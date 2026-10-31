import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

const docker = process.env.DOCKER_BIN || 'docker';
const container = `fastai-merchant-test-${randomUUID()}`;
let started = false;
let tests;
const command = (...args) => execFileSync(docker, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }).trim();
function cleanup() {
  if (started) {
    started = false;
    try { command('rm', '-f', container); } catch { console.error('请手动清理测试容器：', container); }
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { tests?.kill(signal); cleanup(); process.exit(1); });
try {
  let connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    console.log('正在启动临时 PostgreSQL 18 测试数据库…');
    try { command('image', 'inspect', 'postgres:18-alpine'); } catch {
      console.log('首次运行正在拉取 PostgreSQL 测试镜像…');
      await new Promise((resolve, reject) => {
        const pull = spawn(docker, ['pull', 'postgres:18-alpine'], { stdio: 'inherit' });
        pull.once('error', reject);
        pull.once('exit', (code) => code === 0 ? resolve() : reject(new Error('无法拉取 PostgreSQL 测试镜像')));
      });
    }
    const password = randomBytes(32).toString('hex');
    command('run', '-d', '--name', container, '--tmpfs', '/var/lib/postgresql:rw', '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_USER=merchant_test', '-e', 'POSTGRES_DB=merchant_test', '-e', `POSTGRES_PASSWORD=${password}`, 'postgres:18-alpine');
    started = true;
    let ready = false;
    for (let n = 0; n < 100; n++) {
      try { command('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'merchant_test', '-d', 'merchant_test'); ready = true; break; } catch { await setTimeout(300); }
    }
    if (!ready) throw new Error('临时 PostgreSQL 未就绪');
    const port = command('port', container, '5432/tcp').split(':').at(-1);
    connectionString = `postgresql://merchant_test:${password}@127.0.0.1:${port}/merchant_test`;
  }
  const files = readdirSync(new URL('.', import.meta.url)).filter((file) => file.endsWith('.test.mjs')).map((file) => `test/${file}`);
  tests = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: connectionString } });
  process.exitCode = await new Promise((resolve) => { tests.once('error', () => resolve(1)); tests.once('exit', (code) => resolve(code ?? 1)); });
} catch (error) {
  console.error(error.message.startsWith('Command failed') ? '无法启动测试数据库，请检查 Docker 或提供 TEST_DATABASE_URL。' : error.message);
  process.exitCode = 1;
} finally { cleanup(); }
