# 验证记录

日期：2026-10-09（Asia/Shanghai）。本机验证，尚未部署到公网域名。

官网端口已更新为 6668，Nginx `server_name`、canonical 和 Open Graph 地址已设为 `web.fastaiapi.cloud`。带该 Host 的本地首页、健康检查与三个安装包 HEAD 请求均通过。公网访问由服务器反向代理负责，对应配置见 `docker/Caddyfile.example`。

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
