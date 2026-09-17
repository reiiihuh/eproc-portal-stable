import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backend = readFileSync("apps-script/BackendPortal.gs", "utf8");
const review = readFileSync("apps-script/ProcurementReview.gs", "utf8");
const router = readFileSync("apps-script/RouterPortal.gs", "utf8");
const flow = readFileSync("app/layanan/alur-portal.ts", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

test("login profile resolves metadata from MASTER PIC by verified email", () => {
  assert.match(router, /case "getmyprofile": return portalGetMyProfile_/);
  assert.match(review, /case "savemyprofile": return portalSaveMyProfile_/);
  assert.match(backend, /getSheetByName\("MASTER PIC"\)/);
  assert.match(backend, /portalEmail_\(row\[fields\.email\]\) === actor\.email/);
  assert.match(backend, /values\[fields\.division\] = profile\.division/);
  assert.match(backend, /picId = "PIC-" \+ Utilities\.getUuid/);
  assert.match(backend, /"Email PIC", "Alamat Email"/);
  assert.match(backend, /PROFILE_REQUIRED/);
  assert.match(flow, /portalApi\.getMyProfile\(\)/);
  assert.match(nextConfig, /Cross-Origin-Opener-Policy/);
  assert.match(nextConfig, /same-origin-allow-popups/);
});

test("promoted request date is stored as date-only with a uniform sheet format", () => {
  assert.match(review, /procurementDateOnly_\(request\.SUBMITTED_AT/);
  assert.match(review, /range\.setNumberFormat\("dd-mmm-yyyy"\)/);
  assert.match(review, /function normalizeMasterRequestDates\(\)/);
  assert.match(review, /"Lvl Jabatan": request\.REQUESTER_POSITION/);
  assert.match(review, /"Lokasi": request\.REQUESTER_LOCATION/);
});
