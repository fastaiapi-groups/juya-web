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

官网登录入口 `/fastaiui/login?redirect=...` 用于充值、发布管理。原 `/login` 控制台路径保持。认证代理只放行公开设置、原登录和2FA三个接口，继续使用原账号和权限；不新建账号、重置密码或复制数据库。开启验证码时停止本页密码提交，引导到原主站验证，禁止跳过。会话沿用现有前端 bearer token 方案；三个域名之间不自动共享浏览器令牌。

## 定位与验收结果

首页按用户确定定位展示五项产品：FastAi API、TuMei API、图灵设计、笑笑漫剧、Codex++；服务区统一提供充值、客户端发布、商户授权、统计、帮助和官网登录入口。原官网首页 `/hub/home/` 及 home 域名继续可用，不替换两个中转平台的原根路径控制台。

2026-11-11 验收：44 项原官网测试、18 项前端（含登录/2FA/验证码保护）测试、15 项 Worker 回归全部通过。11 组页面/API 在三线路均 200、逐路径正文摘要一致；新登录页、两个构建资源与公开账号设置也逐一一致。实际浏览器三线路均成功下载正式 APK，610881 字节、SHA256 与既有发布一致；三个二维码截图均经解码等于正式英文包 URL。

使用用户提供的当前官网管理员账号，三线路均实际登录、返回漫剧发布管理，读取漫剧/Codex++ 管理权限与充值管理权限成功。只读验收未创建或发布版本、未创建充值订单。商户后台三线路实际登录、会话查询、外来 Origin 拒绝和退出均通过；HTTP Cookie 与 HTTPS Secure 属性分别核实。未授权发布管理仍被拒绝，同源管理请求抵达鉴权层、外来来源返回403。生产所有47个原容器ID保持不变；老项目完整保留，其下载页二维码也使用原静态发布入口更新，原充值源码和服务继续运行。

首页 1360、390、375 像素宽度五产品和六管理入口检查通过，无横向溢出。验收私有临时凭据使用后删除，不进入仓库。

## 2026-11-11 Hub 优先链接与首页安卓二维码

用户要求官网与文档关联跳转优先使用 `/hub/` 开头地址。统一公开路径：`/hub/home/downloads/manju`、`downloads/codexplus`、`help/`、`merchant/`、`recharge`、`admin/client-releases`、`admin/recharge-stats`、`login`，旧入口仍提供兼容访问。Vue构建资源位于 `/hub/home/ui/`；原业务接口通过 `/hub/home/services/`、登录白名单通过 `/hub/home/auth/` 转发原服务，不新建账号或移动数据库。保留旧 merchant Cookie 和 API 路径，避免现有商户会话失效。

`deploy/hub-home/nginx.conf` 在基础设施仓库维护，保留原 Android 代理，新增官网路径映射。网站 Nginx 同时允许原home域名下的 `/hub/home/` 访问。先平滑加载兼容网关，再热发布网站，保留旧首页资源兼容，禁止重建业务容器。页面链接更新包含帮助文档及商户邀请链接，模型中转/设计平台各自业务根入口不改。已有安装包签名元数据不修改，只将页面中的受信任下载URL转换为Hub兼容地址。

首页独立漫剧下载模块新增SVG二维码，内容为 `https://fastaiapi.cloud/hub/home/android/downloads/XiaoxiaoManju-0.2.19-android.apk`，点击也可直接下载同一正式APK；文件大小和SHA保持。二维码为离线生成的静态资源，不依赖第三方二维码服务。
