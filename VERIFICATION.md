# 验证记录

日期：2026-10-09（Asia/Shanghai）。已恢复 `0.0.0.0:6660` 和 `https://ui.fastaiapi.cloud`，本机、服务器及公网下载验证均通过。

当前 Nginx `server_name`、canonical、Open Graph 和代理示例均使用 `ui.fastaiapi.cloud`。以下保留先前 `6668` / `web.fastaiapi.cloud` 的验证历史；最新公网结果见末尾「恢复原端口与 ui 域名」。

## 容器与下载

- `docker compose config --quiet`：通过。
- `docker compose up -d --build`：镜像构建与启动通过。
- `docker compose ps`：`website` 为 healthy，宿主机端口映射 `0.0.0.0:6668:80`。
- `docker compose exec -T website nginx -t`：通过。
- `node --check public/app.js`：通过。
- `/healthz`：HTTP 200，正文 `ok`。
- `/site-config.json`：返回与宿主机配置相同的 JSON，`Cache-Control: no-store`。
- Windows、Mac Apple 芯片、Mac Intel 三个安装包均返回 HTTP 200，`Content-Disposition: attachment`，Content-Length 与宿主机真实文件大小一致。
- 三个安装包均通过 `Range: bytes=0-63` 返回 HTTP 206，64 字节正文与宿主机文件首段一致。验证期间未重复下载整份数百 MB 安装包。
- 下载目录根路径、未上架 DMG、发行目录中的校验 JSON、子目录文件、`.env` 和缺失静态文件均返回 HTTP 404。

## 浏览器

- 官网标题、产品介绍、三个产品入口与五种联系方式正常显示。
- 下载卡片显示 4.0.10 版本、真实文件大小、经过编码的正确文件名。
- 手机导航菜单可打开，点击“联系我们”后跳转到联系区并自动关闭菜单。
- 桌面下载导航可跳转到下载区。
- 320 / 390 / 768 / 1280 像素宽度下，文档 scrollWidth 等于视口宽度，无横向溢出。
- 390 像素时联系卡片为两列，768 像素时为三列，桌面为五列。
- 临时把 Intel 安装包配置为不存在的文件并刷新：显示“暂未上架 · 联系管理员获取”，`aria-disabled=true` 且无 `href`。其他两个下载保持可用。
- 临时修改备案字段并刷新：页面直接读取新内容，无重建或重启，证明目录挂载下的配置热更新有效。
- 临时验证后恢复完整的原始配置，三平台正式安装包均已恢复。

预览截图：`docs/preview-desktop.png`、`docs/preview-mobile.png`、`docs/preview-products.png`。

## 产品主题改版

- 参考 Chatfire 的产品矩阵信息组织，首屏突出剧芽短剧与 AI 短剧创作，产品区改为独立产品卡片、功能说明、适用人群与操作入口。
- 在线设计平台能力已依据其公开页面核对，介绍生图、套图、图像编辑与节点画布；未添加参考站的性能数字或服务承诺。
- 分镜切换验证：海岸、山林、神鸟的图片、标题、说明和 `aria-pressed` 选中状态同步更新。浮层不阻挡分镜按钮。
- 320 像素视口：首屏文案、分镜舞台、产品卡片宽度均为 280 像素，完整适配容器；390 像素视口均为 350 像素；768 像素视口舞台宽 530 像素、产品卡片宽 600 像素。各尺寸无文档横向溢出。
- 新版桌面、手机产品入口、下载导航与三平台 4.0.10 安装包检查通过，浏览器无页面 JavaScript 错误日志。
- Docker 已重建并继续绑定 `0.0.0.0:6668:80`，健康检查通过。下载目录与公开配置的映射保留。

## 端口与域名更新

- Docker 默认端口与当前本地配置均设为 `6668`，绑定 `0.0.0.0`，容器内部仍监听 80。
- Nginx `server_name`、页面 canonical、Open Graph 地址、Caddy 代理示例与部署文档统一更新为 `web.fastaiapi.cloud`。
- 实际重建并重启容器后，使用 Host `web.fastaiapi.cloud` 访问本地 6668 首页返回 HTTP 200，canonical 正确；健康检查、Nginx 配置校验及三个安装包 HEAD 均通过。
- 浏览器直连 `http://127.0.0.1:6668` 返回 `net::ERR_UNSAFE_PORT`。使用用户指定的端口部署，通过标准 HTTPS 域名反向代理访问，不修改浏览器限制。
- 公网 `https://web.fastaiapi.cloud` 返回 HTTP 200，但标题为 `DeepTrade X GPU-NFT - 产品需求原型`，并非此官网。项目内域名配置已更新，服务器上的代理与部署仍需切换到官网服务。

## 面板上传与服务器部署

- 通过小皮面板文件管理器创建 `/opt/fastaiapi-groups/juya-web/download`，使用「选择文件」「开始上传」上传三个 4.0.10 安装包；面板全部显示「已上传」。未使用 SCP 替代面板上传。
- 三个服务器文件的大小和完整 SHA-256 与 `config/installers-checksums.json` 完全一致。
- 服务器代码同步到 `a459870`，通过面板终端执行 `docker-compose up -d --build`。该服务器使用面板提供的独立 Compose 命令。
- `fastai-website-website-1` 为 healthy，端口 `0.0.0.0:6668->80/tcp`；下载目录只读挂载到 `/srv/downloads`，公开配置只读挂载到 `/etc/fastai`。
- 服务器 `http://127.0.0.1:6668/` 返回剧芽官网标题，`/healthz` 返回 `ok`，容器 `nginx -t` 通过。
- 三个安装包 HEAD 均为 HTTP 200，`Content-Disposition: attachment`；Content-Length 分别为 462426538、469839316、500595004 字节。
- 三个安装包请求前 64 字节，响应内容 SHA-256 均与本地文件首段一致；未重复下载完整安装包。下载目录根路径及校验 JSON 返回 404。
- 公网域名仍返回 DeepTrade 页面，响应经过 Caddy；当前面板服务器未发现该域名的代理配置或 Caddy 进程。已请求域名代理的管理入口，尚未验证公网官网前端下载，不能视为公网发布完成。
- 上传证明：`docs/panel-upload-complete.png`；实际目录：`docs/panel-download-directory.png`。

## 联系方式图标与 QQ 群

- 联系区改为独立圆角卡片，添加邮件、Telegram、WhatsApp、X、QQ 平台 SVG 图标，使用不同的平台颜色与悬停效果。
- 新增 QQ 群 `48878665`；点击后成功显示「群号已复制 · 打开 QQ 搜索加入」，复制功能已在浏览器验证。
- 1440 像素下为三列，768 像素下为两列，390 / 320 像素下为单列；页面与卡片均无横向溢出。
- 六个卡片的图标和联系方式均正确，原有联系方式与安装包配置保留。
- JavaScript 语法、JSON 配置和 Compose 配置校验通过。
- 效果截图：`docs/contacts-desktop.png`。

## 五语言官网

- 支持 `zh-CN`、`en`、`ja`、`ko`、`zh-TW`，深色下拉菜单显示原生语言名、语言标识与当前选中项。默认简体中文，选择后刷新仍保留语言。
- 四份翻译各有 206 个文案键，静态简体中文文案、图片说明与无障碍属性全部通过覆盖检查。标题、页面说明、分镜、下载状态、联系方式、QQ 群复制提示同步本地化。
- 五种语言分别在 1440 / 768 / 390 / 320 像素下验证，共 20 组；文档 scrollWidth 等于视口宽度，三个下载链接和六个联系卡片均正常。
- 选中山林分镜后切换日语，选中分镜保留，标题、说明与图片 alt 更新为日语。
- 日语 QQ 群复制成功；语言菜单支持方向键、Home / End 和 Escape，关闭后焦点回到语言按钮。
- 切换语言复用安装包检查结果，文件名、版本号、账号和链接保持原配置，不重复请求已经确认的安装包信息。
- JavaScript、Compose 配置与 Git diff 检查通过。
- 截图：`docs/languages-menu.png`、`docs/languages-english.png`、`docs/languages-mobile.png`。

## 恢复原端口与 ui 域名

- Compose 默认端口、本地与服务器 `.env` 改回 `6660`，绑定 `0.0.0.0`；Nginx、canonical、Open Graph 和代理示例统一为 `ui.fastaiapi.cloud`。
- 面板目录 `/opt/fastaiapi-groups/juya-web` 已拉取代码，通过 `docker-compose up -d --build --force-recreate website` 重建并重启官网。
- 服务器 `http://127.0.0.1:6660/healthz` 与公网 `https://ui.fastaiapi.cloud/healthz` 均返回 `ok`；公网首页标题、canonical 正确。
- 公网三个安装包 HEAD 均返回 HTTP 200，Content-Length 与校验记录一致，Content-Disposition 为 attachment；Range 请求均返回 HTTP 206，前 64 字节与本地原文件一致。
- 公网浏览器三个下载卡片均显示 4.0.10、正确大小和有效下载链接；五语言菜单、六个联系方式及 QQ 群号保持正常。
- 下载目录继续映射 `/opt/fastaiapi-groups/juya-web/download`。无需重复上传安装包。
- 公网下载区截图：`docs/live-ui-downloads.png`。

## 小字可读性优化

- 新增统一阅读样式：正文桌面 16px、手机 15px，下载信息、辅助说明、联系卡片说明与页脚 14px，产品标签 13px。提高文字亮度并增大行距。
- 放大产品和工作台示意图中的文字，调整预览高度、节点位置和手机布局，让文字获得足够空间。
- 五种语言分别在 1440 / 768 / 390 / 320 像素下检查，共 20 组：文档无横向溢出，下载卡片、联系卡片、产品介绍、标签和分镜说明无元素内部裁切；三个下载链接与六个联系卡片均正常。
- 浏览器实测手机正文 15px，下载版本、大小、安装说明与联系说明 14px。人工核对桌面下载区、英文产品卡片、390px 中文下载区和 320px 英文首屏。
- Docker 本地重建、Compose 配置和 Git diff 检查通过。截图：`docs/readability-desktop.png`、`docs/readability-mobile.png`。
- 服务器已部署 `5833d98` 并重建容器：healthy、`0.0.0.0:6660`、Nginx 配置检查通过。公网样式文件与本地 SHA-256 一致，浏览器确认下载说明和联系说明为 14px；三个安装包 HEAD 200、文件大小正确且仍以附件下载。
