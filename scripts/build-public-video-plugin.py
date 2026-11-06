#!/usr/bin/env python3
"""Build the customer NewAPI-only profile from the validated internal adapter."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
source=(root.parent/'comfyui-api-wrapper/integrations/newapi/comfyui-video.js').read_text()
assert 'version: "1.9.7"' in source
source=source.replace('baseUrl: "https://comfy.fastaiapi.cloud"','baseUrl: "https://tumeiapi.com"').replace('upstreams: ["vendor", "new_api"]','upstreams: ["new_api"]').replace('allowedHosts: ["comfy.fastaiapi.cloud:443"]','allowedHosts: ["tumeiapi.com:443"]')
source=source.replace('  const baseUrl = configuredBase === "http://fastai-comfy-gateway:8000" ? "https://comfy.fastaiapi.cloud" : configuredBase;','  const baseUrl = configuredBase;')
source=re.sub(r'^\s*//.*\n','',source,flags=re.M)
source=source.replace('xiangongAlias','extendedAlias').replace('xiangongRequest','extendedRequest').replace('isXiangong','isExtended')
source=source.replace('  if (body.channel !== undefined && body.channel !== "xiangongyun") throw new Error("Xiangongyun models require the xiangongyun channel");\n','').replace('  body.channel = "xiangongyun";\n','')
source=source.replace('return !!extendedAlias(model || req.model) || req.channel === "xiangongyun" || req.metadata && req.metadata.channel === "xiangongyun";','return !!extendedAlias(model || req.model);')
source=source.replace('export function buildSubmitRequest(ctx) {','export function buildSubmitRequest(ctx) {\n  if (!ctx.upstream || ctx.upstream.kind !== "new_api") throw new Error("Select the NewAPI connection profile");')
source=source.replace('  const req = ctx.requestBody || {};\n  if (!String(req.prompt', '  const req = ctx.requestBody || {};\n  if (req.channel !== undefined || (req.metadata || {}).channel !== undefined) throw new Error("Select a public model; routing options are not accepted");\n  if (!String(req.prompt')
source=source.replace('AutoDL','video').replace('Xiangongyun','selected video').replace('Wrapper','service').replace('"autodl"','"managed"')
assert not re.search(r'comfy\.fastaiapi|autodl|xiangong|seetacloud|fastai-comfy-gateway|meaicc|zealman|wrapper',source,re.I)
(root/'plugins/gpu-video/comfyui-video.js').write_text(source)
(root/'plugins/gpu-video/plugin-upload.json').write_text(json.dumps({'source':source,'remark':'1.9.7: public video models, private-routing-free task responses and NewAPI-only profile'},ensure_ascii=False,indent=2)+'\n')
print('Generated public NewAPI profile 1.9.7')
