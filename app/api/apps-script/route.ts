import { portalServerRuntime } from "../../konfigurasi/runtime-server";

function backendUrl() {
  const url = portalServerRuntime().appsScriptUrl;
  if (!url.startsWith("https://script.google.com/macros/s/") || !url.endsWith("/exec")) throw new Error("APPS_SCRIPT_URL belum dikonfigurasi dengan URL deployment /exec.");
  return url;
}

const retryableActions = new Set(["health", "getPortalConfig", "getTemplateLibrary", "listTemplates", "listMyRequests", "getRequestDetail"]);

async function callAppsScript(input: Record<string, unknown>) {
  const retryable = retryableActions.has(String(input.action || ""));
  let lastError: unknown;
  for (let attempt = 0; attempt < (retryable ? 2 : 1); attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);
    try {
      const response = await fetch(backendUrl(), {
        method: "POST",
        headers: { "content-type": "text/plain;charset=utf-8" },
        body: JSON.stringify(input),
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      });
      if (attempt === 0 && retryable && [404, 408, 429, 500, 502, 503, 504].includes(response.status)) {
        await new Promise(resolve => setTimeout(resolve, 450));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!retryable || attempt > 0) throw error;
      await new Promise(resolve => setTimeout(resolve, 450));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Apps Script tidak merespons.");
}
async function relay(response: Response) {
  if (response.status === 401 || response.status === 403) {
    console.error(JSON.stringify({ stage: "apps_script", code: "APPS_SCRIPT_ACCESS_DENIED", status: response.status }));
    return Response.json({ ok: false, error: "APPS_SCRIPT_ACCESS_DENIED", message: "Apps Script menolak akses server portal. Periksa pengaturan deployment Apps Script dan izin aksesnya. Login ulang Google tidak memperbaiki izin ini." }, { status: 502 });
  }
  const body = await response.text();
  let payload;
  try { payload = JSON.parse(body); } catch {
    console.error(JSON.stringify({ stage: "apps_script", code: "APPS_SCRIPT_NON_JSON", status: response.status }));
    return Response.json({ ok: false, error: "APPS_SCRIPT_NON_JSON", message: "Apps Script mengembalikan halaman HTML, bukan data JSON. Periksa URL /exec dan pengaturan deployment." }, { status: 502 });
  }
  return Response.json(payload, { status: response.ok ? 200 : 502 });
}

type GoogleIdentity = { email: string; name: string; picture?: string; sub: string };
type GoogleJwk = JsonWebKey & { kid?: string };
let googleJwksCache: { expiresAt: number; keys: GoogleJwk[] } | null = null;
const googleKeyCache = new Map<string, CryptoKey>();
function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
}
async function verifyGoogleIdentity(idToken: string): Promise<GoogleIdentity> {
  if (!idToken) throw new Error("Sesi Google tidak tersedia. Silakan login ulang.");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Format sesi Google tidak valid.");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]))) as { alg?: string; kid?: string };
  const claim = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]))) as Record<string, string | number | boolean>;
  if (header.alg !== "RS256" || !header.kid) throw new Error("Algoritma sesi Google tidak didukung.");
  if (!googleJwksCache || googleJwksCache.expiresAt <= Date.now()) {
    const certResponse = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cache: "force-cache" });
    if (!certResponse.ok) throw new Error("Public key Google tidak dapat dimuat.");
    const certs = await certResponse.json() as { keys?: GoogleJwk[] };
    googleJwksCache = { keys: certs.keys ?? [], expiresAt: Date.now() + 60 * 60 * 1000 };
    googleKeyCache.clear();
  }
  const jwk = googleJwksCache.keys.find(key => key.kid === header.kid);
  if (!jwk) throw new Error("Public key untuk sesi Google tidak ditemukan.");
  let key = googleKeyCache.get(header.kid);
  if (!key) {
    key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    googleKeyCache.set(header.kid, key);
  }
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const issuer = String(claim.iss ?? "");
  const verified = claim.email_verified === true || claim.email_verified === "true";
  if (!validSignature || !["accounts.google.com", "https://accounts.google.com"].includes(issuer) || claim.aud !== portalServerRuntime().googleClientId || !verified || Number(claim.exp) * 1000 <= Date.now()) throw new Error("Identitas Google tidak lolos verifikasi.");
  const email = String(claim.email ?? "").toLowerCase();
  if (!email) throw new Error("Email Google tidak tersedia.");
  return { email, name: String(claim.name || email), picture: claim.picture ? String(claim.picture) : undefined, sub: String(claim.sub ?? "") };
}
export async function GET(request: Request) {
  try {
    const incoming = new URL(request.url), target = new URL(backendUrl());
    if (!["health", "getPortalConfig"].includes(incoming.searchParams.get("action") ?? "")) return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    incoming.searchParams.forEach((value, key) => target.searchParams.set(key, value));
    return relay(await fetch(target, { cache: "no-store", redirect: "follow" }));
  } catch (error) { return Response.json({ ok: false, error: "BACKEND_CONFIG", message: error instanceof Error ? error.message : "Backend error" }, { status: 503 }); }
}
export async function POST(request: Request) {
  let stage = "input";
  try {
    const input = JSON.parse(await request.text()) as Record<string, unknown>;
    const publicActions = new Set(["health", "validateSchema", "getPortalConfig", "getTemplateLibrary", "listTemplates"]);
    if (!publicActions.has(String(input.action))) {
      stage = "google_identity";
      const identity = await verifyGoogleIdentity(String(input.idToken ?? ""));
      input.requesterEmail = identity.email;
      input.requesterName = identity.name;
      input.actorEmail = identity.email;
      input.authenticatedUser = identity;
    }
    if (input.action === "uploadDocument" && !/\.(pdf|doc|docx|xls|xlsx)$/i.test(String(input.fileName ?? ""))) {
      return Response.json({ ok: false, error: "INVALID_FILE_TYPE", message: "Format yang diizinkan: PDF, DOC, DOCX, XLS, XLSX." }, { status: 400 });
    }
    stage = "apps_script";
    return await relay(await callAppsScript(input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backend error";
    const authError = stage === "google_identity";
    console.error(JSON.stringify({ stage, code: authError ? "AUTH_REQUIRED" : "BACKEND_CONFIG" }));
    return Response.json({ ok: false, error: authError ? "AUTH_REQUIRED" : "BACKEND_CONFIG", message }, { status: authError ? 401 : 503 });
  }
}
