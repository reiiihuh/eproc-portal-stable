import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync('app/api/apps-script/route.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const route = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/test/exec';
const originalFetch = globalThis.fetch;
const post = action => route.POST(new Request('https://portal.test/api/apps-script', { method: 'POST', body: JSON.stringify({ action }) }));
try {
  for (const status of [401, 403]) {
    globalThis.fetch = async () => new Response('Access denied', { status });
    const response = await post('getPortalConfig');
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'APPS_SCRIPT_ACCESS_DENIED');
  }
  globalThis.fetch = async () => new Response('<html>Sign in</html>');
  assert.equal((await (await post('getPortalConfig')).json()).error, 'APPS_SCRIPT_NON_JSON');
  globalThis.fetch = async () => Response.json({ ok: true, data: { requestTypes: [] } });
  assert.equal((await post('getPortalConfig')).status, 200);
  let attempts = 0;
  globalThis.fetch = async () => ++attempts === 1
    ? new Response('Not found', { status: 404 })
    : Response.json({ ok: true, data: { requestTypes: [] } });
  assert.equal((await post('getPortalConfig')).status, 200);
  assert.equal(attempts, 2, 'safe reads retry one transient Apps Script 404');
  globalThis.fetch = async () => { throw new Error('Must not reach backend without identity'); };
  const missingIdentity = await post('listMyRequests');
  assert.equal(missingIdentity.status, 401);
  assert.equal((await missingIdentity.json()).error, 'AUTH_REQUIRED');
  assert.equal((await route.GET(new Request('https://portal.test/api/apps-script?action=listMyRequests'))).status, 405);
  const client = readFileSync('app/layanan/akses-backend.ts', 'utf8');
  assert.ok(!client.includes('location.reload'), 'API errors must never trigger reload loops');
  console.log('PASS: upstream denial, HTML response, valid response, missing identity, protected GET, no automatic reload');
} finally { globalThis.fetch = originalFetch; }
