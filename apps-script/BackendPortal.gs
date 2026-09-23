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
  var root = portalRootFolder_();
  portalVerifyDriveWrite_(root);
  var result = {
    spreadsheet: getSpreadsheet_().getName(),
    driveFolder: root.getName(),
    driveFolderId: root.getId(),
    driveWritable: true,
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
  var actor = portalIdentity_(body);
  return portalWithLock_(function () {
    portalEnsureSheetHeaders_(PORTAL_SHEETS_.requests, ["REQUESTER_POSITION", "REQUESTER_LOCATION"]);
    var requestType = portalRequestTypeLabel_(body.requestType);
    var now = new Date();
    var requestId = "REQ-" + Utilities.getUuid();
    var requestNumber = portalNextRequestNumber_();
    var user = portalRequireCompleteProfile_(actor, now);
    var request = portalAppend_(PORTAL_SHEETS_.requests, {
      REQUEST_ID: requestId,
      REQUEST_NUMBER: requestNumber,
      REQUEST_TYPE: requestType,
      REQUESTER_USER_ID: actor.userId,
      REQUESTER_EMAIL: actor.email,
      REQUESTER_NAME: actor.name,
      REQUESTER_DIVISION: user.DIVISION || "",
      REQUESTER_POSITION: user.POSITION || "",
      REQUESTER_LOCATION: user.LOCATION || "",
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
    var document = portalFind_(PORTAL_SHEETS_.documents, "DOCUMENT_ID", body.documentId);
    if (!document || String(document.REQUEST_ID) !== String(request.REQUEST_ID)) throw new Error("DOCUMENT_NOT_FOUND: documentId tidak sesuai request.");
    var reviewStatus = String(document.REVIEW_STATUS || "").toUpperCase().replace(/[ -]+/g, "_");
    var requestEditable = ["DRAFT", "NEED_CLARIFICATION", "REJECTED"].indexOf(requestStatus) >= 0;
    var revisionRequested = requestStatus === "PROCUREMENT_REVIEW" && reviewStatus === "REVISION_REQUIRED";
    if (!requestEditable && !revisionRequested) throw new Error("REQUEST_NOT_EDITABLE: Dokumen hanya dapat diubah saat Draft, Need Clarification, Rejected, atau ketika Procurement meminta revisi dokumen tersebut.");
    var base64 = String(body.base64 || body.base64Data || body.fileBase64 || "");
    if (!base64) throw new Error("FILE_REQUIRED: Isi file tidak tersedia.");
    var fileName = portalSafeFileName_(body.fileName);
    var extension = fileName.split(".").pop().toLowerCase();
    if (["pdf", "doc", "docx", "xls", "xlsx"].indexOf(extension) === -1) throw new Error("FILE_TYPE_NOT_ALLOWED: Gunakan PDF, DOC, DOCX, XLS, atau XLSX.");
    var bytes = Utilities.base64Decode(base64);
    if (bytes.length > 3 * 1024 * 1024) throw new Error("FILE_TOO_LARGE: Maksimal 3 MB per file.");
    var now = new Date();
    var folder = portalRequestFolder_(request, actor);
    var versionNumber = Number(document.CURRENT_VERSION_NUMBER || 0) + 1;
    var storedName = String(document.DOCUMENT_TYPE) + "_v" + versionNumber + "_" + fileName;
    var blob = Utilities.newBlob(bytes, String(body.mimeType || "application/octet-stream"), storedName);
    var file = portalCreateDriveFile_(folder, blob);
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
    var logNote = revisionRequested ? document.DOCUMENT_TYPE + " diunggah ulang sesuai catatan revisi Procurement." : document.DOCUMENT_TYPE + " berhasil diunggah.";
    portalAppendLog_(request.REQUEST_ID, previousVersionId ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED", request.CURRENT_STATUS, request.CURRENT_STATUS, actor, logNote, document.DOCUMENT_ID, version.VERSION_ID);
    return { ok: true, data: { document: portalMerge_(document, version) } };
  });
}

function portalSubmitRequest_(body) {
  body = portalBody_(body);
  var actor = portalIdentity_(body);
  return portalWithLock_(function () {
    portalEnsureSheetHeaders_(PORTAL_SHEETS_.requests, ["REQUESTER_POSITION", "REQUESTER_LOCATION"]);
    var user = portalRequireCompleteProfile_(actor, new Date());
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
      REQUESTER_NAME: user.DISPLAY_NAME || actor.name,
      REQUESTER_DIVISION: user.DIVISION || "",
      REQUESTER_POSITION: user.POSITION || "",
      REQUESTER_LOCATION: user.LOCATION || "",
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
  portalEnsureSheetHeaders_(PORTAL_SHEETS_.users, ["DIVISION", "POSITION", "LOCATION", "MASTER_PIC_ID", "PROFILE_COMPLETE"]);
  var user = portalFind_(PORTAL_SHEETS_.users, "EMAIL", actor.email, true);
  if (!user) return portalAppend_(PORTAL_SHEETS_.users, { USER_ID: actor.userId, EMAIL: actor.email, DISPLAY_NAME: actor.name, ROLE: "REQUESTER", ACTIVE: true, AUTH_PROVIDER: "GOOGLE", LAST_LOGIN_AT: now, CREATED_AT: now, UPDATED_AT: now });
  return portalUpdateOne_(PORTAL_SHEETS_.users, "EMAIL", actor.email, { USER_ID: actor.userId, DISPLAY_NAME: actor.name, ACTIVE: true, AUTH_PROVIDER: "GOOGLE", LAST_LOGIN_AT: now, UPDATED_AT: now }, true);
}

function portalGetMyProfile_(body) {
  var actor = portalIdentity_(portalBody_(body));
  return portalWithLock_(function () {
    var user = portalResolveProfile_(actor, new Date());
    return { ok: true, data: portalProfileDto_(user) };
  });
}

function portalSaveMyProfile_(body) {
  body = portalBody_(body);
  var actor = portalIdentity_(body);
  var division = String(body.division || "").trim();
  var position = String(body.position || "").trim();
  var location = String(body.location || "").trim();
  if (!division || !position || !location) throw new Error("PROFILE_INCOMPLETE: Divisi, jabatan, dan lokasi wajib diisi.");
  return portalWithLock_(function () {
    var profile = portalUpsertMasterPic_(actor, { division: division, position: position, location: location });
    var user = portalPersistProfile_(actor, profile, new Date());
    return { ok: true, data: portalProfileDto_(user) };
  });
}

function portalRequireCompleteProfile_(actor, now) {
  var user = portalResolveProfile_(actor, now);
  if (!portalTrue_(user.PROFILE_COMPLETE)) throw new Error("PROFILE_REQUIRED: Lengkapi divisi, jabatan, dan lokasi pada profil sebelum mengajukan request.");
  return user;
}

function portalResolveProfile_(actor, now) {
  var master = portalFindMasterPicByEmail_(actor.email);
  if (master) return portalPersistProfile_(actor, master, now);
  var user = portalUpsertUser_(actor, now);
  return portalPersistProfile_(actor, {
    picId: user.MASTER_PIC_ID || "",
    name: user.DISPLAY_NAME || actor.name,
    email: actor.email,
    division: user.DIVISION || "",
    position: user.POSITION || "",
    location: user.LOCATION || "",
    active: true
  }, now);
}

function portalPersistProfile_(actor, profile, now) {
  var complete = Boolean(String(profile.picId || "").trim() && profile.active !== false && String(profile.division || "").trim() && String(profile.position || "").trim() && String(profile.location || "").trim());
  portalEnsureSheetHeaders_(PORTAL_SHEETS_.users, ["DIVISION", "POSITION", "LOCATION", "MASTER_PIC_ID", "PROFILE_COMPLETE"]);
  var user = portalFind_(PORTAL_SHEETS_.users, "EMAIL", actor.email, true);
  var values = {
    USER_ID: actor.userId,
    EMAIL: actor.email,
    DISPLAY_NAME: String(profile.name || actor.name),
    ROLE: user && user.ROLE ? user.ROLE : "REQUESTER",
    ACTIVE: profile.active !== false,
    AUTH_PROVIDER: "GOOGLE",
    DIVISION: String(profile.division || ""),
    POSITION: String(profile.position || ""),
    LOCATION: String(profile.location || ""),
    MASTER_PIC_ID: String(profile.picId || ""),
    PROFILE_COMPLETE: complete,
    LAST_LOGIN_AT: now,
    UPDATED_AT: now
  };
  if (!user) {
    values.CREATED_AT = now;
    return portalAppend_(PORTAL_SHEETS_.users, values);
  }
  return portalUpdateOne_(PORTAL_SHEETS_.users, "EMAIL", actor.email, values, true);
}

function portalProfileDto_(user) {
  return {
    email: String(user.EMAIL || ""),
    name: String(user.DISPLAY_NAME || user.EMAIL || ""),
    division: String(user.DIVISION || ""),
    position: String(user.POSITION || ""),
    location: String(user.LOCATION || ""),
    masterPicId: String(user.MASTER_PIC_ID || ""),
    profileComplete: portalTrue_(user.PROFILE_COMPLETE)
  };
}

function portalFindMasterPicByEmail_(email) {
  var context = portalMasterPicContext_();
  var expected = portalEmail_(email);
  var fields = context.fields;
  var row = context.rows.filter(function (item) { return portalEmail_(item[fields.email]) === expected; })[0];
  if (!row) return null;
  var picId = String(row[fields.picId] || "").trim();
  if (!picId) {
    picId = "PIC-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    context.sheet.getRange(row.__rowNumber, context.headers.indexOf(fields.picId) + 1).setValue(picId);
    row[fields.picId] = picId;
  }
  var inactive = ["TIDAK AKTIF", "INACTIVE", "NONAKTIF"].indexOf(String(row[fields.status] || "").trim().toUpperCase()) >= 0;
  return {
    picId: picId,
    name: row[fields.name] || "",
    email: row[fields.email] || email,
    division: row[fields.division] || "",
    position: row[fields.position] || "",
    location: row[fields.location] || "",
    active: !inactive
  };
}

function portalUpsertMasterPic_(actor, profile) {
  var context = portalMasterPicContext_();
  var sheet = context.sheet;
  var fields = context.fields;
  var existing = context.rows.filter(function (row) { return portalEmail_(row[fields.email]) === actor.email; })[0];
  var picId = existing && existing[fields.picId] ? String(existing[fields.picId]) : "PIC-" + Utilities.getUuid().slice(0, 8).toUpperCase();
  var values = {};
  values[fields.picId] = picId;
  values[fields.name] = actor.name;
  values[fields.division] = profile.division;
  values[fields.position] = profile.position;
  values[fields.location] = profile.location;
  values[fields.email] = actor.email;
  values[fields.status] = "Aktif";
  if (existing) {
    Object.keys(values).forEach(function (header) {
      var column = context.headers.indexOf(header);
      if (column >= 0) sheet.getRange(existing.__rowNumber, column + 1).setValue(values[header]);
    });
  } else {
    sheet.appendRow(context.headers.map(function (header) { return values[header] === undefined ? "" : values[header]; }));
  }
  return { picId: picId, name: actor.name, email: actor.email, division: profile.division, position: profile.position, location: profile.location, active: true };
}

function portalMasterPicContext_() {
  var sheet = getSpreadsheet_().getSheetByName("MASTER PIC");
  if (!sheet) throw new Error("SHEET_NOT_FOUND: MASTER PIC.");
  var values = sheet.getDataRange().getValues();
  var display = sheet.getDataRange().getDisplayValues();
  var headerIndex = -1;
  for (var index = 0; index < Math.min(display.length, 20); index++) {
    var candidate = display[index].map(function (value) { return String(value || "").trim(); });
    if (portalMasterPicHeader_(candidate, ["Nama PIC", "Nama", "Nama Requester"]) && portalMasterPicHeader_(candidate, ["Email", "Email PIC", "Alamat Email", "Alamat Email User", "Email Address", "E-mail"])) { headerIndex = index; break; }
  }
  if (headerIndex < 0) throw new Error("MASTER_HEADER_REQUIRED: MASTER PIC membutuhkan header Nama PIC dan Email.");
  var headers = display[headerIndex].map(function (value) { return String(value || "").trim(); });
  var definitions = {
    picId: ["PIC ID", "ID PIC"],
    name: ["Nama PIC", "Nama", "Nama Requester"],
    division: ["Group/Divisi", "Group/Div", "Divisi", "Division"],
    position: ["Jabatan", "Lvl Jabatan", "Level Jabatan", "Position"],
    location: ["Lokasi", "Location"],
    email: ["Email", "Email PIC", "Alamat Email", "Alamat Email User", "Email Address", "E-mail"],
    status: ["Status", "Status PIC"]
  };
  var canonical = { picId: "PIC ID", name: "Nama PIC", division: "Group/Divisi", position: "Jabatan", location: "Lokasi", email: "Email", status: "Status" };
  var fields = {};
  Object.keys(definitions).forEach(function (key) {
    fields[key] = portalMasterPicHeader_(headers, definitions[key]);
    if (!fields[key]) {
      var column = sheet.getLastColumn() + 1;
      sheet.getRange(headerIndex + 1, column).setValue(canonical[key]);
      headers[column - 1] = canonical[key];
      fields[key] = canonical[key];
    }
  });
  values = sheet.getDataRange().getValues();
  var rows = values.slice(headerIndex + 1).map(function (row, rowIndex) {
    var result = { __rowNumber: headerIndex + rowIndex + 2 };
    headers.forEach(function (header, column) { result[header] = row[column]; });
    return result;
  }).filter(function (row) { return row.Email || row["Nama PIC"]; });
  return { sheet: sheet, headers: headers, headerRow: headerIndex + 1, rows: rows, fields: fields };
}

function portalMasterPicHeader_(headers, aliases) {
  var expected = aliases.map(portalNormalizeHeader_);
  return headers.filter(function (header) { return expected.indexOf(portalNormalizeHeader_(header)) >= 0; })[0] || "";
}

function portalNormalizeHeader_(value) {
  return String(value || "").replace(/\u00a0/g, " ").trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

function portalEnsureSheetHeaders_(sheetName, required) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error("SHEET_NOT_FOUND: " + sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function (value) { return String(value || "").trim(); });
  required.forEach(function (header) {
    if (headers.indexOf(header) < 0) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      headers.push(header);
    }
  });
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
  try {
    var root = portalRootFolder_();
    var yearFolder = portalChildFolder_(root, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy"));
    return portalChildFolder_(yearFolder, portalSafeFileName_(request.REQUEST_NUMBER + " - " + request.REQUEST_TYPE + " - " + actor.email));
  } catch (error) {
    if (String(error && error.message || error).indexOf("DRIVE_") === 0) throw error;
    throw new Error("DRIVE_ACCESS_DENIED: Folder request tidak dapat dibuka atau dibuat. Pastikan akun pemilik deployment Apps Script memiliki akses Editor ke PORTAL_ROOT_FOLDER_ID. Detail: " + portalErrorMessage_(error));
  }
}

function portalChildFolder_(parent, name) {
  var found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function portalRootFolder_() {
  var rootId = String(PropertiesService.getScriptProperties().getProperty("PORTAL_ROOT_FOLDER_ID") || "").trim();
  if (!rootId) throw new Error("DRIVE_NOT_CONFIGURED: PORTAL_ROOT_FOLDER_ID belum diisi di Script Properties.");
  try {
    var root = DriveApp.getFolderById(rootId);
    root.getName();
    return root;
  } catch (error) {
    throw new Error("DRIVE_ACCESS_DENIED: Akun pemilik deployment Apps Script tidak dapat mengakses PORTAL_ROOT_FOLDER_ID. Jalankan authorizePortalServices dari editor lalu pastikan folder dibagikan sebagai Editor ke akun tersebut. Detail: " + portalErrorMessage_(error));
  }
}

function portalCreateDriveFile_(folder, blob) {
  try {
    return folder.createFile(blob);
  } catch (error) {
    throw new Error("DRIVE_WRITE_DENIED: File tidak dapat ditulis ke folder request. Pastikan akun pemilik deployment Apps Script memiliki akses Editor dan deployment dijalankan sebagai pemilik. Detail: " + portalErrorMessage_(error));
  }
}

function portalVerifyDriveWrite_(folder) {
  var probe;
  try {
    probe = folder.createFile(Utilities.newBlob("Nano Portal Drive permission check", "text/plain", ".nano-portal-write-check.txt"));
    probe.setTrashed(true);
  } catch (error) {
    try { if (probe) probe.setTrashed(true); } catch (cleanupError) { Logger.log("DRIVE_PROBE_CLEANUP_FAILED: " + portalErrorMessage_(cleanupError)); }
    throw new Error("DRIVE_WRITE_DENIED: Akun yang menjalankan authorizePortalServices tidak dapat menulis ke PORTAL_ROOT_FOLDER_ID. Bagikan folder sebagai Editor lalu jalankan fungsi ini lagi. Detail: " + portalErrorMessage_(error));
  }
}

function portalErrorMessage_(error) {
  return String(error && error.message ? error.message : error || "Unknown Drive error");
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
