# 漫剧商户与卡密服务

## 运行与初始化

业务数据库统一使用 PostgreSQL 18，运行时不再使用 SQLite。Node.js 24 通过锁定版本的 `pg` 驱动访问 PostgreSQL，官网仍由 Nginx 提供。Compose 增加 `merchant`、`postgres` 服务、独立内部网络和 `merchant-postgres-data` 持久卷，数据库不开放宿主机端口。

在项目目录运行：

```sh
./restart.sh
```

脚本依次快进拉取当前分支、检查私有配置、构建镜像、备份现有数据库、启动 PostgreSQL 和商户服务、重建 Nginx 并验证健康接口。镜像构建失败不会停止旧服务。更新入口支持 Docker Compose 插件及服务器独立 Compose 路径；保留 `COMPOSE_FILE` 和 `COMPOSE_PROJECT_NAME` 的配置。脚本通过目录锁阻止重复运行，不删除数据卷、不覆盖未提交源码。

生产检出和私有环境文件由 root 管理时，使用 `sudo ./restart.sh`。源码拉取使用标准可读权限，环境文件及备份仍使用私有权限；镜像也显式设置运行用户所需的文件权限。

首次启动时，脚本从 `.env.example` 创建缺少的 `.env`，并为留空的 `POSTGRES_PASSWORD`、`MERCHANT_ADMIN_PASSWORD` 生成随机密码，文件权限设为 600，控制台不输出密码。已有密码、下载目录和端口保持原值；已有 PostgreSQL 数据卷但缺少数据库密码时脚本拒绝生成替代密码，需要恢复原配置。

首次管理员默认为 `platform_admin`，可在第一次启动前通过 `MERCHANT_ADMIN_USERNAME` 修改；密码见服务器项目目录的私有 `.env`。公开注册入口 `/merchant/register.html`；商户可自行申请，代理可通过上级邀请链接或由上级创建。所有新注册的商户和下级代理均处于待审批状态，平台管理员在后台通过后才能登录。管理员手动开通商户视为已批准。已有管理员后，初始化变量不重置账号密码，应在后台修改或由账号开通方重置下级密码。

已通过其他方式快进到指定的已推送提交，或本机调试时：

```sh
./restart.sh --no-pull
```

可通过 `ENV_FILE` 指定其他环境文件，通过 `DOCKER_BIN` / `DOCKER_COMPOSE_BIN` 指定可执行文件。默认生产服务监听原有 6660 端口。HTTPS 使用 `MERCHANT_SECURE_COOKIES=true`、`MERCHANT_PUBLIC_ORIGIN=https://home.fastaiapi.cloud`；本机 HTTP 调试将 Cookie Secure 设为 false，并配置实际 origin 或留空。

不使用 Compose 的开发环境先执行 `npm ci`，然后设置 `DATABASE_URL=postgresql://用户:密码@主机:端口/数据库` 和首次管理员环境变量，再执行 `npm start`。也支持标准 `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`。商户服务默认监听 `127.0.0.1:3000`，网页由静态服务提供并把 `/api/` 代理到它。

数据库会在启动时事务化创建表与索引，签名密钥只生成一次并保存在 `settings`。连接池事务绑定同一连接；按商户串行处理管理写入和权限变化，设备激活同时使用设备身份锁与卡密行锁，跨应用实例也不能超出设备上限或把同一设备同时绑定到两张有效卡。

生产后端只在 Docker 网络内访问，`MERCHANT_TRUST_PROXY=true` 仅用于由受信任 Nginx 提供 `X-Real-IP` 的情形。公网 Origin 使用独立的规范域名配置，避免 Worker 内部回源端口影响同源校验。

## 权限与业务边界

| 角色 | 账号权限 | 卡密权限 |
| --- | --- | --- |
| 平台管理员 | 审批商户及各级代理，启停和重置账号 | 不通过商户 API 查询卡密 |
| 商户 | 创建或邀请下级代理，查看整个所属代理树，启停和重置下级账号 | 生成、查询、分配、导出、标记售出、启停和删除所属卡密 |
| 各级代理 | 可继续创建或邀请下级，仅管理自己下方的代理树 | 查看和导出自己及下级持有的卡密，标记销售状态，继续向自己的下级分配卡密 |

支持多级分销树，不限制为单层代理。每个代理的 `parent_id` 指向直接上级，`merchant_id` 指向所属商户。账号的上级关系只能在注册时确定，后续不能通过账号更新接口修改，避免跨商户挂靠或循环层级。只有平台管理员可设置审批状态；上级不能自行批准下级。

登录、会话和授权操作检查账号及全部上级的启停和审批状态；停用一个代理会同时阻止其全部下级登录。商户与上级可以查看、管理所属下级的卡密，不可访问其他商户、兄弟分支或上级的独立库存。分配目标必须位于自己的分销树内且审批通过；商户可收回卡密到自有库存，代理也可收回自己下级的卡密。生成、禁用和删除授权卡密由所属商户负责，各级代理分发获配库存。

后台「复制代理邀请链接」生成 `/merchant/register.html?parent=<当前账号ID>`。通过邀请链接提交时，服务端验证邀请人的状态并确定层级，新账号仍需管理员审批。普通注册不会因为传入 `role`、`merchant_id` 或审批字段而提升权限。

账号名称不区分大小写且全局唯一。专属登录入口带 `shop` 参数，只接受对应商户及其各级代理。所有权限在后端及事务内执行，界面隐藏按钮不替代权限检查。分销提供账号层级与卡密分发，未接入余额、佣金或支付结算。

卡密为随机 128 位代码，格式为 `MJ-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`。每批 1–500 张；有效天数 0 表示永久，否则在生成时计算固定到期时间；每张卡最多绑定 1–100 台设备。标记售出只记录销售进度，不改变授权。代码检查只读数据库，不占名额。同一设备重复激活同一卡不新增名额；该设备已有另一张有效卡时拒绝激活其他卡。

停用代理会撤销该代理及下级的登录，不会使卡密失效。停用商户会撤销本商户和代理会话，并使其所有卡密验证失败。卡密禁用、到期、删除对公开检查和 License 校验即时生效。删除为逻辑删除，正常查询和导出不可见，已发出的凭证也失效。

本功能提供卡密生成、销售记录和代理发放管理。支付、余额、佣金和自动发货尚未接入。旧 xiaoxiao 的卡密、账号和 Token 不会自动导入；已安装客户端若继续请求旧域名，将仍由旧后台验证。接入新卡密的客户端需将基础地址配置到本网站域名。

## API

无需登录的三个接口详见公开页面 [public/merchant/api.html](../public/merchant/api.html)：

```text
POST /api/cards/check   {code}               -> {ok, reason, expiresAt, ...}
POST /api/activate      {code, deviceId}     -> {code: 0, data: {access_token, ...}}
POST /api/verify        {license}            -> {ok, reason, expiresAt, code}
```

公开接口支持 CORS，三个接口按来源 IP 合计每分钟 120 次。业务拒绝为 HTTP 200，客户端必须判断业务字段；参数或 JSON 错误为 400，频率超限为 429。`expiresAt` 为毫秒时间戳，`null` 为永久；`expires_in` 为秒，永久卡为 0。

License 是服务端签名的非 JWT 凭证，绑定到卡密和设备。客户端应视为不透明字符串，每次向 `/api/verify` 查询当前有效性；卡密与 Token 都不应写入 URL 或日志。新服务没有实现旧文档中的账号兑换、`/api/v1/auth/card-login` 或固定 VIP 状态兼容接口。

后台 API 前缀为 `/api/merchant`，只允许同源后台访问；登录返回 HttpOnly + SameSite=Strict Cookie 与 CSRF Token。会话最长 12 小时，服务端只保存 Cookie Token 的 SHA-256。写请求同时需要 Cookie 和 `X-CSRF-Token`，密码使用随机盐 scrypt 散列。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/register` | `{username,display_name,password,parent_id?}` 提交待审批注册申请 |
| POST | `/login` | `{username,password,shop?}` 登录 |
| GET | `/session` | 当前用户与 CSRF Token |
| POST | `/logout` | 注销当前会话 |
| POST | `/password` | `{current_password,password}` 修改密码并注销所有会话 |
| GET | `/shops/:id` | 专属入口的公开商户名称 |
| GET / POST | `/accounts` | 分页账号列表 / 创建下级账号 |
| PATCH | `/accounts/:id` | 更新下级名称、密码或启停状态；管理员可审批 `approval_status=approved|rejected` |
| GET | `/summary` | 当前账号可见的卡密统计 |
| GET / POST | `/cards` | 分页卡密列表 / 商户批量生成 |
| PATCH / DELETE | `/cards/:id` | 按权限更新 / 删除卡密 |
| GET | `/cards/export` | 当前筛选范围的 CSV，最多 10000 条 |
| GET | `/healthz` | 数据库健康检查 |

分页参数：`page` 默认 1、`page_size` 默认 20（1–100）。卡密筛选：`q` 搜索代码或产品，`status=valid|disabled|expired`，`sale=sold|unsold`；商户及各级代理可使用 `agent=<所属下级ID>|unassigned`。审批列表支持 `approval=pending|approved|rejected`，待审批申请优先显示。导出使用相同筛选与权限规则，不受当前页码限制。CSV 文本会处理公式前缀。

## 备份与恢复

`restart.sh` 每次构建成功后、应用升级前，自动使用 `pg_dump --format=custom` 在线备份当前 PostgreSQL，并保存环境配置副本到 `backups/<UTC时间>-<提交>-<随机后缀>/`。首次初始化也会备份启动应用前的数据库；数据库原先停止时先启动数据库，再备份，最后启动应用。备份失败会停止后续应用更新。完整数据包含密码散列、卡密、设备绑定和签名密钥，需要与 `.env` 一起保护。

手动备份：

```sh
mkdir -p backups
umask 077
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > backups/merchant.dump
```

恢复时先停止网站和商户服务，保持 PostgreSQL 运行，确认目标备份，再执行以下覆盖恢复操作：

```sh
docker compose stop website merchant
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < backups/merchant.dump
./restart.sh --no-pull
```

恢复同一份完整数据库会保留授权签名密钥和凭证。更换空数据卷会丢失原卡密与签名密钥。常规重建、重启及 `docker compose down` 保留命名卷；不要在生产使用 `down -v`。备份、私有环境文件和数据卷不进入 Git，也不能放入网站公开目录或下载目录。

## 验证

```sh
npm run check
npm test
bash -n restart.sh
docker compose config --quiet  # 首次通过 restart.sh 生成数据库配置后执行
```

测试覆盖多商户/代理的列表、导出和写入隔离，账号分页与登录入口范围，公开检查无副作用，设备限制并发，禁用/到期/删除/商户停用后的凭证失效，CSRF/来源校验，密码重置、注销、CORS、限流和重启持久化。`npm test` 默认自动启动临时 PostgreSQL 18 容器并在完成后删除；也可显式提供 `TEST_DATABASE_URL`，每个测试只创建和删除自己随机命名的 schema。测试不使用生产数据库地址，不读取现有 `.env` 或真实卡密。额外覆盖跨应用实例的设备互斥、事务回滚、并发同名注册、首次配置幂等性、注册审批、多级卡密分发和跨分支越权拦截。
