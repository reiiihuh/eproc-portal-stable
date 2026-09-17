/**
 * Nano Procurement Portal backend add-on.
 * Requires Script Properties:
 * - GOOGLE_CLIENT_ID
 * - PORTAL_ROOT_FOLDER_ID
 *
 * Add the action cases from RouterPortal.gs to the existing handleRequest_ router.
 * Existing procurement sheets are never read or changed by this file.
 */

var PORTAL_SHEETS_ = {
  requests: "PORTAL_REQUESTS",
  documents: "PORTAL_DOCUMENTS",
  versions: "PORTAL_DOCUMENT_VERSIONS",
  logs: "PORTAL_STATUS_LOG",
  users: "PORTAL_USERS",
  config: "PORTAL_CONFIG"
};

function authorizePortalServices_() {
  var rootId = PropertiesService.getScriptProperties().getProperty("PORTAL_ROOT_FOLDER_ID");
  if (!rootId) throw new Error("PORTAL_ROOT_FOLDER_ID belum diisi.");
  var result = {
    spreadsheet: getSpreadsheet_().getName(),
    driveFolder: DriveApp.getFolderById(rootId).getName(),
    urlFetchAuthorized: UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=invalid", { muteHttpExceptions: true }).getResponseCode() > 0
  };
  Logger.log(JSON.stringify(result));
  return result;
}

// Public wrapper yang muncul di dropdown Run. Jangan rename function lain.
function authorizePortalServices() {
  return authorizePortalServices_();
}

function portalCreateDraft_(body) {
  body = portalBody_(body);
  return portalWithLock_(function () {
    var actor = portalIdentity_(body);
    var requestType = portalRequestTypeLabel_(body.requestType);
    var now = new Date();
    var requestId = "REQ-" + Utilities.getUuid();
    var requestNumber = portalNextRequestNumber_();
    var user = portalUpsertUser_(actor, now);
    var request = portalAppend_(PORTAL_SHEETS_.requests, {
      REQUEST_ID: requestId,
      REQUEST_NUMBER: requestNumber,
      REQUEST_TYPE: requestType,
      REQUESTER_USER_ID: actor.userId,
      REQUESTER_EMAIL: actor.email,
      REQUESTER_NAME: actor.name,
      REQUESTER_DIVISION: user.DIVISION || "",
      REQUESTER_NOTES: String(body.notes || "").trim(),
      CURRENT_STATUS: "DRAFT",
      LAST_UPDATED_AT: now,
      ROW_VERSION: 1,
      CREATED_AT: now,
      CREATED_BY: actor.email,
      UPDATED_AT: now,
      UPDATED_BY: actor.email,
      IS_DELETED: false
    });
    var documents = portalCreateDocumentRows_(requestId, requestType, now);
    var log = portalAppendLog_(requestId, "DRAFT_CREATED", "", "DRAFT", actor, "Draft request dibuat.");
    return { ok: true, data: { request: request, documents: documents, logs: [log] } };
  });
}

function portalListMyRequests_(body) {
  body = portalBody_(body);
  var actor = portalIdentity_(body);
  var requests = portalRows_(PORTAL_SHEETS_.requests).filter(function (row) {
    return portalEmail_(row.REQUESTER_EMAIL) === actor.email && !portalTrue_(row.IS_DELETED);
  });
  requests.sort(function (a, b) { return portalTime_(b.LAST_UPDATED_AT || b.UPDATED_AT) - portalTime_(a.LAST_UPDATED_AT || a.UPDATED_AT); });
  var result = { ok: true, data: { requests: requests } };
  return typeof procurementReconcilePortalResult_ === "function" ? procurementReconcilePortalResult_(result, false) : result;
}

function portalGetRequestDetail_(body) {
  body = portalBody_(body);
  var actor = portalIdentity_(body);
  var request = portalOwnedRequest_(body.requestId, actor);
  if (typeof procurementReconcileRequestsFromMaster_ === "function" && request.MASTER_REQUEST_ID) {
    request = procurementReconcileRequestsFromMaster_([request])[0] || request;
  }
  var documents = portalRows_(PORTAL_SHEETS_.documents).filter(function (row) { return String(row.REQUEST_ID) === String(request.REQUEST_ID); });
  // Detail normal adalah read-only dan tidak perlu menunggu upload/write lain.
  // Lock hanya dipakai untuk self-heal document rows pada draft lama.
  if (!documents.length && String(request.CURRENT_STATUS).toUpperCase() === "DRAFT") {
    documents = portalWithLock_(function () {
      var existing = portalRows_(PORTAL_SHEETS_.documents).filter(function (row) { return String(row.REQUEST_ID) === String(request.REQUEST_ID); });
      return existing.length ? existing : portalCreateDocumentRows_(request.REQUEST_ID, request.REQUEST_TYPE, new Date());
    });
  }
  var versions = portalRows_(PORTAL_SHEETS_.versions);
  documents = documents.map(function (document) {
    var current = versions.filter(function (version) {
      return String(version.DOCUMENT_ID) === String(document.DOCUMENT_ID) && portalTrue_(version.IS_CURRENT);
    }).sort(function (a, b) { return Number(b.VERSION_NUMBER || 0) - Number(a.VERSION_NUMBER || 0); })[0];
    return portalMerge_(document, current || {});
  });
  var logs = portalRows_(PORTAL_SHEETS_.logs).filter(function (row) { return String(row.REQUEST_ID) === String(request.REQUEST_ID); });
  logs.sort(function (a, b) { return portalTime_(a.EVENT_AT) - portalTime_(b.EVENT_AT); });
  return { ok: true, data: { request: request, documents: documents, logs: logs } };
}

function portalUploadDocument_(body) {
  body = portalBody_(body);
  return portalWithLock_(function () {
    var actor = portalIdentity_(body);
    var request = portalOwnedRequest_(body.requestId, actor);
    var requestStatus = String(request.CURRENT_STATUS || "").toUpperCase();
    if (["DRAFT", "NEED_CLARIFICATION", "REJECTED"].indexOf(requestStatus) < 0) throw new Error("REQUEST_NOT_EDITABLE: Dokumen hanya dapat diubah saat Draft, Need Clarification, atau Rejected.");
    var document = portalFind_(PORTAL_SHEETS_.documents, "DOCUMENT_ID", body.documentId);
    if (!document || String(document.REQUEST_ID) !== String(request.REQUEST_ID)) throw new Error("DOCUMENT_NOT_FOUND: documentId tidak sesuai request.");
    var base64 = String(body.base64 || body.base64Data || body.fileBase64 || "");
    if (!base64) throw new Error("FILE_REQUIRED: Isi file tidak tersedia.");
    var fileName = portalSafeFileName_(body.fileName);
    var extension = fileName.split(".").pop().toLowerCase();
    if (["pdf", "doc", "docx", "xls", "xlsx"].indexOf(extension) === -1) throw new Error("FILE_TYPE_NOT_ALLOWED: Gunakan PDF, DOC, DOCX, XLS, atau XLSX.");
    var bytes = Utilities.base64Decode(base64);
    if (bytes.length > 10 * 1024 * 1024) throw new Error("FILE_TOO_LARGE: Maksimal 10 MB per file.");
    var now = new Date();
    var folder = portalRequestFolder_(request, actor);
    var versionNumber = Number(document.CURRENT_VERSION_NUMBER || 0) + 1;
    var storedName = String(document.DOCUMENT_TYPE) + "_v" + versionNumber + "_" + fileName;
    var blob = Utilities.newBlob(bytes, String(body.mimeType || "application/octet-stream"), storedName);
    var file = folder.createFile(blob);
    var previousVersionId = String(document.CURRENT_VERSION_ID || "");
    portalUpdateWhere_(PORTAL_SHEETS_.versions, "DOCUMENT_ID", document.DOCUMENT_ID, function (row) {
      if (portalTrue_(row.IS_CURRENT)) row.IS_CURRENT = false;
      return row;
    });
    var version = portalAppend_(PORTAL_SHEETS_.versions, {
      VERSION_ID: "VER-" + Utilities.getUuid(),
      DOCUMENT_ID: document.DOCUMENT_ID,
      REQUEST_ID: request.REQUEST_ID,
      VERSION_NUMBER: versionNumber,
      STORAGE_PROVIDER: "GOOGLE_DRIVE",
      FILE_ID: file.getId(),
      FILE_URL: file.getUrl(),
      FILE_NAME: file.getName(),
      MIME_TYPE: file.getMimeType(),
      FILE_SIZE_BYTES: bytes.length,
      DRIVE_FOLDER_ID: folder.getId(),
      UPLOADED_AT: now,
      UPLOADED_BY_USER_ID: actor.userId,
      UPLOADED_BY_EMAIL: actor.email,
      REPLACES_VERSION_ID: previousVersionId,
      IS_CURRENT: true,
      CREATED_AT: now
    });
    document = portalUpdateOne_(PORTAL_SHEETS_.documents, "DOCUMENT_ID", document.DOCUMENT_ID, {
      CURRENT_VERSION_NUMBER: versionNumber,
      CURRENT_VERSION_ID: version.VERSION_ID,
      REVIEW_STATUS: "UPLOADED",
      REVIEW_NOTE: "",
      UPDATED_AT: now,
      ROW_VERSION: Number(document.ROW_VERSION || 0) + 1
    });
    portalTouchRequest_(request.REQUEST_ID, actor, now);
    portalAppendLog_(request.REQUEST_ID, previousVersionId ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED", request.CURRENT_STATUS, request.CURRENT_STATUS, actor, document.DOCUMENT_TYPE + " berhasil diunggah.", document.DOCUMENT_ID, version.VERSION_ID);
    return { ok: true, data: { document: portalMerge_(document, version) } };
  });
}

function portalSubmitRequest_(body) {
  body = portalBody_(body);
  return portalWithLock_(function () {
    var actor = portalIdentity_(body);
    var request = portalOwnedRequest_(body.requestId, actor);
    var requestStatus = String(request.CURRENT_STATUS || "").toUpperCase();
    if (["DRAFT", "NEED_CLARIFICATION", "REJECTED"].indexOf(requestStatus) < 0) throw new Error("INVALID_STATUS_TRANSITION: Request dengan status " + requestStatus + " tidak dapat dikirim ulang.");
    var documents = portalRows_(PORTAL_SHEETS_.documents).filter(function (row) { return String(row.REQUEST_ID) === String(request.REQUEST_ID); });
    var missing = documents.filter(function (row) { return portalTrue_(row.IS_REQUIRED) && Number(row.CURRENT_VERSION_NUMBER || 0) < 1; }).map(function (row) { return row.DOCUMENT_TYPE; });
    if (missing.length) throw new Error("DOCUMENTS_INCOMPLETE: Dokumen wajib belum lengkap: " + missing.join(", "));
    var now = new Date();
    var previousStatus = request.CURRENT_STATUS;
    var updated = portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, {
      CURRENT_STATUS: "SUBMITTED",
      SUBMITTED_AT: now,
      LAST_UPDATED_AT: now,
      UPDATED_AT: now,
      UPDATED_BY: actor.email,
      ROW_VERSION: Number(request.ROW_VERSION || 0) + 1
    });
    var log = portalAppendLog_(request.REQUEST_ID, requestStatus === "DRAFT" ? "REQUEST_SUBMITTED" : "REQUEST_RESUBMITTED", previousStatus, "SUBMITTED", actor, requestStatus === "DRAFT" ? "Dokumen dikirim ke Procurement." : "Request diperbaiki dan dikirim ulang ke Procurement.");
    return { ok: true, data: { request: updated, logs: [log] } };
  });
}

function portalCreateDocumentRows_(requestId, requestType, now) {
  var existing = portalRows_(PORTAL_SHEETS_.documents).filter(function (row) { return String(row.REQUEST_ID) === String(requestId); });
  if (existing.length) return existing;
  var requirements = portalRequirements_(requestType);
  return requirements.map(function (requirement) {
    return portalAppend_(PORTAL_SHEETS_.documents, {
      DOCUMENT_ID: "DOC-" + Utilities.getUuid(),
      REQUEST_ID: requestId,
      DOCUMENT_TYPE: requirement.type,
      IS_REQUIRED: requirement.type.toUpperCase() !== "PQ VENDOR" && requirement.required,
      CURRENT_VERSION_NUMBER: 0,
      CURRENT_VERSION_ID: "",
      REVIEW_STATUS: "NOT_UPLOADED",
      REVIEW_NOTE: "",
      CREATED_AT: now,
      UPDATED_AT: now,
      ROW_VERSION: 1
    });
  });
}

function portalRequirements_(requestType) {
  var rows = portalRows_(PORTAL_SHEETS_.config).filter(function (row) {
    return String(row.CONFIG_GROUP).toUpperCase() === "DOCUMENT_REQUIREMENT" && portalTrue_(row.ACTIVE) && String(row.REQUEST_TYPE).toLowerCase() === String(requestType).toLowerCase();
  });
  var result = rows.map(function (row) {
    return { type: String(row.DOCUMENT_TYPE), required: String(row.CONFIG_VALUE).toUpperCase() === "REQUIRED", sortOrder: Number(row.SORT_ORDER || 0) };
  }).sort(function (a, b) { return a.sortOrder - b.sortOrder; });
  if (!result.length) {
    result = requestType === "Pengadaan Baru"
      ? [{ type: "FPB", required: true }, { type: "RFP", required: true }, { type: "Memo Izin Prinsip", required: true }, { type: "PQ Vendor", required: false }]
      : [{ type: "FPB", required: true }, { type: "Form Evaluation Vendor", required: true }, { type: "Memo Izin Prinsip", required: true }, { type: "PQ Vendor", required: false }];
  }
  if (!result.some(function (item) { return item.type.toUpperCase() === "PQ VENDOR"; })) result.push({ type: "PQ Vendor", required: false, sortOrder: 40 });
  result.forEach(function (item) { if (item.type.toUpperCase() === "PQ VENDOR") item.required = false; });
  return result;
}

function portalIdentity_(body) {
  var token = String(body.idToken || "");
  if (!token) throw new Error("AUTH_REQUIRED: Login Google diperlukan.");
  var digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  var cache = CacheService.getScriptCache();
  var cached = cache.get("portal-identity-" + digest);
  if (cached) return JSON.parse(cached);
  var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error("AUTH_INVALID: Sesi Google tidak valid. Silakan login ulang.");
  var claims = JSON.parse(response.getContentText());
  var clientId = PropertiesService.getScriptProperties().getProperty("GOOGLE_CLIENT_ID");
  if (clientId && String(claims.aud) !== String(clientId)) throw new Error("AUTH_AUDIENCE_INVALID: Google Client ID tidak sesuai.");
  if (!claims.email || String(claims.email_verified) !== "true") throw new Error("AUTH_EMAIL_INVALID: Email Google belum terverifikasi.");
  var actor = { userId: String(claims.sub), email: portalEmail_(claims.email), name: String(claims.name || claims.email) };
  cache.put("portal-identity-" + digest, JSON.stringify(actor), 300);
  return actor;
}

function portalUpsertUser_(actor, now) {
  var user = portalFind_(PORTAL_SHEETS_.users, "EMAIL", actor.email, true);
  if (!user) return portalAppend_(PORTAL_SHEETS_.users, { USER_ID: actor.userId, EMAIL: actor.email, DISPLAY_NAME: actor.name, ROLE: "REQUESTER", ACTIVE: true, AUTH_PROVIDER: "GOOGLE", LAST_LOGIN_AT: now, CREATED_AT: now, UPDATED_AT: now });
  return portalUpdateOne_(PORTAL_SHEETS_.users, "EMAIL", actor.email, { USER_ID: actor.userId, DISPLAY_NAME: actor.name, ACTIVE: true, AUTH_PROVIDER: "GOOGLE", LAST_LOGIN_AT: now, UPDATED_AT: now }, true);
}

function portalOwnedRequest_(requestId, actor) {
  var request = portalFind_(PORTAL_SHEETS_.requests, "REQUEST_ID", requestId);
  if (!request || portalTrue_(request.IS_DELETED)) throw new Error("REQUEST_NOT_FOUND: Request tidak ditemukan.");
  if (portalEmail_(request.REQUESTER_EMAIL) !== actor.email) throw new Error("FORBIDDEN: Request hanya dapat dibuka oleh requester.");
  return request;
}

function portalRequestTypeLabel_(input) {
  var normalized = String(input || "").trim().toUpperCase().replace(/[ -]+/g, "_");
  var map = { PENGADAAN_BARU: "Pengadaan Baru", MAINTENANCE: "Maintenance", RENEWAL: "Renewal" };
  if (!map[normalized]) throw new Error("INVALID_REQUEST_TYPE: Request type tidak valid: " + input);
  return map[normalized];
}

function portalRequestFolder_(request, actor) {
  var rootId = PropertiesService.getScriptProperties().getProperty("PORTAL_ROOT_FOLDER_ID");
  if (!rootId) throw new Error("DRIVE_NOT_CONFIGURED: PORTAL_ROOT_FOLDER_ID belum diisi di Script Properties.");
  var root = DriveApp.getFolderById(rootId);
  var yearFolder = portalChildFolder_(root, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy"));
  return portalChildFolder_(yearFolder, portalSafeFileName_(request.REQUEST_NUMBER + " - " + request.REQUEST_TYPE + " - " + actor.email));
}

function portalChildFolder_(parent, name) {
  var found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function portalNextRequestNumber_() {
  var year = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy");
  var prefix = "NPR-" + year + "-";
  var max = portalRows_(PORTAL_SHEETS_.requests).reduce(function (current, row) {
    var number = String(row.REQUEST_NUMBER || "");
    return number.indexOf(prefix) === 0 ? Math.max(current, Number(number.slice(prefix.length)) || 0) : current;
  }, 0);
  return prefix + String(max + 1).padStart(4, "0");
}

function portalAppendLog_(requestId, eventType, oldStatus, newStatus, actor, note, documentId, versionId) {
  return portalAppend_(PORTAL_SHEETS_.logs, { LOG_ID: "LOG-" + Utilities.getUuid(), REQUEST_ID: requestId, EVENT_TYPE: eventType, OLD_STATUS: oldStatus, NEW_STATUS: newStatus, EVENT_AT: new Date(), ACTOR_USER_ID: actor.userId, ACTOR_EMAIL: actor.email, ACTOR_NAME: actor.name, ACTOR_ROLE: "REQUESTER", NOTE: note || "", RELATED_DOCUMENT_ID: documentId || "", RELATED_VERSION_ID: versionId || "", METADATA_JSON: "{}" });
}

function portalTouchRequest_(requestId, actor, now) {
  var request = portalFind_(PORTAL_SHEETS_.requests, "REQUEST_ID", requestId);
  portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", requestId, { LAST_UPDATED_AT: now, UPDATED_AT: now, UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 1 });
}

function portalRows_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error("SHEET_NOT_FOUND: " + sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (header) { return String(header).trim(); });
  return values.slice(1).filter(function (row) { return row.some(function (cell) { return cell !== ""; }); }).map(function (row, index) {
    var object = { __rowNumber: index + 2 };
    headers.forEach(function (header, column) { object[header] = row[column]; });
    return object;
  });
}

function portalAppend_(sheetName, values) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error("SHEET_NOT_FOUND: " + sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function (header) { return String(header).trim(); });
  sheet.appendRow(headers.map(function (header) { return values[header] === undefined ? "" : values[header]; }));
  return portalMerge_({}, values);
}

function portalFind_(sheetName, key, needle, ignoreCase) {
  var expected = String(needle || "");
  return portalRows_(sheetName).filter(function (row) {
    var actual = String(row[key] || "");
    return ignoreCase ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
  })[0] || null;
}

function portalUpdateOne_(sheetName, key, needle, changes, ignoreCase) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  var row = portalFind_(sheetName, key, needle, ignoreCase);
  if (!row) throw new Error("ROW_NOT_FOUND: " + sheetName + "." + key);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function (header) { return String(header).trim(); });
  Object.keys(changes).forEach(function (header) {
    var column = headers.indexOf(header);
    if (column >= 0) sheet.getRange(row.__rowNumber, column + 1).setValue(changes[header]);
    row[header] = changes[header];
  });
  delete row.__rowNumber;
  return row;
}

function portalUpdateWhere_(sheetName, key, needle, updater) {
  var rows = portalRows_(sheetName).filter(function (row) { return String(row[key]) === String(needle); });
  rows.forEach(function (row) {
    var before = portalMerge_({}, row);
    var after = updater(portalMerge_({}, row));
    var changes = {};
    Object.keys(after).forEach(function (field) { if (field !== "__rowNumber" && after[field] !== before[field]) changes[field] = after[field]; });
    if (Object.keys(changes).length) portalUpdateOne_(sheetName, key === "DOCUMENT_ID" ? "VERSION_ID" : key, key === "DOCUMENT_ID" ? row.VERSION_ID : needle, changes);
  });
}

function portalWithLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function portalMerge_(left, right) { var result = {}; Object.keys(left || {}).forEach(function (key) { if (key !== "__rowNumber") result[key] = left[key]; }); Object.keys(right || {}).forEach(function (key) { if (key !== "__rowNumber") result[key] = right[key]; }); return result; }
function portalEmail_(value) { return String(value || "").trim().toLowerCase(); }
function portalTrue_(value) { return value === true || String(value).toLowerCase() === "true" || String(value) === "1"; }
function portalTime_(value) { var time = new Date(value || 0).getTime(); return isNaN(time) ? 0 : time; }
function portalSafeFileName_(value) { return String(value || "file").replace(/[\\/:*?"<>|#%{}~]/g, "-").trim().slice(0, 180); }
function portalBody_(value) { if (!value || typeof value !== "object") return {}; if (value.body && typeof value.body === "object") return value.body; if (value.payload && typeof value.payload === "object") return value.payload; return value; }
