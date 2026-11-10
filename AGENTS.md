# 项目约定

- 官网域名为 `home.fastaiapi.cloud`，当前仓库为 `fastaiapi-groups/juya-web`。本地 `fastai-website` 对应生产 `/opt/fastaiapi-groups/juya-web`，生产分支为 `main`。
- 用户明确要求后续业务数据统一使用 PostgreSQL。商户、代理、卡密、设备绑定、会话和签名密钥均存 PostgreSQL；新功能沿用现有连接池和参数化 SQL，不添加 SQLite 或浏览器本地存储作为业务数据库。
- 商户和代理保留分销层级，代理可发展下级。自助注册和上级创建的新代理均需平台管理员审批，分销权限按整条上级链和所属子树校验。
- 多条相关写入通过 `server/store.mjs` 的事务执行，事务必须使用同一连接。保留商户权限隔离、设备激活锁和现有公开 API 的请求/响应格式。
- 发布统一使用 `./restart.sh`。先在本地验证、提交并推送，再在生产快进到同一提交后启动；生产源码漂移必须先对账保留，不使用强制 reset 或清理数据卷。
- `.env`、数据库、备份、凭据和测试数据不提交 Git。管理员和数据库初始密码由启动脚本安全生成，启动时不得自动重置已有密码；用户明确要求改名或重置管理员时，使用一次性的 set-admin 操作并保留账号 ID 和业务数据。
- 验证命令：`npm ci`、`npm run check`、`npm test`、`bash -n restart.sh`。集成测试使用临时 PostgreSQL 或显式 `TEST_DATABASE_URL`，不使用生产数据库测试。

- 官网统一页面源码位于 `frontend/`，构建基路径 `/fastaiui/`。原下载、充值、管理路径不变；三入口为国内90端口、tumeiapi.com、fastaiapi.cloud。老 `sub2api-creator-engine` 的全部源码和原充值服务必须保留。
- 纯页面发布使用 `./restart.sh --no-pull --website-static`，只构建页面并原子写入现有 Nginx 后平滑 reload，不触发商户/账号/数据库或 NewAPI/Sub2API 重建。
- 官网登录入口 `/fastaiui/login` 使用原 Sub2API 登录与两步验证，精确认证代理白名单不得扩大；启用验证码时引导到原主站验证，不跳过验证。不改变原控制台 `/login`。
- 官网定位为两款中转平台（FastAi API、TuMei API）、图灵在线设计、笑笑漫剧、Codex++ 的统一宣传与管理门户；首页五项产品均需保留明确入口。
- 官网页面与文档的导航优先使用 `/hub/home/` 路径：downloads、help、merchant、recharge、admin、login；旧 `/fastaiui`、`/help` 等保持兼容。不要改写签名发布数据，安装包只转换呈现链接。首页漫剧模块保留直达正式APK的二维码。
