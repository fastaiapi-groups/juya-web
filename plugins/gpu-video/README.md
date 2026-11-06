# NewAPI 视频插件 1.9.6

同一个 `comfyui-video` 插件支持两种接入：平台的 NewAPI 连接 Go Wrapper；下游自己的 NewAPI 连接平台 NewAPI。字字动画使用 NewAPI 的公开接口，不需要 Wrapper 密钥。

## 安装与升级

1. 在支持 Task Plugin API v1 的 NewAPI 后台导入 `comfyui-video.js`，或用管理 API 导入 `plugin-upload.json`。
2. 在插件版本列表激活 **1.9.6**。上传与激活是两步；保留现有渠道、任务和管理员自定义价格。
3. 平台直连 Wrapper 使用 `channel-template.json`（type 61），填写 Wrapper Key。
4. 下游连接平台使用 `downstream-channel-template.json`（type 60），填写 **tumeiapi.com 的用户 API Key**。该模板绑定 `task_extend_plugin_keys=["comfyui-video"]`，Base URL 为 `https://tumeiapi.com`。不要把 Wrapper Key 发给下游。

模板不写入或覆盖价格。模型权限、分组与定价由各自 NewAPI 管理员配置；该 Key 必须具备所选模型权限。

## 创建、查询与下载

```bash
export NEWAPI_BASE='https://tumeiapi.com'
export NEWAPI_KEY='替换成自己的 NewAPI Key'
curl --fail-with-body "$NEWAPI_BASE/v1/videos" \
  -H "Authorization: Bearer $NEWAPI_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"minimax-h3-u24","prompt":"红球在木桌上缓缓滚动，固定镜头","seconds":5,"size":"864x480","metadata":{"channel":"autodl"}}'
# 保存响应的 id；创建超时后先核对原任务，不要自动再次创建。
export TASK_ID='上一步返回的 task_…'
curl --fail-with-body "$NEWAPI_BASE/v1/videos/$TASK_ID" -H "Authorization: Bearer $NEWAPI_KEY"
# status=completed 后下载；这是需要鉴权的 NewAPI 地址。
curl --fail --location --proto '=https' --proto-redir '=https' \
  "$NEWAPI_BASE/v1/videos/$TASK_ID/content" -H "Authorization: Bearer $NEWAPI_KEY" -o result.mp4
```

自己的下游 NewAPI 使用自己的 Base URL 和 Key。插件在转发时保留公开模型名，返回当前 NewAPI 的任务 ID 和内容路径；调用者不依赖 Go 的内部任务 ID、云机地址或工作流节点。

状态为 `queued`、`in_progress`、`completed`、`failed`。重连和提交回执待核实归为进行中，并保留 `stage`。错误停止后先检查原因；明确失败才重新创建。

## 首尾帧与参考素材

```json
{
  "model": "minimax-h3",
  "prompt": "保持红球与木桌外观，镜头平稳",
  "seconds": 5,
  "size": "864x480",
  "input_reference": "https://example.com/first.png",
  "metadata": {
    "channel": "autodl",
    "last_frame_url": "https://example.com/last.png"
  }
}
```

人物、场景使用 `metadata.reference_images` 数组；音频使用 `metadata.reference_audios`。它们与首帧、尾帧约束分别表达，不能互相替代。Go 在上传显卡前将图片解码并重新编码为 JPEG。首帧也可通过 multipart 的 `input_reference` 文件字段提交。

AutoDL U24 支持参考图和参考音频，U32 支持参考图；不能照搬仙宫云 H3 的参考视频或 Hybrid 参数。详细范围见 [按模型参数表](gpu-video-api.md)。

## 用户自己的显卡

先通过 Go 资源账号接口登记云账号，取得 `rgpu_…` 资源 Key，再在创建视频的 `metadata.resource_account_key` 提供。`metadata.channel` 与资源池匹配（AutoDL 为 `autodl` / `autodl-native`，仙宫云为 `xiangongyun`）。资源 Key 只代表隔离资源池，不能据其格式猜测云平台。

NewAPI 用户 Key 与云账号 Token、资源 Key 是不同凭据。插件将资源 Key 放在平台委托头中；NewAPI 之间转发时保留委托信息，最终由 Go 校验资源池归属。

## 验证

```bash
node integrations/newapi/test-plugin.mjs
new-api plugin lint integrations/newapi/comfyui-video.js
new-api plugin test integrations/newapi/comfyui-video.js --fixture integrations/newapi/xiangongyun-fixture.json
```

真实生成验收单独记录；这些协议测试不等于已在任意镜像、任意 GPU 上跑过模型。
