import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export const id = () => randomUUID();

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = await deriveKey(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const schemaSql = `
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE CHECK (username = lower(username)),
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'merchant', 'agent')),
    merchant_id TEXT REFERENCES accounts(id),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT NOT NULL,
    UNIQUE (id, merchant_id),
    CHECK ((role = 'admin' AND merchant_id IS NULL) OR
           (role = 'merchant' AND merchant_id IS NOT NULL AND merchant_id = id) OR
           (role = 'agent' AND merchant_id IS NOT NULL AND merchant_id <> id))
  );
  CREATE INDEX IF NOT EXISTS accounts_merchant ON accounts(merchant_id, role);
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES accounts(id);
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reviewed_at BIGINT;
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES accounts(id);
  ALTER TABLE accounts ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '';
  UPDATE accounts SET parent_id = merchant_id WHERE role = 'agent' AND parent_id IS NULL;
  CREATE INDEX IF NOT EXISTS accounts_parent ON accounts(parent_id);
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    expires_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
  CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    merchant_id TEXT NOT NULL REFERENCES accounts(id),
    agent_id TEXT,
    product TEXT NOT NULL,
    expires_at BIGINT,
    max_devices INTEGER NOT NULL CHECK (max_devices BETWEEN 1 AND 100),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sold_at BIGINT,
    note TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    deleted_at BIGINT,
    FOREIGN KEY (agent_id, merchant_id) REFERENCES accounts(id, merchant_id)
  );
  CREATE INDEX IF NOT EXISTS cards_merchant ON cards(merchant_id, deleted_at, created_at DESC, id);
  CREATE INDEX IF NOT EXISTS cards_agent ON cards(agent_id, deleted_at, created_at DESC, id);
  CREATE TABLE IF NOT EXISTS devices (
    card_id TEXT NOT NULL REFERENCES cards(id),
    device_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    last_seen BIGINT NOT NULL,
    PRIMARY KEY (card_id, device_id)
  );
  CREATE INDEX IF NOT EXISTS devices_device ON devices(device_id);
`;

export async function openStore({ connectionString = process.env.DATABASE_URL, schema = 'public' } = {}) {
  if (!connectionString && !process.env.PGHOST) throw new Error('请配置 PostgreSQL DATABASE_URL 或 PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE。');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('数据库 schema 名称不合法');
  const context = new AsyncLocalStorage();
  const pool = new pg.Pool({
    connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000,
    statement_timeout: 15_000, application_name: 'fastai-website-merchant',
    options: `-c search_path=${schema}`,
    types: { getTypeParser(oid, format) {
      if (oid !== 20 || format === 'binary') return pg.types.getTypeParser(oid, format);
      return (value) => {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw new Error('数据库整数超出安全范围');
        return number;
      };
    } },
  });
  pool.on('error', (error) => console.error('PostgreSQL 连接异常', error.code || error.name));
  const query = (text, values) => (context.getStore() || pool).query(text, values);
  const db = {
    one: async (text, ...values) => (await query(text, values)).rows[0],
    all: async (text, ...values) => (await query(text, values)).rows,
    exec: async (text, ...values) => query(text, values),
    async transaction(callback) {
      if (context.getStore()) throw new Error('不支持嵌套事务');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await context.run(client, callback);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  };
  try {
    const licenseSecret = await db.transaction(async () => {
      await db.exec("SELECT pg_advisory_xact_lock(hashtextextended('fastai-merchant-schema', 0))");
      await db.exec(schemaSql);
      await db.exec('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', 'license_secret', secret());
      return (await db.one('SELECT value FROM settings WHERE key = $1', 'license_secret')).value;
    });
    return { db, licenseSecret, close: () => pool.end() };
  } catch (error) { await pool.end(); throw error; }
}

export const transaction = (db, callback) => db.transaction(callback);
export async function lockTenant(db, tenantId) {
  await db.exec("SELECT pg_advisory_xact_lock(hashtextextended('tenant:' || $1, 0))", tenantId);
}

export async function bootstrapAdmin(store, env = process.env) {
  await transaction(store.db, async () => {
    await store.db.exec("SELECT pg_advisory_xact_lock(hashtextextended('fastai-merchant-bootstrap', 0))");
    if (await store.db.one("SELECT id FROM accounts WHERE role = 'admin'")) return;
    const username = env.MERCHANT_ADMIN_USERNAME;
    const password = env.MERCHANT_ADMIN_PASSWORD;
    if (!username || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username) || !password || password.length < 8 || password.length > 128) {
      throw new Error('首次启动请设置 MERCHANT_ADMIN_USERNAME（3–40 位字母、数字、_.-）和 MERCHANT_ADMIN_PASSWORD（8–128 位），管理员创建后可移除这两个环境变量。');
    }
    await store.db.exec(`INSERT INTO accounts
      (id, username, password_hash, display_name, role, merchant_id, created_at)
      VALUES ($1, $2, $3, $4, 'admin', NULL, $5)`, id(), username.toLowerCase(), await hashPassword(password), '平台管理员', Date.now());
  });
}

// Explicit operator action; normal startup never resets an existing administrator.
export async function setAdminCredentials(store, { username, password, previous_username: previousUsername } = {}) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error('管理员账号格式不正确');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('管理员密码须为 8–128 位');
  const normalized = username.toLowerCase();
  const passwordHash = await hashPassword(password);
  return transaction(store.db, async () => {
    await store.db.exec("SELECT pg_advisory_xact_lock(hashtextextended('fastai-merchant-bootstrap', 0))");
    let account = await store.db.one('SELECT * FROM accounts WHERE username = $1', normalized);
    if (account && account.role !== 'admin') throw new Error('目标账号已由商户或代理使用，不能覆盖');
    if (!account && previousUsername) {
      if (typeof previousUsername !== 'string') throw new Error('原管理员账号格式不正确');
      account = await store.db.one("SELECT * FROM accounts WHERE username = $1 AND role = 'admin'", previousUsername.toLowerCase());
      if (!account) throw new Error('指定的原管理员账号不存在');
    }
    if (!account) {
      const admins = await store.db.all("SELECT * FROM accounts WHERE role = 'admin'");
      if (admins.length > 1) throw new Error('存在多个管理员，请指定 previous_username');
      account = admins[0];
    }
    const accountId = account?.id || id();
    await lockTenant(store.db, accountId);
    if (account) {
      await store.db.exec("UPDATE accounts SET username = $1, password_hash = $2, enabled = TRUE, approval_status = 'approved' WHERE id = $3", normalized, passwordHash, accountId);
      await store.db.exec('DELETE FROM sessions WHERE account_id = $1', accountId);
    } else {
      await store.db.exec(`INSERT INTO accounts (id, username, password_hash, display_name, role, merchant_id, created_at)
        VALUES ($1, $2, $3, '平台管理员', 'admin', NULL, $4)`, accountId, normalized, passwordHash, Date.now());
    }
    return { id: accountId, username: normalized };
  });
}
