import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { once } from 'node:events';
import { openStore, bootstrapAdmin, transaction, setAdminCredentials } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const PASS = 'test-password-2026';
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('请使用 npm test 自动启动隔离 PostgreSQL，或指定 TEST_DATABASE_URL。');
async function createSchema(t) {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const client = new pg.Client({ connectionString });
  await client.connect();
  try { await client.query(`CREATE SCHEMA ${schema}`); } finally { await client.end(); }
  t.after(async () => {
    const cleanup = new pg.Client({ connectionString });
    await cleanup.connect();
    try { await cleanup.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await cleanup.end(); }
  });
  return schema;
}
async function fixture(t, schema = null) {
  schema ||= await createSchema(t);
  const store = await openStore({ connectionString, schema });
  await bootstrapAdmin(store, { MERCHANT_ADMIN_USERNAME: 'platform_admin', MERCHANT_ADMIN_PASSWORD: PASS });
  const server = createServer(createApp(store, { secureCookies: false }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise((resolve) => server.close(resolve));
    await store.close();
  };
  t.after(close);
  async function request(path, { body, method = body === undefined ? 'GET' : 'POST', session, raw, headers = {} } = {}) {
    const response = await fetch(base + path, { method,
      headers: { ...(body === undefined && raw === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    const data = response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
    return { status: response.status, data, headers: response.headers };
  }
  const api = (path, options) => request(`/api/merchant${path}`, options);
  async function login(username, extra = {}) {
    const result = await api('/login', { body: { username, password: PASS, ...extra } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    return { ...result.data, cookie: result.headers.get('set-cookie').split(';')[0] };
  }
  async function account(session, username, displayName = username) {
    const result = await api('/accounts', { session, body: { username, display_name: displayName, password: PASS } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.equal(result.data.password_hash, undefined);
    if (result.data.approval_status === 'pending') {
      const approved = await api(`/accounts/${result.data.id}`, { session: admin, method: 'PATCH', body: { approval_status: 'approved' } });
      assert.equal(approved.status, 200);
    }
    return { user: result.data, session: await login(username) };
  }
  async function generate(session, extra = {}) {
    const result = await api('/cards', { session, body: { count: 1, days: 0, max_devices: 1, ...extra } });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return (await api('/cards?page_size=100', { session })).data.items;
  }
  const admin = await login('platform_admin');
  return { store, schema, request, api, login, account, generate, close, base, admin };
}

test('first boot has no default credentials; supplied bootstrap credentials never reset an existing admin', async (t) => {
  const store = await openStore({ connectionString, schema: await createSchema(t) });
  try {
    await assert.rejects(bootstrapAdmin(store, {}), /首次启动/);
    await assert.rejects(bootstrapAdmin(store, { MERCHANT_ADMIN_USERNAME: 'admin', MERCHANT_ADMIN_PASSWORD: 'weak' }), /首次启动/);
    await bootstrapAdmin(store, { MERCHANT_ADMIN_USERNAME: 'admin', MERCHANT_ADMIN_PASSWORD: PASS });
    const initial = (await store.db.one(`SELECT * FROM accounts WHERE role = 'admin'`));
    await bootstrapAdmin(store, { MERCHANT_ADMIN_USERNAME: 'different', MERCHANT_ADMIN_PASSWORD: 'different-password' });
    assert.deepEqual((await store.db.one(`SELECT * FROM accounts WHERE role = 'admin'`)), initial);
  } finally { await store.close(); }
});

test('explicit administrator setup preserves identity and data and accepts a ten-character password', async (t) => {
  const f = await fixture(t);
  const merchant = await f.account(f.admin, 'existing_shop');
  const [card] = await f.generate(merchant.session);
  const configured = await setAdminCredentials(f.store, { username: 'admin', password: 'admin-pass', previous_username: 'platform_admin' });
  assert.equal(configured.id, f.admin.user.id);
  assert.equal(configured.username, 'admin');
  assert.equal((await f.api('/session', { session: f.admin })).status, 401);
  assert.equal((await f.api('/cards', { session: merchant.session })).data.items[0].id, card.id);
  const logged = await f.api('/login', { body: { username: 'admin', password: 'admin-pass' } });
  assert.equal(logged.status, 200);
  assert.equal(logged.data.user.role, 'admin');
  const session = { cookie: logged.headers.get('set-cookie').split(';')[0], csrf: logged.data.csrf };
  assert.equal((await f.api('/password', { session, body: { current_password: 'admin-pass', password: 'new-pass' } })).status, 200);
  assert.equal((await f.api('/session', { session })).status, 401);
  await bootstrapAdmin(f.store, { MERCHANT_ADMIN_USERNAME: 'admin', MERCHANT_ADMIN_PASSWORD: 'admin-pass' });
  assert.equal((await f.api('/login', { body: { username: 'admin', password: 'new-pass' } })).status, 200);
  assert.equal((await f.api('/login', { body: { username: 'admin', password: 'admin-pass' } })).status, 401);
  assert.equal((await f.store.db.one("SELECT COUNT(*) AS n FROM accounts WHERE role = 'admin'")).n, 1);
});

test('administrator setup cannot overwrite a merchant and registration cannot claim admin', async (t) => {
  const f = await fixture(t);
  const merchant = await f.account(f.admin, 'existing_name');
  await assert.rejects(setAdminCredentials(f.store, { username: 'existing_name', password: 'admin-pass' }), /不能覆盖/);
  await assert.rejects(setAdminCredentials(f.store, { username: 'admin', password: 'short' }), /8–128/);
  assert.equal((await f.api('/session', { session: f.admin })).status, 200);
  assert.equal((await f.api('/session', { session: merchant.session })).data.user.role, 'merchant');
  assert.equal((await f.api('/register', { body: { username: 'admin', display_name: 'reserved', password: PASS } })).status, 409);
});

test('self-registered merchants stay pending until an administrator approves them', async (t) => {
  const f = await fixture(t);
  const signed = await f.api('/register', { body: { username: 'new_merchant', display_name: '新商户代理', password: PASS, role: 'admin', approval_status: 'approved' } });
  assert.equal(signed.status, 201);
  assert.equal(signed.data.approval_status, 'pending');
  assert.equal(signed.headers.get('set-cookie'), null);
  const pendingLogin = await f.api('/login', { body: { username: 'new_merchant', password: PASS } });
  assert.equal(pendingLogin.status, 403);
  assert.match(pendingLogin.data.error, /审批/);
  const pending = (await f.api('/accounts?approval=pending', { session: f.admin })).data;
  assert.equal(pending.total, 1);
  const target = pending.items[0];
  assert.equal(target.role, 'merchant');
  assert.equal(target.merchant_id, target.id);
  assert.equal(target.password_hash, undefined);
  assert.equal((await f.api(`/shops/${target.id}`)).status, 404);
  const other = await f.account(f.admin, 'other_merchant');
  assert.equal((await f.api(`/accounts/${target.id}`, { method: 'PATCH', session: other.session, body: { approval_status: 'approved' } })).status, 404);
  assert.equal((await f.api(`/accounts/${target.id}`, { method: 'PATCH', session: f.admin, headers: { 'X-CSRF-Token': '' }, body: { approval_status: 'approved' } })).status, 403);
  assert.equal((await f.api(`/accounts/${target.id}`, { method: 'PATCH', session: f.admin, body: { approval_status: 'approved' } })).status, 200);
  const session = await f.login('new_merchant');
  assert.equal(session.user.approval_status, 'approved');
  assert.equal((await f.generate(session)).length, 1);
  assert.equal((await f.api('/accounts', { session })).data.total, 0);
  assert.equal((await f.api('/accounts', { session, body: { username: 'sub_agent', display_name: '新下级代理', password: PASS } })).status, 201);
  assert.equal((await f.api('/accounts?approval=pending', { session: f.admin })).data.total, 1);
});

test('list, export, summary and mutations enforce independent merchant boundaries', async (t) => {
  const f = await fixture(t);
  const a = await f.account(f.admin, 'shop_a');
  const b = await f.account(f.admin, 'shop_b');
  const [card] = await f.generate(a.session);
  const [privateCard] = await f.generate(b.session);
  const listed = await f.api(`/cards?merchant_id=${b.user.id}`, { session: a.session });
  assert.equal(listed.data.total, 1);
  assert.equal(listed.data.items[0].id, card.id);
  const exported = await f.api('/cards/export', { session: a.session });
  assert.ok(exported.data.includes(card.code));
  assert.ok(!exported.data.includes(privateCard.code));
  assert.equal((await f.api('/summary', { session: a.session })).data.total, 1);
  assert.equal((await f.api(`/cards/${card.id}`, { method: 'PATCH', body: { enabled: false }, session: b.session })).status, 404);
  assert.equal((await f.api(`/cards/${privateCard.id}`, { method: 'DELETE', session: a.session })).status, 404);
  assert.equal((await f.api(`/cards/${card.id}`, { method: 'PATCH', body: { sold: true }, session: a.session })).status, 200);
  assert.equal((await f.api('/summary', { session: a.session })).data.sold, 1);
  assert.equal((await f.api('/cards', { session: f.admin })).data.total, 2);
  assert.equal((await f.api('/cards')).status, 401);
  const accounts = (await f.api('/accounts?page_size=1', { session: f.admin })).data;
  assert.equal(accounts.total, 2);
  assert.equal(accounts.items.length, 1);
  assert.equal((await f.api('/login', { body: { username: 'shop_b', password: PASS, shop: a.user.id } })).status, 401);
});

test('administrators can inspect all merchants and filtered exports without gaining card write permissions', async (t) => {
  const f = await fixture(t);
  const a = await f.account(f.admin, 'overview_a', '商户甲');
  const b = await f.account(f.admin, 'overview_b', '商户乙');
  const agent = await f.account(b.session, 'overview_agent');
  const [disabled, expired, active, deleted] = await f.generate(a.session, { count: 4, product: '甲的漫剧' });
  const foreign = await f.generate(b.session, { count: 2, agent_id: agent.user.id, product: '乙的漫剧' });
  await f.api(`/cards/${disabled.id}`, { method: 'PATCH', session: a.session, body: { enabled: false, sold: true } });
  await f.store.db.exec('UPDATE cards SET expires_at = $1 WHERE id = $2', Date.now() - 1000, expired.id);
  await f.api(`/cards/${deleted.id}`, { method: 'DELETE', session: a.session });
  await f.request('/api/activate', { body: { code: active.code, deviceId: 'overview-device' } });

  for (const path of ['/cards', '/summary', '/cards/export']) {
    assert.equal((await f.api(`${path}?merchant=${b.user.id}`, { session: a.session })).status, 403);
    assert.equal((await f.api(`${path}?merchant=${a.user.id}`, { session: agent.session })).status, 403);
    assert.equal((await f.api(`${path}?merchant=${agent.user.id}`, { session: f.admin })).status, 400);
    assert.equal((await f.api(path)).status, 401);
  }
  assert.equal((await f.api('/accounts?role=merchant&page_size=1', { session: f.admin })).data.total, 2);
  assert.equal((await f.api('/accounts?role=agent', { session: f.admin })).data.total, 1);
  assert.equal((await f.api('/accounts?role=merchant', { session: a.session })).data.total, 0);
  assert.equal((await f.api('/accounts?role=admin', { session: f.admin })).status, 400);
  assert.equal((await f.api(`/cards?agent=${agent.user.id}`, { session: f.admin })).data.total, 2);
  assert.equal((await f.api('/cards?agent=unassigned', { session: f.admin })).data.total, 3);
  assert.equal((await f.api(`/cards?agent=${a.user.id}`, { session: f.admin })).status, 400);

  // Disabled merchants remain visible to administrators, but their inventory is not available for sale.
  await f.api(`/accounts/${b.user.id}`, { method: 'PATCH', session: f.admin, body: { enabled: false } });
  const overview = (await f.api('/summary', { session: f.admin })).data;
  assert.deepEqual(overview, { total: 5, available: 1, sold: 1, activated: 1 });
  assert.deepEqual((await f.api(`/summary?merchant=${b.user.id}`, { session: f.admin })).data,
    { total: 2, available: 0, sold: 0, activated: 0 });
  const pages = await Promise.all([1, 2, 3].map(async (page) => (await f.api(`/cards?page=${page}&page_size=2`, { session: f.admin })).data));
  const cards = pages.flatMap((page) => page.items);
  assert.equal(pages[0].total, 5);
  assert.equal(new Set(cards.map((card) => card.id)).size, 5);
  assert.equal(cards.find((card) => card.id === active.id).used_devices, 1);
  assert.equal(cards.find((card) => card.id === disabled.id).status, 'disabled');
  assert.equal(cards.find((card) => card.id === expired.id).status, 'expired');
  assert.equal(cards.find((card) => card.id === foreign[0].id).merchant_enabled, false);
  assert.equal(cards.find((card) => card.id === foreign[0].id).merchant_name, '商户乙');
  assert.equal(cards.find((card) => card.id === foreign[0].id).merchant_username, 'overview_b');
  assert.equal(cards.some((card) => card.id === deleted.id), false);
  const filtered = await f.api(`/cards?merchant=${a.user.id}&status=disabled&sale=sold&q=甲的`, { session: f.admin });
  assert.equal(filtered.data.total, 1);
  assert.equal(filtered.data.items[0].id, disabled.id);
  const csv = await f.api(`/cards/export?merchant=${a.user.id}&status=disabled&sale=sold`, { session: f.admin });
  assert.match(csv.data, /所属商户/);
  assert.match(csv.data, /商户甲/);
  assert.ok(csv.data.includes(disabled.code));
  assert.ok(!csv.data.includes(foreign[0].code));
  assert.ok(!csv.data.includes(deleted.code));

  assert.equal((await f.api('/cards', { session: f.admin, body: { count: 1, days: 0, max_devices: 1 } })).status, 403);
  for (const body of [{ sold: true }, { enabled: false }, { agent_id: agent.user.id }, { note: 'forbidden' }]) {
    assert.equal((await f.api(`/cards/${active.id}`, { method: 'PATCH', session: f.admin, body })).status, 403);
  }
  assert.equal((await f.api(`/cards/${active.id}`, { method: 'DELETE', session: f.admin })).status, 403);
  assert.deepEqual((await f.api('/summary', { session: f.admin })).data, overview);
  assert.equal((await f.api('/cards', { session: a.session })).data.total, 3);
});

test('generation, pagination, filters, expiry and CSV export operate on persisted cards', async (t) => {
  const f = await fixture(t);
  const merchant = await f.account(f.admin, 'shop_a');
  const cards = await f.generate(merchant.session, { count: 25, days: 30, product: '漫剧月卡' });
  assert.equal(new Set(cards.map((card) => card.code)).size, 25);
  assert.match(cards[0].code, /^MJ-(?:[0-9A-F]{8}-){3}[0-9A-F]{8}$/);
  assert.ok(Math.abs(cards[0].expires_at - Date.now() - 30 * 86_400_000) < 5000);
  const page1 = (await f.api('/cards?page=1&page_size=10', { session: merchant.session })).data;
  const page2 = (await f.api('/cards?page=2&page_size=10', { session: merchant.session })).data;
  const page3 = (await f.api('/cards?page=3&page_size=10', { session: merchant.session })).data;
  assert.equal(page1.total, 25);
  assert.equal(page3.items.length, 5);
  assert.equal(new Set([...page1.items, ...page2.items, ...page3.items].map((card) => card.id)).size, 25);
  assert.equal((await f.api('/cards?page=-1', { session: merchant.session })).status, 400);
  assert.equal((await f.api('/cards?page_size=9999', { session: merchant.session })).status, 400);
  for (const count of [0, 501, 1.5]) assert.equal((await f.api('/cards', { session: merchant.session, body: { count, days: 0, max_devices: 1 } })).status, 400);
  assert.equal((await f.api('/cards?q=月卡', { session: merchant.session })).data.total, 25);
  await f.api(`/cards/${cards[0].id}`, { session: merchant.session, method: 'PATCH', body: { enabled: false, sold: true, note: '=DANGEROUS()' } });
  assert.equal((await f.api('/cards?status=disabled&sale=sold', { session: merchant.session })).data.total, 1);
  const csv = await f.api('/cards/export?status=disabled', { session: merchant.session });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.data.includes("'=DANGEROUS()"));
  assert.ok(!csv.data.includes(cards[1].code));
  assert.equal((await f.api('/summary', { session: merchant.session })).data.available, 24);
});

test('public check is anonymous and side-effect free; activation and verify match the supplied contract', async (t) => {
  const f = await fixture(t);
  const merchant = await f.account(f.admin, 'shop_a');
  const [card] = await f.generate(merchant.session);
  const checked = await f.request('/api/cards/check', { body: { code: ` ${card.code.toLowerCase()} ` }, headers: { Origin: 'https://external-client.example' } });
  assert.equal(checked.status, 200);
  assert.equal(checked.headers.get('access-control-allow-origin'), '*');
  assert.equal(checked.data.ok, true);
  assert.equal(checked.data.expiresAt, null);
  assert.equal(checked.data.usedDevices, 0);
  assert.equal(checked.data.merchant_id, undefined);
  assert.equal((await f.store.db.one(`SELECT COUNT(*) AS n FROM devices`)).n, 0);
  const activated = await f.request('/api/activate', { body: { code: card.code, deviceId: 'stable-device' } });
  assert.equal(activated.data.code, 0);
  const data = activated.data.data;
  assert.equal(data.expires_in, 0);
  assert.equal(data.token, data.access_token);
  assert.equal(data.refresh_token, data.token);
  const verified = await f.request('/api/verify', { body: { license: data.access_token } });
  assert.deepEqual(verified.data, { ok: true, reason: '', expiresAt: null, code: card.code });
  const repeat = await f.request('/api/activate', { body: { code: card.code, device_fingerprint: 'stable-device' } });
  assert.equal(repeat.data.data.token, data.token);
  assert.equal((await f.store.db.one(`SELECT COUNT(*) AS n FROM devices`)).n, 1);
  const full = await f.request('/api/cards/check', { body: { code: card.code } });
  assert.equal(full.data.ok, true);
  assert.equal(full.data.canActivate, false);
  assert.equal((await f.request('/api/verify', { body: { license: card.code } })).data.ok, false);
  assert.equal((await f.request('/api/verify', { body: { license: `${data.token}tampered` } })).data.ok, false);
  assert.equal((await f.request('/api/activate', { body: { code: card.code } })).data.message, '缺少设备标识');
});

test('simultaneous activation cannot exceed device limits; a device cannot bind another live card', async (t) => {
  const f = await fixture(t);
  const merchant = await f.account(f.admin, 'shop_a');
  const [card] = await f.generate(merchant.session);
  const results = await Promise.all(Array.from({ length: 8 }, (_, n) => f.request('/api/activate', { body: { code: card.code, deviceId: `device-${n}` } })));
  assert.equal(results.filter((row) => row.data.code === 0).length, 1);
  assert.equal((await f.store.db.one(`SELECT COUNT(*) AS n FROM devices WHERE card_id = $1`, card.id)).n, 1);
  const [other] = (await f.generate(merchant.session, { product: 'other-card' })).filter((row) => row.product === 'other-card');
  const winner = results.findIndex((row) => row.data.code === 0);
  assert.equal((await f.request('/api/activate', { body: { code: other.code, deviceId: `device-${winner}` } })).data.code, 1);
  await f.api(`/cards/${card.id}`, { session: merchant.session, method: 'PATCH', body: { enabled: false } });
  assert.equal((await f.request('/api/activate', { body: { code: other.code, deviceId: `device-${winner}` } })).data.code, 0);
});

test('disable, expire, delete and merchant suspension revoke all public checks and license verification', async (t) => {
  const f = await fixture(t);
  const merchant = await f.account(f.admin, 'shop_a');
  const [card] = await f.generate(merchant.session);
  const token = (await f.request('/api/activate', { body: { code: card.code, deviceId: 'device-1' } })).data.data.token;
  const verify = async () => (await f.request('/api/verify', { body: { license: token } })).data;
  await f.api(`/cards/${card.id}`, { session: merchant.session, method: 'PATCH', body: { enabled: false } });
  assert.equal((await verify()).reason, '该卡密已被禁用');
  assert.equal((await f.request('/api/cards/check', { body: { code: card.code } })).data.ok, false);
  await f.api(`/cards/${card.id}`, { session: merchant.session, method: 'PATCH', body: { enabled: true } });
  assert.equal((await verify()).ok, true);
  (await f.store.db.exec(`UPDATE cards SET expires_at = $1 WHERE id = $2`, Date.now() - 1, card.id));
  assert.equal((await verify()).reason, '该卡密已过期');
  (await f.store.db.exec(`UPDATE cards SET expires_at = NULL WHERE id = $1`, card.id));
  await f.api(`/accounts/${merchant.user.id}`, { session: f.admin, method: 'PATCH', body: { enabled: false } });
  assert.equal((await verify()).reason, '该商户已被停用');
  assert.equal((await f.api('/session', { session: merchant.session })).status, 401);
  await f.api(`/accounts/${merchant.user.id}`, { session: f.admin, method: 'PATCH', body: { enabled: true } });
  const session = await f.login('shop_a');
  await f.api(`/cards/${card.id}`, { session, method: 'DELETE' });
  assert.equal((await verify()).ok, false);
  assert.equal((await f.api('/cards', { session })).data.total, 0);
});

test('CSRF and origin checks protect authenticated writes; password reset and logout revoke sessions', async (t) => {
  const f = await fixture(t);
  const merchant = await f.account(f.admin, 'shop_a');
  const agent = await f.account(f.admin, 'second_merchant');
  const body = { count: 1, days: 0, max_devices: 1 };
  assert.equal((await f.api('/cards', { body, session: merchant.session, headers: { 'X-CSRF-Token': '' } })).status, 403);
  assert.equal((await f.api('/cards', { body, session: merchant.session, headers: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await f.api('/login', { body: { username: 'shop_a', password: PASS }, headers: { Origin: 'https://attacker.example' } })).status, 403);
  await f.api(`/accounts/${agent.user.id}`, { method: 'PATCH', session: f.admin, body: { password: 'replacement-password-2026' } });
  assert.equal((await f.api('/session', { session: agent.session })).status, 401);
  assert.equal((await f.api('/login', { body: { username: 'second_merchant', password: PASS } })).status, 401);
  const newLogin = await f.api('/login', { body: { username: 'second_merchant', password: 'replacement-password-2026' } });
  assert.equal(newLogin.status, 200);
  assert.equal((await f.api('/password', { session: merchant.session, body: { current_password: PASS, password: 'new-merchant-password' } })).status, 200);
  assert.equal((await f.api('/session', { session: merchant.session })).status, 401);
  assert.equal((await f.api('/logout', { method: 'POST', session: f.admin })).status, 200);
  assert.equal((await f.api('/session', { session: f.admin })).status, 401);
});

test('public parsing, CORS, method errors and rate limiting have explicit JSON failures', async (t) => {
  const f = await fixture(t);
  const options = await f.request('/api/cards/check', { method: 'OPTIONS', headers: { Origin: 'https://external.example' } });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');
  assert.equal((await f.request('//[')).status, 400);
  assert.equal((await f.api('/healthz')).data.ok, true);
  assert.equal((await f.request('/api/cards/check')).status, 405);
  for (const path of ['/api/activate', '/api/verify', '/api/cards/check']) {
    const malformed = await f.request(path, { method: 'POST', raw: '{' });
    assert.equal(malformed.status, 400);
    assert.equal(path === '/api/activate' ? malformed.data.code : malformed.data.ok, path === '/api/activate' ? 1 : false);
  }
  assert.equal((await f.request('/api/verify', { body: { license: 'placeholder' }, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.request('/api/verify', { raw: JSON.stringify({ license: 'x'.repeat(40_000) }), method: 'POST' })).status, 413);
  let result;
  for (let n = 0; n < 121; n++) result = await f.request('/api/verify', { body: { license: 'invalid' } });
  assert.equal(result.status, 429);
  assert.equal(result.data.ok, false);
  assert.ok(result.headers.has('retry-after'));
});

test('PostgreSQL state and signing secret survive application restarts', async (t) => {
  const schema = await createSchema(t);
  const first = await fixture(t, schema);
  const merchant = await first.account(first.admin, 'shop_a');
  const [card] = await first.generate(merchant.session);
  const license = (await first.request('/api/activate', { body: { code: card.code, deviceId: 'persisted-device' } })).data.data.token;
  await first.close();
  const second = await fixture(t, schema);
  assert.equal((await second.request('/api/verify', { body: { license } })).data.ok, true);
  assert.equal((await second.api('/cards', { session: merchant.session })).data.total, 1);
});

test('transactions roll back failed writes and leave the connection usable', async (t) => {
  const f = await fixture(t);
  await assert.rejects(transaction(f.store.db, async () => {
    await f.store.db.exec('INSERT INTO settings (key, value) VALUES ($1, $2)', 'must_rollback', 'temporary');
    throw new Error('rollback-test');
  }), /rollback-test/);
  assert.equal(await f.store.db.one('SELECT value FROM settings WHERE key = $1', 'must_rollback'), undefined);
  assert.equal((await f.api('/healthz')).data.database, 'postgresql');
});

test('independent app instances enforce device identity and card capacity in PostgreSQL', async (t) => {
  const schema = await createSchema(t);
  const first = await fixture(t, schema);
  const second = await fixture(t, schema);
  const merchant = await first.account(first.admin, 'shared_shop');
  const cards = await first.generate(merchant.session, { count: 2 });
  const simultaneous = await Promise.all([
    first.request('/api/activate', { body: { code: cards[0].code, deviceId: 'same-device-across-instances' } }),
    second.request('/api/activate', { body: { code: cards[1].code, deviceId: 'same-device-across-instances' } }),
  ]);
  assert.equal(simultaneous.filter((result) => result.data.code === 0).length, 1);
  const unused = cards[simultaneous.findIndex((result) => result.data.code !== 0)];
  const capacity = await Promise.all(Array.from({ length: 12 }, (_, index) => (index % 2 ? first : second).request('/api/activate', {
    body: { code: unused.code, deviceId: `separate-device-${index}` },
  })));
  assert.equal(capacity.filter((result) => result.data.code === 0).length, 1);
  assert.equal((await first.store.db.one('SELECT COUNT(*) AS n FROM devices WHERE card_id = $1', unused.id)).n, 1);
});

test('simultaneous duplicate registrations create only one pending merchant', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([1, 2].map(() => f.api('/register', {
    body: { username: 'same_merchant', password: PASS, display_name: '同名商户' },
  })));
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal((await f.store.db.one('SELECT COUNT(*) AS n FROM accounts WHERE username = $1', 'same_merchant')).n, 1);
});

test('rejection blocks login and a later approval or revocation takes effect immediately', async (t) => {
  const f = await fixture(t);
  await f.api('/register', { body: { username: 'review_me', display_name: '审批测试', password: PASS } });
  const target = (await f.api('/accounts?approval=pending', { session: f.admin })).data.items[0];
  const review = (body) => f.api(`/accounts/${target.id}`, { method: 'PATCH', session: f.admin, body });
  await review({ approval_status: 'rejected', rejection_reason: '请联系平台补充资料' });
  const denied = await f.api('/login', { body: { username: 'review_me', password: PASS } });
  assert.equal(denied.status, 403);
  assert.equal(denied.data.error, '请联系平台补充资料');
  await review({ approval_status: 'approved' });
  const session = await f.login('review_me');
  const [card] = await f.generate(session);
  const license = (await f.request('/api/activate', { body: { code: card.code, deviceId: 'approval-device' } })).data.data.token;
  await review({ approval_status: 'rejected' });
  assert.equal((await f.api('/session', { session })).status, 401);
  assert.equal((await f.request('/api/verify', { body: { license } })).data.ok, false);
  await review({ approval_status: 'approved' });
  assert.equal((await f.request('/api/verify', { body: { license } })).data.ok, true);
});

test('registration validates input, rejects cross-origin requests and throttles anonymous signups', async (t) => {
  const f = await fixture(t);
  const body = { username: 'valid_name', display_name: '测试', password: PASS };
  assert.equal((await f.api('/register', { body, headers: { Origin: 'https://external.example' } })).status, 403);
  assert.equal((await f.api('/register', { body: { ...body, password: 'short' } })).status, 400);
  assert.equal((await f.api('/register', { body: { ...body, username: 'bad account' } })).status, 400);
  assert.equal((await f.api('/register', { body })).status, 201);
  assert.equal((await f.api('/register', { body })).status, 409);
  assert.equal((await f.api('/register', { body: { ...body, username: 'last_allowed' } })).status, 201);
  assert.equal((await f.api('/register', { body: { ...body, username: 'too_many' } })).status, 429);
});


test('multiple agent levels can distribute stock only within their own subtree', async (t) => {
  const f = await fixture(t);
  const root = await f.account(f.admin, 'root_shop');
  const a = await f.account(root.session, 'level_one');
  const b = await f.account(a.session, 'level_two');
  const c = await f.account(b.session, 'level_three');
  const sibling = await f.account(root.session, 'sibling_agent');
  const foreign = await f.account(f.admin, 'foreign_shop');
  assert.equal(b.user.parent_id, a.user.id);
  assert.equal(c.user.merchant_id, root.user.id);
  const [card] = await f.generate(root.session, { agent_id: a.user.id });
  assert.equal((await f.api('/cards', { session: sibling.session })).data.total, 0);
  const assign = (session, agent_id) => f.api(`/cards/${card.id}`, { session, method: 'PATCH', body: { agent_id } });
  assert.equal((await assign(a.session, b.user.id)).status, 200);
  assert.equal((await assign(b.session, c.user.id)).status, 200);
  for (const node of [root, a, b, c]) assert.equal((await f.api('/cards', { session: node.session })).data.total, 1);
  assert.equal((await f.api('/accounts', { session: a.session })).data.total, 2);
  assert.equal((await f.api('/cards/export', { session: sibling.session })).data.includes(card.code), false);
  assert.equal((await assign(c.session, sibling.user.id)).status, 400);
  assert.equal((await assign(a.session, foreign.user.id)).status, 400);
  assert.equal((await f.api(`/accounts/${a.user.id}`, { session: c.session, method: 'PATCH', body: { enabled: false } })).status, 404);
  assert.equal((await f.api(`/accounts/${c.user.id}`, { session: b.session, method: 'PATCH', body: { approval_status: 'approved' } })).status, 403);
  assert.equal((await f.api('/cards', { session: c.session, body: { count: 1, days: 0, max_devices: 1 } })).status, 403);
  await f.api(`/accounts/${a.user.id}`, { session: root.session, method: 'PATCH', body: { enabled: false } });
  assert.equal((await f.api('/session', { session: c.session })).status, 401);
  assert.equal((await f.api('/login', { body: { username: 'level_three', password: PASS } })).status, 403);
  await f.api(`/accounts/${a.user.id}`, { session: root.session, method: 'PATCH', body: { enabled: true } });
  assert.equal((await f.login('level_three')).user.id, c.user.id);
  assert.equal((await assign(root.session, null)).status, 200);
  assert.equal((await f.api('/cards', { session: await f.login('level_three') })).data.total, 0);
});

test('invitation registration creates a pending child and cannot forge its tenant or approval', async (t) => {
  const f = await fixture(t);
  const root = await f.account(f.admin, 'inviting_shop');
  const a = await f.account(root.session, 'inviting_agent');
  const registered = await f.api('/register', { body: { username: 'invited_child', display_name: '邀请下级', password: PASS, parent_id: a.user.id, merchant_id: 'forged', approval_status: 'approved' } });
  assert.equal(registered.status, 201);
  const child = await f.store.db.one('SELECT * FROM accounts WHERE username = $1', 'invited_child');
  assert.equal(child.role, 'agent');
  assert.equal(child.parent_id, a.user.id);
  assert.equal(child.merchant_id, root.user.id);
  assert.equal(child.approval_status, 'pending');
  assert.equal((await f.api('/login', { body: { username: child.username, password: PASS } })).status, 403);
  await f.api(`/accounts/${child.id}`, { method: 'PATCH', session: f.admin, body: { approval_status: 'approved' } });
  assert.equal((await f.login(child.username)).user.role, 'agent');
});
