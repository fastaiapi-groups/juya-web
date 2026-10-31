import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { digest, hashPassword, verifyPassword, secret, id, transaction, lockTenant } from './store.mjs';

const DAY = 86_400_000;
const COOKIE = 'merchant_session';
const PUBLIC_PATHS = new Set(['/api/activate', '/api/verify', '/api/cards/check']);
const own = (object, key) => Object.hasOwn(object, key);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new HttpError(status, message); }
function string(value, label, max = 200, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) fail(400, `${label}格式不正确`);
  return value.trim();
}
function password(value, min = 12) {
  if (typeof value !== 'string' || value.length < min || value.length > 128) fail(400, `密码须为 ${min}–128 位`);
  return value;
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(400, `${label}须为 ${min}–${max} 的整数`);
  return value;
}
function bool(value) {
  if (typeof value !== 'boolean') fail(400, '状态须为布尔值');
  return value;
}
function publicAccount(account) {
  return { id: account.id, username: account.username, display_name: account.display_name,
    role: account.role, merchant_id: account.merchant_id, parent_id: account.parent_id, approval_status: account.approval_status, rejection_reason: account.rejection_reason, reviewed_at: account.reviewed_at, enabled: Boolean(account.enabled), created_at: account.created_at };
}
function requireRole(account, ...roles) {
  if (!roles.includes(account.role)) fail(403, '没有此操作权限');
}
async function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, '请使用 application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32_768) fail(413, '请求内容过大');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch { fail(400, '请求 JSON 格式错误'); }
}
function cookieValue(header) {
  return (header || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
}
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createApp(store, options = {}) {
  const { db, licenseSecret } = store;
  const { secureCookies = true, publicOrigin = '', trustProxy = false, version = 'development' } = options;
  const limits = new Map();
  // Unknown usernames perform the same password derivation as existing accounts.
  const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
  let nextCleanup = 0;

  async function rateLimit(key, max, windowMs) {
    const now = Date.now();
    if (now > nextCleanup) {
      nextCleanup = now + 60_000;
      for (const [name, value] of limits) if (value.until <= now) limits.delete(name);
      await db.exec(`DELETE FROM sessions WHERE expires_at <= $1`, now);
    }
    let value = limits.get(key);
    if (!value || value.until <= now) {
      if (limits.size >= 20_000) fail(429, '请求过于频繁，请稍后重试');
      value = { count: 0, until: now + windowMs };
      limits.set(key, value);
    }
    if (++value.count > max) fail(429, '请求过于频繁，请稍后重试');
  }
  async function session(req) {
    const token = cookieValue(req.headers.cookie);
    if (!token || token.length > 100) fail(401, '请先登录');
    const result = (await db.one(`SELECT a.*, s.csrf, s.token_hash FROM sessions s
      JOIN accounts a ON a.id = s.account_id
      LEFT JOIN accounts m ON m.id = a.merchant_id
      WHERE s.token_hash = $1 AND s.expires_at > $2 AND a.enabled = TRUE
        AND (a.role = 'admin' OR m.enabled = TRUE)`, digest(token), Date.now()));
    if (!result || !await activeLineage(result.id)) fail(401, '登录已失效，请重新登录');
    return result;
  }
  async function activeLineage(accountId) {
    return (await db.one(`WITH RECURSIVE lineage AS (
      SELECT id, parent_id, enabled, approval_status FROM accounts WHERE id = $1
      UNION ALL SELECT a.id, a.parent_id, a.enabled, a.approval_status FROM accounts a JOIN lineage l ON a.id = l.parent_id
    ) SELECT COALESCE(bool_and(enabled AND approval_status = 'approved'), FALSE) AS ok FROM lineage`, accountId)).ok;
  }
  async function descendants(accountId) {
    return (await db.all(`WITH RECURSIVE tree AS (
      SELECT id FROM accounts WHERE id = $1
      UNION ALL SELECT a.id FROM accounts a JOIN tree p ON a.parent_id = p.id
    ) SELECT id FROM tree`, accountId)).map((row) => row.id);
  }
  async function authorizedWrite(account, req, callback, otherTenant = null) {
    return transaction(db, async () => {
      // Serialize permission changes and writes within a tenant across all app instances.
      await lockTenant(db, account.merchant_id || account.id);
      if (otherTenant && otherTenant !== account.id) await lockTenant(db, otherTenant);
      await session(req);
      return callback();
    });
  }
  function sameOrigin(req) {
    if (!req.headers.origin) return;
    let actual;
    try { actual = new URL(req.headers.origin); } catch { fail(403, '请求来源不允许'); }
    if (publicOrigin) {
      if (actual.origin !== publicOrigin) fail(403, '请求来源不允许');
    } else if (actual.host !== req.headers.host || !['http:', 'https:'].includes(actual.protocol)) {
      fail(403, '请求来源不允许');
    }
  }
  async function checkAgent(account, agentId, requireEnabled = true) {
    if (agentId === null || agentId === '') return account.role === 'agent' ? account.id : null;
    const ids = await descendants(account.id);
    const target = typeof agentId === 'string' && await db.one("SELECT id, enabled, approval_status FROM accounts WHERE id = $1 AND merchant_id = $2 AND role = 'agent'", agentId, account.merchant_id);
    if (!target || (account.role === 'agent' && !ids.includes(agentId)) || (requireEnabled && (!target.enabled || target.approval_status !== 'approved' || !await activeLineage(agentId)))) fail(400, '请选择所属分销层级内的有效代理');
    return agentId;
  }
  async function cardScope(account, params, filters = true) {
    requireRole(account, 'admin', 'merchant', 'agent');
    const values = [];
    const bind = (value) => `$${values.push(value)}`;
    const clauses = ['c.deleted_at IS NULL'];
    const merchantId = params.get('merchant');
    if (account.role === 'admin') {
      if (merchantId) {
        if (!await db.one("SELECT id FROM accounts WHERE id = $1 AND role = 'merchant'", merchantId)) fail(400, '请选择有效的商户');
        clauses.push(`c.merchant_id = ${bind(merchantId)}`);
      }
    } else {
      if (merchantId) fail(403, '只有管理员可以按商户查询');
      clauses.push(`c.merchant_id = ${bind(account.merchant_id)}`);
    }
    if (account.role === 'agent') clauses.push(`c.agent_id = ANY(${bind(await descendants(account.id))}::text[])`);
    if (filters) {
      const q = params.get('q') || '';
      if (q.length > 100) fail(400, '搜索内容过长');
      if (q) clauses.push(`(strpos(c.code, ${bind(q.toUpperCase())}) > 0 OR strpos(lower(c.product), ${bind(q.toLowerCase())}) > 0)`);
      const status = params.get('status');
      if (status === 'valid') clauses.push(`c.enabled = TRUE AND (c.expires_at IS NULL OR c.expires_at > ${bind(Date.now())})`);
      else if (status === 'disabled') clauses.push('c.enabled = FALSE');
      else if (status === 'expired') clauses.push(`c.enabled = TRUE AND c.expires_at <= ${bind(Date.now())}`);
      else if (status) fail(400, '卡密状态不正确');
      const sale = params.get('sale');
      if (sale === 'sold') clauses.push('c.sold_at IS NOT NULL');
      else if (sale === 'unsold') clauses.push('c.sold_at IS NULL');
      else if (sale) fail(400, '销售状态不正确');
      const agentId = params.get('agent');
      if (agentId) {
        if (agentId === 'unassigned') clauses.push(account.role === 'agent' ? `c.agent_id = ${bind(account.id)}` : 'c.agent_id IS NULL');
        else if (account.role === 'admin') {
          if (!await db.one("SELECT id FROM accounts WHERE id = $1 AND role = 'agent'", agentId)) fail(400, '请选择有效的代理');
          clauses.push(`c.agent_id = ${bind(agentId)}`);
        }
        else clauses.push(`c.agent_id = ${bind(await checkAgent(account, agentId, false))}`);
      }
    }
    return { sql: clauses.join(' AND '), values };
  }
  async function listCards(scope, limit, offset = 0) {
    return (await db.all(`SELECT c.*, a.display_name AS agent_name,
      m.display_name AS merchant_name, m.username AS merchant_username,
      m.enabled AS merchant_enabled, m.approval_status AS merchant_approval_status,
      (SELECT COUNT(*) FROM devices d WHERE d.card_id = c.id) AS used_devices
      FROM cards c JOIN accounts m ON m.id = c.merchant_id LEFT JOIN accounts a ON a.id = c.agent_id
      WHERE ${scope.sql} ORDER BY c.created_at DESC, c.id DESC
      LIMIT $${scope.values.length + 1} OFFSET $${scope.values.length + 2}`, ...scope.values, limit, offset))
      .map((card) => ({ ...card, enabled: Boolean(card.enabled),
        status: !card.enabled ? 'disabled' : card.expires_at !== null && card.expires_at <= Date.now() ? 'expired' : 'valid' }));
  }
  async function validCard(card) {
    if (!card || card.deleted_at !== null) return '卡密不存在或已被删除';
    const merchant = (await db.one(`SELECT enabled, approval_status FROM accounts WHERE id = $1 AND role = 'merchant'`, card.merchant_id));
    if (!merchant?.enabled) return '该商户已被停用';
    if (merchant.approval_status !== 'approved') return '商户账号未通过审批';
    if (!card.enabled) return '该卡密已被禁用';
    if (card.expires_at !== null && card.expires_at <= Date.now()) return '该卡密已过期';
    return '';
  }
  async function findCard(code, lock = false) {
    return db.one(`SELECT * FROM cards WHERE code = $1${lock ? ' FOR UPDATE' : ''}`, string(code, '卡密', 100).toUpperCase());
  }
  function makeLicense(cardId, deviceId) {
    const payload = Buffer.from(JSON.stringify([cardId, deviceId])).toString('base64url');
    return `${payload}.${createHmac('sha256', licenseSecret).update(payload).digest('base64url')}`;
  }
  function parseLicense(value) {
    if (typeof value !== 'string' || value.length > 8192) return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;
    const expected = createHmac('sha256', licenseSecret).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      return Array.isArray(parsed) && parsed.length === 2 && parsed.every((item) => typeof item === 'string') ? parsed : null;
    } catch { return null; }
  }

  return async function app(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: '请求地址格式错误' }));
      return;
    }
    const path = url.pathname;
    const isPublic = PUBLIC_PATHS.has(path);
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (isPublic) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    try {
      if (isPublic && req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.method === 'GET' && path === '/api/merchant/healthz') {
        await db.one('SELECT 1'); send(200, { ok: true, database: 'postgresql', version }); return;
      }
      const ip = trustProxy ? req.headers['x-real-ip'] || req.socket.remoteAddress : req.socket.remoteAddress;
      if (isPublic) {
        if (req.method !== 'POST') fail(405, '请使用 POST');
        await rateLimit(`public:${ip}`, 120, 60_000);
        const body = await readJson(req);
        if (path === '/api/cards/check') {
          const card = await findCard(body.code);
          const reason = await validCard(card);
          if (reason) { send(200, { ok: false, reason }); return; }
          const used = (await db.one(`SELECT COUNT(*) AS n FROM devices WHERE card_id = $1`, card.id)).n;
          send(200, { ok: true, reason: '', code: card.code, product: card.product, expiresAt: card.expires_at,
            maxUses: card.max_devices, usedDevices: used, canActivate: used < card.max_devices });
          return;
        }
        if (path === '/api/activate') {
          const rawDevice = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId : body.device_fingerprint;
          if (!rawDevice) { send(200, { code: 1, message: '缺少设备标识' }); return; }
          const deviceId = string(rawDevice, '设备标识', 200);
          const result = await transaction(db, async () => {
            // Lock both device identity and card capacity, including across merchant instances.
            await db.exec("SELECT pg_advisory_xact_lock(hashtextextended('device:' || $1, 0))", deviceId);
            const card = await findCard(body.code, true);
            const reason = await validCard(card);
            if (reason) return { code: 1, message: reason };
            const now = Date.now();
            const other = (await db.one(`SELECT c.id FROM devices d JOIN cards c ON c.id = d.card_id
              JOIN accounts m ON m.id = c.merchant_id WHERE d.device_id = $1 AND c.id != $2
              AND c.enabled = TRUE AND c.deleted_at IS NULL AND m.enabled = TRUE
              AND (c.expires_at IS NULL OR c.expires_at > $3) LIMIT 1`, deviceId, card.id, now));
            if (other) return { code: 1, message: '本机已绑定其他有效卡密' };
            const binding = (await db.one(`SELECT 1 FROM devices WHERE card_id = $1 AND device_id = $2`, card.id, deviceId));
            if (!binding) {
              const used = (await db.one(`SELECT COUNT(*) AS n FROM devices WHERE card_id = $1`, card.id)).n;
              if (used >= card.max_devices) return { code: 1, message: '该卡密已达到使用设备数上限' };
              await db.exec(`INSERT INTO devices (card_id, device_id, created_at, last_seen) VALUES ($1, $2, $3, $4)`, card.id, deviceId, now, now);
            } else (await db.exec(`UPDATE devices SET last_seen = $1 WHERE card_id = $2 AND device_id = $3`, now, card.id, deviceId));
            const license = makeLicense(card.id, deviceId);
            return { code: 0, message: 'ok', data: { access_token: license, token: license, refresh_token: license,
              expires_in: card.expires_at === null ? 0 : Math.max(0, Math.ceil((card.expires_at - now) / 1000)),
              user: { username: `card_${card.id.slice(0, 8)}`, email: '' } } };
          });
          send(200, result); return;
        }
        const payload = parseLicense(body.license);
        if (!payload) { send(200, { ok: false, reason: '授权凭证无效' }); return; }
        const [cardId, deviceId] = payload;
        const card = (await db.one(`SELECT * FROM cards WHERE id = $1`, cardId));
        const reason = await validCard(card);
        if (reason) { send(200, { ok: false, reason }); return; }
        const device = (await db.one(`SELECT last_seen FROM devices WHERE card_id = $1 AND device_id = $2`, cardId, deviceId));
        if (!device) { send(200, { ok: false, reason: '该设备未绑定此卡密' }); return; }
        if (Date.now() - device.last_seen > 3_600_000) (await db.exec(`UPDATE devices SET last_seen = $1 WHERE card_id = $2 AND device_id = $3`, Date.now(), cardId, deviceId));
        send(200, { ok: true, reason: '', expiresAt: card.expires_at, code: card.code }); return;
      }

      if (!path.startsWith('/api/merchant/')) fail(404, '接口不存在');
      if (req.method === 'GET' && /^\/api\/merchant\/shops\/[a-f0-9-]+$/.test(path)) {
        await rateLimit(`shop:${ip}`, 120, 60_000);
        const shop = (await db.one(`SELECT id, display_name FROM accounts WHERE id = $1 AND role = 'merchant' AND enabled = TRUE AND approval_status = 'approved'`, path.split('/').at(-1)));
        if (!shop) fail(404, '商户不存在或已停用');
        send(200, shop); return;
      }
      if (req.method === 'POST' && path === '/api/merchant/register') {
        sameOrigin(req);
        await rateLimit(`register:${ip}`, 5, 3_600_000);
        const body = await readJson(req);
        const username = string(body.username, '登录账号', 40).toLowerCase();
        if (username === 'admin') fail(409, '该账号为内置管理员账号');
        if (!/^[a-z0-9_.-]{3,40}$/.test(username)) fail(400, '账号须为 3–40 位字母、数字、_.-');
        const name = string(body.display_name, '名称', 60);
        const passwordHash = await hashPassword(password(body.password));
        const accountId = id();
        await transaction(db, async () => {
          let parent = null;
          if (body.parent_id) {
            parent = await db.one("SELECT * FROM accounts WHERE id = $1 AND role IN ('merchant', 'agent')", string(body.parent_id, '邀请人', 100));
            if (!parent) fail(400, '邀请人不存在或不可用');
            await lockTenant(db, parent.merchant_id);
            if (!await activeLineage(parent.id)) fail(400, '邀请人不存在或不可用');
          }
          await db.exec(`INSERT INTO accounts (id, username, password_hash, display_name, role, merchant_id, parent_id, created_at, approval_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`, accountId, username, passwordHash, name,
            parent ? 'agent' : 'merchant', parent?.merchant_id || accountId, parent?.id || null, Date.now());
        });
        send(201, { ok: true, approval_status: 'pending', message: '注册成功，请等待管理员审批，通过后即可登录使用。' }); return;
      }
      if (req.method === 'POST' && path === '/api/merchant/login') {
        sameOrigin(req);
        await rateLimit(`login:${ip}`, 30, 60_000);
        const body = await readJson(req);
        const username = string(body.username, '登录账号', 40).toLowerCase();
        const pass = body.password;
        if (typeof pass !== 'string' || !pass.length || pass.length > 128) fail(400, '密码格式不正确');
        await rateLimit(`login:${ip}:${username}`, 10, 15 * 60_000);
        const account = (await db.one(`SELECT * FROM accounts WHERE username = $1`, username));
        const matches = await verifyPassword(pass, account?.password_hash || dummyHash);
        if (!matches || !account) fail(401, '账号或密码错误，或账号已被停用');
        const token = secret();
        const csrf = secret();
        const current = await transaction(db, async () => {
          await lockTenant(db, account.merchant_id || account.id);
          const fresh = await db.one('SELECT * FROM accounts WHERE id = $1', account.id);
          const owner = fresh?.merchant_id && await db.one('SELECT enabled FROM accounts WHERE id = $1', fresh.merchant_id);
          if (!fresh?.enabled || fresh.password_hash !== account.password_hash ||
              (fresh.role !== 'admin' && !owner?.enabled) || (body.shop && fresh.merchant_id !== body.shop)) fail(401, '账号或密码错误，或账号已被停用');
          if (fresh.approval_status === 'pending') fail(403, '账号正在等待管理员审批，通过后即可登录');
          if (fresh.approval_status === 'rejected') fail(403, fresh.rejection_reason || '注册申请未通过，请联系管理员');
          if (!await activeLineage(fresh.id)) fail(403, '上级代理或商户已停用或尚未通过审批');
          await db.exec('INSERT INTO sessions (token_hash, account_id, csrf, expires_at) VALUES ($1, $2, $3, $4)', digest(token), fresh.id, csrf, Date.now() + 12 * 3_600_000);
          return fresh;
        });
        res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/merchant; Max-Age=43200${secureCookies ? '; Secure' : ''}`);
        send(200, { user: publicAccount(current), csrf }); return;
      }

      // Read the body before authorizing, so a slow request cannot retain stale permissions.
      const body = ['POST', 'PATCH'].includes(req.method) && path !== '/api/merchant/logout' ? await readJson(req) : null;
      const account = await session(req);
      if (req.method === 'GET' && path === '/api/merchant/session') { send(200, { user: publicAccount(account), csrf: account.csrf }); return; }
      if (req.method !== 'GET') {
        sameOrigin(req);
        if (req.headers['x-csrf-token'] !== account.csrf) fail(403, '请求校验失败，请刷新页面');
      }
      if (req.method === 'POST' && path === '/api/merchant/logout') {
        await authorizedWrite(account, req, () => db.exec('DELETE FROM sessions WHERE token_hash = $1', account.token_hash));
        res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/merchant; Max-Age=0${secureCookies ? '; Secure' : ''}`);
        send(200, { ok: true }); return;
      }
      if (req.method === 'POST' && path === '/api/merchant/password') {
        await rateLimit(`password:${account.id}`, 6, 15 * 60_000);
        const hash = account.password_hash;
        if (!await verifyPassword(password(body.current_password, 1), hash)) fail(400, '原密码不正确');
        const replacement = await hashPassword(password(body.password, account.role === 'admin' ? 8 : 12));
        await authorizedWrite(account, req, async () => {
          // A concurrent administrator reset takes precedence over this request.
          if ((await db.one(`SELECT password_hash FROM accounts WHERE id = $1`, account.id))?.password_hash !== hash) fail(409, '密码已变更，请重新登录');
          await db.exec(`UPDATE accounts SET password_hash = $1 WHERE id = $2`, replacement, account.id);
          await db.exec(`DELETE FROM sessions WHERE account_id = $1`, account.id);
        });
        send(200, { ok: true }); return;
      }
      if (path === '/api/merchant/accounts' && req.method === 'GET') {
        requireRole(account, 'admin', 'merchant', 'agent');
        const page = integer(Number(url.searchParams.get('page') || 1), '页码', 1, 1_000_000);
        const pageSize = integer(Number(url.searchParams.get('page_size') || 20), '每页条数', 1, 100);
        const values = [];
        const clauses = [account.role === 'admin' ? "a.role IN ('merchant', 'agent')" : `a.role = 'agent' AND a.id = ANY($${values.push((await descendants(account.id)).filter((child) => child !== account.id))}::text[])`];
        const approval = url.searchParams.get('approval') || '';
        if (approval && !['pending', 'approved', 'rejected'].includes(approval)) fail(400, '审批状态不正确');
        if (approval) clauses.push(`a.approval_status = $${values.push(approval)}`);
        const role = url.searchParams.get('role') || '';
        if (role && !['merchant', 'agent'].includes(role)) fail(400, '账号类型不正确');
        if (role) clauses.push(`a.role = $${values.push(role)}`);
        const clause = clauses.join(' AND ');
        const total = (await db.one(`SELECT COUNT(*) AS n FROM accounts a WHERE ${clause}`, ...values)).n;
        const rows = await db.all(`SELECT a.*, p.display_name AS parent_name,
          (SELECT COUNT(*) FROM cards c WHERE c.deleted_at IS NULL AND (CASE WHEN a.role = 'merchant' THEN c.merchant_id = a.id ELSE c.agent_id = a.id END)) AS card_count
          FROM accounts a LEFT JOIN accounts p ON p.id = a.parent_id WHERE ${clause}
          ORDER BY (a.approval_status = 'pending') DESC, a.created_at DESC, a.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, ...values, pageSize, (page - 1) * pageSize);
        send(200, { items: rows.map((row) => ({ ...publicAccount(row), parent_name: row.parent_name, card_count: row.card_count })), total, page, page_size: pageSize }); return;
      }
      if (path === '/api/merchant/accounts' && req.method === 'POST') {
        requireRole(account, 'admin', 'merchant', 'agent');
        const username = string(body.username, '登录账号', 40).toLowerCase();
        if (!/^[a-z0-9_.-]{3,40}$/.test(username)) fail(400, '账号须为 3–40 位字母、数字、_.-');
        const name = string(body.display_name, '名称', 60);
        const passwordHash = await hashPassword(password(body.password));
        const accountId = id();
        const role = account.role === 'admin' ? 'merchant' : 'agent';
        await authorizedWrite(account, req, async () => {
          const current = (await db.one(`SELECT enabled FROM accounts WHERE id = $1`, account.id));
          if (!current?.enabled) fail(401, '登录已失效');
          if ((await db.one(`SELECT id FROM accounts WHERE username = $1`, username))) fail(409, '登录账号已存在');
          (await db.exec(`INSERT INTO accounts (id, username, password_hash, display_name, role, merchant_id, parent_id, created_at, approval_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, accountId, username, passwordHash, name, role,
            role === 'merchant' ? accountId : account.merchant_id, role === 'merchant' ? null : account.id, Date.now(), account.role === 'admin' ? 'approved' : 'pending'));
        });
        send(201, publicAccount((await db.one(`SELECT * FROM accounts WHERE id = $1`, accountId)))); return;
      }
      const accountMatch = path.match(/^\/api\/merchant\/accounts\/([a-f0-9-]+)$/);
      if (accountMatch && req.method === 'PATCH') {
        requireRole(account, 'admin', 'merchant', 'agent');
        const target = (await db.one(`SELECT * FROM accounts WHERE id = $1`, accountMatch[1]));
        if (!target || target.role === 'admin' || target.id === account.id || (account.role !== 'admin' && !(await descendants(account.id)).includes(target.id))) fail(404, '账号不存在');
        const fields = [];
        const values = [];
        if (own(body, 'enabled')) fields.push(`enabled = $${values.push(bool(body.enabled))}`);
        if (own(body, 'display_name')) fields.push(`display_name = $${values.push(string(body.display_name, '名称', 60))}`);
        if (own(body, 'password')) fields.push(`password_hash = $${values.push(await hashPassword(password(body.password)))}`);
        if (own(body, 'approval_status')) {
          requireRole(account, 'admin');
          if (!['approved', 'rejected'].includes(body.approval_status)) fail(400, '请选择通过或拒绝');
          fields.push(`approval_status = $${values.push(body.approval_status)}`);
          fields.push(`reviewed_at = $${values.push(Date.now())}`);
          fields.push(`reviewed_by = $${values.push(account.id)}`);
          fields.push(`rejection_reason = $${values.push(body.approval_status === 'rejected' ? string(body.rejection_reason || '注册申请未通过，请联系管理员', '拒绝原因', 200) : '')}`);
        }
        if (!fields.length) fail(400, '没有可更新的字段');
        await authorizedWrite(account, req, async () => {
          if (!(await db.one(`SELECT enabled FROM accounts WHERE id = $1`, account.id))?.enabled) fail(401, '登录已失效');
          await db.exec(`UPDATE accounts SET ${fields.join(', ')} WHERE id = $${values.length + 1}`, ...values, target.id);
          if (own(body, 'password') || own(body, 'enabled') || own(body, 'approval_status')) {
            await db.exec(`DELETE FROM sessions WHERE account_id = $1`, target.id);
            if (own(body, 'enabled') || own(body, 'approval_status')) await db.exec('DELETE FROM sessions WHERE account_id = ANY($1::text[])', await descendants(target.id));
          }
        }, target.merchant_id);
        send(200, { ok: true }); return;
      }
      if (path === '/api/merchant/summary' && req.method === 'GET') {
        const scope = await cardScope(account, url.searchParams, false);
        const result = (await db.one(`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE c.enabled AND m.enabled AND m.approval_status = 'approved'
            AND (c.expires_at IS NULL OR c.expires_at > $${scope.values.length + 1}) AND c.sold_at IS NULL) AS available,
          COUNT(*) FILTER (WHERE c.sold_at IS NOT NULL) AS sold,
          COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM devices d WHERE d.card_id = c.id)) AS activated
          FROM cards c JOIN accounts m ON m.id = c.merchant_id WHERE ${scope.sql}`, ...scope.values, Date.now()));
        send(200, result); return;
      }
      if ((path === '/api/merchant/cards' || path === '/api/merchant/cards/export') && req.method === 'GET') {
        const scope = await cardScope(account, url.searchParams);
        if (path.endsWith('/export')) {
          await rateLimit(`export:${account.id}`, 10, 60_000);
          const rows = await listCards(scope, 10001);
          if (rows.length > 10000) fail(400, '单次最多导出 10000 条，请筛选后导出');
          const status = { valid: '有效', expired: '已过期', disabled: '已禁用' };
          const lines = [['卡密', '产品', '有效期', '状态', '代理', '销售状态', '已用设备', '设备上限', '备注'],
            ...rows.map((row) => [row.code, row.product, row.expires_at === null ? '永久' : new Date(row.expires_at).toISOString(),
              status[row.status], row.agent_name, row.sold_at === null ? '未售出' : '已售出', row.used_devices, row.max_devices, row.note])];
          if (account.role === 'admin') {
            lines[0].splice(4, 0, '所属商户', '商户账号');
            rows.forEach((row, index) => lines[index + 1].splice(4, 0, row.merchant_name, row.merchant_username));
          }
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="cards.csv"' });
          res.end('\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n')); return;
        }
        const page = integer(Number(url.searchParams.get('page') || 1), '页码', 1, 1_000_000);
        const pageSize = integer(Number(url.searchParams.get('page_size') || 20), '每页条数', 1, 100);
        const total = (await db.one(`SELECT COUNT(*) AS n FROM cards c WHERE ${scope.sql}`, ...scope.values)).n;
        send(200, { items: await listCards(scope, pageSize, (page - 1) * pageSize), total, page, page_size: pageSize }); return;
      }
      if (path === '/api/merchant/cards' && req.method === 'POST') {
        requireRole(account, 'merchant');
        const count = integer(body.count, '生成数量', 1, 500);
        const days = integer(body.days, '有效天数', 0, 3650);
        const maxDevices = integer(body.max_devices, '设备上限', 1, 100);
        const product = string(body.product || '漫剧 VIP', '产品名称', 60);
        const note = string(body.note ?? '', '备注', 200, 0);
        const now = Date.now();
        const expiresAt = days ? now + days * DAY : null;
        await authorizedWrite(account, req, async () => {
          const agentId = await checkAgent(account, body.agent_id ?? null);
          const values = [];
          const rows = [];
          for (let i = 0; i < count; i++) {
            const code = `MJ-${randomBytes(16).toString('hex').toUpperCase().match(/.{8}/g).join('-')}`;
            rows.push(`(${[id(), code, account.id, agentId, product, expiresAt, maxDevices, note, now].map((value) => `$${values.push(value)}`).join(', ')})`);
          }
          await db.exec(`INSERT INTO cards (id, code, merchant_id, agent_id, product, expires_at, max_devices, note, created_at) VALUES ${rows.join(', ')}`, ...values);
        });
        send(201, { ok: true, count }); return;
      }
      const cardMatch = path.match(/^\/api\/merchant\/cards\/([a-f0-9-]+)$/);
      if (cardMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
        requireRole(account, 'merchant', 'agent');
        await authorizedWrite(account, req, async () => {
          const scope = await cardScope(account, url.searchParams, false);
          const card = await db.one(`SELECT c.* FROM cards c WHERE ${scope.sql} AND c.id = $${scope.values.length + 1}`, ...scope.values, cardMatch[1]);
          if (!card) fail(404, '卡密不存在');
          if (req.method === 'DELETE') {
            requireRole(account, 'merchant');
            await db.exec('UPDATE cards SET deleted_at = $1 WHERE id = $2', Date.now(), card.id);
            return;
          }
          if (Object.keys(body).some((key) => !(account.role === 'merchant' ? ['enabled', 'sold', 'agent_id', 'note'] : ['sold', 'agent_id']).includes(key))) fail(403, '没有此操作权限');
          const fields = [];
          const values = [];
          if (own(body, 'enabled')) fields.push(`enabled = $${values.push(bool(body.enabled))}`);
          if (own(body, 'sold')) fields.push(`sold_at = $${values.push(bool(body.sold) ? Date.now() : null)}`);
          if (own(body, 'agent_id')) fields.push(`agent_id = $${values.push(await checkAgent(account, body.agent_id))}`);
          if (own(body, 'note')) fields.push(`note = $${values.push(string(body.note, '备注', 200, 0))}`);
          if (!fields.length) fail(400, '没有可更新的字段');
          await db.exec(`UPDATE cards SET ${fields.join(', ')} WHERE id = $${values.length + 1}`, ...values, card.id);
        });
        send(200, { ok: true }); return;
      }
      fail(404, '接口不存在');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error.code === '23505' ? 409 : 500;
      const message = status === 500 ? '服务暂时不可用，请稍后重试' : status === 409 && !(error instanceof HttpError) ? '登录账号或卡密已存在' : error.message;
      if (status === 429) res.setHeader('Retry-After', '60');
      // Never log request bodies, passwords, card codes, license tokens, or SQL parameters.
      if (status === 500) console.error('商户 API 内部错误', error.code || error.name);
      if (path === '/api/activate') send(status, { code: 1, message });
      else if (isPublic) send(status, { ok: false, reason: message });
      else send(status, { error: message });
    }
  };
}
