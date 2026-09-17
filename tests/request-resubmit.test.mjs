import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync("apps-script/BackendPortal.gs", "utf8");

function createHarness(status) {
  const request = { REQUEST_ID: "REQ-1", REQUEST_NUMBER: "NPR-2026-0001", CURRENT_STATUS: status, ROW_VERSION: 2 };
  const logs = [];
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  context.portalWithLock_ = callback => callback();
  context.portalIdentity_ = () => ({ userId: "USER-1", email: "requester@example.com", name: "Requester" });
  context.portalRequireCompleteProfile_ = () => ({ DISPLAY_NAME: "Requester", DIVISION: "IT", POSITION: "Officer", LOCATION: "Head Office" });
  context.portalEnsureSheetHeaders_ = () => undefined;
  context.portalOwnedRequest_ = () => request;
  context.portalRows_ = () => [{ REQUEST_ID: request.REQUEST_ID, IS_REQUIRED: true, CURRENT_VERSION_NUMBER: 1 }];
  context.portalUpdateOne_ = (_sheet, _key, _id, changes) => {
    Object.assign(request, changes);
    return { ...request };
  };
  context.portalAppendLog_ = (_id, eventType, oldStatus, newStatus, _actor, note) => {
    const log = { eventType, oldStatus, newStatus, note };
    logs.push(log);
    return log;
  };
  return { context, logs, request };
}

test("rejected request can be corrected and resubmitted without changing its number", () => {
  const { context, logs, request } = createHarness("REJECTED");
  context.portalSubmitRequest_({ requestId: request.REQUEST_ID });

  assert.equal(request.REQUEST_NUMBER, "NPR-2026-0001");
  assert.equal(request.CURRENT_STATUS, "SUBMITTED");
  assert.equal(logs[0].eventType, "REQUEST_RESUBMITTED");
  assert.equal(logs[0].oldStatus, "REJECTED");
});

test("completed procurement records remain immutable", () => {
  const { context, request } = createHarness("COMPLETED");
  assert.throws(
    () => context.portalSubmitRequest_({ requestId: request.REQUEST_ID }),
    /INVALID_STATUS_TRANSITION/,
  );
});
