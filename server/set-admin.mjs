import { openStore, setAdminCredentials } from './store.mjs';

let store;
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 8192) throw new Error('管理员设置请求过大');
  }
  let credentials;
  try { credentials = JSON.parse(input); } catch { throw new Error('请从标准输入提供管理员设置 JSON'); }
  store = await openStore();
  const account = await setAdminCredentials(store, credentials);
  console.log(JSON.stringify({ ok: true, username: account.username }));
} catch (error) {
  console.error(error.code ? `管理员设置失败：${error.code}` : error.message);
  process.exitCode = 1;
} finally { await store?.close(); }
