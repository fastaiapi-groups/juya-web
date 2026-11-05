import { createServer } from 'node:http';
import { openStore, bootstrapAdmin } from './store.mjs';
import { createApp } from './app.mjs';
import { createMagicVideoGateway } from './magic-video.mjs';

let store;
try {
  store = await openStore();
  await bootstrapAdmin(store);
} catch (error) {
  console.error(error.code ? `PostgreSQL 初始化失败：${error.code}` : error.message);
  await store?.close();
  process.exit(1);
}
const magicVideo = createMagicVideoGateway({ vendorKey: process.env.MAGIC_VIDEO_VENDOR_KEY || '' });
const app = createApp(store, {
  secureCookies: process.env.MERCHANT_SECURE_COOKIES !== 'false',
  publicOrigin: process.env.MERCHANT_PUBLIC_ORIGIN || '',
  trustProxy: process.env.MERCHANT_TRUST_PROXY === 'true',
  version: process.env.APP_VERSION || 'development',
});
const server = createServer(async (req, res) => {
  let path;
  try { path = new URL(req.url, 'http://localhost').pathname; } catch { return app(req, res); }
  if (await magicVideo(req, res, path)) return;
  return app(req, res);
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(Number(process.env.MERCHANT_PORT || 3000), process.env.MERCHANT_HOST || '127.0.0.1', () => {
  console.log(`商户服务已启动，端口 ${server.address().port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(async () => { await store.close(); process.exit(0); }));
}
