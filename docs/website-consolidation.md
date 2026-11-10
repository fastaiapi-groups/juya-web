# 统一官网页面（2026-11-11）

`fastai-website` 统一维护官网、帮助、商户后台以及从 `sub2api-creator-engine/frontend` 复制的全部 Vue 页面（下载、版本发布、充值、充值统计、图像工作台）。旧项目源码、页面、接口及部署全部保留，尤其原充值页面继续可用，不删除其任何内容。

访问入口：`http://8.137.194.180:90`、`https://tumeiapi.com`、`https://fastaiapi.cloud`。原路径保持，例如 `/fastaiui/downloads/manju`、`/fastaiui/downloads/codexplus`、`/fastaiui/admin/client-releases`、`/fastaiui/recharge`、`/fastaiui/admin/recharge-stats`、`/merchant/`、`/help/`。官方首页 `/hub/home/` 继续由原官网网关提供；已有根域控制台及登录入口保持各线路既有业务归属。

仅页面归并；充值订单、授权、版本签名、上传目录、下载地址和数据仍由原服务维护。官网 Nginx 经 `design_default` 内网访问 `design-api:8080` 与 `manju-updates-api:8080`；商户沿用原 PostgreSQL 与 merchant 服务。浏览器仍使用同源 `/fastaiapi/...`，无需复制账号或改写历史数据。

安卓卡片显示正式 APK 二维码，内容与下载按钮的正式英文包 URL 一致。原签名桌面包元数据不变。HTTP 线路的分片上传标识使用 getRandomValues，兼容无 randomUUID 的浏览器上下文。

## 验证与发布

- `npm ci && npm run check && npm test`：临时 PostgreSQL，禁止生产库测试。
- `npm --prefix frontend ci && npm run test:pages && npm run build:pages`。
- `./restart.sh --no-pull --website-static`：仅构建静态镜像，保留旧哈希资源，原容器内原子替换 HTML、校验并平滑 reload Nginx；不重建 API、商户、数据库、NewAPI 或 Sub2API。
- 原版全量 `restart.sh` 仍保留，纯页面发布必须使用上述参数。
- `deploy/website-routes/restart.sh` 在 VPS2 安装精确路径分流，校验失败恢复原文件，不重启服务。
- tumei 路由位于基础设施仓库 `chatgpt2api-go/deploy/direct-gateway/worker.mjs`，只对精确官网路径回源 6660，其余接口不变。

只对已公布别名的精确同源 Origin 做后端规范化；外部 Origin 原样交给后端拒绝，不关闭 CSRF。HTTP 国内入口登录时仅在该精确 Origin 上移除商户 Cookie 的 Secure 标志，HTTPS 保持 Secure；会话仍 HttpOnly、SameSite=Strict。三个域名会话各自隔离，不能承诺自动跨域登录。

回退文件保存在服务器 `.local/website-publish/<UTC>-<commit>/`；恢复 previous-nginx.conf 并 nginx -t / reload，恢复 previous-html 中对应 HTML；旧哈希不清理。Caddy 同目录 before-website 备份可原样恢复并 validate/reload，Worker 可回退上一版本。老项目仍完整运行。
