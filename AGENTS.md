# 项目约定

- 官网域名为 `home.fastaiapi.cloud`，当前仓库为 `fastaiapi-groups/juya-web`。本地 `fastai-website` 对应生产 `/opt/fastaiapi-groups/juya-web`，生产分支为 `main`。
- 用户明确要求后续业务数据统一使用 PostgreSQL。商户、代理、卡密、设备绑定、会话和签名密钥均存 PostgreSQL；新功能沿用现有连接池和参数化 SQL，不添加 SQLite 或浏览器本地存储作为业务数据库。
- 商户和代理保留分销层级，代理可发展下级。自助注册和上级创建的新代理均需平台管理员审批，分销权限按整条上级链和所属子树校验。
- 多条相关写入通过 `server/store.mjs` 的事务执行，事务必须使用同一连接。保留商户权限隔离、设备激活锁和现有公开 API 的请求/响应格式。
- 发布统一使用 `./restart.sh`。先在本地验证、提交并推送，再在生产快进到同一提交后启动；生产源码漂移必须先对账保留，不使用强制 reset 或清理数据卷。
- `.env`、数据库、备份、凭据和测试数据不提交 Git。管理员和数据库初始密码由启动脚本安全生成，已有密码不得重置。
- 验证命令：`npm ci`、`npm run check`、`npm test`、`bash -n restart.sh`。集成测试使用临时 PostgreSQL 或显式 `TEST_DATABASE_URL`，不使用生产数据库测试。
