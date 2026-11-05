import { createHash, timingSafeEqual } from 'node:crypto';

const MODELS = new Set(['mx-h3','sd-2-c1','sd-2-c4','sd-2-c5','sd-2-c7','sd-2-c8','sd-2.5-c2','sd-2.5-c3','sd-2.5-d2','sd-2.5-d3','w3-p-c1']);
const VENDOR = 'https://api.meaicc.com';
const MEDIA = 'https://minioapi.meaicc.com';
const PLATFORM = 'https://tumeiapi.com';
const MAX_FILE = 10 * 1024 * 1024;
const TYPES = new Map([['png','image/png'],['jpg','image/jpeg'],['jpeg','image/jpeg'],['webp','image/webp'],['mp3','audio/mpeg'],['wav','audio/wav'],['mp4','video/mp4'],['webm','video/webm'],['mov','video/quicktime'],['m4a','audio/mp4']]);
const hash = value => createHash('sha256').update(value).digest();

async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw Object.assign(new Error('上传内容超过大小限制'), { status: 413 });
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('上传内容超过大小限制'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readResponse(response, limit = 1024 * 1024) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Response too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
function storageURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'minioapi.meaicc.com' || (url.port && url.port !== '443') || url.username || url.password) throw new Error('Unexpected storage host');
  return url.href;
}
function validMedia(bytes, ext) {
  if (ext === 'png') return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (['jpg','jpeg'].includes(ext)) return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (['webp','wav'].includes(ext)) return bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === (ext === 'webp' ? 'WEBP' : 'WAVE');
  if (ext === 'mp3') return bytes.toString('ascii',0,3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (ext === 'webm') return bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  return bytes.toString('ascii',4,8) === 'ftyp';
}

// Bearer authentication is checked on every upload by the platform. No login
// sessions, cookies, raw user keys, or successful auth decisions are cached.
export function createMagicVideoGateway({ vendorKey = '', fetchImpl = fetch, now = Date.now, audit = console.info } = {}) {
  const vendorHash = hash(vendorKey);
  const cached = new Map(), pending = new Map(), limits = new Map();
  let activeUploads = 0;
  return async function magicVideo(req, res, path) {
    if (!path.startsWith('/api/magic-video/')) return false;
    const reply = (status, data) => {
      if (status >= 400) audit(`magic_video action=${path.endsWith('/assets') ? 'upload' : 'bridge'} status=${status} token_ref=${key ? hash(key).toString('hex').slice(0,12) : 'none'}`);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    const key = /^Bearer ([^\s]{8,512})$/i.exec(req.headers.authorization || '')?.[1];
    let acquired = false;
    try {
      if (!vendorKey) { reply(503, { error: '视频服务暂未配置' }); return true; }
      if (!key) { reply(401, { error: '请提供有效 API Key' }); return true; }
      if (path.startsWith('/api/magic-video/bridge/')) {
        if (!timingSafeEqual(hash(key), vendorHash)) { reply(401, { error: 'Invalid service credential' }); return true; }
        const suffix = path.slice('/api/magic-video/bridge'.length);
        const isCreate = suffix === '/v1/videos' && req.method === 'POST';
        const isQuery = /^\/v1\/videos\/[A-Za-z0-9_-]{1,160}$/.test(suffix) && req.method === 'GET';
        if (!isCreate && !isQuery) { reply(404, { error: 'Unknown video operation' }); return true; }
        if (isQuery && cached.get(suffix)?.until > now()) {
          const entry = cached.get(suffix); reply(entry.status, entry.data); return true;
        }
        let operation = isQuery ? pending.get(suffix) : null;
        if (!operation) {
          if (pending.size >= 100) { reply(429, { error: '视频查询繁忙，请稍后重试' }); return true; }
          let body;
          if (isCreate) {
            body = await readBody(req, 1024 * 1024);
            try { JSON.parse(body.toString('utf8')); } catch { reply(400, { error: '请求 JSON 格式错误' }); return true; }
          }
          operation = (async () => {
            const response = await fetchImpl(VENDOR + suffix, {
              method: req.method, headers: { Authorization: `Bearer ${vendorKey}`, ...(isCreate ? { 'Content-Type': 'application/json' } : {}) },
              ...(body ? { body } : {}), redirect: 'error', signal: AbortSignal.timeout(isCreate ? 240_000 : 30_000)
            });
            const data = JSON.parse((await readResponse(response)).toString('utf8'));
            const entry = { status: response.status, data, until: now() + 20_000 };
            if (isQuery && response.ok) {
              for (const [name, value] of cached) if (value.until <= now()) cached.delete(name);
              if (cached.size < 2000) cached.set(suffix, entry);
            }
            return entry;
          })();
          if (isQuery) pending.set(suffix, operation);
        }
        try { const entry = await operation; reply(entry.status, entry.data); }
        finally { if (isQuery && pending.get(suffix) === operation) pending.delete(suffix); }
        return true;
      }
      if (path !== '/api/magic-video/assets' || req.method !== 'POST') { reply(405, { error: '请使用 POST 上传素材' }); return true; }
      const tokenHash = hash(key).toString('hex');
      const bucket = limits.get(tokenHash);
      for (const [name,value] of limits) if (value.until <= now()) limits.delete(name);
      if (!bucket || bucket.until <= now()) {
        if (limits.size >= 5000) { reply(429, { error: '服务繁忙，请稍后重试' }); return true; }
        limits.set(tokenHash, { count: 1, until: now() + 60_000 });
      } else if (++bucket.count > 30) { reply(429, { error: '上传过于频繁，请稍后重试' }); return true; }
      if (activeUploads >= 4) { reply(429, { error: '上传繁忙，请稍后重试' }); return true; }
      activeUploads++; acquired = true;
      const auth = await fetchImpl(PLATFORM + '/v1/models', { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (!auth.ok) { reply(401, { error: 'API Key 无效、已过期或不可用' }); return true; }
      const visible = JSON.parse((await readResponse(auth)).toString('utf8'));
      if (!Array.isArray(visible.data) || !visible.data.some(m => MODELS.has(m.id))) { reply(403, { error: '请使用魔法视频分组的 API Key' }); return true; }
      const infoResponse = await fetchImpl(PLATFORM + '/api/usage/token/', { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (!infoResponse.ok) { reply(401, { error: '无法验证 API Key 权限' }); return true; }
      const info = JSON.parse((await readResponse(infoResponse)).toString('utf8')).data;
      if (!info || (info.expires_at && info.expires_at <= now()/1000) || (info.model_limits_enabled && !Object.keys(info.model_limits || {}).some(m => MODELS.has(m)))) { reply(403, { error: '此 API Key 没有魔法视频模型权限' }); return true; }
      let filename;
      try { filename = decodeURIComponent(req.headers['x-file-name'] || ''); } catch { reply(400, { error: '素材文件名格式错误' }); return true; }
      if (!/^[^/\\\u0000-\u001f]{1,180}$/.test(filename)) { reply(400, { error: '素材文件名格式错误' }); return true; }
      const ext = filename.split('.').at(-1).toLowerCase(), contentType = TYPES.get(ext);
      if (!contentType) { reply(415, { error: '不支持此素材格式' }); return true; }
      const bytes = await readBody(req, MAX_FILE);
      if (!bytes.length || !validMedia(bytes, ext)) { reply(415, { error: '素材内容与文件类型不一致' }); return true; }
      const signed = await fetchImpl(`${MEDIA}/api/get-upload-url?filename=${encodeURIComponent(filename)}`, { headers: { Authorization: `Bearer ${vendorKey}` }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (!signed.ok) throw new Error('Storage signing failed');
      const sign = JSON.parse((await readResponse(signed)).toString('utf8'));
      const uploadUrl = storageURL(sign.uploadUrl), viewUrl = storageURL(sign.viewUrl);
      const uploaded = await fetchImpl(uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': contentType }, redirect: 'error', signal: AbortSignal.timeout(90_000) });
      if (!uploaded.ok) throw new Error('Storage upload failed');
      audit(`magic_video_asset action=upload status=201 bytes=${bytes.length} token_ref=${tokenHash.slice(0,12)}`);
      reply(201, { url: viewUrl });
      return true;
    } catch (error) {
      const status = error.status || 502;
      reply(status, { error: status === 413 ? error.message : '视频服务请求失败，请稍后重试' });
      return true;
    } finally { if (acquired) activeUploads--; }
  };
}
