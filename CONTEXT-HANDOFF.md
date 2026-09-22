# AEOX 虚拟电子书 — 新对话快速上下文

> 粘贴到新对话开头。聚焦：产品创建 → 文件上传 → API管理。go.aeox.uk工程本身在另一个对话维护。
> 最后更新: 2026-09-01

---

## 产品上线三步流水线

```
① 写内容(Prompt .md) → ② 上传PDF/封面到GD+R2 → ③ 调API注册商品到go.aeox.uk
```

---

## 1. 产品数据模型

### Product 商品 (核心字段)
```json
{
  "id": "p_ha01",                           // 格式: p_{shortId}
  "shortId": "ha01",                        // URL/checkout用
  "locales": ["en", "es"],                  // 语言版本
  "title": { "en": "...", "es": "..." },
  "cover": "https://pub-...r2.dev/...",     // 封面URL(R2)
  "price": 9.99,                            // 0=免费
  "desc": { "en": "...", "es": "..." },
  "whatYouLearn": { "en": "..." },
  "whatYouGet": { "en": "..." },
  "whoIsFor": { "en": "..." },
  "format": "PDF",
  "fileSize": "2.1 MB",
  "downloads": {                            // 按语言分组，双镜像
    "en": [
      { "url": "https://drive.google.com/uc?export=download&id={GD_FILE_ID}", "label": "Google Drive" },
      { "url": "https://pub-3be20831d6764fe7a7a42f7a11d42d98.r2.dev/pdfs/{path}", "label": "Mirror (R2)" }
    ]
  },
  "drive": { "primary": "GD_URL", "backup": "R2_URL" },
  "kofiLink": "https://ko-fi.com/s/xxx",   // 付费书Ko-fi链接
  "categoryId": "cat_xxx",
  "featured": true,
  "status": "active",                       // active | archived
  "tags": ["tag_id"],
  "upsell": { "mode": "auto", "products": [] }
}
```

### Sample 试读
```json
{
  "shortId": "ha03",                        // URL: /read/ha03
  "productId": "p_ha03",                    // 关联商品(可null=独立sample)
  "title": { "en": "..." },
  "cover": "https://...",
  "enabled": true,
  "content": { "en": "## Markdown...", "es": "## ..." },
  "upsellMode": "auto",                     // auto | manual | none
  "category": "ai-pro-guides"              // 分类slug
}
```

### 分类体系 (5个)
| slug | 系列 | 类型 |
|------|------|------|
| `fengshui-basics` | 风水 | 免费 |
| `fengshui-pro` | 风水 | 付费 |
| `ai-free-guides` | AI | 免费 |
| `ai-pro-guides` | AI | 付费 |
| `seo-digital-marketing` | SEO | - |

---

## 2. 文件上传 (Google Drive + R2)

### 双镜像
每个PDF两个下载源：
- **Google Drive (主)**: `https://drive.google.com/uc?export=download&id={FILE_ID}`
- **R2 (备)**: `https://pub-3be20831d6764fe7a7a42f7a11d42d98.r2.dev/pdfs/{series}/{filename}.pdf`

### R2 图床
- **公开域名**: `pub-3be20831d6764fe7a7a42f7a11d42d98.r2.dev`
- 封面: `/covers/{series}/{filename}.png`
- PDF: `/pdfs/{series}/{filename}.pdf`

### Google Drive 关键ID
- **根目录**: `1ag7H8ACYK-d7HRekSMcH5aWgqbWQE_gX`
- **Prompt Products**: `1RMkddzedjO-HCV1jMNtPr48sF69BZ2bH`
- **书文件夹**:
  - Freelancer: `1Hb7d_XtqPzzTc4Dh50NyjjcM3NhHH0Jm`
  - Teacher: `1vbUYpJtY3m8tmur_KlXL9iQJ_yPpniMD`
  - Business: `1IBi3U1-rPyzQ0moZ332rr-8tbrFEf2gK`
  - Marketer: `19tFnHtlw3G9s8K64iE2fYwXjU2UnZaZe`
- **GD文件ID映射**: `D:\My_Obsidian_Vault\20_New_Books\30_Publish\out\gd_prompt_product_ids.json`

### 文件命名规范
- PDF: `{series}-{number}-{topic}__{version}__{language}.pdf`
- 封面: `{series}-{number}-{topic}__{version}__{language}_cover-front-shop.png`
- 例: `helloai-01-freelancer__v0__english.pdf`

### 上传方式
- **R2**: 通过 Cloudflare Dashboard 或 wrangler CLI
- **GD**: 通过 Python 脚本(google-auth + requests)或手动上传后记录fileId
- **注意**: 服务器 Python 3.14.4，httplib2不可用，需用 google-auth.transport.requests

---

## 3. go.aeox.uk API 管理

### 认证
- **V1 API**: Header `x-api-key: aeox_xxx` (需先创建Key)
- **Admin API**: JWT Cookie (登录 `POST /api/login` with password)

### 商品 CRUD (V1 API — 需 x-api-key)
```
POST   /api/v1/products          ← 创建商品
PUT    /api/v1/products/:id      ← 更新(id或shortId)
GET    /api/v1/products           ← 列表
DELETE /api/v1/products/:id      ← 删除(需admin scope)
```

### 试读 CRUD
```
POST   /api/v1/samples           ← 创建(短ID可关联商品自动填title/cover)
PUT    /api/v1/samples/:shortId  ← 更新
GET    /api/v1/samples           ← 列表
DELETE /api/v1/samples/:shortId  ← 删除(需admin scope)
```

### 分类/标签
```
POST   /api/v1/categories        ← 创建分类
POST   /api/v1/tags              ← 创建标签
```

### 创建API Key
```
POST /api/v1/keys  { "name": "my-key", "scopes": ["*"] }
Response: { "key": "aeox_xxx..." }  ⚠️ 只返回一次
```

### 创建商品的典型curl
```bash
curl -X POST https://go.aeox.uk/api/v1/products \
  -H "Content-Type: application/json" \
  -H "x-api-key: aeox_YOUR_KEY" \
  -d '{
    "id": "p_seo01",
    "shortId": "seo01",
    "locales": ["en"],
    "title": { "en": "SEO Audit Blueprint" },
    "cover": "https://pub-3be20831d6764fe7a7a42f7a11d42d98.r2.dev/covers/seo/seo-01-audit__v0__english_cover-front-shop.png",
    "price": 0,
    "desc": { "en": "..." },
    "whatYouLearn": { "en": "..." },
    "whatYouGet": { "en": "..." },
    "whoIsFor": { "en": "..." },
    "format": "PDF",
    "fileSize": "1.5 MB",
    "downloads": {
      "en": [
        { "url": "https://drive.google.com/uc?export=download&id=GD_FILE_ID", "label": "Google Drive" },
        { "url": "https://pub-3be20831d6764fe7a7a42f7a11d42d98.r2.dev/pdfs/seo/seo-01-audit__v0__english.pdf", "label": "Mirror (R2)" }
      ]
    },
    "categoryId": "cat_mtfqxhfg0zxb",
    "featured": false,
    "tags": [],
    "status": "active"
  }'
```

### 更新商品(添加Ko-fi链接)
```bash
curl -X PUT https://go.aeox.uk/api/v1/products/p_seo01 \
  -H "Content-Type: application/json" \
  -H "x-api-key: aeox_YOUR_KEY" \
  -d '{ "kofiLink": "https://ko-fi.com/s/xxx" }'
```

---

## 4. 已有产品清单

### Hello AI 系列
| ShortId | 书名 | 价格 | Ko-fi |
|---------|------|------|-------|
| ha01 | Freelancer Edition | 免费 | - |
| ha02 | Teacher Edition | $9.99 | `ko-fi.com/s/1f3f69a534` |
| ha05 | Business Edition | $9.99 | `ko-fi.com/s/a578d3c9df` |
| ha09 | Marketer Edition | $9.99 | `ko-fi.com/s/febf31a399` |

### 风水系列(已上传R2/GD，未上架go.aeox.uk)
- fs00-fs09: 免费(10本)
- fs20: 卧室风水(付费)
- fs21: 八卦风水(已归档)

### SEO系列 — **待开发**
- 分类已建: `seo-digital-marketing` (ID: `cat_mtfqxhfg0zxb`)
- 产品尚未创建

---

## 5. 重要约束

- **三个系列(AI/SEO/Feng Shui)互不交叉推荐**
- **财务/法律Prompt**: 不写固定百分比，必须写 "compare against your own baseline"
- **4-Step Loop**: 是用户质量控制方法，不是产品免责声明
- **文件修改前先备份**: 旧版v0与新版v01共存
- **文件命名**: `{book}-{tier}-{LANG}-{version}.md`, LANG大写, version v01/v0
- **不使用git**: 备份方式是复制文件
- **go.aeox.uk工程维护在另一个对话**，本对话聚焦产品内容与API管理
