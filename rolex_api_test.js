'use strict';
/** Smoke test for Rolex backend auth + entitlements (requires `npm start`). */
const ORIGIN = process.env.ROLEX_API || 'http://127.0.0.1:3000';

async function req(path, opt = {}) {
  const r = await fetch(ORIGIN + path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${j.error || r.statusText}`);
  return j;
}

async function main() {
  const health = await req('/api/health');
  if (!health.ok) throw new Error('health check failed');
  console.log('✓ /api/health');

  const email = `rolex-test-${Date.now()}@test.local`;
  const password = 'testpass99';
  const reg = await req('/api/quant/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!reg.token) throw new Error('register missing token');
  console.log('✓ /api/quant/auth/register');

  const login = await req('/api/quant/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.token) throw new Error('login missing token');
  console.log('✓ /api/quant/auth/login');

  const authHdr = { Authorization: 'Bearer ' + login.token };
  const me = await req('/api/quant/me', { headers: authHdr });
  if (me.email !== email) throw new Error('me email mismatch');
  console.log('✓ /api/quant/me');

  const ent = await req('/api/rolex/entitlements', { headers: authHdr });
  console.log('✓ /api/rolex/entitlements →', ent.tier);

  const meta = await req('/api/rolex/params/meta');
  console.log('✓ /api/rolex/params/meta →', meta.strategy || 'v3');

  console.log('\n✓ All Rolex API tests passed');
}

main().catch((e) => {
  console.error('\n✗', e.message);
  console.error('  Start the backend first: npm start');
  process.exit(1);
});
