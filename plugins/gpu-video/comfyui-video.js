// QuantumNous/new-api task plugin API v1. The upstream is comfyui-api-wrapper.
export const meta = {
  apiVersion: 1,
  key: "comfyui-video",
  name: "视频生成服务",
  version: "1.9.6",
  author: { name: "FastAI" },
  description: { en: "Video generation and reference-based creation", zh: "视频生成与参考素材创作" },
  baseUrl: "https://comfy.fastaiapi.cloud",
  upstreams: ["vendor", "new_api"],
  allowedHosts: ["comfy.fastaiapi.cloud:443"],
  models: ["minimax-h3", "minimax-h3-u17", "minimax-h3-u24", "minimax-h3-u32", "wan2.2", "ltx-2.3", "ltx-2.3-grid", "ltx-2.3-avatar", "wan2.1", "minimax-h3-x", "ltx-2.3-x"],
  fetchMode: "per_task",
  protocols: ["openai_video"],
  usageProfiles: [{ models: ["minimax-h3", "minimax-h3-u17", "minimax-h3-u24", "minimax-h3-u32"], schema: {
    resolution: { enum: ["480p", "768p", "1080p"], description: {en: "Video resolution", zh: "分辨率"} },
    seconds: { type: "number", unit: "second", description: {en: "Video generation unit price", zh: "视频生成单价"} }
  } }, { models: ["minimax-h3-x", "ltx-2.3-x"], schema: {
    seconds: { type: "number", unit: "second", description: {en: "Video generation unit price", zh: "视频生成单价"} }
  } }],
  usageSchema: {
    resolution: {enum: ["480p", "768p", "1080p", "2k"], description: {en: "Video resolution", zh: "分辨率"}},
    seconds: { type: "number", unit: "second", description: { en: "Video generation unit price", zh: "视频生成单价" } }
  }
};

function endpoint(ctx, path) { return String(ctx.baseUrl).replace(/\/+$/, "") + path; }

function resourceAccountKey(req) {
  const direct = req.resource_account_key, nested = (req.metadata || {}).resource_account_key;
  if (direct !== undefined && nested !== undefined && direct !== nested) throw new Error("Conflicting resource account keys");
  const key = direct === undefined ? nested : direct;
  if (key !== undefined && (typeof key !== "string" || !/^rgpu_[a-f0-9]{64}$/.test(key))) throw new Error("Invalid resource_account_key");
  return key;
}

function xiangongAlias(model) {
  const id = String(model || "").toLowerCase();
  return id === "minimax-h3-x" ? "minimax-h3" : id === "ltx-2.3-x" ? "ltx-2.3" : undefined;
}

function xiangongRequest(req, model) {
  const metadata = req.metadata === undefined ? {} : req.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("metadata must be an object");
  const body = Object.assign({}, req);
  delete body.metadata;
  for (const field of Object.keys(metadata)) {
    if (body[field] !== undefined && JSON.stringify(body[field]) !== JSON.stringify(metadata[field])) throw new Error("Conflicting metadata field: " + field);
    body[field] = metadata[field];
  }
  for (const field of ["seconds", "duration", "width", "height", "fps", "seed", "steps", "cfg", "n"]) {
    if (body[field] === undefined) continue;
    const value = body[field];
    if (!["number", "string"].includes(typeof value) || String(value).trim() === "" || !Number.isFinite(Number(value))) throw new Error(field + " must be numeric");
    body[field] = Number(value);
  }
  if (body.seconds !== undefined && body.duration !== undefined && body.seconds !== body.duration) throw new Error("seconds conflicts with duration");
  body.seconds = body.seconds === undefined ? (body.duration === undefined ? 5 : body.duration) : body.seconds;
  const id = xiangongAlias(model) || String(model || "").toLowerCase();
  if (!["minimax-h3", "ltx-2.3"].includes(id)) throw new Error("Unsupported Xiangongyun model");
  if (body.seconds < (id === "minimax-h3" ? 2 : 1) || body.seconds > 15) throw new Error("Unsupported Xiangongyun video duration");
  if (body.size === undefined) body.size = String(body.width === undefined ? (id === "minimax-h3" ? 864 : 768) : body.width) + "x" + String(body.height === undefined ? (id === "minimax-h3" ? 480 : 448) : body.height);
  const dimensions = /^(\d{3,4})x(\d{3,4})$/.exec(body.size);
  if (!dimensions) throw new Error("size must be WIDTHxHEIGHT");
  const width = Number(dimensions[1]), height = Number(dimensions[2]), multiple = id === "minimax-h3" ? 32 : 64;
  if (width < 256 || height < 256 || width > 1920 || height > 1920 || width * height > 1920 * 1088 || width % multiple || height % multiple) throw new Error("Unsupported Xiangongyun video dimensions");
  if (body.width !== undefined && body.width !== width || body.height !== undefined && body.height !== height) throw new Error("size conflicts with dimensions");
  if (body.n !== undefined && body.n !== 1) throw new Error("Only n=1 is supported");
  body.model = id;
  if (body.channel !== undefined && body.channel !== "xiangongyun") throw new Error("Xiangongyun models require the xiangongyun channel");
  body.channel = "xiangongyun";
  body["async"] = true;
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 20000) throw new Error("prompt must contain 1–20000 characters");
  resourceAccountKey(body);
  const allowed = ["model", "channel", "prompt", "seconds", "duration", "size", "input_reference", "first_frame_url", "image_url", "last_frame_url", "reference_images", "reference_videos", "reference_audios", "mode", "variant", "width", "height", "fps", "seed", "steps", "cfg", "negative_prompt", "n", "async", "response_format", "resource_account_key"];
  for (const field of Object.keys(body)) if (!allowed.includes(field)) throw new Error("Unsupported Xiangongyun parameter: " + field);
  // Keep OpenAI video fields intact. Wrapper owns workflow and GPU selection.
  return body;
}

function isXiangong(req, model) {
  // Resource keys identify an isolated pool, not its cloud provider. AutoDL
  // user pools use the same key format as Xiangongyun pools.
  return !!xiangongAlias(model || req.model) || req.channel === "xiangongyun" || req.metadata && req.metadata.channel === "xiangongyun";
}
function effectiveRequest(req) {
  const metadata = req.metadata === undefined ? {} : req.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("metadata must be an object");
  const body = Object.assign({}, req);
  delete body.metadata;
  for (const field of Object.keys(metadata)) {
    if (body[field] !== undefined && JSON.stringify(body[field]) !== JSON.stringify(metadata[field])) throw new Error("Conflicting metadata field: " + field);
    body[field] = metadata[field];
  }
  return body;
}
function values(req, model) {
  const body = Object.assign({}, req, { model: model });
  body["async"] = true;
  if (body.seconds === undefined && body.duration === undefined && (body.metadata || {}).seconds === undefined && (body.metadata || {}).duration === undefined) body.seconds = 5;
  for (const field of ["duration", "width", "height", "fps", "seed", "steps", "cfg", "n"]) {
    if (typeof body[field] === "string") {
      if (!body[field].trim() || !Number.isFinite(Number(body[field]))) throw new Error(field + " must be numeric");
      body[field] = Number(body[field]);
    }
  }
  return body;
}


// Legacy semantic fields and aliases work on both wrapper registry versions.
// Public model names remain owned by the NewAPI host response.
function upstreamValues(req, model, hasFile) {
  if (isXiangong(req, model)) return xiangongRequest(req, model);
  const body = values(effectiveRequest(req), model);
  const modelId = String(model || '').toLowerCase();
  if (["minimax-h3", "minimax-h3-u24", "minimax-h3-u32"].includes(modelId) && body.resolution !== undefined) {
    const tier = h3BillingResolution({model:modelId,requestBody:req});
    if (body.size === undefined && body.width === undefined && body.height === undefined) {
      const dimensions = {"480p":[864,480],"768p":[1376,768],"1080p":[1920,1088]}[tier];
      body.width = dimensions[0]; body.height = dimensions[1];
    }
    // Resolution is a public price/size selector; graph adapters receive the
    // actual dimensions, not an unsupported string-valued GPU control.
    delete body.resolution;
  } else if (typeof body.resolution === "string" && Number.isFinite(Number(body.resolution)) && body.resolution.trim()) {
    body.resolution = Number(body.resolution);
  }
  const image = body.input_reference || body.image || body.first_frame_url || body.image_url;
  const commerce = modelId === "ltx-2.3-avatar";
  const referenceMode = !commerce && (body.reference_images !== undefined || body.reference_audios !== undefined || body.reference_videos !== undefined || body.mode === "ref2va" || body.variant === "reference");
  if (commerce) {
    if ((!image && !hasFile) || !Array.isArray(body.reference_audios) || body.reference_audios.length !== 1 || typeof body.reference_audios[0] !== 'string' || !body.reference_audios[0].trim()) throw new Error('J11 requires one presenter image and one complete speech audio');
    if (body.reference_images !== undefined || body.reference_videos !== undefined || body.mode !== undefined || body.variant !== undefined || body.audio_url !== undefined) throw new Error('Unsupported J11 reference mode');
    body.audio_url = body.reference_audios[0];
    delete body.reference_audios;
  }
  for (const field of ["reference_images", "reference_audios", "reference_videos"]) {
    if (body[field] !== undefined && (!Array.isArray(body[field]) || body[field].length < 1 || body[field].length > (field === "reference_images" ? 9 : 3) || body[field].some(x => typeof x !== "string" || !x.trim()))) throw new Error("Invalid " + field);
  }
  if (referenceMode && (image || hasFile || body.variant === "fast")) throw new Error("Reference mode conflicts with first-frame/fast mode");
  const h3 = modelId === "minimax-h3" || modelId === "minimax-h3-u17" || modelId === "minimax-h3-u24" || modelId === "minimax-h3-u32";
  if (referenceMode && !h3) throw new Error("Only MiniMax H3 models support multiple reference images/audio");
  const imageMode = !!image || hasFile;
  if (h3 && modelId === "minimax-h3") {
    if (imageMode && body.variant === "fast") throw new Error("H3 fast supports text-to-video only");
    if (body.variant !== undefined && body.variant !== "standard" && body.variant !== "fast" && body.variant !== "reference") throw new Error("Unsupported H3 variant");
    body.model = referenceMode ? "minimax-h3-reference" : imageMode ? "minimax-h3-i2v" : body.variant === "fast" ? "minimax-h3-t2v-fast" : "minimax-h3-t2v";
  } else if (h3) body.model = modelId;
  else body.model = model;
  // Keep primary Wan/LTX IDs so updated wrappers select their configured GPU
  // channel. Saved-workflow aliases would fall back to the legacy backend.
  if (body.seconds !== undefined) {
    const seconds = Number(body.seconds);
    if (body.duration !== undefined && Number(body.duration) !== seconds) throw new Error("seconds conflicts with duration");
    body.duration = seconds;
  }
  if (image) {
    if (body.first_frame_url && body.first_frame_url !== image) throw new Error("Conflicting reference images");
    body.first_frame_url = image;
  }
  if (body.size !== undefined) {
    const match = /^([0-9]{3,4})x([0-9]{3,4})$/.exec(body.size);
    if (!match) throw new Error("size must be WIDTHxHEIGHT");
    const width = Number(match[1]), height = Number(match[2]);
    if (width < 256 || height < 256 || width > 1920 || height > 1920) throw new Error("size dimensions must be 256–1920");
    if (model === "wan2.2" && body.channel === "autodl") {
      const resolution = Math.ceil(Math.max(width, height) / 16) * 16;
      if (body.width !== undefined || body.height !== undefined || (body.resolution !== undefined && Number(body.resolution) !== resolution)) throw new Error("size conflicts with resolution");
      body.resolution = resolution;
    } else {
      const multiple = model === "wan2.1" || model === "wan2.2" ? 16 : model === "ltx-2.3" && body.channel !== "autodl" ? 64 : 32;
      for (const pair of [["width", width], ["height", height]]) {
        const aligned = Math.ceil(pair[1] / multiple) * multiple;
        if (body[pair[0]] !== undefined && Number(body[pair[0]]) !== aligned) throw new Error("size conflicts with " + pair[0]);
        body[pair[0]] = aligned;
      }
    }
  }
  if (body.n !== undefined && Number(body.n) !== 1) throw new Error("Only n=1 is supported");
  for (const field of ["seconds", "size", "input_reference", "image", "metadata", "variant", "user", "n"]) delete body[field];
  return body;
}

export function buildSubmitRequest(ctx) {
  h3BillingResolution(ctx);
  const req = ctx.requestBody || {};
  if (!String(req.prompt || "").trim()) throw new Error("prompt is required");
  let body = upstreamValues(req, ctx.upstreamModel, (ctx.files || []).length > 0);
  if (ctx.upstream && ctx.upstream.kind === "new_api") {
    // A downstream gateway addresses the upstream's public model, not the
    // Wrapper's private workflow aliases. Validation above still applies.
    body = Object.assign(effectiveRequest(req), {model: ctx.upstreamModel});
    body["async"] = true;
  }
  const headers = { Authorization: "Bearer " + ctx.apiKey };
  const accountKey = resourceAccountKey(req);
  if (accountKey !== undefined) headers["X-Resource-Account-Key"] = accountKey;
  if (!ctx.upstream || ctx.upstream.kind !== "new_api") delete body.resource_account_key;
  if ((ctx.files || []).length) {
    const parts = [];
    for (const key of Object.keys(body)) {
      if (body[key] === undefined || body[key] === null) continue;
      if (["metadata", "reference_images", "reference_audios", "reference_videos"].includes(key)) parts.push({ name: key, value: JSON.stringify(body[key]) });
      else if (typeof body[key] !== "object") parts.push({ name: key, value: String(body[key]) });
      else throw new Error("unsupported object field: " + key);
    }
    for (const file of ctx.files) {
      if (file.field !== "input_reference") throw new Error("only input_reference uploads are supported");
      parts.push({ name: file.field, fileRef: file.ref, filename: file.filename });
    }
    return { url: endpoint(ctx, "/v1/videos"), method: "POST", headers, bodyType: "multipart", parts };
  }
  headers["Content-Type"] = "application/json";
  return { url: endpoint(ctx, "/v1/videos"), method: "POST", headers, body };
}

export function parseSubmitResponse(ctx, resp) {
  const body = resp.body || {};
  if (!body.id || !body.status) throw new Error("upstream did not return an asynchronous video task");
  return { taskId: body.id, taskData: Object.assign({}, body, {requested_seconds: extractUsage(ctx).seconds}) };
}

export function buildQueryRequest(ctx) {
  return { url: endpoint(ctx, "/v1/videos/" + encodeURIComponent(ctx.taskId)), method: "GET",
           headers: { Authorization: "Bearer " + ctx.apiKey } };
}

export function parseTaskResult(ctx, body) {
  const statuses = { queued: "QUEUED", queued_upstream: "QUEUED", preparing: "IN_PROGRESS", submitting: "IN_PROGRESS", submitted: "IN_PROGRESS", in_progress: "IN_PROGRESS", recovering: "IN_PROGRESS", uncertain: "IN_PROGRESS", downloading: "IN_PROGRESS", completed: "SUCCESS", failed: "FAILURE", cancelled: "FAILURE" };
  const result = { status: statuses[body.status] || "UNKNOWN" };
  if (result.status === "UNKNOWN") result.reason = "Unrecognized video status: " + body.status;
  if (result.status === "FAILURE") result.reason = body.error && body.error.message || "Video failed or was cancelled";
  if (body.progress > 0 && body.progress <= 100) result.progress = body.progress + "%";
  return result;
}

// H3 price tiers share the published MiniMax resolution names.
function h3BillingResolution(ctx) {
  const req = effectiveRequest(ctx.requestBody || {});
  const model = String(ctx.model || req.model || ctx.upstreamModel || "").toLowerCase();
  if (!["minimax-h3", "minimax-h3-u24", "minimax-h3-u32"].includes(model)) return undefined;
  if (req.size === undefined && (req.width === undefined) !== (req.height === undefined)) throw new Error("Provide both width and height, or size");
  const size = typeof req.size === "string" && /^(\d+)x(\d+)$/.exec(req.size);
  const width = size ? Number(size[1]) : Number(req.width), height = size ? Number(size[2]) : Number(req.height);
  const edge = Number.isFinite(width) && Number.isFinite(height) ? Math.min(width,height) : undefined;
  const actualTier = edge === undefined ? undefined : edge <= 480 ? "480p" : edge <= 768 ? "768p" : "1080p";
  const raw = req.resolution;
  if (raw === undefined || raw === null || raw === "") return actualTier || "480p";
  const value = String(raw).trim().toLowerCase();
  const tier = ["480", "480p"].includes(value) ? "480p" : ["768", "768p"].includes(value) ? "768p" : ["1080", "1080p", "1088", "1088p"].includes(value) ? "1080p" : undefined;
  if (!tier) throw new Error("Unsupported H3 resolution for this channel; supported: 480p, 768p, 1080p");
  if (actualTier && actualTier !== tier) throw new Error("resolution conflicts with actual video dimensions");
  return tier;
}

export function extractUsage(ctx) {
  const req = effectiveRequest(ctx.requestBody || {});
  if (isXiangong(req, ctx.model || ctx.upstreamModel)) {
    const body = xiangongRequest(req, ctx.upstreamModel || ctx.model);
    if (xiangongAlias(ctx.model) || xiangongAlias(ctx.upstreamModel)) return { seconds: body.seconds };
    const shortEdge = Math.min(body.width || 864, body.height || 480);
    const size = body.size && /^(\d+)x(\d+)$/.exec(body.size);
    const edge = size ? Math.min(Number(size[1]), Number(size[2])) : shortEdge;
    return { seconds: body.seconds, resolution: edge <= 480 ? "480p" : edge <= 768 ? "768p" : "1080p" };
  }
  const rawSeconds = req.seconds === undefined ? (req.duration === undefined ? 5 : req.duration) : req.seconds;
  const seconds = Number(rawSeconds);
  if (!["number", "string"].includes(typeof rawSeconds) || String(rawSeconds).trim() === "" || !Number.isFinite(seconds) || seconds < 1 || seconds > 15) throw new Error("seconds must be between 1 and 15");
  const resolution = h3BillingResolution(ctx);
  return resolution === undefined ? {seconds} : {seconds, resolution};
}

export function extractUsageOnComplete(task, taskResult, body) {
  const seconds = Number((body || {}).seconds || ((body || {}).parameters || {}).duration || ((task || {}).data || {}).requested_seconds);
  return Number.isFinite(seconds) && seconds >= 1 && seconds <= 15 ? { seconds } : {};
}

export function listArtifacts(task) {
  return task.status === "SUCCESS" ? [{ key: "video", type: "video" }] : [];
}

export function buildContentRequest(ctx) {
  if (ctx.artifactKey !== "video") throw new Error("artifact_not_found");
  // Artifact downloads enforce SSRF protection independently of task submission.
  // This deployment uses an internal address for dispatch and its fixed public
  // TLS address for artifacts, whose host enforces public-address SSRF checks.
  // Do not derive a credential destination from caller-supplied metadata.
  const configuredBase = String(ctx.baseUrl).replace(/\/+$/, "");
  const baseUrl = configuredBase === "http://fastai-comfy-gateway:8000" ? "https://comfy.fastaiapi.cloud" : configuredBase;
  return { url: baseUrl + "/v1/videos/" + encodeURIComponent(ctx.upstreamTaskId) + "/content",
           method: ctx.clientRequest.method, headers: { Authorization: "Bearer " + ctx.apiKey } };
}

export const protocols = {
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || !["json", "multipart"].includes(ctx.body.kind)) throw new Error("JSON or multipart is required");
      let req;
      let hasFile = false;
      if (ctx.body.kind === "json") {
        if (!ctx.body.value || typeof ctx.body.value !== "object" || Array.isArray(ctx.body.value)) throw new Error("JSON object is required");
        req = Object.assign({}, ctx.body.value);
      } else {
        req = {};
        for (const name of Object.keys(ctx.body.fields || {})) {
          const fields = ctx.body.fields[name];
          if (fields.length !== 1) throw new Error("Duplicate field: " + name);
          req[name] = fields[0];
        }
        for (const file of ctx.body.files || []) {
          if (file.field !== "input_reference" || hasFile) throw new Error("Provide one input_reference image");
          hasFile = true;
        }
        for (const field of ["reference_images", "reference_audios", "reference_videos"]) {
          if (req[field] !== undefined) req[field] = JSON.parse(req[field]);
        }
        if (req.metadata !== undefined) {
          req.metadata = JSON.parse(req.metadata);
          if (!req.metadata || typeof req.metadata !== "object" || Array.isArray(req.metadata)) throw new Error("metadata must be an object");
        }
      }
      if (isXiangong(req, ctx.model)) {
        req = xiangongRequest(req, ctx.model);
        return { kind: "submit", model: ctx.model,
                 action: req.reference_images || req.reference_videos || req.reference_audios ? "reference_to_video" : hasFile || req.input_reference || req.first_frame_url ? "image_to_video" : "text_to_video",
                 requestBody: req };
      }
      req = values(req, ctx.model);
      const effective = effectiveRequest(req);
      const seconds = effective.seconds === undefined ? effective.duration : effective.seconds;
      if (typeof seconds === "boolean" || !Number.isFinite(Number(seconds)) || Number(seconds) < 1 || Number(seconds) > 15) throw new Error("seconds must be between 1 and 15");
      return { kind: "submit", model: ctx.model,
               action: (req.reference_images || (req.metadata || {}).reference_images) ? "reference_to_video" : hasFile || req.input_reference || req.image || req.first_frame_url || req.image_url ? "image_to_video" : "text_to_video",
               requestBody: req };
    },
    render: function (ctx, task) {
      const statuses = { NOT_START: "queued", SUBMITTED: "queued", QUEUED: "queued", IN_PROGRESS: "in_progress", SUCCESS: "completed", FAILURE: "failed" };
      const result = Object.assign({}, task.data || {}, { id: task.task_id, object: "video", status: statuses[task.status] || "queued" });
      if (ctx.model) result.model = ctx.model;
      if (task.status === "SUCCESS") {
        const content = "/v1/videos/" + encodeURIComponent(task.task_id) + "/content";
        result.url = result.video_url = result.content_url = content;
        result.data = (Array.isArray(result.data) ? result.data : [{mime_type:"video/mp4"}]).map(item => item.b64_json ? item : Object.assign({},item,{url:content}));
      }
      result.seconds = Number(result.seconds || (result.parameters || {}).duration || result.requested_seconds) || undefined;
      if (task.finish_time && task.submit_time) result.generation_seconds = Math.max(0, task.finish_time - task.submit_time);
      if (task.status === "FAILURE") result.error = { code: "video_generation_failed", message: task.fail_reason || "Video generation failed" };
      return result;
    }
  }
};
