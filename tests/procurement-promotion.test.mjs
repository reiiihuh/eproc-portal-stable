import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("apps-script/ProcurementReview.gs", "utf8");
const backendSource = readFileSync("apps-script/BackendPortal.gs", "utf8");

function createHarness() {
  const headers = [
    "Nomor Request",
    "Request ID Asli",
    "Nama",
    "Alamat Email User",
    "Group/Div",
    "Lvl Jabatan",
    "Lokasi",
    "Tanggal Request",
    "Jenis Permintaan",
    "Status",
    "Nomor PO",
    "Link PO",
  ];
  const masterRows = [];
  const logs = [];
  const request = {
    REQUEST_ID: "REQ-1",
    REQUEST_NUMBER: "NPR-2026-0001",
    REQUEST_TYPE: "Pengadaan Baru",
    REQUESTER_NAME: "Requester Nano",
    REQUESTER_EMAIL: "requester@example.com",
    REQUESTER_DIVISION: "Information Technology",
    REQUESTER_POSITION: "Officer",
    REQUESTER_LOCATION: "Head Office",
    SUBMITTED_AT: new Date("2026-09-14T02:00:00Z"),
    CURRENT_STATUS: "PROCUREMENT_REVIEW",
    ROW_VERSION: 4,
  };
  const documents = [{ REQUEST_ID: "REQ-1", IS_REQUIRED: true, REVIEW_STATUS: "VALID" }];
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => Math.max(1, masterRows.length + 1),
    getRange: (row, column) => ({
      getDisplayValues: () => [headers],
      setValue: value => { masterRows[row - 2][column - 1] = value; },
      setNumberFormat: () => undefined,
    }),
    getDataRange: () => ({ getValues: () => [headers, ...masterRows], getDisplayValues: () => [headers, ...masterRows] }),
    appendRow: row => masterRows.push(row),
  };
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  context.PORTAL_SHEETS_ = { requests: "PORTAL_REQUESTS", documents: "PORTAL_DOCUMENTS" };
  context.SpreadsheetApp = { flush: () => undefined };
  context.Session = { getScriptTimeZone: () => "Asia/Jakarta" };
  context.Utilities = { formatDate: () => "2026-09-14" };
  context.getSpreadsheet_ = () => ({ getSheetByName: name => name === "MASTER DATABASE PENGADAAN" ? sheet : null });
  context.portalRows_ = name => name === "PORTAL_DOCUMENTS" ? documents : name === "PORTAL_REQUESTS" ? [request] : [];
  context.portalTrue_ = value => value === true || String(value).toLowerCase() === "true";
  context.portalRowsFromSheet_ = () => masterRows.map((row, index) => ({ __rowNumber: index + 2, ...Object.fromEntries(headers.map((header, column) => [header, row[column]])) }));
  context.procurementNextMasterId_ = () => "PROC-2026-0001";
  context.portalUpdateOne_ = (_sheet, _key, _id, changes) => {
    Object.assign(request, changes);
    return { ...request };
  };
  context.procurementLog_ = (_id, eventType, oldStatus, newStatus) => logs.push({ eventType, oldStatus, newStatus });
  context.procurementWrite_ = (_body, callback) => {
    callback(request, { email: "procurement@example.com", name: "Procurement", role: "PROCUREMENT_ADMIN" }, new Date("2026-09-14T03:00:00Z"));
    return { ok: true, data: { request } };
  };
  context.procurementActor_ = () => ({ email: "procurement@example.com", name: "Procurement", role: "PROCUREMENT_ADMIN" });
  context.portalWithLock_ = callback => callback();
  context.portalTime_ = value => new Date(value || 0).getTime();
  return { context, headers, logs, masterRows, request };
}

test("review queue reconciles approvals created before automatic promotion", () => {
  const { context, masterRows, request } = createHarness();
  request.CURRENT_STATUS = "APPROVED_FOR_PROCESS";

  const result = context.procurementListQueue_({});

  assert.equal(masterRows.length, 1);
  assert.equal(request.MASTER_REQUEST_ID, "NPR-2026-0001");
  assert.equal(request.CURRENT_STATUS, "IN_PROCESS");
  assert.equal(result.data.length, 0, "reconciled request should leave the review queue");
});

test("dropped master request becomes a historical cancellation", () => {
  const { context, logs, request } = createHarness();
  request.CURRENT_STATUS = "IN_PROCESS";
  request.MASTER_REQUEST_ID = "PROC-2026-0001";
  context.portalFind_ = () => request;

  context.procurementSyncStatus_({ masterRequestId: request.MASTER_REQUEST_ID, status: "Dropped" });

  assert.equal(request.CURRENT_STATUS, "DROPPED");
  assert.equal(logs.at(-1).newStatus, "DROPPED");
});

test("requester list and detail reconcile linked status directly from master", () => {
  assert.match(backendSource, /portalListMyRequests_[\s\S]*procurementReconcilePortalResult_\(result, false\)/);
  assert.match(backendSource, /portalGetRequestDetail_[\s\S]*procurementReconcileRequestsFromMaster_\(\[request\]\)/);
});

test("review rejection becomes a final Dropped status", () => {
  const { context, logs, request } = createHarness();
  context.procurementRejectRequest_({ requestId: request.REQUEST_ID, note: "Pengadaan dihentikan" });
  assert.equal(request.CURRENT_STATUS, "DROPPED");
  assert.equal(logs.at(-1).eventType, "REQUEST_DROPPED");
});

test("portal pull maps Dropped, PO, and Complete from the procurement master", () => {
  const { context, headers, masterRows, request } = createHarness();
  request.CURRENT_STATUS = "IN_PROCESS";
  request.MASTER_REQUEST_ID = "PROC-2026-0001";
  masterRows.push(headers.map(header => ({
    "Nomor Request": "PROC-2026-0001",
    "Request ID Asli": request.REQUEST_NUMBER,
    Status: "Dropped",
  })[header] ?? ""));

  context.procurementReconcilePortalResult_({ ok: true, data: { requests: [request] } }, false);
  assert.equal(request.CURRENT_STATUS, "DROPPED");

  masterRows[0][headers.indexOf("Status")] = "PO";
  masterRows[0][headers.indexOf("Nomor PO")] = "PO-2026-001";
  context.procurementReconcilePortalResult_({ ok: true, data: { requests: [request] } }, false);
  assert.equal(request.CURRENT_STATUS, "PO_ISSUED");
  assert.equal(request.PO_NUMBER, "PO-2026-001");

  masterRows[0][headers.indexOf("Status")] = "Complete";
  context.procurementReconcilePortalResult_({ ok: true, data: { requests: [request] } }, false);
  assert.equal(request.CURRENT_STATUS, "COMPLETED");
});

for (const action of ["approveRequest", "submitReview"]) {
  test(`${action} promotes an approved portal request exactly once`, () => {
    const { context, headers, logs, masterRows, request } = createHarness();
    if (action === "approveRequest") context.procurementApproveRequest_({ requestId: request.REQUEST_ID });
    else context.procurementSubmitReview_({ requestId: request.REQUEST_ID, decision: "APPROVE", reviews: [] });

    assert.equal(masterRows.length, 1);
    const master = Object.fromEntries(headers.map((header, index) => [header, masterRows[0][index]]));
    assert.equal(master["Request ID Asli"], "NPR-2026-0001");
    assert.equal(master["Nomor Request"], "NPR-2026-0001");
    assert.equal(master.Status, "Ongoing");
    assert.equal(master["Group/Div"], "Information Technology");
    assert.equal(master["Lvl Jabatan"], "Officer");
    assert.equal(master.Lokasi, "Head Office");
    assert.equal(Object.prototype.toString.call(master["Tanggal Request"]), "[object Date]");
    assert.equal(request.MASTER_REQUEST_ID, "NPR-2026-0001");
    assert.equal(request.CURRENT_STATUS, "IN_PROCESS");
    assert.deepEqual(logs.map(log => log.eventType), ["REQUEST_APPROVED", "PROMOTED_TO_PROCUREMENT"]);

    context.procurementPromoteApproved_(request, { email: "procurement@example.com" }, new Date());
    assert.equal(masterRows.length, 1, "retry must not append a duplicate master row");
  });
}

test("retrying an older approved row upgrades Upcoming to Ongoing", () => {
  const { context, headers, masterRows, request } = createHarness();
  masterRows.push(headers.map(header => ({
    "Nomor Request": "PROC-2026-0001",
    "Request ID Asli": request.REQUEST_NUMBER,
    Status: "Upcoming",
  })[header] ?? ""));
  context.procurementApproveRequest_({ requestId: request.REQUEST_ID });
  assert.equal(masterRows.length, 1);
  assert.equal(masterRows[0][headers.indexOf("Status")], "Ongoing");
});
