/** Backend review Procurement. Semua identitas dan role berasal dari ID token terverifikasi. */
// Fallback mandiri agar modul review tetap jalan saat helper BackendPortal versi lama belum ikut ter-deploy.
function portalBody_(value) { return procurementBody_(value); }

function testProcurementReviewModule() {
  var parsed = portalBody_({ payload: { ready: true } });
  if (!parsed.ready) throw new Error("PROCUREMENT_BODY_HELPER_FAILED");
  Logger.log("Procurement Review backend siap: 2026-09-16.4");
  return true;
}

function tryProcurementRoute_(request) {
  request = request || {};
  var body = request.body && typeof request.body === "object" ? request.body : request;
  if (body.payload && typeof body.payload === "object") body = body.payload;
  var action = String(request.action || body.action || "").trim().toLowerCase();
  switch (action) {
    case "getprocurementsession": return procurementSession_(body);
    case "listreviewqueue": return procurementListQueue_(body);
    case "getprocurementrequestdetail": return procurementGetDetail_(body);
    case "startreview": case "procurement.startreview": return procurementStartReview_(body);
    case "reviewdocument": case "procurement.reviewdocument": return procurementReviewDocument_(body);
    case "requestclarification": case "procurement.requestrevision": return procurementRequestClarification_(body);
    case "approverequest": case "procurement.approve": return procurementApproveRequest_(body);
    case "rejectrequest": case "procurement.reject": return procurementRejectRequest_(body);
    case "procurement.submitreview": return procurementSubmitReview_(body);
    case "promotetoprocurement": case "procurement.promote": return procurementPromote_(body);
    case "syncprocurementstatus": return procurementSyncStatus_(body);
    case "getprocurementworkspace": return procurementGetWorkspace_(body);
    case "procurement.upsertrecord": return procurementUpsertRecord_(body);
    case "procurement.deleterecords": return procurementDeleteRecords_(body);
    case "procurement.upsertpic": return procurementUpsertPic_(body);
    case "procurement.deletepics": return procurementDeletePics_(body);
    case "procurement.upsertvendor": return procurementUpsertVendor_(body);
    case "procurement.deletevendors": return procurementDeleteVendors_(body);
    default: return null;
  }
}

// Jalankan sekali dari editor Apps Script; hanya menambah header pada sheet PORTAL_*.
function ensureProcurementPortalSchema() {
  var additions = {};
  additions[PORTAL_SHEETS_.requests] = ["MASTER_REQUEST_ID", "PO_NUMBER", "PO_URL"];
  additions[PORTAL_SHEETS_.documents] = ["REVIEWED_AT", "REVIEWED_BY"];
  Object.keys(additions).forEach(function (sheetName) {
    var sheet = getSpreadsheet_().getSheetByName(sheetName);
    if (!sheet) throw new Error("SHEET_NOT_FOUND: " + sheetName);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(function (value) { return String(value).trim(); });
    additions[sheetName].forEach(function (header) { if (headers.indexOf(header) < 0) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header); headers.push(header); } });
  });
  return "Schema PORTAL_* siap.";
}

function procurementSession_(body) {
  var actor = procurementActor_(body);
  return { ok: true, data: { email: actor.email, name: actor.name, role: "PROCUREMENT_ADMIN", spreadsheetId: getSpreadsheet_().getId() } };
}

function procurementListQueue_(body) {
  var actor = procurementActor_(body);
  return portalWithLock_(function () {
    portalRows_(PORTAL_SHEETS_.requests).filter(function (row) {
      return String(row.CURRENT_STATUS).toUpperCase() === "APPROVED_FOR_PROCESS" && !row.MASTER_REQUEST_ID && !portalTrue_(row.IS_DELETED);
    }).forEach(function (request) {
      procurementPromoteApproved_(request, actor, new Date());
    });
    var visible = { SUBMITTED: true, PROCUREMENT_REVIEW: true, NEED_CLARIFICATION: true, APPROVED_FOR_PROCESS: true };
    var rows = portalRows_(PORTAL_SHEETS_.requests).filter(function (row) {
      return visible[String(row.CURRENT_STATUS).toUpperCase()] && !portalTrue_(row.IS_DELETED);
    });
    rows.sort(function (a, b) { return portalTime_(b.LAST_UPDATED_AT || b.UPDATED_AT) - portalTime_(a.LAST_UPDATED_AT || a.UPDATED_AT); });
    return { ok: true, data: rows.map(procurementRequestDto_) };
  });
}

function procurementGetDetail_(body) {
  procurementActor_(body);
  return { ok: true, data: procurementDetail_(body.requestId) };
}

function procurementStartReview_(body) {
  return procurementWrite_(body, function (request, actor, now) {
    procurementRequireStatus_(request, ["SUBMITTED", "NEED_CLARIFICATION"]);
    portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, {
      CURRENT_STATUS: "PROCUREMENT_REVIEW", LAST_UPDATED_AT: now, UPDATED_AT: now,
      UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 1
    });
    procurementLog_(request.REQUEST_ID, "REVIEW_STARTED", request.CURRENT_STATUS, "PROCUREMENT_REVIEW", actor, "Review Procurement dimulai.");
  });
}

function procurementReviewDocument_(body) {
  var status = String(body.status || "").toUpperCase();
  if (["VALID", "REVISION_REQUIRED"].indexOf(status) < 0) throw new Error("INVALID_REVIEW_STATUS: Status dokumen tidak valid.");
  if (status === "REVISION_REQUIRED" && !String(body.note || "").trim()) throw new Error("REVIEW_NOTE_REQUIRED: Catatan revisi wajib diisi.");
  return procurementWrite_(body, function (request, actor, now) {
    procurementEnterReview_(request, actor, now);
    var document = portalFind_(PORTAL_SHEETS_.documents, "DOCUMENT_ID", body.documentId);
    if (!document || String(document.REQUEST_ID) !== String(request.REQUEST_ID)) throw new Error("DOCUMENT_NOT_FOUND: Dokumen tidak sesuai request.");
    if (Number(document.CURRENT_VERSION_NUMBER || 0) < 1) throw new Error("DOCUMENT_NOT_UPLOADED: Dokumen belum diunggah.");
    portalUpdateOne_(PORTAL_SHEETS_.documents, "DOCUMENT_ID", document.DOCUMENT_ID, {
      REVIEW_STATUS: status, REVIEW_NOTE: String(body.note || "").trim(), REVIEWED_AT: now,
      REVIEWED_BY: actor.email, UPDATED_AT: now, ROW_VERSION: Number(document.ROW_VERSION || 0) + 1
    });
    procurementLog_(request.REQUEST_ID, "DOCUMENT_" + status, request.CURRENT_STATUS, request.CURRENT_STATUS, actor, String(body.note || ""), document.DOCUMENT_ID);
  });
}

function procurementRequestClarification_(body) {
  var note = String(body.note || "").trim();
  if (!note) throw new Error("NOTE_REQUIRED: Catatan klarifikasi wajib diisi.");
  return procurementWrite_(body, function (request, actor, now) {
    procurementRequireStatus_(request, ["SUBMITTED", "NEED_CLARIFICATION", "PROCUREMENT_REVIEW"]);
    portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, { CURRENT_STATUS: "NEED_CLARIFICATION", LAST_UPDATED_AT: now, UPDATED_AT: now, UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 1 });
    procurementLog_(request.REQUEST_ID, "CLARIFICATION_REQUESTED", request.CURRENT_STATUS, "NEED_CLARIFICATION", actor, note);
  });
}

function procurementApproveRequest_(body) {
  return procurementWrite_(body, function (request, actor, now) {
    procurementEnterReview_(request, actor, now);
    var documents = portalRows_(PORTAL_SHEETS_.documents).filter(function (row) { return String(row.REQUEST_ID) === String(request.REQUEST_ID); });
    var invalid = documents.filter(function (row) { return portalTrue_(row.IS_REQUIRED) && String(row.REVIEW_STATUS).toUpperCase() !== "VALID"; });
    if (invalid.length) throw new Error("DOCUMENT_REVIEW_INCOMPLETE: Semua dokumen wajib harus berstatus VALID.");
    procurementPromoteApproved_(request, actor, now, { oldStatus: request.CURRENT_STATUS, note: String(body.note || "") });
  });
}

function procurementRejectRequest_(body) {
  var note = String(body.note || "").trim();
  if (!note) throw new Error("NOTE_REQUIRED: Alasan penolakan wajib diisi.");
  return procurementWrite_(body, function (request, actor, now) {
    procurementRequireStatus_(request, ["SUBMITTED", "PROCUREMENT_REVIEW", "NEED_CLARIFICATION"]);
    portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, { CURRENT_STATUS: "DROPPED", LAST_UPDATED_AT: now, UPDATED_AT: now, UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 1 });
    procurementLog_(request.REQUEST_ID, "REQUEST_DROPPED", request.CURRENT_STATUS, "DROPPED", actor, note);
  });
}

function procurementSubmitReview_(body) {
  var decision = String(body.decision || "").toUpperCase();
  var note = String(body.note || "").trim();
  var reviews = Array.isArray(body.reviews) ? body.reviews : [];
  if (["REVISION", "APPROVE", "REJECT"].indexOf(decision) < 0) throw new Error("INVALID_DECISION: Keputusan review tidak valid.");
  if ((decision === "REVISION" || decision === "REJECT") && !note) throw new Error("NOTE_REQUIRED: Catatan wajib diisi.");
  return procurementWrite_(body, function (request, actor, now) {
    procurementEnterReview_(request, actor, now);
    reviews.forEach(function (review) {
      var status = String(review.status || "").toUpperCase();
      if (["VALID", "REVISION_REQUIRED"].indexOf(status) < 0) throw new Error("INVALID_REVIEW_STATUS: Status dokumen tidak valid.");
      if (status === "REVISION_REQUIRED" && !String(review.note || "").trim()) throw new Error("REVIEW_NOTE_REQUIRED: Isi catatan pada dokumen yang perlu revisi.");
      var document = portalFind_(PORTAL_SHEETS_.documents, "DOCUMENT_ID", review.documentId);
      if (!document || String(document.REQUEST_ID) !== String(request.REQUEST_ID)) throw new Error("DOCUMENT_NOT_FOUND: Dokumen tidak sesuai request.");
      portalUpdateOne_(PORTAL_SHEETS_.documents, "DOCUMENT_ID", document.DOCUMENT_ID, { REVIEW_STATUS: status, REVIEW_NOTE: String(review.note || "").trim(), REVIEWED_AT: now, REVIEWED_BY: actor.email, UPDATED_AT: now, ROW_VERSION: Number(document.ROW_VERSION || 0) + 1 });
    });
    if (decision === "APPROVE") {
      var invalid = portalRows_(PORTAL_SHEETS_.documents).filter(function (row) { return String(row.REQUEST_ID) === String(request.REQUEST_ID) && portalTrue_(row.IS_REQUIRED) && String(row.REVIEW_STATUS).toUpperCase() !== "VALID"; });
      if (invalid.length) throw new Error("DOCUMENT_REVIEW_INCOMPLETE: Periksa semua dokumen wajib.");
      procurementPromoteApproved_(request, actor, now, { oldStatus: "PROCUREMENT_REVIEW", note: note });
    } else if (decision === "REVISION") {
      portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, { CURRENT_STATUS: "NEED_CLARIFICATION", LAST_UPDATED_AT: now, UPDATED_AT: now, UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 2 });
      procurementLog_(request.REQUEST_ID, "CLARIFICATION_REQUESTED", "PROCUREMENT_REVIEW", "NEED_CLARIFICATION", actor, note);
    } else {
      portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, { CURRENT_STATUS: "DROPPED", LAST_UPDATED_AT: now, UPDATED_AT: now, UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 2 });
      procurementLog_(request.REQUEST_ID, "REQUEST_DROPPED", "PROCUREMENT_REVIEW", "DROPPED", actor, note);
    }
  });
}

function procurementPromote_(body) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    var actor = procurementActor_(body);
    var request = portalFind_(PORTAL_SHEETS_.requests, "REQUEST_ID", body.requestId);
    if (!request || portalTrue_(request.IS_DELETED)) throw new Error("REQUEST_NOT_FOUND: Request tidak ditemukan.");
    if (request.MASTER_REQUEST_ID) return { ok: true, data: procurementDetail_(request.REQUEST_ID) };
    procurementRequireStatus_(request, ["APPROVED_FOR_PROCESS"]);
    procurementPromoteApproved_(request, actor, new Date());
    return { ok: true, data: procurementDetail_(request.REQUEST_ID) };
  });
}

/** Snapshot dashboard melalui Apps Script; tidak memerlukan OAuth Sheets di browser. */
function procurementGetWorkspace_(body) {
  procurementActor_(procurementBody_(body));
  var spreadsheet = getSpreadsheet_();
  var names = ["MASTER DATABASE PENGADAAN", "MASTER PIC", "VENDOR REKANAN", "PENAWARAN VENDOR", "DOKUMEN PENGADAAN"];
  var sheets = {};
  names.forEach(function (name) {
    var sheet = spreadsheet.getSheetByName(name);
    if (sheet) sheets[name] = sheet.getDataRange().getValues();
  });
  if (!sheets["MASTER DATABASE PENGADAAN"]) throw new Error("SHEET_NOT_FOUND: MASTER DATABASE PENGADAAN.");
  return { ok: true, data: { title: spreadsheet.getName(), sheets: sheets } };
}

function procurementUpsertRecord_(body) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    procurementActor_(body);
    var record = body.record || {};
    if (!String(record.requestId || "").trim()) throw new Error("VALIDATION_ERROR: Nomor Request wajib diisi.");
    var sheet = getSpreadsheet_().getSheetByName("MASTER DATABASE PENGADAAN");
    if (!sheet) throw new Error("SHEET_NOT_FOUND: MASTER DATABASE PENGADAAN.");
    var context = procurementEnsureMasterHeaders_(sheet, ["Currency", "Keterangan Status", "Jenis Budget", "Harga Awal Excl. PPN", "Request ID Asli", "Tanggal Memo", "Tanggal Persetujuan Direksi", "Tanggal Send FPC", "Tanggal Approval FPC"]);
    var rows = portalRowsFromSheet_(sheet, context.headers, context.headerRow);
    var ids = [record.requestId, record.originalRequestId].map(function (value) { return String(value || "").trim(); }).filter(Boolean);
    var existing = rows.filter(function (row) {
      return ids.indexOf(String(row["Nomor Request"] || "").trim()) >= 0 || ids.indexOf(String(row["Request ID Asli"] || "").trim()) >= 0;
    })[0];
    var requestedRow = Number(record.sourceRow || 0);
    if (!existing && requestedRow > context.headerRow && requestedRow <= sheet.getLastRow()) {
      var candidate = rows.filter(function (row) { return row.__rowNumber === requestedRow; })[0];
      if (candidate && ids.indexOf(String(candidate["Nomor Request"] || "").trim()) >= 0) existing = candidate;
    }
    var rowNumber = existing ? existing.__rowNumber : procurementNextDataRow_(sheet, context);
    if (!existing && rowNumber > context.headerRow + 1) {
      var source = sheet.getRange(rowNumber - 1, 1, 1, sheet.getLastColumn());
      var destination = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn());
      source.copyTo(destination, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      source.copyTo(destination, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    }
    var patches = {
      "Status": record.status,
      "Keterangan Status": record.statusNotes,
      "Nomor Request": record.requestId,
      "Request ID Asli": record.originalRequestId || "",
      "Nama": record.picName,
      "Group/Div": record.division,
      "Lvl Jabatan": record.position,
      "Lokasi": record.location,
      "Tanggal Request": record.requestDate,
      "Bentuk": record.requestType,
      "Alamat Email User": record.email,
      "Item": record.itemName,
      "Deskripsi": record.description,
      "Qty": record.quantity,
      "Kategori": record.category,
      "Jenis Permintaan": record.requestKind,
      "PeriodeAwal": record.periodStart || "",
      "PeriodeAkhir": record.periodEnd || "",
      "Metode Pengadaan": record.procurementMethod,
      "Budget": record.budget,
      "Jenis Budget": record.budgetType || "",
      "Kode Budget": record.budgetCode,
      "Vendor Terpilih": record.selectedVendor,
      "Nomor PO": record.poNumber,
      "Tanggal PO": record.poDate || "",
      "Tanggal Memo": record.memoDate || "",
      "Tanggal Persetujuan Direksi": record.directorApprovalDate || "",
      "Tanggal Send FPC": record.fpcSentDate || "",
      "Tanggal Approval FPC": record.fpcApprovalDate || "",
      "Harga Awal Excl. PPN": record.initialPriceExcl || 0,
      "Amount PO Excl. PPN": record.poAmountExcl,
      "Amount PO Incld. PPN": record.poAmountIncl,
      "Amount Efficiency incld PPN": record.efficiency,
      "Currency": record.currency
    };
    procurementWritePatches_(sheet, rowNumber, context.headers, patches);
    procurementReplaceOffers_(record);
    SpreadsheetApp.flush();
    return { ok: true, data: { sourceRow: rowNumber } };
  });
}

function procurementDeleteRecords_(body) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    procurementActor_(body);
    var records = Array.isArray(body.records) ? body.records : [];
    if (!records.length) throw new Error("VALIDATION_ERROR: Record yang dihapus tidak tersedia.");
    var sheet = getSpreadsheet_().getSheetByName("MASTER DATABASE PENGADAAN");
    var context = procurementMasterContext_(sheet);
    var rows = portalRowsFromSheet_(sheet, context.headers, context.headerRow);
    var ids = [];
    records.forEach(function (record) { [record.requestId, record.originalRequestId].forEach(function (value) { value = String(value || "").trim(); if (value) ids.push(value); }); });
    var rowNumbers = rows.filter(function (row) {
      return ids.indexOf(String(row["Nomor Request"] || "").trim()) >= 0 || ids.indexOf(String(row["Request ID Asli"] || "").trim()) >= 0;
    }).map(function (row) { return row.__rowNumber; }).sort(function (a, b) { return b - a; });
    if (!rowNumbers.length) throw new Error("ROW_NOT_FOUND: Refresh dashboard lalu coba lagi.");
    procurementDeleteOfferRows_(ids);
    rowNumbers.forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
    SpreadsheetApp.flush();
    return { ok: true, data: { deleted: rowNumbers.length } };
  });
}

/** CRUD requester melalui sesi admin Apps Script, tanpa OAuth Sheets di browser. */
function procurementUpsertPic_(body) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    procurementActor_(body);
    var pic = body.pic || {};
    if (!String(pic.name || "").trim()) throw new Error("VALIDATION_ERROR: Nama requester wajib diisi.");
    var sheet = getSpreadsheet_().getSheetByName("MASTER PIC");
    if (!sheet) throw new Error("SHEET_NOT_FOUND: MASTER PIC.");
    var context = procurementEnsureSheetHeaders_(sheet, "Nama PIC", ["PIC ID", "Group/Divisi", "Jabatan", "Lokasi", "Email", "Status"]);
    var rowNumber = procurementResolveReferenceRow_(sheet, context, Number(pic.sourceRow || 0), "PIC ID", pic.id, "Nama PIC", pic.name);
    if (!rowNumber) rowNumber = procurementNextSheetDataRow_(sheet, context, "Nama PIC");
    procurementCopyPreviousRowFormat_(sheet, rowNumber, context.headerRow);
    var id = String(pic.id || "").trim();
    if (!id || id.indexOf("demo-") === 0) id = "PIC-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    procurementWritePatches_(sheet, rowNumber, context.headers, {
      "PIC ID": id, "Nama PIC": pic.name, "Group/Divisi": pic.division,
      "Jabatan": pic.position, "Lokasi": pic.location, "Email": pic.email,
      "Status": pic.active === false ? "Tidak Aktif" : "Aktif"
    });
    SpreadsheetApp.flush();
    return { ok: true, data: { id: id, sourceRow: rowNumber } };
  });
}

function procurementDeletePics_(body) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    procurementActor_(body);
    return procurementDeleteReferences_("MASTER PIC", "Nama PIC", Array.isArray(body.pics) ? body.pics : [], "PIC ID", "id", "name");
  });
}

/** CRUD vendor memakai backend yang sama dengan master pengadaan. */
function procurementUpsertVendor_(body) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    procurementActor_(body);
    var vendor = body.vendor || {};
    if (!String(vendor.name || "").trim()) throw new Error("VALIDATION_ERROR: Nama vendor wajib diisi.");
    var sheet = getSpreadsheet_().getSheetByName("VENDOR REKANAN");
    if (!sheet) throw new Error("SHEET_NOT_FOUND: VENDOR REKANAN.");
    var context = procurementEnsureSheetHeaders_(sheet, "Nama Pihak Penyedia Jasa", ["Nama Bank", "Nomor Rekening"]);
    var rowNumber = procurementResolveReferenceRow_(sheet, context, Number(vendor.sourceRow || 0), "", "", "Nama Pihak Penyedia Jasa", vendor.name);
    if (!rowNumber) rowNumber = procurementNextSheetDataRow_(sheet, context, "Nama Pihak Penyedia Jasa");
    procurementCopyPreviousRowFormat_(sheet, rowNumber, context.headerRow);
    procurementWritePatches_(sheet, rowNumber, context.headers, {
      "No": rowNumber - context.headerRow,
      "Status Prioritas": vendor.priority,
      "Status Kelengkapan Dokumen": vendor.documentStatus,
      "Kesediaan Buka Rekening": vendor.bankAccountCommitment,
      "Nama Bank": vendor.bankName,
      "Nomor Rekening": vendor.bankAccountNumber,
      "Nama Pihak Penyedia Jasa": vendor.name,
      "Alamat Penyedia Jasa TI": vendor.address,
      "Jasa Yang diberikan": vendor.services,
      "Nama PIC 1": vendor.picName,
      "Contact Person 1": vendor.phone,
      "Email 1": vendor.email,
      "Jabatan/Divisi Contact Person 1": vendor.position,
      "Kritikal/Non Kritikal": vendor.criticality,
      "Kategori": vendor.category,
      "Barang/Jasa": vendor.goodsOrServices,
      "PKS": vendor.agreementStatus,
      "Keterangan": vendor.notes
    });
    SpreadsheetApp.flush();
    return { ok: true, data: { id: "vendor-row-" + rowNumber, sourceRow: rowNumber } };
  });
}

function procurementDeleteVendors_(body) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    procurementActor_(body);
    return procurementDeleteReferences_("VENDOR REKANAN", "Nama Pihak Penyedia Jasa", Array.isArray(body.vendors) ? body.vendors : [], "", "", "name");
  });
}

function procurementEnsureSheetHeaders_(sheet, requiredHeader, additions) {
  var context = procurementSheetContext_(sheet, requiredHeader);
  additions.forEach(function (header) {
    if (context.headers.indexOf(header) < 0) {
      sheet.getRange(context.headerRow, sheet.getLastColumn() + 1).setValue(header);
      context.headers.push(header);
    }
  });
  return procurementSheetContext_(sheet, requiredHeader);
}

function procurementResolveReferenceRow_(sheet, context, requestedRow, idHeader, idValue, nameHeader, nameValue) {
  var rows = portalRowsFromSheet_(sheet, context.headers, context.headerRow);
  var id = String(idValue || "").trim();
  var name = String(nameValue || "").trim().toLowerCase();
  var byRow = rows.filter(function (row) { return row.__rowNumber === requestedRow; })[0];
  if (byRow) return byRow.__rowNumber;
  var existing = rows.filter(function (row) {
    if (idHeader && id && String(row[idHeader] || "").trim() === id) return true;
    return name && String(row[nameHeader] || "").trim().toLowerCase() === name;
  })[0];
  return existing ? existing.__rowNumber : 0;
}

function procurementCopyPreviousRowFormat_(sheet, rowNumber, headerRow) {
  if (rowNumber <= headerRow + 1 || rowNumber <= sheet.getLastRow()) return;
  sheet.getRange(rowNumber - 1, 1, 1, sheet.getLastColumn()).copyTo(
    sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()),
    SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
    false
  );
}

function procurementDeleteReferences_(sheetName, keyHeader, items, idHeader, itemIdKey, itemNameKey) {
  if (!items.length) throw new Error("VALIDATION_ERROR: Data yang dihapus tidak tersedia.");
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error("SHEET_NOT_FOUND: " + sheetName + ".");
  var context = procurementSheetContext_(sheet, keyHeader);
  var rows = portalRowsFromSheet_(sheet, context.headers, context.headerRow);
  var rowNumbers = [];
  items.forEach(function (item) {
    var requestedRow = Number(item.sourceRow || 0);
    var id = itemIdKey ? String(item[itemIdKey] || "").trim() : "";
    var name = String(item[itemNameKey] || "").trim().toLowerCase();
    var match = rows.filter(function (row) {
      if (row.__rowNumber === requestedRow) return true;
      if (idHeader && id && String(row[idHeader] || "").trim() === id) return true;
      return name && String(row[keyHeader] || "").trim().toLowerCase() === name;
    })[0];
    if (match && rowNumbers.indexOf(match.__rowNumber) < 0) rowNumbers.push(match.__rowNumber);
  });
  if (!rowNumbers.length) throw new Error("ROW_NOT_FOUND: Refresh dashboard lalu coba lagi.");
  rowNumbers.sort(function (a, b) { return b - a; }).forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
  SpreadsheetApp.flush();
  return { ok: true, data: { deleted: rowNumbers.length } };
}

function procurementEnsureMasterHeaders_(sheet, additions) {
  var context = procurementMasterContext_(sheet);
  additions.forEach(function (header) {
    if (context.headers.indexOf(header) < 0) {
      sheet.getRange(context.headerRow, sheet.getLastColumn() + 1).setValue(header);
      context.headers.push(header);
    }
  });
  return procurementMasterContext_(sheet);
}

function procurementNextDataRow_(sheet, context) {
  var rows = portalRowsFromSheet_(sheet, context.headers, context.headerRow);
  return rows.reduce(function (last, row) {
    return row["Nomor Request"] || row["Tanggal Request"] || row.Item ? Math.max(last, row.__rowNumber) : last;
  }, context.headerRow) + 1;
}

function procurementWritePatches_(sheet, rowNumber, headers, patches) {
  var cells = Object.keys(patches).map(function (header) { return { column: headers.indexOf(header), value: patches[header] }; }).filter(function (cell) { return cell.column >= 0; }).sort(function (a, b) { return a.column - b.column; });
  var groups = [];
  cells.forEach(function (cell) {
    var group = groups[groups.length - 1];
    if (!group || cell.column !== group[group.length - 1].column + 1) groups.push([cell]);
    else group.push(cell);
  });
  groups.forEach(function (group) { sheet.getRange(rowNumber, group[0].column + 1, 1, group.length).setValues([group.map(function (cell) { return cell.value === undefined ? "" : cell.value; })]); });
}

function procurementReplaceOffers_(record) {
  var sheet = getSpreadsheet_().getSheetByName("PENAWARAN VENDOR");
  if (!sheet) return;
  var context = procurementSheetContext_(sheet, "Request ID");
  var requestId = String(record.originalRequestId || record.requestId || "").trim();
  var rows = portalRowsFromSheet_(sheet, context.headers, context.headerRow).filter(function (row) { return String(row["Request ID"] || "").trim() === requestId; });
  rows.forEach(function (row) { sheet.getRange(row.__rowNumber, 1, 1, sheet.getLastColumn()).clearContent(); });
  var reusable = rows.map(function (row) { return row.__rowNumber; });
  var nextRow = procurementNextSheetDataRow_(sheet, context, "Request ID");
  (record.offers || []).forEach(function (offer, index) {
    var rowNumber = reusable[index] || nextRow++;
    procurementWritePatches_(sheet, rowNumber, context.headers, {
      "Request ID": requestId, "Urutan (Auto)": index + 1, "Vendor": offer.vendor,
      "Penawaran Awal": offer.initialOffer, "Penawaran Revisi/BAFO": offer.bafo,
      "Harga Final/Nego": offer.finalOffer, "PPN %": offer.taxRate,
      "Final Incl. PPN": Number(offer.finalOffer || 0) * (1 + Number(offer.taxRate || 0.11)),
      "Link Penawaran/BAFO": offer.quotationLink || "", "Lolos Teknis": offer.technicalPass ? "Ya" : "Tidak",
      "Pemenang": offer.winner ? "Ya" : "Tidak"
    });
  });
}

function procurementDeleteOfferRows_(ids) {
  var sheet = getSpreadsheet_().getSheetByName("PENAWARAN VENDOR");
  if (!sheet) return;
  var context = procurementSheetContext_(sheet, "Request ID");
  portalRowsFromSheet_(sheet, context.headers, context.headerRow).filter(function (row) { return ids.indexOf(String(row["Request ID"] || "").trim()) >= 0; }).map(function (row) { return row.__rowNumber; }).sort(function (a, b) { return b - a; }).forEach(function (rowNumber) { sheet.deleteRow(rowNumber); });
}

function procurementSheetContext_(sheet, requiredHeader) {
  var values = sheet.getDataRange().getDisplayValues();
  for (var rowIndex = 0; rowIndex < Math.min(values.length, 20); rowIndex++) {
    var headers = values[rowIndex].map(function (value) { return String(value || "").trim(); });
    if (headers.indexOf(requiredHeader) >= 0) return { headers: headers, headerRow: rowIndex + 1 };
  }
  throw new Error("MASTER_HEADER_REQUIRED: Header " + requiredHeader + " tidak ditemukan.");
}

function procurementNextSheetDataRow_(sheet, context, keyHeader) {
  return portalRowsFromSheet_(sheet, context.headers, context.headerRow).reduce(function (last, row) { return row[keyHeader] ? Math.max(last, row.__rowNumber) : last; }, context.headerRow) + 1;
}

function procurementPromoteApproved_(request, actor, now, approval) {
  if (request.MASTER_REQUEST_ID) return String(request.MASTER_REQUEST_ID);
  var sheet = getSpreadsheet_().getSheetByName("MASTER DATABASE PENGADAAN");
  if (!sheet) throw new Error("SHEET_NOT_FOUND: MASTER DATABASE PENGADAAN.");
  var masterContext = procurementMasterContext_(sheet);
  var headers = masterContext.headers;
  if (headers.indexOf("Nomor Request") < 0) throw new Error("MASTER_HEADER_REQUIRED: Header Nomor Request tidak ditemukan; promotion dibatalkan tanpa mengubah master.");

  // Sheet lama menyimpan nomor portal langsung di Nomor Request. Sheet baru dapat
  // memakai Request ID Asli dan Nomor Request terpisah. Keduanya tetap idempotent.
  var hasOriginalRequestId = headers.indexOf("Request ID Asli") >= 0;
  var reconciliationHeader = hasOriginalRequestId ? "Request ID Asli" : "Nomor Request";
  var existing = portalRowsFromSheet_(sheet, headers, masterContext.headerRow).filter(function (row) {
    return String(row[reconciliationHeader] || "").trim() === String(request.REQUEST_NUMBER || "").trim();
  })[0];
  var masterId = existing
    ? String(existing["Nomor Request"] || request.REQUEST_NUMBER)
    : hasOriginalRequestId
      ? procurementNextMasterId_(sheet, headers, masterContext.headerRow)
      : String(request.REQUEST_NUMBER);
  if (!existing) {
    var values = {
      "Nomor Request": masterId,
      "Request ID Asli": request.REQUEST_NUMBER,
      "Nama": request.REQUESTER_NAME,
      "Alamat Email User": request.REQUESTER_EMAIL,
      "Group/Div": request.REQUESTER_DIVISION || "",
      "Tanggal Request": request.SUBMITTED_AT || request.CREATED_AT,
      "Bentuk": request.REQUEST_TYPE,
      "Jenis Permintaan": request.REQUEST_TYPE,
      "Item": request.REQUEST_TYPE,
      "Deskripsi": request.REQUESTER_NOTES || "",
      "Status": "Ongoing",
      "Keterangan Status": "Disetujui melalui Portal Procurement"
    };
    sheet.appendRow(headers.map(function (header) { return values[header] === undefined ? "" : values[header]; }));
    SpreadsheetApp.flush();
  } else {
    var existingStatus = String(existing.Status || "").trim().toUpperCase();
    var statusColumn = headers.indexOf("Status");
    if (statusColumn >= 0 && (!existingStatus || existingStatus === "UPCOMING")) {
      sheet.getRange(existing.__rowNumber, statusColumn + 1).setValue("Ongoing");
    }
  }
  var updated = portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, { MASTER_REQUEST_ID: masterId, CURRENT_STATUS: "IN_PROCESS", LAST_UPDATED_AT: now, UPDATED_AT: now, UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 1 });
  Object.keys(updated).forEach(function (key) { request[key] = updated[key]; });
  if (approval) procurementLog_(request.REQUEST_ID, "REQUEST_APPROVED", approval.oldStatus, "APPROVED_FOR_PROCESS", actor, approval.note);
  procurementLog_(request.REQUEST_ID, "PROMOTED_TO_PROCUREMENT", "APPROVED_FOR_PROCESS", "IN_PROCESS", actor, "Dipromote otomatis ke " + masterId);
  return masterId;
}


function procurementSyncStatus_(body) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    var actor = procurementActor_(body);
    var request = portalFind_(PORTAL_SHEETS_.requests, "MASTER_REQUEST_ID", body.masterRequestId)
      || portalFind_(PORTAL_SHEETS_.requests, "REQUEST_NUMBER", body.masterRequestId);
    if (!request) throw new Error("PORTAL_LINK_NOT_FOUND: Master Request ID tidak terhubung ke portal.");
    var next = procurementPortalStatus_(body.status, body.poNumber, body.poUrl);
    var poNumber = String(body.poNumber || "");
    var poUrl = String(body.poUrl || "");
    if (String(request.CURRENT_STATUS || "").toUpperCase() === next && String(request.PO_NUMBER || "") === poNumber && String(request.PO_URL || "") === poUrl) {
      return { ok: true, data: { requestId: request.REQUEST_ID, status: next, unchanged: true } };
    }
    var now = new Date();
    portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, { CURRENT_STATUS: next, PO_NUMBER: poNumber, PO_URL: poUrl, LAST_UPDATED_AT: now, UPDATED_AT: now, UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 1 });
    procurementLog_(request.REQUEST_ID, "STATUS_CHANGED", request.CURRENT_STATUS, next, actor, "Sinkron dari Procurement " + body.masterRequestId);
    return { ok: true, data: { requestId: request.REQUEST_ID, status: next } };
  });
}

/**
 * Menyegarkan status portal dari master dalam satu kali pembacaan sheet.
 * Dipanggil saat requester membuka daftar/detail agar perubahan langsung di
 * spreadsheet tetap tersinkron walaupun dashboard admin sedang tidak terbuka.
 */
function procurementReconcilePortalResult_(result, detailMode) {
  try {
    if (!result || result.ok === false || !result.data) return result;
    var requests = detailMode ? [result.data.request] : result.data.requests;
    if (!requests || !requests.length) return result;
    var reconciled = procurementReconcileRequestsFromMaster_(requests);
    if (detailMode) result.data.request = reconciled[0] || result.data.request;
    else result.data.requests = reconciled;
  } catch (error) {
    // Gangguan sinkron master tidak boleh membuat portal requester ikut gagal.
    Logger.log("MASTER_STATUS_SYNC_SKIPPED: " + (error && error.message ? error.message : error));
  }
  return result;
}

function procurementReconcileRequestsFromMaster_(requests) {
  var linked = requests.filter(function (request) { return request && request.MASTER_REQUEST_ID; });
  if (!linked.length) return requests;
  var sheet = getSpreadsheet_().getSheetByName("MASTER DATABASE PENGADAAN");
  if (!sheet) return requests;
  var context = procurementMasterContext_(sheet);
  var masterRows = portalRowsFromSheet_(sheet, context.headers, context.headerRow);
  var masterById = {};
  masterRows.forEach(function (row) {
    [row["Nomor Request"], row["Request ID Asli"]].forEach(function (value) {
      var key = String(value || "").trim();
      if (key) masterById[key] = row;
    });
  });
  return requests.map(function (request) {
    if (!request || !request.MASTER_REQUEST_ID) return request;
    var master = masterById[String(request.MASTER_REQUEST_ID || "").trim()] || masterById[String(request.REQUEST_NUMBER || "").trim()];
    if (!master) return request;
    var nextStatus = procurementPortalStatusFromMaster_(master);
    if (!nextStatus) return request;
    var poNumber = String(master["Nomor PO"] || "").trim();
    var poUrl = String(master["Link PO"] || master["PO URL"] || "").trim();
    var currentStatus = String(request.CURRENT_STATUS || "").toUpperCase();
    var currentPoNumber = String(request.PO_NUMBER || "").trim();
    var currentPoUrl = String(request.PO_URL || "").trim();
    if (currentStatus === nextStatus && currentPoNumber === poNumber && currentPoUrl === poUrl) return request;
    var now = new Date();
    var system = { userId: "SYSTEM", email: "", name: "Procurement Master", role: "SYSTEM" };
    var updated = portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, {
      CURRENT_STATUS: nextStatus,
      PO_NUMBER: poNumber,
      PO_URL: poUrl,
      LAST_UPDATED_AT: now,
      UPDATED_AT: now,
      UPDATED_BY: "Procurement Master",
      ROW_VERSION: Number(request.ROW_VERSION || 0) + 1
    });
    procurementLog_(request.REQUEST_ID, "MASTER_STATUS_SYNCED", currentStatus, nextStatus, system, "Status mengikuti MASTER DATABASE PENGADAAN.");
    return updated;
  });
}

function procurementPortalStatusFromMaster_(master) {
  var status = String(master.Status || "").trim().toUpperCase().replace(/[ _-]+/g, " ");
  var hasPo = String(master["Nomor PO"] || master["Link PO"] || master["PO URL"] || "").trim();
  if (["DROPPED", "DROP", "CANCELLED", "CANCELED", "DIBATALKAN"].indexOf(status) >= 0) return "DROPPED";
  if (["COMPLETE", "COMPLETED", "SELESAI"].indexOf(status) >= 0) return "COMPLETED";
  if (["PO", "PO ISSUED", "PO TERBIT"].indexOf(status) >= 0 || hasPo) return "PO_ISSUED";
  if (["UPCOMING", "ONGOING", "ON GOING", "IN PROCESS", "PROSES"].indexOf(status) >= 0) return "IN_PROCESS";
  return "";
}

function procurementPortalStatus_(status, poNumber, poUrl) {
  var masterStatus = String(status || "").trim().toUpperCase();
  if (masterStatus === "COMPLETE" || masterStatus === "COMPLETED") return "COMPLETED";
  if (["DROPPED", "CANCELLED", "CANCELED"].indexOf(masterStatus) >= 0) return "DROPPED";
  if (masterStatus === "PO" || String(poNumber || poUrl || "").trim()) return "PO_ISSUED";
  return "IN_PROCESS";
}

function procurementWrite_(body, callback) {
  body = procurementBody_(body);
  return portalWithLock_(function () {
    var actor = procurementActor_(body);
    var request = portalFind_(PORTAL_SHEETS_.requests, "REQUEST_ID", body.requestId);
    if (!request || portalTrue_(request.IS_DELETED)) throw new Error("REQUEST_NOT_FOUND: Request tidak ditemukan.");
    callback(request, actor, new Date());
    return { ok: true, data: procurementDetail_(request.REQUEST_ID) };
  });
}

function procurementActor_(body) {
  var token = String(body && body.idToken || "");
  var digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  var cache = CacheService.getScriptCache();
  var cached = cache.get("proc-admin-" + digest);
  if (cached) return JSON.parse(cached);
  var actor = portalIdentity_(body);
  var user = portalFind_(PORTAL_SHEETS_.users, "EMAIL", actor.email, true);
  if (!user || !portalTrue_(user.ACTIVE) || String(user.ROLE).toUpperCase() !== "PROCUREMENT_ADMIN") throw new Error("FORBIDDEN: Akun tidak terdaftar sebagai Procurement Admin.");
  actor.role = "PROCUREMENT_ADMIN";
  // Cache singkat menghindari tokeninfo Google di setiap klik tanpa menunda revokasi terlalu lama.
  cache.put("proc-admin-" + digest, JSON.stringify(actor), 300);
  return actor;
}

function procurementRequireStatus_(request, allowed) {
  var status = String(request.CURRENT_STATUS).toUpperCase();
  if (allowed.indexOf(status) < 0) throw new Error("INVALID_STATUS_TRANSITION: Status " + status + " tidak dapat menjalankan action ini.");
}

function procurementEnterReview_(request, actor, now) {
  procurementRequireStatus_(request, ["SUBMITTED", "NEED_CLARIFICATION", "PROCUREMENT_REVIEW"]);
  if (String(request.CURRENT_STATUS).toUpperCase() === "PROCUREMENT_REVIEW") return;
  var updated = portalUpdateOne_(PORTAL_SHEETS_.requests, "REQUEST_ID", request.REQUEST_ID, { CURRENT_STATUS: "PROCUREMENT_REVIEW", LAST_UPDATED_AT: now, UPDATED_AT: now, UPDATED_BY: actor.email, ROW_VERSION: Number(request.ROW_VERSION || 0) + 1 });
  procurementLog_(request.REQUEST_ID, "REVIEW_STARTED", request.CURRENT_STATUS, "PROCUREMENT_REVIEW", actor, "");
  Object.keys(updated).forEach(function (key) { request[key] = updated[key]; });
}

function procurementDetail_(requestId) {
  var request = portalFind_(PORTAL_SHEETS_.requests, "REQUEST_ID", requestId);
  if (!request) throw new Error("REQUEST_NOT_FOUND: Request tidak ditemukan.");
  var versions = portalRows_(PORTAL_SHEETS_.versions);
  var documents = portalRows_(PORTAL_SHEETS_.documents).filter(function (row) { return String(row.REQUEST_ID) === String(requestId); }).map(function (row) {
    var version = versions.filter(function (item) { return String(item.DOCUMENT_ID) === String(row.DOCUMENT_ID) && portalTrue_(item.IS_CURRENT); })[0] || {};
    return { documentId: String(row.DOCUMENT_ID), type: String(row.DOCUMENT_TYPE), required: portalTrue_(row.IS_REQUIRED), versionNumber: Number(row.CURRENT_VERSION_NUMBER || 0), reviewStatus: String(row.REVIEW_STATUS || "NOT_UPLOADED"), reviewNote: String(row.REVIEW_NOTE || ""), fileName: String(version.FILE_NAME || ""), fileUrl: String(version.FILE_URL || ""), reviewedAt: procurementIso_(row.REVIEWED_AT), reviewedBy: String(row.REVIEWED_BY || "") };
  });
  var logs = portalRows_(PORTAL_SHEETS_.logs).filter(function (row) { return String(row.REQUEST_ID) === String(requestId); }).sort(function (a, b) { return portalTime_(a.EVENT_AT) - portalTime_(b.EVENT_AT); }).map(function (row) { return { id: String(row.LOG_ID), eventType: String(row.EVENT_TYPE), oldStatus: String(row.OLD_STATUS || ""), newStatus: String(row.NEW_STATUS || ""), at: procurementIso_(row.EVENT_AT), actorName: String(row.ACTOR_NAME || ""), actorEmail: String(row.ACTOR_EMAIL || ""), note: String(row.NOTE || "") }; });
  return { request: procurementRequestDto_(request), documents: documents, logs: logs };
}

function procurementRequestDto_(row) { return { requestId: String(row.REQUEST_ID), requestNumber: String(row.REQUEST_NUMBER), requestType: String(row.REQUEST_TYPE), requesterName: String(row.REQUESTER_NAME), requesterEmail: String(row.REQUESTER_EMAIL), requesterDivision: String(row.REQUESTER_DIVISION || ""), requesterNotes: String(row.REQUESTER_NOTES || ""), status: String(row.CURRENT_STATUS), submittedAt: procurementIso_(row.SUBMITTED_AT), updatedAt: procurementIso_(row.LAST_UPDATED_AT || row.UPDATED_AT), masterRequestId: String(row.MASTER_REQUEST_ID || "") }; }
function procurementLog_(requestId, eventType, oldStatus, newStatus, actor, note, documentId) { portalAppend_(PORTAL_SHEETS_.logs, { LOG_ID: "LOG-" + Utilities.getUuid(), REQUEST_ID: requestId, EVENT_TYPE: eventType, OLD_STATUS: oldStatus, NEW_STATUS: newStatus, EVENT_AT: new Date(), ACTOR_USER_ID: actor.userId, ACTOR_EMAIL: actor.email, ACTOR_NAME: actor.name, ACTOR_ROLE: actor.role, NOTE: note || "", RELATED_DOCUMENT_ID: documentId || "", RELATED_VERSION_ID: "", METADATA_JSON: "{}" }); }
function procurementIso_(value) { if (!value) return ""; var date = new Date(value); return isNaN(date.getTime()) ? String(value) : date.toISOString(); }
function procurementMasterContext_(sheet) {
  var lastColumn = sheet.getLastColumn();
  var lastRow = typeof sheet.getLastRow === "function" ? sheet.getLastRow() : 20;
  var scanRows = Math.min(Math.max(lastRow, 1), 20);
  var grid = sheet.getRange(1, 1, scanRows, lastColumn).getDisplayValues();
  var canonical = ["Nomor Request", "Request ID Asli", "Nama", "Alamat Email User", "Tanggal Request", "Jenis Permintaan", "Status"];
  for (var rowIndex = 0; rowIndex < grid.length; rowIndex++) {
    var normalized = grid[rowIndex].map(procurementNormalizeHeader_);
    if (normalized.indexOf("nomor request") < 0) continue;
    var headers = grid[rowIndex].map(function (value) {
      var key = procurementNormalizeHeader_(value);
      var match = canonical.filter(function (name) { return procurementNormalizeHeader_(name) === key; })[0];
      return match || String(value || "").trim();
    });
    return { headers: headers, headerRow: rowIndex + 1 };
  }
  throw new Error("MASTER_HEADER_REQUIRED: Header Nomor Request tidak ditemukan pada 20 baris pertama.");
}
function procurementNormalizeHeader_(value) { return String(value || "").replace(/\u00a0/g, " ").trim().toLowerCase().replace(/\s+/g, " "); }
function portalRowsFromSheet_(sheet, headers, headerRow) { var values = sheet.getDataRange().getValues(); return values.slice(headerRow || 1).map(function (row, rowIndex) { var result = { __rowNumber: (headerRow || 1) + rowIndex + 1 }; headers.forEach(function (header, index) { result[header] = row[index]; }); return result; }); }
function procurementNextMasterId_(sheet, headers, headerRow) { var year = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy"); var index = headers.indexOf("Nomor Request"); var max = sheet.getDataRange().getDisplayValues().slice(headerRow || 1).reduce(function (current, row) { var match = String(row[index] || "").match(new RegExp("^PROC-" + year + "-(\\d+)$")); return match ? Math.max(current, Number(match[1])) : current; }, 0); return "PROC-" + year + "-" + String(max + 1).padStart(4, "0"); }
function procurementBody_(value) { if (!value || typeof value !== "object") return {}; if (value.body && typeof value.body === "object") return value.body; if (value.payload && typeof value.payload === "object") return value.payload; return value; }
