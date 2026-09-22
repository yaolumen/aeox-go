# AEOX Store Lite

极简电子书商城与交付系统 —— Express + Preact + JSON 文件存储，零数据库依赖，零构建步骤，适合部署在 Hostinger 等共享主机。

## 核心闭环

```
用户访问商品详情 → 点击购买
  ├─ 免费商品 → 直接跳转下载页（自动授权）
  └─ 付费商品 → 跳转 Ko-fi 支付页（当前唯一支付方式）
                  → 支付成功后获取下载链接
                  → （Stripe Payment Links 代码保留，后期可启用）
```

## 快速开始

### 环境要求
- Node.js 22.x
- 无需数据库（JSON 文件持久化）

### 本地运行

```bash
cd aeox-store-lite
npm install
node server.js
```

启动后控制台会输出：
- 前台地址：`http://localhost:3000`
- 后台入口：`http://localhost:3000/admin.html?k=<自动生成的密钥>`
- 默认管理员密码：`admin123456`（首次启动自动初始化，登录后可在站点设置中修改）
- 若设置了 `ADMIN_PASSWORD` 环境变量，则使用环境变量值作为初始密码

### 环境变量

只需设置 `ADMIN_PASSWORD`，其余未配置时系统自动生成并持久化到 `data/` 目录，重启后仍有效。

| 变量名 | 必填 | 说明 | 默认值 |
|--------|------|------|--------|
| `ADMIN_PASSWORD` | **推荐** | 管理员密码（启动时 bcrypt 哈希） | `admin123456`（内置默认值） |
| `PORT` | 否 | 监听端口 | `3000` |
| `BASE_URL` | 否 | 站点完整 URL（Stripe 回跳拼接用） | `https://go.aeox.uk` |
| `ADMIN_ENTRY_KEY` | 否 | 后台入口 URL 密钥 | 随机生成并持久化 |
| `JWT_SECRET` | 否 | JWT 签名密钥 | 随机生成并持久化 |
| `DOWNLOAD_TOKEN_SECRET` | 否 | 下载令牌 HMAC 密钥 | 随机生成并持久化 |
| `DOWNLOAD_TOKEN_TTL` | 否 | 下载令牌有效期（秒） | `86400`（24 小时） |
| `CORS_ORIGINS` | 否 | V1 API 允许的域名 | `*`（允许所有） |
| `STRIPE_SECRET_KEY` | 否 | Stripe 受限密钥（后期付费书籍时配置） | 无 |

> **注意**：项目未使用 dotenv，`.env` 文件不会自动加载。请在主机面板（如 Hostinger）的环境变量配置中设置，或通过启动命令注入。

## 项目结构

```
aeox-store-lite/
├── server.js                  # 后端入口（Express + 静态文件 + 路由挂载 + 安全头 + 错误处理）
├── lib/                       # 核心库
│   ├── store.js               # JSON 持久化（原子写入 write→rename / loadJson / saveJson / withLock / markDirty / flushDirty）
│   ├── auth.js                # 认证中间件（JWT / bcrypt / apiKeyAuth / apiKeyAdminAuth / adminEntryMiddleware / reloadPasswordFromDisk）
│   ├── token.js               # 下载令牌（signDownloadToken / verifyDownloadToken，HMAC-SHA256 + timingSafeEqual）
│   ├── orders.js              # 订单管理（createOrder / getOrders / updateOrderStatus / leadType / 订单统计）
│   ├── ai.js                  # AI 多供应商引擎（路由 / 降级 / 配额 / Cooldown / normalizeBaseUrl）
│   ├── stats.js               # 统计聚合（recordStat → saveJson，pv / checkout / download 事件 + 按天 + 按商品）
│   ├── utils.js               # 工具函数（debugLog / generateId / generateSlug / generateApiKey / maskSecretKey / rot13 / rateLimit）
│   ├── schemas.js             # Zod 输入验证 schema（30+ 定义 + validate 中间件）
│   ├── types.js               # JSDoc 共享类型定义
│   └── migrations.js          # 数据迁移函数（从 store.js 提取）
├── routes/                    # 路由模块
│   ├── admin.js               # 后台管理 API（/api/login, /api/auth/*, /api/dashboard, /api/orders, /api/config/*, /api/logos/*, /api/track/*, /api/cache/invalidate）
│   ├── products.js            # 商品 API（/api/products CRUD + /api/i18n + /api/products/import-preview + /api/products/export + /api/products/batch-tags）
│   ├── categories.js          # 分类 API（/api/config/categories CRUD）
│   ├── tags.js                # 标签 API（/api/config/tags CRUD，删除级联清理）
│   ├── keys.js                # API Key 管理（/api/config/keys CRUD，撤销=禁用，列表掩码）
│   ├── checkout.js            # 结账 + 下载验证（/api/checkout, /api/verify-download, /api/recover-download）+ 限流 + 自动创建订单
│   ├── short-links.js         # 短链接（/api/short-links CRUD + /s/:slug 302重定向）
│   ├── samples.js             # 样章 + 邮箱收集（/api/samples, /api/emails）
│   ├── ai.js                  # AI 聊天/生成/测试（/api/ai/*）
│   ├── seo.js                 # SEO 处理器（sitemap / robots / llms，共享模块）
│   └── v1/                    # 开放 API v1（/api/v1/*，三级权限：read < write < admin）
│       ├── index.js           # 路由聚合 + health 端点 + accessLogMiddleware
│       ├── products.js        # 商品 CRUD（read/write/admin）
│       ├── categories.js      # 分类 CRUD（DELETE 需 admin）
│       ├── tags.js            # 标签 CRUD（DELETE 需 admin，级联清理商品引用）
│       ├── config.js          # 站点配置（GET=read，PUT=admin，sanitize+merge 逻辑）
│       ├── keys.js            # API Key 管理（全部 admin，软删除=禁用）
│       ├── providers.js       # AI 供应商管理（全部 admin，最多 3 个）
│       ├── stats.js           # 看板统计（/api/v1/stats/dashboard?range=all|today|week|month）
│       └── imports.js         # 批量导入 + 预览（/api/v1/imports/preview + /api/v1/imports/）
├── index.html                 # 前台首页（Preact 入口，加载 app.js）
├── download.html              # 下载交付页（Preact 入口，加载 download.js）
├── admin.html                 # 后台管理面板（Preact 入口，隐藏入口，加载 admin.js）
├── .env.example               # 环境变量示例（无真实密钥）
├── assets/
│   ├── app.js                 # 前台逻辑（Preact 组件：Nav / Hero / Shelf / ProductList / DetailSheet / ChatWidget / Footer + Shelf 拖拽滚动）
│   ├── download.js            # 下载页逻辑（多语言版本同时展示 + 语言标签 + Upsell + 备链）
│   ├── read.js                # 样章阅读页（多语言切换 + i18n 返回按钮）
│   ├── admin.js               # 后台逻辑入口（Preact 组件挂载）
│   ├── admin-lib.js           # 后台共享工具（html / hooks / api / ShortLinksTab / CollapsibleSection）
│   ├── admin-dashboard.js     # 数据看板组件
│   ├── admin-products.js      # 商品管理组件（导入 admin-import-export + admin-product-form）
│   ├── admin-settings.js      # 系统设置组件（导入 admin-orders + admin-logos + admin-api-docs）
│   ├── admin-orders.js        # 订单管理组件（从 admin-settings.js 拆分）
│   ├── admin-logos.js         # Logo 管理组件（从 admin-settings.js 拆分）
│   ├── admin-api-docs.js      # API 文档组件（从 admin-settings.js 拆分）
│   ├── admin-import-export.js # 导入导出对话框（从 admin-products.js 拆分）
│   ├── admin-product-form.js  # 商品编辑表单 + i18n 辅助（从 admin-products.js 拆分）
│   ├── admin-samples.js       # 样章管理组件
│   ├── admin-emails.js        # 邮箱收集组件
│   ├── admin-ai.js            # AI 管理组件
│   ├── style.css              # 全局样式（白色极简主题，CSS 变量驱动）
│   └── lib/
│       ├── api.js             # 公共 API 工具（api() / authFetch() / getToken()）
│       └── (preact/hooks/htm) # 本地 ESM 模块（CDN 独立）
├── data/                      # JSON 持久化目录（自动创建，gitignored）
│   ├── products.json          # 商品数据
│   ├── categories.json        # 商品分类
│   ├── tags.json              # 全局标签
│   ├── site-config.json       # 站点设置 + SEO + Stripe 配置
│   ├── ai-providers.json      # AI 供应商配置
│   ├── api-keys.json          # 开放 API 密钥
│   ├── orders.json            # 付费订单记录
│   ├── short-links.json       # 短链接
│   ├── i18n.json              # 前台多语言翻译
│   ├── admin-password.json    # 管理员密码 bcrypt 哈希
│   ├── jwt-secret.json        # JWT 密钥（自动持久化）
│   ├── admin-entry.json       # 后台入口密钥（自动持久化）
│   ├── download-token-secret.json  # 下载令牌密钥（自动持久化）
│   └── stats.json             # 真实统计数据（PV / checkout / download）
├── uploads/logos/             # 上传的 Logo 图片（gitignored）
├── tests/                     # 集成测试套件（450 用例）
└── package.json
```

## 核心功能

### 前台
- **商品列表**：免费/付费分区展示，付费商品支持分页（每页 12 本）
- **店主推荐**：首页醒目展示推荐商品，含封面、价格、简介和购买/查看按钮
- **商品详情弹窗**：响应式弹窗设计（移动端底部弹层 / 桌面端居中弹窗），含封面、作者、分类徽章、格式标签、节选试读、价格和购买按钮
- **详情弹窗交互**：支持 ESC 键关闭、点击遮罩关闭
- **下载交付**：HMAC 令牌校验 + 多下载源（Google Drive 主源 + R2 镜像）+ Upsell 关联推荐 + 多语言版本同时展示（EN/ES/ZH/DE 等带语言标签）
- **AI 选书助手**：浮窗式聊天，根据需求推荐商品

### 后台管理（隐藏入口 `admin.html?k=<密钥>`，中文界面）
- **数据看板**：PV/销量/收入/退款/净收入指标 + 热门商品 + 漏斗（支持全部/今日/本周/本月筛选，需 JWT 认证）
- **商品管理**：CRUD 软删除、分类筛选、标签筛选、推荐筛选、复制 shortId
- **站点设置**：
  - **管理员账号**：后台入口 URL 显示、重置入口密钥、修改密码
  - **基础信息**：站点名称、描述、关键词、Logo、页脚版权
  - **会话设置**：登录超时时间（默认 240 分钟，适合手机长时间挂机）
  - **Stripe 配置**：密钥输入后根据前缀自动识别模式（rk_live_ = 正式 / rk_test_ = 测试）
  - **SEO 配置**：爬虫排除路径、AI 爬虫拦截
- **AI 管理**：最多 3 个供应商配置，按顺序决定优先级
- **关于**：标签管理、分类管理、API Key 管理、访问日志、AI 调用日志
- **Leads 管理**：订单列表按 leadType 筛选（opted_in/skipped/paid），Dashboard 统计新增 leadsOptedIn/leadsSkipped
- **安全**：JWT 认证、bcrypt 密码哈希（cost=10）、登录限流（5 次/分钟/IP）、密码热重载 API、checkout 限流（10 次/分钟/IP）、邮箱恢复双重限流（IP 5 次/分钟 + 邮箱 3 次/5 分钟）

## 性能与可靠性

- **compression 中间件**：自动 gzip/deflate 压缩响应，减少传输体积
- **原子写入**：`saveJson` 使用唯一临时文件名（`.tmp.{pid}.{ts}.{rnd}`）写入后 `rename`，防止并发冲突和崩溃导致 JSON 文件损坏
- **延迟写入**：高频数据变更先写内存缓存，每 30 秒批量刷盘（`markDirty` + `flushDirty`），减少磁盘 I/O
- **写入重试**：`saveJson` 失败自动重试 3 次，间隔 500ms，失败后回滚缓存
- **写入锁**：`withLock`（队列式 AsyncMutex）防止同一文件的并发写冲突
- **请求体限制**：`express.json({ limit: '1mb' })` 防止大 body DoS 攻击
- **安全响应头**：X-Content-Type-Options: nosniff / X-Frame-Options: DENY / X-XSS-Protection / Referrer-Policy
- **集中错误处理**：Express error middleware 统一返回 500 JSON（entity.too.large 返回 413），防止泄漏堆栈
- **Zod 输入验证**：所有 API 端点 schema 校验，拒绝非法/缺失参数（400）
- **日志轮转**：API 访问日志和 AI 调用日志超 5MB 自动轮转（追加日期后缀）
- **速率限制**：登录 5 次/分钟/IP、checkout 10 次/分钟/IP、邮箱恢复 IP 5 次/分钟 + 邮箱 3 次/5 分钟，限流 Map 每 10 分钟清理过期条目
- **优雅退出**：SIGTERM/SIGINT 信号触发 `flushDirty` 刷盘后退出，防止数据丢失
- **未捕获异常**：`uncaughtException` / `unhandledRejection` 写入调试日志，避免进程静默崩溃
- **调试日志**：所有请求方法/路径/状态码/耗时 + 未捕获异常 → `data/server-debug.log`

## 商业闭环关键流程

### 1. 添加商品到上架

```
1. 登录后台 → 商品 Tab → 添加商品
2. 填写：标题 / 封面 / 价格 / 描述 / 下载链接（downloads 数组，支持多个源 + 标签）
3. 保存（付费商品可暂不填 Stripe Payment Link，先保存后补填）
4. 可选：填写 Upsell 推荐配置（关联商品ID/标题/描述/折扣）
4. 商品列表 → 复制该商品的 shortId
5. 去 Stripe 创建 Payment Link，成功跳转 URL 填：
   https://<域名>/api/stripe-return?sid=<shortId>
6. 回到后台 → 编辑该商品 → 补填 Payment Link URL → 保存
7. 商品上架完成
```

### 2. Stripe Payment Link 配置

**Stripe 后台操作**：
1. Stripe Dashboard → Payment Links → Create new
2. 填写商品名称、价格（与 AEOX 后台一致）
3. **关键**：「After payment」选择「Redirect to website」，URL 填：
   ```
   https://<你的域名>/api/stripe-return?sid=<商品shortId>
   ```
   > 注意：回调路径是 `/api/stripe-return`（非 `/api/checkout/stripe-return`）
4. 创建后复制 Payment Link URL（`https://buy.stripe.com/xxx`）
5. 粘贴到 AEOX 后台商品编辑的「Stripe Payment Link」字段

**可选增强验证**：
- 在「站点设置 → Stripe 配置」填入受限密钥（`rk_live_xxx` 或 `rk_test_xxx`）
- 配置后，Stripe 回跳带 `session_id` 时会调 Stripe API 验证付款状态 + 金额匹配
- 未配置密钥时：信任 Payment Link 跳转（success_url 仅支付成功后触发）

**密钥自动模式检测**：
- 输入 `rk_live_` 开头的密钥 → 自动识别为正式环境
- 输入 `rk_test_` 开头的密钥 → 自动识别为测试环境
- 无需手动选择模式，密钥前缀决定运行环境

**测试环境**：
- Stripe 切换到 Test mode → 创建测试 Payment Link
- 后台 Stripe 配置填测试密钥（`rk_test_xxx`），自动识别为测试模式
- 测试卡：`4242 4242 4242 4242` / 有效期任意未来日期 / CVC 任意3位

### 3. 下载令牌机制

- 支付成功后，后端生成 HMAC 签名令牌（`signDownloadToken`）
- 令牌格式：`base64url(payload).base64url(signature)`
- payload 包含 `{ pid: productId, exp: 过期时间戳 }`
- 签名使用 `crypto.timingSafeEqual` 时间安全比较，防时序攻击
- 302 重定向到 `download.html?id=<shortId>&token=<token>`
- 令牌有效期默认 24 小时（`DOWNLOAD_TOKEN_TTL` 可配）
- 下载页调 `POST /api/verify-download` 校验令牌，返回 `downloads` 数组（当前语言下载链接）+ `product.downloads` 对象（所有语言）+ `upsell` 推荐对象
- 金额防篡改：后端校验 `actualAmount >= expectedAmount`，低价买高价书会被拒
- 免费产品邮箱收集：checkout 弹窗收集邮箱，leadType=opted_in/skipped 记录至订单

### 4. 订单系统

- 付费商品支付成功后（stripe-return 回调），自动创建订单记录
- 订单字段：id, productId, productTitle, shortId, stripeSessionId, stripePaymentIntent, amount, currency, customerEmail, status(paid/refunded), refundStatus(none/refunded), stripeRefundId, refundNote, downloadToken, leadType(paid/opted_in/skipped), createdAt, refundedAt
- 订单创建失败不阻塞用户重定向（错误日志记录，用户仍可下载）
- 后台「商品 Tab → 订单筛选」查看所有订单，按退款状态或 leadType 筛选，手动更新退款状态
- 无 Webhook：仅在用户浏览器回跳时创建订单；如用户关闭浏览器则无订单记录（管理员可通过 Stripe Dashboard 补查）
- **退款状态仅两种**：`none`（正常）和 `refunded`（已退款），`pending_review` 和 `rejected` 已移除
- **stripeRefundId**：记录 Stripe 退款 ID（格式 `re_xxx`），用于 HMRC 税务审计核对
- **撤销退款**：已退款订单可撤销恢复为正常，同时清除 stripeRefundId 和 refundedAt
- **系统不连接 Stripe Refunds API**：所有退款需在 Stripe Dashboard 手动执行后在本系统标记
- **订单汇总**：`GET /api/orders/stats` 返回 totalSales/totalRevenue/totalRefunds/totalRefunded/netRevenue

### 5. 退款政策

- 后台「系统设置 → 退款政策」配置：启用开关、政策文案、客服邮箱
- 前台首页 HowItWorks 区域显示退款政策摘要 + 联系邮箱
- 下载页显示完整退款政策 + 邮箱链接
- **邮箱防爬虫**：服务端 API 返回 ROT13 编码邮箱（`_emailEnc` 字段），前端 JS 运行时解码渲染，页面源码不含明文邮箱
- 退款流程：管理员在 Stripe Dashboard 手动退款 → 获取 Refund ID（re_xxx）→ 在 AEOX 后台标记退款 + 填入 stripeRefundId
- 受限密钥（`rk_test_`/`rk_live_`）无 Refunds Write 权限，无法通过 API 自动退款
- **退款记录用途**：UK HMRC 税务合规与 Stripe 审核，确保 总销售 - 总退款 = 净收入 可核对

### 6. 统计追踪

- 前端通过 `POST /api/track/pv|checkout|download` 上报事件
- 后端按天/按商品聚合计数，事件保留最近 10000 条
- 自动清理 90 天前的日期数据和已归档商品的产品数据
- 看板 `GET /api/dashboard` 支持 `?range=all|today|week|month` 筛选

## API 概览

### 公开接口（无需认证）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/products` | 商品列表（默认过滤已归档） |
| GET | `/api/config/site` | 站点配置（敏感字段掩码） |
| GET | `/api/config/categories` | 商品分类列表 |
| GET | `/api/config/tags` | 标签列表 |
| GET | `/robots.txt` `/sitemap.xml` `/llms.txt` | SEO 文件（动态生成） |
| POST | `/api/checkout/:shortId` | 获取支付链接（免费直下 / 付费跳 Stripe） |
| GET | `/api/stripe-return` | Stripe 支付回跳中转 |
| POST | `/api/verify-download` | 下载令牌校验（body: { shortId, token?, lang? }） |
| GET | `/api/dashboard?range=all\|today\|week\|month` | 看板数据（需 JWT） |
| POST | `/api/cache/invalidate` | 缓存失效（需 JWT，body: `{files: [...]}`） |
| POST | `/api/ai/chat` | AI 选书助手（前台聊天） |
| POST | `/api/ai/generate` | AI 内容生成 |
| POST | `/api/ai/test` | AI 连接测试（支持 Provider ID 或直传密钥） |
| POST | `/api/track/pv` | PV 统计上报 |
| POST | `/api/track/checkout` | Checkout 统计上报 |
| POST | `/api/track/download` | Download 统计上报 |

### 管理接口（需 JWT，`adminSession` 中间件）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 管理员登录（5次/分钟/IP限流） |
| POST | `/api/checkout/:shortId` | 免费产品结账（10次/分钟/IP限流） |
| POST | `/api/recover-download` | 邮箱恢复下载（IP 5次/分钟 + 邮箱 3次/5分钟双重限流） |
| GET | `/api/auth/status` | 会话状态（含剩余秒数） |
| POST | `/api/auth/change-password` | 修改密码（需验证当前密码） |
| POST | `/api/auth/reset-entry-key` | 重置后台入口密钥 |
| GET | `/api/auth/admin-info` | 管理员信息（入口URL、密码来源） |
| POST | `/api/auth/reload-password` | 密码热重载（外部修改密码文件后刷新缓存） |
| POST/PUT/DELETE | `/api/products` `/api/products/:id` | 商品 CRUD（删除为软删除） |
| POST | `/api/products/batch-tags` | 批量打标/移除标签 |
| POST/PUT/DELETE | `/api/config/categories` `/api/config/categories/:id` | 商品分类 CRUD |
| PUT/DELETE | `/api/config/tags` `/api/config/tags/:id` | 标签 CRUD（删除级联清理商品引用） |
| PUT | `/api/config/site` | 站点设置（Stripe 密钥智能保留/更新） |
| GET/POST/PUT/DELETE | `/api/config/keys` `/api/config/keys/:id` | API Key 管理 |
| GET | `/api/config/logs` | API 访问日志 |
| GET | `/api/config/ai-logs` | AI 调用日志 |
| GET/POST/PUT/DELETE | `/api/config/providers` `/api/config/providers/:id` | AI 供应商 CRUD |
| GET | `/api/config/provider-presets` | AI 预设供应商模板 |
| PUT | `/api/config/ai-routing` | AI 路由配置 |
| GET | `/api/orders` | 订单列表（?refundStatus=none\|refunded&limit=50） |
| GET | `/api/orders/stats` | 订单汇总（totalSales/totalRefunds/totalRefunded/netRevenue） |
| PUT | `/api/orders/:id/status` | 更新订单退款状态（body: `{refundStatus, refundNote, stripeRefundId}`） |

### 开放 API v1（需 `x-api-key` Header，三级权限：read < write < admin）

**权限模型**：
- `read`：只读访问（商品/分类/标签/配置/统计）
- `write`：读写访问（含创建/编辑商品、分类、标签）
- `admin`：全权限（含删除、Key/Provider 管理、站点配置修改）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/v1/health` | 免鉴权 | 健康检查（version=2.4.2） |
| **商品** | | | |
| GET | `/api/v1/products` | read | 商品列表 |
| GET | `/api/v1/products/:id` | read | 商品详情（支持 id 或 shortId） |
| POST | `/api/v1/products` | write | 创建商品（全字段：title/desc/cover/price/downloads/locales/whatYouLearn/whatYouGet/whoIsFor/bookLang/format/fileSize/kofiLink/tags/categoryId/featured/upsell） |
| PUT | `/api/v1/products/:id` | write | 编辑商品（支持 id 或 shortId，locales/downloads 正确合并） |
| DELETE | `/api/v1/products/:id` | write | 删除商品（软删除） |
| **试读** | | | |
| GET | `/api/v1/samples` | read | 试读列表（?enabled=true/false 筛选） |
| GET | `/api/v1/samples/:shortId` | read | 试读详情 |
| POST | `/api/v1/samples` | write | 创建试读（content 支持 {en,es,zh} 多语言，shortId 可关联商品） |
| PUT | `/api/v1/samples/:shortId` | write | 编辑试读（content/title/cover/buyLink/enabled/relatedProducts） |
| DELETE | `/api/v1/samples/:shortId` | admin | 删除试读 |
| **分类** | | | |
| GET | `/api/v1/categories` | read | 分类列表 |
| POST | `/api/v1/categories` | write | 创建分类（slug 可自动生成） |
| PUT | `/api/v1/categories/:id` | write | 编辑分类 |
| DELETE | `/api/v1/categories/:id` | admin | 删除分类（有商品引用时返回 409） |
| **标签** | | | |
| GET | `/api/v1/tags` | read | 标签列表 |
| POST | `/api/v1/tags` | write | 创建标签（颜色自动分配） |
| PUT | `/api/v1/tags/:id` | write | 编辑标签 |
| DELETE | `/api/v1/tags/:id` | admin | 删除标签（级联清理商品引用） |
| **站点配置** | | | |
| GET | `/api/v1/config/site` | read | 站点配置（敏感字段掩码） |
| PUT | `/api/v1/config/site` | admin | 更新站点配置（Stripe 密钥智能保留/掩码更新） |
| **API Key 管理** | | | |
| GET | `/api/v1/keys` | admin | Key 列表（仅显示前缀+后4位） |
| POST | `/api/v1/keys` | admin | 创建 Key（默认 scopes: read+write） |
| PUT | `/api/v1/keys/:id` | admin | 编辑 Key（名称/scopes/enabled） |
| DELETE | `/api/v1/keys/:id` | admin | 撤销 Key（软删除=禁用，保留记录） |
| **AI 供应商** | | | |
| GET | `/api/v1/providers` | admin | 供应商列表（apiKey 掩码） |
| POST | `/api/v1/providers` | admin | 创建供应商（最多 3 个） |
| PUT | `/api/v1/providers/:id` | admin | 编辑供应商 |
| DELETE | `/api/v1/providers/:id` | admin | 删除供应商 |
| **统计看板** | | | |
| GET | `/api/v1/stats/dashboard` | read | 看板数据（?range=all\|today\|week\|month） |

## 分类与标签体系

| 概念 | 存储文件 | 关系 | 管理入口 |
|------|---------|------|---------|
| **商品分类** | `categories.json` | 商品 1 对 1 | 后台站点设置 |
| **标签** | `tags.json` | 商品多对多 | 后台站点设置 |

- **分类** = 纵向组织（"我属于什么类目"），单选
- **标签** = 横向标记（"我涉及什么主题"），多选
- 删除分类时校验引用：有商品使用则返回 409 阻止删除
- 删除标签时级联清理：自动从所有商品的 `tags` 数组中移除该标签 ID

## AI 多供应商引擎

### 架构
- 多 Provider 注册，每个独立配置（baseUrl / model / apiKey / priority / dailyQuota）
- 用途路由：`frontend_chat`（前台聊天）、`content_generate`（内容生成）可绑定不同 Provider 子集
- 三种策略：`priority`（按优先级排序）、`round-robin`（轮询）、`random`（随机）
- 自动降级：Provider 失败后尝试下一个，全局超时 60 秒，单次请求超时 30 秒
- 重试：单个 Provider 最多重试 `maxRetries` 次（默认 2），间隔递增（1s, 2s...）
- 配额：每个 Provider 可设 `dailyQuota`，每日零点重置
- Cooldown：Provider 出错记录 `lastErrorAt` / `lastErrorMsg`，后续调用自动跳过 `cooldownUntil` 未过期的 Provider

### 预设供应商
DeepSeek、通义千问 Qwen、NVIDIA NIM、UnoRouter、Agnes AI、自定义

## 部署到 Hostinger

1. 上传项目文件到主机（`public_html/` 或子目录）
2. 在 Hostinger 面板创建 Node.js 应用，入口指向 `server.js`
3. 设置环境变量（只需 `ADMIN_PASSWORD`，其余自动生成）：
    - `ADMIN_PASSWORD`：强密码（推荐 ≥16 字符）
4. 确保 `data/` 目录可写
5. 首次访问后台后立即修改密码

### 部署后检查清单

- [ ] 访问 `https://<域名>` 确认前台正常
- [ ] 查看启动日志获取后台入口 URL（默认密码：`admin123456`）
- [ ] 访问 `https://<域名>/admin.html?k=<密钥>` 登录
- [ ] 站点设置 → 管理员账号 → 修改密码
- [ ] 站点设置 → 管理员账号 → 复制入口 URL 备存
- [ ] 站点设置 → Stripe 配置 → 填入密钥（后期付费书籍时配置，暂可跳过）
- [ ] 添加测试商品 → 测试完整下载流程（付费商品需配置 Stripe Payment Link，暂可跳过）
- [ ] 确认下载页正常显示下载链接

## 数据安全

- 管理员密码使用 bcrypt（cost=10）哈希存储；内置默认密码 `admin123456`（source: default），环境变量密码仅在 `source: default` 时覆盖（用户改过后不再被 env 覆盖）
- JWT 认证，统一会话超时（默认 240 分钟，可配置）
- 后台入口隐藏，需 `?k=<密钥>` 参数，无密钥返回 404 伪装页
- 登录限流：5 次/分钟/IP
- Checkout 限流：10 次/分钟/IP
- 邮箱恢复限流：IP 5 次/分钟 + 邮箱 3 次/5 分钟（双重限流防绕过）
- 缓存失效 API：`POST /api/cache/invalidate`，解决跨进程内存缓存不一致
- API Key 读写权限分离，撤销=禁用（保留记录）
- 下载令牌 HMAC-SHA256 签名，`timingSafeEqual` 防时序攻击
- 金额校验：后端验证实际支付金额 ≥ 商品价格
- 敏感字段在 API 响应中过滤（adminEntryKey 清空、Stripe 密钥掩码、API Key 仅显示前缀+后4位）

## 关键文件备份

以下文件**不可丢失**，丢失会导致数据丢失或令牌失效：

- `data/products.json` — 商品数据
- `data/admin-password.json` — 密码哈希（丢失需重置密码）
- `data/jwt-secret.json` — JWT 密钥（丢失所有会话失效，需重新登录）
- `data/download-token-secret.json` — 下载令牌密钥（**丢失则所有已付款用户的令牌失效**，需重新购买）
- `data/site-config.json` — 站点配置（含 Stripe 密钥、白名单等）
- `data/admin-entry.json` — 后台入口密钥（丢失需重置入口 URL）

## 技术栈

- **后端**：Express 4.21 + compression + JSON 文件存储 + JWT + bcryptjs
- **前端**：Preact 10 + htm 3（本地 ESM 模块，零构建步骤）+ 手写 CSS（白色极简主题）
- **AI**：多供应商路由引擎（DeepSeek / 通义千问 / NVIDIA NIM / UnoRouter / Agnes / 自定义）
- **支付**：Stripe Payment Links + 服务端验证
- **SEO**：动态 robots.txt / sitemap.xml / llms.txt

## 开发约定

- 所有中间件使用 async/await
- 数据操作使用 `withLock` 防止并发写入冲突
- 高频写入使用 `markDirty` + `flushDirty` 延迟刷盘（30 秒间隔），减少磁盘 I/O
- `saveJson` 使用原子写入模式：先写唯一临时文件（`.tmp.{pid}.{ts}.{rnd}`）再 `rename`，防止并发冲突和崩溃导致数据损坏
- 所有 API 端点使用 Zod schema 验证输入，`validate(Schema)` 中间件统一拦截非法请求
- 商品删除为软删除（`status: 'archived'`），前端默认过滤已归档商品
- 标签删除时级联清理商品中的引用
- 分类删除时校验引用，有引用则阻止
- 中文 slug 自动 fallback 到时间戳
- 敏感凭据不写入日志，错误堆栈不暴露密钥
- AI Provider baseUrl 自动规范化（去末尾斜杠和 `/chat/completions` 后缀）
- 前端零构建：Preact + htm 通过本地 ESM 模块加载，JS 文件直接 `<script type="module">` 引入
- 详情弹窗支持 ESC 关闭、遮罩点击关闭
- 商品列表分页：付费商品每页 12 本
- Stripe 密钥模式自动检测：根据 `rk_live_` / `rk_test_` 前缀自动设置 mode
- 删除操作后刷新列表加时间戳参数（`?_t=${Date.now()}`）防止缓存
- SIGTERM/SIGINT 信号触发 `flushDirty` 确保数据刷盘后退出
- `// @ts-check` 添加到所有 JS/ETS 文件，JSDoc 类型标注覆盖全部 lib/ 核心模块

## 多语言架构

项目三层 i18n 体系：

| 层级 | 数据结构 | 切换位置 | 自动检测 |
|------|----------|----------|----------|
| **商品下载** | `product.downloads = { en: [{url,label}], es: [{url,label}] }` | 下载页语言按钮 | API 调用时传 `lang` 参数 |
| **商品标题/描述** | `product.title = { en: "...", es: "..." }` | 前台 `t()` 函数 | 浏览器语言 → localStorage |
| **试读内容** | `sample.content = { en: "Markdown", es: "Markdown" }` | 阅读页语言按钮 | `navigator.language` |
| **界面翻译** | `i18n.json` → `/api/i18n?lang=xx` | 全站语言切换 | localStorage `aeox_lang` |

**下载页多语言展示**：
1. `POST /api/verify-download` 传 `lang` 参数，返回当前语言的 `downloads` 数组 + 完整 `product.downloads` 对象
2. 前端 `Authorized` 组件从 `product.downloads` 提取所有语言版本，同时展示，每个语言区块带标签（如 "EN Edition"）
3. 1 本书 = 1 商品，购买后获得所有语言版本下载链接

**试读多语言切换**：
1. 管理后台 `admin-samples.js` 编辑器支持多语言 tab（en/zh/es/de/ja/ko/fr）
2. 前台 `read.js` 初始语言读 `localStorage.aeox_lang`，导航栏显示语言切换按钮
3. 提交邮箱时记录 `lang` 偏好
4. "返回商城" 等固定文案已多语言化

## 集成测试报告（v2.2.1）

### 测试环境
- Node.js 22.x, Windows, Express on port 3000
- 9 个系统测试套件，238 个测试用例，全部通过
- 1 个用户闭环测试套件，99 个测试用例，全部通过
- 1 个功能验证测试，113 个测试用例，全部通过
- 1 个多用户混沌测试，7 个测试区域，全部通过
- **总计：500+ PASS**

### 功能验证测试（113/113 PASS，v2.2.1 新增）

| 批次 | 覆盖范围 | 通过 |
|------|----------|------|
| 认证+站点设置 | 登录/错误密码/会话状态/修改密码/入口密钥重置/未认证拒绝/站点名称修改→前台验证/Logo设置→前台验证 | 16/16 |
| 商品+分类+标签CRUD | 分类创建/更新/列表、标签创建/更新/列表、商品创建(免费/付费)/属性验证/更新/前台联动/软删除/二次删除404/标签级联清理/分类引用阻止删除 | 23/23 |
| Checkout+令牌+统计 | 免费checkout(带/不带邮箱)/下载令牌验证/付费商品无token→拒绝/伪造token→拒绝/错配token→拒绝/已归档404/订单创建/leadType/统计追踪PV/Checkout/Download→Dashboard计数/top5/trend/range参数 | 26/26 |
| 订单+邮箱恢复 | 无匹配邮箱/缺少邮箱/有匹配恢复/大小写不敏感/订单列表/leadType筛选/退款标记/撤销退款/退款筛选/已下架商品恢复→message提示 | 16/16 |
| API Key+V1+短链接+SEO | Key创建(读写/只读)/列表掩码/只读Key写入拒绝/撤销Key拒绝/V1 health/CRUD/无Key拒绝/短链接CRUD/302重定向/重复slug/无效url/robots.txt/sitemap.xml/llms.txt/缓存失效/导入预览/商品导出/密码热重载 | 32/32 |

### 全系统自动化测试（238/238 PASS）

| 测试套 | 覆盖范围 | 通过 |
|--------|----------|------|
| 认证与会话 | 登录/错误密码/Token验证/会话状态/修改密码/入口密钥重置/速率限制/Admin入口保护 | 19/19 |
| 商品CRUD | 创建免费/付费/缺省商品/列表过滤/属性验证/更新/批量打标/软删除/未认证拒绝 | 30/30 |
| 分类与标签 | 分类CRUD/slug重复检测/引用阻止删除/标签CRUD/标签删除级联清理 | 33/33 |
| 购买流程与下载令牌 | 免费checkout/付费Stripe/无Stripe拒绝/令牌验证(免费/无token/伪造/篡改/有效)/Stripe回跳/SEO文件 | 27/27 |
| 站点设置 | 站点配置读取/更新/Stripe密钥保留/未认证拒绝/统计追踪/Dashboard | 28/28 |
| API Key管理 | 创建读写/只读Key/属性验证/keyPreview掩码/列表掩码/更新/撤销/已撤销拒绝/访问日志/AI日志 | 23/23 |
| AI供应商管理 | 配置读取/创建Provider(含预处理)/baseUrl规范化/最多3个限制/更新/删除/AI接口502降级/测试接口 | 23/23 |
| Open API v1 | 健康检查/无Key拒绝/无效Key拒绝/只读Key读/只读写入拒绝/CRUD/按id+shortId查询/过滤/访问日志 | 35/35 |
| 并发与边界 | 并发分类创建/并发商品创建/并发同商品更新(withLock)/空body/特殊字符/中文slug/批量打标/Dashboard一致性/令牌边界 | 20/20 |

### 多用户混沌测试（7/7 区域全过）

| 区域 | 覆盖范围 |
|------|----------|
| Setup | 管理员登录、API Key 创建（read+write/read-only/admin） |
| Multi-User Concurrent | 5 用户并发免费 checkout、并发 token 验证、同用户多产品下载、邮箱恢复 |
| Race Conditions | 10 次并发商品更新（withLock）、5 次并发分类创建（1 ok + 4 冲突）、并发订单状态更新、并发配置保存 |
| Logic Vulnerabilities | 免费产品始终授权（设计如此）、跨产品 token 对付费产品被拒、空 token 被拒、API Key 权限升级被拒、归档商品 checkout 被拒 |
| Edge Cases | 超长标题、负价格拒绝、空 body → 400、特殊字符标签、重复 shortId、分类引用阻止删除、body 大小限制 |
| Security | 未认证访问拒绝、伪造 JWT 拒绝、伪造 API Key 拒绝、SQL 注入安全、原型污染存活、限流触发、安全响应头、V1 Zod 验证 |
| Data Consistency | 核心端点数据完整、Health check 通过 |

### 用户闭环模拟测试（99/99 PASS）

| 用户 | 场景 | 断言 |
|------|------|------|
| Alice | 免费产品 → 邮箱收集 → 下载 → token有效 | 12 |
| Bob | 免费产品 → 跳过邮箱 → 仍可下载 | 8 |
| Carol | 付费产品 → Stripe支付 → 下载 → token有效 | 10 |
| Dave | 付费下载后关页面 → 重新打开仍可下载 → 邮箱恢复 | 14 |
| Eve | Token过期 → 拒绝下载 → 邮箱恢复新token | 12 |
| Frank | 已退款 → 邮箱恢复被拒 | 8 |
| Grace | 多产品购买 → 邮箱恢复返回全部 | 10 |
| Hank | 免费+付费混合 → 邮箱恢复 | 10 |
| 攻击者 | Token伪造（5种攻击）→ 全部拦截 | 10 |
| 边界 | 跨产品token → 拒绝 / 限流验证 | 5 |

### 发现并修复的问题

1. **Dashboard 无认证**（已修复）：`GET /api/dashboard` 原为公开端点，现已加 `adminSession` 认证，防止销售/退款/净收入等敏感数据泄露
2. **下载恢复孤儿订单**（已修复）：订单存在但关联商品已下架时，原返回 `found:true, downloads:[]`（误导用户），现返回 `message: "关联商品已下架或不可用，请联系 support@aeox.uk"`
3. **API Key keyPreview 缺失**（已修复）：`POST /api/config/keys` 创建 Key 时返回体缺少 `keyPreview` 字段，现已补上
4. **Dashboard 测试缺 auth**（已修复）：`test-site-config.js` 和 `test-concurrency-edge.js` 中 Dashboard 请求缺少 JWT 认证头
5. **测试数据累积冲突**（已修复）：分类/标签/Provider 测试用硬编码名称，多次运行后 409 冲突，现使用 `Date.now().toString(36)` 唯一后缀
6. **AI 接口 502 断言**（已修复）：测试删光 Provider 后 AI Chat/Generate 返回 502 属于预期行为，断言已接受 200|502
7. **登录限流跨测试影响**（已修复）：`login()` 函数增加 429 重试逻辑（最多 12 次，间隔 10s），解决 test-auth 限流后后续测试无法登录的问题
8. **密码热重载**（已修复）：新增 `reloadPasswordFromDisk()` + `POST /api/auth/reload-password` API，解决跨进程密码缓存失效问题
9. **免费Checkout无限下单**（已修复）：`POST /api/checkout/:shortId` 新增 10次/分钟/IP 限流，防止恶意刷单
10. **邮箱恢复IP绕过**（已修复）：`POST /api/recover-download` 新增双重限流 — IP 5次/分钟 + 邮箱 3次/5分钟，攻击者无法仅通过换IP绕过
11. **跨进程缓存不一致**（已修复）：新增 `POST /api/cache/invalidate` 管理端点（body: `{files: [...]}`），测试脚本直接操作订单文件后可通知服务器刷新缓存
12. **双重删除返回200**（已修复）：`DELETE /api/products/:id` 对已归档商品二次删除返回 404
13. **stats.js 统计数据丢失**（已修复，v2.2.1）：`recordStat()` 使用 `markDirty`，当 stats.json 不在缓存时（新部署或文件被删）数据静默丢失。改为 `saveJson` 确保同步写入并缓存
14. **API Key 列表泄露完整密钥**（已修复，v2.2.1）：`GET /api/config/keys` 使用 `...k` 展开导致完整 `key` 字段暴露。改为解构 `const { key, ...rest } = k` 排除敏感字段，仅返回 `keyPreview`
15. **saveJson 并发写入崩溃**（已修复，v2.2.1）：多个请求同时写同一文件时 `.tmp` 文件名冲突导致 `ENOENT: rename` 失败。改为唯一临时文件名 `.tmp.{pid}.{ts}.{rnd}`，并为所有 `saveJson` 调用补全 `withLock`
16. **ProductCreateSchema 过于宽松**（已修复，v2.2.1）：`title` 字段为 optional，空 body 可创建商品。改为 `z.string().min(1)` 必填，`ProductUpdateSchema` 独立定义
17. **entity.too.large 返回 500**（已修复，v2.2.1）：Express body 超限错误未识别为 413。error handler 新增 `err.type === 'entity.too.large'` 判断
  18. **V1 API CORS 缺失**（已修复，v2.2.1）：`/api/v1/*` 无 CORS 头，外部消费者无法跨域调用。新增 CORS 中间件，通过 `CORS_ORIGINS` 环境变量配置
  19. **下载页多语言切换失效**（已修复，v2.2.2）：`verify-download` API 响应中 `product.downloads` 被 `getProductDownloads()` 返回的扁平数组覆盖，前端无法获取其他语言下载链接。修复为传原始 `product.downloads` 对象（含所有语言 key），前端语言切换正常工作
  20. **下载页只显示单语言**（已修复，v2.4.0）：`isOldFormat` 判断的是后端返回的 `downloads` 扁平数组而非 `product.downloads` 多语言对象，导致多语言下载链接不渲染。改为从 `product.downloads` 判断，所有语言版本同时展示带语言标签
  21. **Shelf 桌面端无法横向滚动**（已修复，v2.4.0）：`overflow-x: auto` + `scrollbar: none` 在桌面端无法滚动。添加鼠标拖拽 + 滚轮横向滚动 + grab/grabbing 光标
  22. **Hero 区域撑满全屏**（已修复，v2.4.0）：Shelf 移出 `<main container>` 后 Hero 也跟着移出，缺少 `max-width` 限制。给 `.hero` 加 `max-width: 960px; margin: 0 auto`
  23. **read.js 首次显示语言错误**（已修复，v2.4.0）：初始 `lang` 从 `navigator.language` 获取，覆盖了用户在首页选过的语言。改为优先读 `localStorage.aeox_lang`
  24. **read.js "返回商城" 硬编码中文**（已修复，v2.4.0）：改为根据当前语言显示对应文案
  25. **ChatWidget 推荐书点击无跳转**（已修复，v2.4.1）：点击 AI 推荐的商品只关闭聊天窗口，无任何跳转。改为试读书跳 `/read/shortId`，其他书打开详情弹窗
  26. **DetailSheet Upsell 推荐不生效**（已修复，v2.4.2）：首页详情弹窗 `relatedPaid` 完全忽略 `product.upsell` 配置，始终按自动逻辑显示。改为 `getUpsellProducts()` 正确读取 upsell.mode（auto/manual/none）
  27. **DetailSheet 推荐卡片无法点击**（已修复，v2.4.2）：推荐商品卡片无 onClick 事件，点击无反应。改为点击后关闭当前弹窗并打开推荐商品详情弹窗
  28. **标签白底白字不可见**（已修复，v2.4.2）：V1 批量导入的旧标签缺少 `color` 字段，前端 `background: undefined` 回退白色 + `color:#fff` = 不可见。修复：补数据 + 前端加 `#737373` fallback

## 线上商品数据（v2.4.0）

| 分类 | 商品 | 语言 | 价格 |
|------|------|------|------|
| 风水基础 | fs00-fs09 (10本) | EN+ZH+ES（fs00 仅 EN+ZH）| FREE |
| 风水进阶 | fs20 Bedroom | EN+ES | $9.99 | [Ko-fi](https://ko-fi.com/s/b5a78be573) |
| 风水进阶 | fs21 Bagua (**已归档**) | EN+ES | 搭售赠品 | — |
| AI 进阶 | ha02 Teacher | EN+ES | $9.99 | [Ko-fi](https://ko-fi.com/s/1f3f69a534) |
| AI 进阶 | ha05 Business | EN+ES | $9.99 | [Ko-fi](https://ko-fi.com/s/a578d3c9df) |
| AI 进阶 | ha09 Marketer | EN+ES | $9.99 | [Ko-fi](https://ko-fi.com/s/febf31a399) |
| AI 免费 | ha00 4-Step Loop | EN+ES+DE | FREE |
| AI 免费 | ha01 Prompt Starter | EN+ES | FREE |
| AI 进阶 | ha02/ha05/ha09 | EN+ES | $9.99 |
| AI 试读 | ha03 Real Estate | EN | FREE |

**R2 图床**: `https://pub-3be20831d6764fe7a7a42f7a11d42d98.r2.dev`
**Google Drive 下载源**: 6 个目录（free/fengshui, free/helloai, paid/fengshui, paid/helloai, bonus/fengshui, sample/helloai）
