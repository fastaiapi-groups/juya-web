// Task Plugin API v1. Customer gateways use the platform URL; production sets
// its private vendor connection on the channel, never in this downloadable file.
const CAPS = {
  "mx-h3": { resolutions: ["768p"], min: 4, max: 15, images: 9, videos: 0, audios: 3, ratios: ["9:16"] },
  "sd-2-c1": { resolutions: ["720p"], min: 4, max: 10, images: 9, videos: 0, audios: 0 },
  "sd-2-c4": { resolutions: ["720p"], min: 4, max: 15, images: 9, videos: 3, audios: 3, ratios: ["1:1", "16:9", "9:16"] },
  "sd-2-c5": { resolutions: ["720p"], min: 4, max: 15, images: 9, videos: 3, audios: 3 },
  "sd-2-c7": { resolutions: ["720p"], min: 4, max: 15, images: 9, videos: 3, audios: 3 },
  "sd-2-c8": { resolutions: ["720p"], min: 4, max: 15, images: 9, videos: 3, audios: 3 },
  "sd-2.5-c2": { resolutions: ["720p"], min: 5, max: 30, images: 30, videos: 10, audios: 10 },
  "sd-2.5-c3": { resolutions: ["720p"], min: 4, max: 30, images: 30, videos: 10, audios: 10 },
  "sd-2.5-d2": { resolutions: ["480p"], min: 5, max: 30, images: 30, videos: 10, audios: 10, perSecond: true },
  "sd-2.5-d3": { resolutions: ["720p"], min: 5, max: 30, images: 30, videos: 10, audios: 10, perSecond: true },
  "w3-p-c1": { resolutions: ["720p", "1080p"], min: 5, max: 30, images: 10, videos: 5, audios: 5 }
};
const ALL_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"];
const IMAGES = ["images", "image", "images_url", "image_urls", "imageUrls", "referenceImages", "reference_image", "reference_images", "reference_image_url", "reference_images_url"];
const AUDIOS = ["audios", "audio", "audio_url", "audio_urls", "audioUrls", "referenceAudios", "reference_audio", "reference_audios", "reference_audio_url", "reference_audios_url"];
const VIDEOS = ["videos", "video", "video_url", "video_urls", "videoUrls", "referenceVideos", "reference_video", "reference_videos", "reference_video_url", "reference_videos_url"];
const FIRST = ["first_frame_image", "first_frame_url"];
const LAST = ["last_frame_image", "last_frame_url", "end_frame_url"];
const PRICE = { type: "number", unit: "count", description: { en: "Video generation unit price", zh: "视频生成单价" } };
const SECOND_PRICE = { type: "number", unit: "second", description: { en: "Video generation unit price", zh: "视频生成单价" } };
export const meta = {
  apiVersion: 1, key: "magic-video", name: "魔法视频", version: "1.0.0",
  author: { name: "FastAiApi" }, icon: "text:魔法",
  description: { en: "Asynchronous video generation with image, audio and video references", zh: "支持图片、音频和视频参考的异步视频生成" },
  baseUrl: "https://tumeiapi.com", upstreams: ["vendor", "new_api"],
  models: Object.keys(CAPS), protocols: ["openai_video"], fetchMode: "per_task",
  usageSchema: { requests: PRICE },
  usageProfiles: Object.keys(CAPS).map(model => ({ models: [model], schema: Object.assign(
    { requests: PRICE, resolution: { enum: CAPS[model].resolutions, description: { en: "Output video resolution", zh: "输出视频分辨率" } } },
    CAPS[model].perSecond ? { seconds: SECOND_PRICE } : {}
  ) }))
};
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function publicURL(value) { return typeof value === "string" && /^https?:\/\/[^\s/@]+(?::\d+)?(?:[/?#]|$)/i.test(value); }
function firstValue(req, keys) {
  for (const key of keys) if (req[key] !== undefined) return req[key];
}
function scalar(req, parameters, keys, name) {
  let selected;
  for (const source of [parameters, req]) for (const key of keys) if (source[key] !== undefined) {
    const value = source[key];
    if (selected !== undefined && String(value).trim().toLowerCase() !== String(selected).trim().toLowerCase()) throw new Error("Conflicting " + name + " parameters");
    selected = value;
  }
  return selected;
}
function videoRequest(req, model) {
  if (!object(req) || !Object.hasOwn(CAPS, model)) throw new Error("Unsupported video model");
  if (req.input !== undefined && !object(req.input)) throw new Error("input must be an object");
  if (req.parameters !== undefined && !object(req.parameters)) throw new Error("parameters must be an object");
  const input = req.input || {}, parameters = req.parameters || {}, caps = CAPS[model];
  const allowed = ["model", "input", "parameters", "prompt", "duration", "seconds", "resolution", "ratio", "aspect_ratio", "n"].concat(IMAGES, AUDIOS, VIDEOS, FIRST, LAST);
  for (const key of Object.keys(req)) if (!allowed.includes(key)) throw new Error("Unsupported parameter: " + key);
  for (const key of Object.keys(input)) if (!["prompt", "media"].includes(key)) throw new Error("Unsupported input parameter: " + key);
  for (const key of Object.keys(parameters)) if (!["duration", "seconds", "resolution", "ratio", "aspect_ratio", "n"].includes(key)) throw new Error("Unsupported parameters field: " + key);
  for (const source of [req, parameters]) if (source.n !== undefined && source.n !== 1) throw new Error("Only one video per task is supported");
  const prompt = input.prompt === undefined ? req.prompt : input.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("prompt is required");
  const duration = scalar(req, parameters, ["duration", "seconds"], "duration");
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration < caps.min || duration > caps.max) throw new Error("duration must be an integer between " + caps.min + " and " + caps.max);
  const rawResolution = scalar(req, parameters, ["resolution"], "resolution");
  const resolution = rawResolution === undefined ? caps.resolutions[0] : typeof rawResolution === "string" ? rawResolution.trim().toLowerCase() : "";
  if (!caps.resolutions.includes(resolution)) throw new Error("Unsupported resolution");
  const rawRatio = scalar(req, parameters, ["ratio", "aspect_ratio"], "ratio");
  const ratio = rawRatio === undefined ? (model === "mx-h3" ? "9:16" : "16:9") : rawRatio;
  if (typeof ratio !== "string" || !(caps.ratios || ALL_RATIOS).includes(ratio)) throw new Error("Unsupported video ratio");
  const media = [];
  if (input.media !== undefined) {
    if (!Array.isArray(input.media) || input.media.length > 50) throw new Error("input.media must be an array of at most 50 entries");
    for (const item of input.media) {
      if (!object(item) || !["first_frame", "last_frame", "reference_image", "reference_voice", "reference_video"].includes(item.type) || !publicURL(item.url)) throw new Error("Unsupported media type or invalid public HTTP(S) URL");
      media.push({ type: item.type, url: item.url });
    }
  }
  for (const [keys, type] of [[IMAGES, "reference_image"], [AUDIOS, "reference_voice"], [VIDEOS, "reference_video"], [FIRST, "first_frame"], [LAST, "last_frame"]]) {
    const value = firstValue(req, keys);
    if (value === undefined) continue;
    const urls = Array.isArray(value) ? value : [value];
    if (urls.length > 50) throw new Error("Too many reference materials");
    for (const url of urls) {
      if (!publicURL(url)) throw new Error("Reference materials require public HTTP(S) URLs");
      media.push({ type, url });
    }
  }
  const images = media.filter(m => ["reference_image", "first_frame", "last_frame"].includes(m.type)).length;
  const videos = media.filter(m => m.type === "reference_video").length;
  const audios = media.filter(m => m.type === "reference_voice").length;
  if (images > caps.images || videos > caps.videos || audios > caps.audios) throw new Error("Reference material count exceeds this model's limits");
  for (const type of ["first_frame", "last_frame"]) if (media.filter(m => m.type === type).length > 1) throw new Error("Only one " + type + " is supported");
  const body = { model, input: { prompt }, parameters: { duration, resolution, ratio } };
  if (media.length) body.input.media = media;
  return body;
}
function stateOf(body) {
  const value = String(body.status || "").toUpperCase();
  if (["PENDING", "QUEUED"].includes(value)) return "QUEUED";
  if (["RUNNING", "IN_PROGRESS", "PROCESSING"].includes(value)) return "IN_PROGRESS";
  if (["SUCCEEDED", "COMPLETED", "SUCCESS"].includes(value)) return "SUCCESS";
  if (value === "FAILED" || value.startsWith("FAILED:") || ["FAILURE", "CANCELLED", "CANCELED"].includes(value)) return "FAILURE";
  return "UNKNOWN";
}
function contentURL(body) {
  for (const value of [body.video_url, body.url, body.object]) {
    if (publicURL(value) || (typeof value === "string" && /^\/v1\/videos\/[^?#]+\/content$/.test(value))) return value;
  }
  return "";
}
export function extractUsage(ctx) {
  const model = ctx.upstreamModel || ctx.model;
  const body = videoRequest(ctx.requestBody || {}, model);
  const facts = { requests: 1, resolution: body.parameters.resolution };
  if (CAPS[model].perSecond) facts.seconds = body.parameters.duration;
  return facts;
}
export function buildSubmitRequest(ctx) {
  return { url: String(ctx.baseUrl).replace(/\/+$/, "") + "/v1/videos", method: "POST", headers: { Authorization: "Bearer " + ctx.apiKey, "Content-Type": "application/json" }, body: videoRequest(ctx.requestBody || {}, ctx.upstreamModel || ctx.model) };
}
export function parseSubmitResponse(ctx, resp) {
  const body = resp.body || {}, status = stateOf(body);
  if (status === "FAILURE") throw new Error("Video generation failed");
  const taskId = body.id || body.task_id;
  if (typeof taskId !== "string" || !taskId) throw new Error("Video response is missing a task ID");
  if (status === "SUCCESS" && !contentURL(body)) throw new Error("Video response is missing its content URL");
  return Object.assign({ taskId, taskData: body, state: { model: ctx.upstreamModel || ctx.model, facts: extractUsage(ctx) } }, status === "SUCCESS" ? { immediate: { status: "SUCCESS" } } : {});
}
export function buildQueryRequest(ctx) {
  return { url: String(ctx.baseUrl).replace(/\/+$/, "") + "/v1/videos/" + encodeURIComponent(ctx.taskId), method: "GET", headers: { Authorization: "Bearer " + ctx.apiKey } };
}
export function parseTaskResult(ctx, body) {
  const status = stateOf(body);
  if (status === "SUCCESS" && !contentURL(body)) return { status: "FAILURE", reason: "Video response is missing its content URL" };
  if (status === "FAILURE") return { status, reason: "Video generation failed" };
  if (status === "UNKNOWN") return { status, reason: "Unrecognized video task status" };
  return { status };
}
export function extractUsageOnComplete(task, result, body) {
  if (result.status !== "SUCCESS") return {};
  const state = task.state || {}, model = state.model || task.upstreamModel || task.model;
  const facts = Object.assign({}, state.facts || {});
  if (Object.hasOwn(CAPS, model) && CAPS[model].perSecond) {
    // Completion facts are measured output duration, never caller-supplied billing fields.
    const seconds = body.seconds === undefined ? body.duration : body.seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 && seconds <= CAPS[model].max) facts.seconds = seconds;
  }
  return facts;
}
export function listArtifacts(task) { return task.status === "SUCCESS" ? [{ key: "video", type: "video" }] : []; }
export function buildContentRequest(ctx) {
  if (ctx.artifactKey !== "video") throw new Error("Unknown video artifact");
  const url = contentURL(ctx.data || {}), base = String(ctx.baseUrl).replace(/\/+$/, "");
  if (!url) throw new Error("Video content is unavailable");
  // A customer new-api gateway fetches the platform-owned authenticated content path.
  if (url.startsWith("/v1/videos/") || url.startsWith(base + "/v1/videos/")) return { url: url.startsWith("/") ? base + url : url, method: ctx.clientRequest.method, headers: { Authorization: "Bearer " + ctx.apiKey } };
  return { url, method: ctx.clientRequest.method, credentialless: true };
}
export const protocols = {
  openai_video: {
    decodeRequest(ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON requests with public reference URLs are required");
      const model = ctx.upstreamModel || ctx.model;
      const body = videoRequest(ctx.body.value, model);
      const media = body.input.media || [];
      return { kind: "submit", model: ctx.model, action: media.some(m => m.type === "reference_video") ? "reference_to_video" : media.length ? "image_to_video" : "text_to_video", requestBody: body };
    },
    render(ctx, task) {
      const statuses = { NOT_START: "queued", SUBMITTED: "queued", QUEUED: "queued", IN_PROGRESS: "in_progress", SUCCESS: "completed", FAILURE: "failed" };
      const result = { id: task.task_id, object: "video", model: ctx.model, status: statuses[task.status] || "queued" };
      if (task.status === "SUCCESS") result.url = result.video_url = "/v1/videos/" + encodeURIComponent(task.task_id) + "/content";
      if (task.status === "FAILURE") result.error = { code: "video_generation_failed", message: "Video generation failed" };
      const seconds = (task.data || {}).seconds;
      if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 && seconds <= 30) result.seconds = String(seconds);
      return result;
    }
  }
};
