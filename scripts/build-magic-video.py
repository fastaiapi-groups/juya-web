#!/usr/bin/env python3
"""Build reproducible, credential-free client packages and the public docs module."""
from pathlib import Path
import base64,gzip,hashlib,html,json,urllib.parse,zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/help/magic-video'
DOWNLOADS=OUT/'downloads';DOWNLOADS.mkdir(parents=True,exist_ok=True)
CAT=json.loads((ROOT/'plugins/new-api/catalog.json').read_text())
SOURCE=(ROOT/'plugins/new-api/plugin.js').read_text()
CORE=(ROOT/'plugins/new-api/installer-core.mjs').read_text().replace('export async function installMagicVideo','async function installMagicVideo')

def encoded(value):return base64.b64encode(gzip.compress(value.encode(),mtime=0)).decode()

ui=(ROOT/'plugins/new-api/installer-ui.js').read_text()
codec="""async function decompressData(value){
 if(typeof DecompressionStream==='undefined')throw new Error('请使用当前版本 Chrome、Edge 或 Safari');
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
"""
ui=ui.replace("(async()=>{'use strict';", "(async()=>{'use strict';\n"+codec)
small={k:v for k,v in CAT.items() if k!='models'}
small['models']=[{k:m[k] for k in ['model_name','description','tags','icon','supported_resolutions','model_price','billing_unit']} for m in CAT['models']]
ui=ui.replace('__CATALOG__',"JSON.parse(await decompressData('"+encoded(json.dumps(small,ensure_ascii=False,separators=(',',':')))+"'))").replace('__SOURCE__',"await decompressData('"+encoded(SOURCE)+"')").replace('__CORE__',CORE)
bookmark='javascript:'+urllib.parse.quote(ui,safe='')
assert len(bookmark)<64000,len(bookmark)
installer='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FastAiApi 魔法视频 · new-api 安装器</title><style>body{max-width:760px;margin:60px auto;padding:20px;font:16px/1.9 system-ui;color:#1e4938;background:#f4f9f5}a.button{display:inline-block;padding:15px 24px;border-radius:10px;background:#176c53;color:white;text-decoration:none}code{background:#e4eee8;padding:3px 6px}li{margin:12px 0}</style><h1>魔法视频 · new-api 一键安装</h1><p>业务配置只需填写 tumeiapi.com 的“魔法视频分组”API Key。安装器预置本站地址、11 款模型、图标、标签和计费配置。</p><ol><li>将下面的按钮拖到浏览器书签栏。</li><li>打开你自己的 new-api 后台，正常登录超级管理员，完成面板要求的安全验证。</li><li>点击书签，填写本站 API Key，点击“安装并启用”。</li></ol><p><a class="button" href="__BOOKMARK__" draggable="true">安装魔法视频 → 拖到书签栏</a></p><p>需要支持 Task Plugin API v1 和模型计费配置接口的 new-api。管理员凭据只在当前面板使用，不发送到其他站点；现有自定义价格保留。新建渠道配置完成前保持停用。</p><p><a href="https://fastaiapi.cloud/help/magic-video/">查看完整文档与价格 ↗</a></p></html>'''.replace('__BOOKMARK__',html.escape(bookmark,quote=True))
new_readme='''FastAiApi 魔法视频 new-api 接入包 1.0.0

1. 用当前版本 Chrome/Edge/Safari 打开 installer.html。
2. 将“安装魔法视频”按钮拖到书签栏。
3. 打开自己的 new-api 面板，登录超级管理员，完成面板要求的安全验证。
4. 点击书签，填写 tumeiapi.com 的魔法视频分组 Key，点击安装并启用。

无需手工填写本站地址、模型、图标、标签或价格。需支持 Task Plugin API v1 与模型计费配置接口的版本。
安装保留自定义价格；新价格按面板汇率转换，本地分组倍率保持。
包内 install.js 为完整安装器源代码，plugin.js 为协议插件源代码，catalog.json 为模型规格与参考价格。
安装器不保存或导出管理员凭据，不自动提交生成测试。
文档：https://fastaiapi.cloud/help/magic-video/
'''
zz_readme='''FastAiApi 魔法视频 字字动画插件 1.0.0

将 video_plugin_fastai_magic 文件夹放入字字动画的 _internal/plugins/video_plugins/，重启客户端。
选择“FastAiApi 魔法视频”，填写 tumeiapi.com 的“魔法视频分组”Key。本站地址、11 款模型规格已内置。
支持文生视频、首尾帧、多模态参考与本地素材上传（单文件最多 10MB）。不同模型支持的素材和规格不同。
只创建一次任务，超时或断网后保留 .task.json，重新运行会继续查询。创建结果不确定时先检查控制台任务，勿直接重试；核对后再处理对应 .task.json。
成功后自动保存 mp4，并打印完整的本站下载 URL。下载仍需本站 Key，不是免鉴权直链。
这是字字动画客户端插件，不是额外的服务端 Python 程序。
文档：https://fastaiapi.cloud/help/magic-video/
'''

def archive(path,files):
 with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,data in sorted(files.items()):
   info=zipfile.ZipInfo(name,(2026,11,5,0,0,0));info.create_system=3;info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
   z.writestr(info,data.encode() if isinstance(data,str) else data)

client_root=ROOT/'plugins/zzdh/video_plugin_fastai_magic'
files={}
for name in ['main.py','info.json','catalog.json','ui/index.html','ui/app.js','ui/assets/jimeng.svg','ui/assets/alibaba.svg','ui/assets/lobe-icons-LICENSE.txt']:files['video_plugin_fastai_magic/'+name]=(client_root/name).read_bytes()
files['video_plugin_fastai_magic/安装说明.txt']=zz_readme
zz=DOWNLOADS/'fastai-magic-video-zzdh-1.0.0.zip';archive(zz,files)
new=DOWNLOADS/'fastai-magic-video-newapi-1.0.0.zip';archive(new,{'fastai-magic-video-newapi/plugin.js':SOURCE,'fastai-magic-video-newapi/catalog.json':json.dumps(CAT,ensure_ascii=False,indent=2),'fastai-magic-video-newapi/install.js':ui,'fastai-magic-video-newapi/installer.html':installer,'fastai-magic-video-newapi/安装说明.txt':new_readme})
(DOWNLOADS/'demo.sh').write_bytes((ROOT/'plugins/magic-video/demo.sh').read_bytes())
(DOWNLOADS/'plugin.js').write_text(SOURCE)
(DOWNLOADS/'install.js').write_text(ui)
(DOWNLOADS/'catalog.json').write_text(json.dumps(CAT,ensure_ascii=False,indent=2)+'\n')
(OUT/'installer.html').write_text(installer)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(DOWNLOADS/'SHA256SUMS.txt').write_text(''.join(sha(p)+'  '+p.name+'\n' for p in [zz,new,DOWNLOADS/'demo.sh',DOWNLOADS/'plugin.js',DOWNLOADS/'install.js']))
rows=[]
for m in CAT['models']:
 esc=lambda x:html.escape(str(x),quote=True)
 icon='alibaba' if m['model_name']=='w3-p-c1' else 'jimeng'
 unit='秒' if m['billing_unit']=='second' else '次'
 tags=''.join('<span class="model-tag">'+esc(t)+'</span>' for t in m['tags'].split(',') if t)
 caps=f"{m['supported_duration']['min']}–{m['supported_duration']['max']} 秒 · {' / '.join(m['supported_resolutions'])} · 参考上限 {m['max_reference_images']} 图 / {m['max_reference_videos']} 视频 / {m['max_reference_audios']} 音频"
 rows.append(f'<section class="model-spec"><div class="model-top"><div class="model-id"><img src="assets/{icon}.svg" alt="" width="38" height="38"><strong>{esc(m["model_name"])}</strong></div><span class="model-price">¥{m["model_price"]:g}<small>/{unit}</small></span></div><p>{esc(m["description"])}</p><p class="spec-line">{esc(caps)}</p><div class="model-tags">{tags}</div></section>')
toc=''.join(f'<a class="toc-h2" href="#{key}">{name}</a>' for key,name in [('quickstart','1. 地址与鉴权'),('models','2. 模型、规格与价格'),('request-fields','3. 请求与参考素材'),('query-download','4. 查询与下载'),('plugins','5. 下载插件'),('demo','6. 完整示例'),('errors','7. 常见问题')])
page=(ROOT/'plugins/magic-video/page.html').read_text().replace('__TOC__',toc).replace('__MODEL_ROWS__','\n'.join(rows)).replace('__INSTALL_BOOKMARK__',html.escape(bookmark,quote=True)).replace('__ZZDH_SHA__',sha(zz)).replace('__NEWAPI_SHA__',sha(new)).replace('__DEMO__',html.escape((ROOT/'plugins/magic-video/demo.sh').read_text()))
assert '__' not in page
(OUT/'index.html').write_text(page)
print(json.dumps({'models':len(CAT['models']),'bookmarklet_bytes':len(bookmark),'downloads':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in [zz,new]}},ensure_ascii=False,indent=2))
