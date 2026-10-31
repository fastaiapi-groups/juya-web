import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'merchant-env-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, '.env');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(POSTGRES_|MERCHANT_|COMPOSE_PROJECT_NAME)/.test(key)));
  const run = (...args) => spawnSync('python3', ['scripts/configure-env.py', '--env-file', path, '--example', resolve('.env.example'), ...args], { encoding: 'utf8', env });
  return { path, run };
}

test('first-run configuration generates private passwords and never rotates existing settings', (t) => {
  const f = fixture(t);
  writeFileSync(f.path, 'DOWNLOADS_DIR=/keep/existing/downloads\nWEBSITE_PORT=7770\nMERCHANT_SECURE_COOKIES=false\nMERCHANT_PUBLIC_ORIGIN=\n');
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  const text = readFileSync(f.path, 'utf8');
  assert.match(text, /DOWNLOADS_DIR=\/keep\/existing\/downloads/);
  assert.match(text, /WEBSITE_PORT=7770/);
  assert.match(text, /MERCHANT_SECURE_COOKIES=false/);
  assert.match(text, /MERCHANT_PUBLIC_ORIGIN=\n/);
  const password = text.match(/^POSTGRES_PASSWORD=(.+)$/m)[1];
  const adminPassword = text.match(/^MERCHANT_ADMIN_PASSWORD=(.+)$/m)[1];
  assert.equal(password.length, 64);
  assert.ok(adminPassword.length >= 32);
  assert.ok(!first.stdout.includes(password) && !first.stdout.includes(adminPassword));
  assert.equal(statSync(f.path).mode & 0o777, 0o600);
  assert.equal(f.run('--database-exists').status, 0);
  assert.equal(readFileSync(f.path, 'utf8'), text);
});

test('missing database credentials on an existing volume fail without replacing the password', (t) => {
  const f = fixture(t);
  const original = 'POSTGRES_PASSWORD=\nDOWNLOADS_DIR=/keep\n';
  writeFileSync(f.path, original);
  const result = f.run('--database-exists');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /恢复原密码/);
  assert.equal(readFileSync(f.path, 'utf8'), original);
});

test('a fresh environment is created from the example and project lookup does not initialize secrets', (t) => {
  const f = fixture(t);
  assert.equal(f.run('--project-name').stdout.trim(), 'fastai-website');
  assert.equal(f.run().status, 0);
  assert.match(readFileSync(f.path, 'utf8'), /^POSTGRES_PASSWORD=.+$/m);
});
