"""FastAiApi video integration for the Zizi Animation PluginSDK host."""
import hashlib
import base64
import json
import os
import mimetypes
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

import requests

ROOT = Path(__file__).resolve().parent
for parent in list(ROOT.parents)[:4]:
    if str(parent) not in sys.path:
        sys.path.append(str(parent))
try:
    from plugin_utils import load_plugin_config
except ImportError:
    def load_plugin_config(path):
        config = Path(path).parent / "config.json"
        return json.loads(config.read_text("utf-8")) if config.is_file() else {}

BASE = "https://tumeiapi.com"
UPLOAD = "https://fastaiapi.cloud/help/magic-video/assets"
CATALOG = json.loads((ROOT / "catalog.json").read_text("utf-8"))["models"]
MODELS = {m["model_name"]: m for m in CATALOG}
DEFAULTS = {"api_key": "", "model": "sd-2-c1", "duration": 4, "ratio": "16:9", "resolution": "720p", "generation_mode": "文生视频", "duration_source": "plugin"}


def get_info():
    return {"name": "FastAiApi 视频", "description": "魔法与显卡视频，按模型选择参数和参考素材", "version": "1.1.0", "author": "FastAiApi"}


def get_params():
    params = dict(DEFAULTS)
    params.update(load_plugin_config(__file__) or {})
    return params


def list_models(key=""):
    key = str(key or get_params().get("api_key") or "").strip()
    allowed = None
    try:
        if key:
            authorized = requests.get(BASE + "/v1/models", headers={"Authorization": "Bearer " + key}, timeout=15)
            if authorized.status_code in (401, 403):
                return []
            authorized.raise_for_status()
            allowed = {m["id"] for m in authorized.json().get("data", [])}
        response = requests.get(BASE + "/api/pricing", timeout=15)
        response.raise_for_status()
        current = {m["model_name"]: m for m in response.json().get("data", [])}
        output = []
        for saved in CATALOG:
            name = saved["model_name"]
            if name not in current or allowed is not None and name not in allowed:
                continue
            item = dict(saved)
            for field in ("description", "tags"):
                item[field] = current[name].get(field) or saved.get(field, "")
            match = re.search(r'u\("(requests|seconds)"\)\s*\*\s*(\d+(?:\.\d+)?)', current[name].get("billing_expr", ""))
            if match:
                item["model_price"] = float(match.group(2))
                item["billing_unit"] = "second" if match.group(1) == "seconds" else "request"
            output.append(item)
        return output
    except (requests.RequestException, ValueError):
        return [dict(m) for m in CATALOG if allowed is None or m["model_name"] in allowed]


def handle_action(action, data=None):
    if action == "list_models":
        return {"ok": True, "models": list_models((data or {}).get("api_key", ""))}
    if action != "test_connection":
        return {"ok": False, "error": "不支持此操作"}
    key = str((data or {}).get("api_key") or get_params().get("api_key") or "").strip()
    if not key:
        return {"ok": False, "error": "请填写本站 API Key"}
    try:
        response = requests.get(BASE + "/v1/models", headers={"Authorization": "Bearer " + key}, timeout=15)
        allowed = response.status_code == 200 and any(m.get("id") in MODELS for m in response.json().get("data", []))
        return {"ok": allowed, "message": "连接成功" if allowed else "", "error": "" if allowed else "密钥不可用或没有已支持的视频模型权限"}
    except (requests.RequestException, ValueError):
        return {"ok": False, "error": "连接失败，请检查网络后重试"}


def report(context, text, percent):
    callback = context.get("progress_callback")
    if callable(callback):
        try:
            callback(text, percent)
        except TypeError:
            callback(text)


def paths(value):
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, dict):
        result = []
        keys = sorted(value, key=lambda k: int(k)) if all(str(k).isdigit() for k in value) else list(value)
        for key in keys:
            result.extend(paths(value[key]))
        return result
    if isinstance(value, (list, tuple)):
        result = []
        for item in value:
            result.extend(paths(item))
        return result
    return []


def upload(value, key):
    if re.match(r"^https?://", value, re.I):
        return value
    path = Path(value).expanduser()
    if not path.is_file():
        raise RuntimeError("参考素材不存在，请重新选择")
    if not 0 < path.stat().st_size <= 10 * 1024 * 1024:
        raise RuntimeError("本地素材须小于等于 10MB，较大素材请使用公网 URL")
    with path.open("rb") as stream:
        response = requests.post(UPLOAD, headers={"Authorization": "Bearer " + key, "X-File-Name": quote(path.name), "Content-Type": "application/octet-stream"}, data=stream, timeout=(20, 180))
    if response.status_code != 201:
        raise RuntimeError("素材上传失败，请检查密钥、权限、格式和大小")
    url = response.json().get("url")
    if not isinstance(url, str) or not url.startswith("https://"):
        raise RuntimeError("素材上传没有返回有效地址")
    return url


def media_plan(context, params, model):
    mode = params.get("generation_mode", "文生视频")
    if mode in ("文生视频", "加速文生"):
        return []
    references = context.get("reference_images") or {}
    gallery = paths(references.get("参考图片MAP", references) if isinstance(references, dict) else references)
    first = context.get("first_frame_path") or (references.get("首帧") if isinstance(references, dict) else None)
    last = context.get("end_frame_path") or (references.get("尾帧") if isinstance(references, dict) else None)
    if model.get("protocol") == "openai_video":
        if mode not in model["generation_modes"]:
            raise RuntimeError("当前模型不支持此生成方式，请重新选择")
        if mode in ("文生视频", "加速文生"):
            return []
        if mode in ("首帧", "四宫格", "数字人", "首尾帧", "首尾帧+参考素材"):
            if mode != "首尾帧+参考素材":
                first = first or (gallery[0] if gallery else None)
            if not first:
                raise RuntimeError("此模式需要首帧、四宫格或人物图片")
            result = [("first_frame", first)]
            if mode in ("首尾帧", "首尾帧+参考素材"):
                if mode == "首尾帧":
                    last = last or next((p for p in gallery if p != first), None)
                if not last and mode == "首尾帧":
                    raise RuntimeError("此模式需要尾帧；首帧与尾帧会分别提交")
                if last:
                    result.append(("last_frame", last))
            if mode == "首尾帧+参考素材":
                result.extend(("reference_image", p) for p in dict.fromkeys(gallery) if p not in (first, last))
            if mode not in ("数字人", "首尾帧+参考素材"):
                return result
        else:
            result = [("reference_image", p) for p in dict.fromkeys(gallery)]
            if first or last:
                raise RuntimeError("参考模式不会把首尾帧约束当作普通参考图；请按模型选择首尾帧或参考图片")
        for role, keys in [("reference_video", ("reference_videos", "reference_video_paths", "video_paths", "videos")), ("reference_voice", ("reference_audios", "reference_audio_paths", "audio_paths", "audios", "audio_path", "external_audio_path", "scene_audio_path"))]:
            refs = []
            for name in keys:
                refs.extend(paths(context.get(name)))
            result.extend((role, p) for p in dict.fromkeys(refs))
        return result
    if mode == "首尾帧":
        first = first or (gallery[0] if gallery else None)
        last = last or next((p for p in gallery if p != first), None)
        return [(role, value) for role, value in [("first_frame", first), ("last_frame", last)] if value]
    if mode != "参考生视频":
        raise RuntimeError("请选择文生视频、首尾帧或参考生视频")
    result = [("reference_image", p) for p in dict.fromkeys(([first] if first else []) + gallery + ([last] if last else []))]
    for role, keys in [("reference_video", ("reference_videos", "reference_video_paths", "video_paths", "videos")), ("reference_voice", ("reference_audios", "reference_audio_paths", "audio_paths", "audios"))]:
        values = []
        for name in keys:
            values.extend(paths(context.get(name)))
        if role == "reference_voice" and model["max_reference_audios"]:
            for name in ("audio_path", "external_audio_path", "scene_audio_path"):
                values.extend(paths(context.get(name)))
        result.extend((role, p) for p in dict.fromkeys(values))
    return result


def local_gpu_reference(value):
    if re.match(r"^https?://", value, re.I):
        return value
    path = Path(value).expanduser()
    if not path.is_file() or not 0 < path.stat().st_size <= 10 * 1024 * 1024:
        raise RuntimeError("显卡本地素材须存在且不超过 10MB；较大素材请使用公网 URL")
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return "data:" + mime + ";base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def gpu_payload(model, params, prompt, duration, resolution, ratio, media):
    mode = params.get("generation_mode", "文生视频")
    rule = model["gpu_modes"].get(mode)
    if rule is None:
        raise RuntimeError("当前模型不支持此生成方式")
    roles = {role: [m["url"] for m in media if m["type"] == role] for role in ("first_frame", "last_frame", "reference_image", "reference_voice", "reference_video")}
    for role in ("first_frame", "last_frame"):
        if len(roles[role]) > 1:
            raise RuntimeError("首帧和尾帧各只能提供一张")
    for role, kind in [("reference_image", "images"), ("reference_voice", "audios"), ("reference_video", "videos")]:
        limit = 1 if rule.get("audio_required") and kind == "audios" else rule["reference_" + kind + "_max"]
        if len(roles[role]) > limit:
            raise RuntimeError("参考素材数量超过当前模型模式限制")
    if rule.get("audio_required") and len(roles["reference_voice"]) != 1:
        raise RuntimeError("数字人需要一段覆盖生成时长的完整配音")
    metadata = {"channel": model["channel"]}
    payload = {"model": model["model_name"], "prompt": prompt, "seconds": int(duration), "metadata": metadata}
    if rule["dimension_mode"] == "reference":
        metadata["resolution"] = int(resolution.rstrip("p"))
    else:
        # Match model alignment and the 1920x1088 pixel ceiling.
        short = 1088 if resolution == "1080p" else int(resolution.rstrip("p"))
        width_ratio, height_ratio = [int(x) for x in ratio.split(":")]
        multiple = rule["dimensions"]["multiple"]
        if width_ratio >= height_ratio:
            width, height = min(1920, round(short * width_ratio / height_ratio / multiple) * multiple), short
        else:
            width, height = short, min(1920, round(short * height_ratio / width_ratio / multiple) * multiple)
        payload["size"] = str(width) + "x" + str(height)
        if model["model_name"] in ("minimax-h3", "minimax-h3-u24", "minimax-h3-u32"):
            metadata["resolution"] = resolution
    fps_rule = model["fps"]
    fps = params.get("fps", fps_rule["default"])
    if isinstance(fps, bool) or not isinstance(fps, (int, float)) or not float(fps).is_integer() or not fps_rule["min"] <= fps <= fps_rule["max"]:
        fps = fps_rule["default"]
    metadata["fps"] = int(fps)
    if mode == "加速文生":
        metadata["variant"] = "fast"
    if mode == "首尾帧+参考素材":
        if not (roles["reference_image"] or roles["reference_voice"] or roles["reference_video"]):
            raise RuntimeError("Hybrid 模式至少需要一份额外参考素材")
        metadata["mode"] = "ref2va"
    for role, field in [("first_frame", "input_reference"), ("last_frame", "last_frame_url")]:
        if roles[role]:
            (payload if role == "first_frame" else metadata)[field] = roles[role][0]
    for role, field in [("reference_image", "reference_images"), ("reference_voice", "reference_audios"), ("reference_video", "reference_videos")]:
        if roles[role]:
            metadata[field] = roles[role]
    resource_key = str(params.get("resource_account_key") or "").strip()
    if resource_key:
        if not re.fullmatch(r"rgpu_[a-f0-9]{64}", resource_key):
            raise RuntimeError("用户资源池 Key 格式错误")
        metadata["resource_account_key"] = resource_key
    return payload


def download(task_id, key, destination):
    url = BASE + "/v1/videos/" + quote(task_id, safe="") + "/content"
    print("视频下载 URL：" + url)
    temporary = destination.with_suffix(".mp4.part")
    for _ in range(6):
        target = urlparse(url)
        if target.scheme != "https" or target.username or target.password:
            raise RuntimeError("视频下载地址不受支持")
        headers = {"Authorization": "Bearer " + key} if target.netloc == "tumeiapi.com" else {}
        response = requests.get(url, headers=headers, stream=True, allow_redirects=False, timeout=(20, 180))
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("Location", "")
            response.close()
            if not location:
                raise RuntimeError("下载重定向缺少地址")
            url = urljoin(url, location)
            continue
        try:
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").lower()
            if "text/html" in content_type or "application/json" in content_type:
                raise RuntimeError("下载接口没有返回视频文件")
            with temporary.open("wb") as stream:
                for chunk in response.iter_content(1024 * 1024):
                    if chunk:
                        stream.write(chunk)
            if temporary.stat().st_size == 0:
                raise RuntimeError("视频文件为空")
            temporary.replace(destination)
            return
        finally:
            response.close()
    raise RuntimeError("视频下载重定向过多")


def generate(context):
    params = get_params()
    params.update(context.get("plugin_params") or {})
    key = str(params.get("api_key") or "").strip()
    if not key:
        raise RuntimeError("PLUGIN_ERROR:::请先填写本站 API Key")
    directory = Path(context.get("output_dir") or context.get("project_path") or ".").resolve()
    directory.mkdir(parents=True, exist_ok=True)
    identity = json.dumps([context.get(k) for k in ("viewer_index", "unique_name", "generation_round", "output_position")], ensure_ascii=False, default=str)
    stem = "magic-" + hashlib.sha256(identity.encode()).hexdigest()[:20]
    saved = directory / (stem + ".task.json")
    destination = directory / (stem + ".mp4")
    try:
        task_id = None
        if saved.is_file():
            task_id = json.loads(saved.read_text("utf-8")).get("id")
            if not task_id:
                raise RuntimeError("上次创建响应不确定，请先检查控制台任务，勿重复提交；核对后再移除对应 .task.json")
        if not task_id:
            model_id = params.get("model", "sd-2-c1")
            if model_id not in MODELS:
                raise RuntimeError("不支持此模型，请重新选择")
            model = MODELS[model_id]
            duration = context.get("duration", params.get("duration")) if params.get("duration_source") == "scene" else params.get("duration")
            if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not float(duration).is_integer() or not model["supported_duration"]["min"] <= duration <= model["supported_duration"]["max"]:
                raise RuntimeError("时长超出当前模型范围，请检查插件设置")
            resolution = params.get("resolution")
            if resolution not in model["supported_resolutions"]:
                resolution = model["supported_resolutions"][0]
            ratio = params.get("ratio")
            if ratio not in model["supported_ratios"]:
                ratio = model["supported_ratios"][0]
            prompt = context.get("prompt")
            if not isinstance(prompt, str) or not prompt.strip():
                raise RuntimeError("请填写提示词")
            plan = media_plan(context, params, model)
            if model.get("protocol") == "openai_video":
                gpu_payload(model, params, prompt, duration, resolution, ratio, [{"type": role, "url": value} for role, value in plan])
            for types, limit in [(("first_frame", "last_frame", "reference_image"), model["max_reference_images"]), (("reference_video",), model["max_reference_videos"]), (("reference_voice",), model["max_reference_audios"])]:
                if sum(role in types for role, _ in plan) > limit:
                    raise RuntimeError("参考素材数量超过当前模型限制")
            cache = {}
            media = []
            for role, value in plan:
                report(context, "上传参考素材", 3)
                if value not in cache:
                    cache[value] = local_gpu_reference(value) if model.get("protocol") == "openai_video" else upload(value, key)
                media.append({"type": role, "url": cache[value]})
            payload = {"model": model_id, "input": {"prompt": prompt}, "parameters": {"duration": int(duration), "resolution": resolution, "ratio": ratio}}
            if media:
                payload["input"]["media"] = media
            if model.get("protocol") == "openai_video":
                payload = gpu_payload(model, params, prompt, duration, resolution, ratio, media)
                if len(json.dumps(payload)) > 32 * 1024 * 1024:
                    raise RuntimeError("参考素材总量过大，请改用公网素材 URL")
            try:
                fd = os.open(str(saved), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            except FileExistsError:
                raise RuntimeError("已有任务正在创建，请稍后继续查询，勿重复提交")
            with os.fdopen(fd, "w", encoding="utf-8") as marker:
                json.dump({"creating": True}, marker)
            response = requests.post(BASE + "/v1/videos", headers={"Authorization": "Bearer " + key}, json=payload, timeout=(20, 120))
            response.raise_for_status()
            body = response.json()
            task_id = body.get("id") or body.get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise RuntimeError("创建响应缺少任务 ID，请先检查控制台，勿重复提交")
            saved.write_text(json.dumps({"id": task_id}), encoding="utf-8")
        if not isinstance(task_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", task_id):
            raise RuntimeError("任务 ID 格式错误，请检查本地任务记录")
        print("视频任务 ID：" + task_id)
        deadline = time.monotonic() + 2 * 60 * 60
        while time.monotonic() < deadline:
            response = requests.get(BASE + "/v1/videos/" + quote(task_id, safe=""), headers={"Authorization": "Bearer " + key}, timeout=(20, 45))
            response.raise_for_status()
            task = response.json()
            if task.get("status") == "completed":
                report(context, "保存视频", 99)
                download(task_id, key, destination)
                saved.unlink(missing_ok=True)
                report(context, "视频已保存", 100)
                return [str(destination)]
            if task.get("status") == "failed":
                saved.unlink(missing_ok=True)
                raise RuntimeError("视频生成失败，请查看控制台任务详情后再重试")
            if task.get("status") not in ("queued", "in_progress"):
                raise RuntimeError("任务状态无法识别，请保留任务 ID 联系支持")
            report(context, "排队或生成中，任务 ID：" + task_id, 20)
            time.sleep(20)
        raise RuntimeError("等待超时，任务 ID：" + task_id + "；重新运行会继续查询原任务")
    except Exception as error:
        if isinstance(error, requests.RequestException):
            message = "网络或接口请求失败；请保留任务记录，勿立即重复创建"
        else:
            message = str(error)
        raise RuntimeError("PLUGIN_ERROR:::" + message) from None
