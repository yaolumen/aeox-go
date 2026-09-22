// @ts-check
import { html, useState } from './admin-lib.js';

function ApiDocs({ apiKeys }) {
  const [expanded, setExpanded] = useState(null);
  const origin = typeof location !== 'undefined' ? location.origin : '';

  const sections = [
    {
      id: 'auth',
      title: 'Authentication',
      desc: 'Two auth methods: Admin JWT (cookie-based session) and API Key (x-api-key header for V1).',
      items: [
        { method: 'POST', path: '/api/login', auth: 'None', desc: 'Admin login, returns JWT token', body: '{ "password": "..." }', resp: '{ "success": true, "token": "jwt...", "expiresIn": 14400 }' },
        { method: 'GET', path: '/api/auth/status', auth: 'JWT', desc: 'Check session validity', body: '', resp: '{ "valid": true, "expiresIn": 14350, "expiresAt": "..." }' },
        { method: 'POST', path: '/api/auth/change-password', auth: 'JWT', desc: 'Change admin password', body: '{ "currentPassword": "...", "newPassword": "..." }', resp: '{ "success": true }' },
      ]
    },
    {
      id: 'products',
      title: 'Products',
      desc: 'Product CRUD. Admin routes use JWT auth; V1 routes use API key.',
      items: [
        { method: 'GET', path: '/api/products', auth: 'None', desc: 'List active products (archived excluded; ?status= archived to include)', body: '', resp: '[{ id, shortId, title, cover, price, desc, downloads, locales, ... }]' },
        { method: 'GET', path: '/api/v1/products', auth: 'Key (read)', desc: 'V1: List active products', body: '', resp: '[{ ...same as above }]' },
        { method: 'GET', path: '/api/v1/products/:id', auth: 'Key (read)', desc: 'V1: Get single product (by id or shortId)', body: '', resp: '{ ...product }' },
        { method: 'POST', path: '/api/products', auth: 'JWT', desc: 'Create product (full fields)', body: '{ title: {en,zh}, cover, price, desc, downloads, locales, bookLang, format, whatYouLearn, whatYouGet, whoIsFor, categoryId, tags, featured, stripeLink, kofiLink, ... }', resp: '{ success: true, product: {...} }' },
        { method: 'POST', path: '/api/v1/products', auth: 'Key (write)', desc: 'V1: Create product', body: '{ title, cover, price, desc, downloads, locales, categoryId, tags, featured, ... }', resp: '{ ...created product }' },
        { method: 'PUT', path: '/api/products/:id', auth: 'JWT', desc: 'Update product (partial)', body: '{ price: 9.99, title: {en: "New"} }', resp: '{ success: true, product: {...} }' },
        { method: 'PUT', path: '/api/v1/products/:id', auth: 'Key (write)', desc: 'V1: Update product (partial, by id or shortId)', body: '{ price: 9.99 }', resp: '{ ...updated product }' },
        { method: 'DELETE', path: '/api/products/:id', auth: 'JWT', desc: 'Archive product (soft delete)', body: '', resp: '{ success: true }' },
        { method: 'DELETE', path: '/api/v1/products/:id', auth: 'Key (write)', desc: 'V1: Archive product', body: '', resp: '{ success: true }' },
        { method: 'POST', path: '/api/v1/imports/preview', auth: 'Key (read)', desc: 'V1: Batch import preview (check conflicts)', body: '{ products: [{title, price, ...}], categories: [...], tags: [...] }', resp: '{ total, newCount, existingCount, newCategories, newTags, preview: [...] }' },
        { method: 'POST', path: '/api/v1/imports/', auth: 'Key (write)', desc: 'V1: Batch import products + categories + tags. mode: merge|overwrite|skip', body: '{ products: [{title:{en,zh}, cover:"图床URL", price:0, downloads:{en:[{url:"网盘URL",label:"PDF"}]}, ...}], categories: [{id,slug,name}], tags: [{id,name}], mode: "merge" }', resp: '{ success: true, added, updated, skipped, results: [{id, action}] }' },
        { method: 'GET', path: '/api/products/export', auth: 'JWT', desc: 'Export full catalog (products + categories + tags)', body: '', resp: '{ _meta, products: [...], categories: [...], tags: [...] }' },
        { method: 'POST', path: '/api/products/import-preview', auth: 'JWT', desc: 'Admin import preview', body: '{ products: [...] }', resp: '{ total, newCount, existingCount, preview }' },
        { method: 'POST', path: '/api/products/import', auth: 'JWT', desc: 'Admin import (mode: merge|overwrite|skip)', body: '{ products, categories, tags, mode }', resp: '{ success, added, updated, skipped, results }' },
        { method: 'POST', path: '/api/products/batch-tags', auth: 'JWT', desc: 'Batch add/remove tags on products', body: '{ productIds: [], tagIds: [], mode: "add"|"remove" }', resp: '{ success: true }' },
      ]
    },
    {
      id: 'categories',
      title: 'Categories',
      desc: 'Category CRUD. Categories use i18n name objects: { en, zh, es, de }.',
      items: [
        { method: 'GET', path: '/api/config/categories', auth: 'None', desc: 'List categories', body: '', resp: '[{ id, slug, name:{en,zh}, description, sort, status }]' },
        { method: 'GET', path: '/api/v1/categories', auth: 'Key (read)', desc: 'V1: List categories', body: '', resp: '[ ... ]' },
        { method: 'POST', path: '/api/config/categories', auth: 'JWT', desc: 'Create category', body: '{ name: {en:"Programming",zh:"编程"} }', resp: '{ success: true, category: {...} }' },
        { method: 'POST', path: '/api/v1/categories', auth: 'Key (write)', desc: 'V1: Create category', body: '{ name: {en:"Programming"}, slug: "programming" }', resp: '{ ...created category }' },
        { method: 'PUT', path: '/api/config/categories/:id', auth: 'JWT', desc: 'Update category', body: '{ name: {en:"New Name"} }', resp: '{ success: true, category: {...} }' },
        { method: 'PUT', path: '/api/v1/categories/:id', auth: 'Key (write)', desc: 'V1: Update category', body: '{ name: {en:"New Name"} }', resp: '{ ...updated category }' },
        { method: 'DELETE', path: '/api/config/categories/:id', auth: 'JWT', desc: 'Delete category (must be empty)', body: '', resp: '{ success: true }' },
        { method: 'DELETE', path: '/api/v1/categories/:id', auth: 'Key (admin)', desc: 'V1: Delete category', body: '', resp: '{ success: true }' },
      ]
    },
    {
      id: 'tags',
      title: 'Tags',
      desc: 'Tag CRUD. Tags use plain string name (not i18n).',
      items: [
        { method: 'GET', path: '/api/config/tags', auth: 'None', desc: 'List tags', body: '', resp: '[{ id, name, color, createdAt }]' },
        { method: 'GET', path: '/api/v1/tags', auth: 'Key (read)', desc: 'V1: List tags', body: '', resp: '[ ... ]' },
        { method: 'POST', path: '/api/config/tags', auth: 'JWT', desc: 'Create tag', body: '{ name: "Python" }', resp: '{ success: true, tag: {...} }' },
        { method: 'POST', path: '/api/v1/tags', auth: 'Key (write)', desc: 'V1: Create tag', body: '{ name: "Python", color: "#00ff00" }', resp: '{ ...created tag }' },
        { method: 'DELETE', path: '/api/config/tags/:id', auth: 'JWT', desc: 'Delete tag', body: '', resp: '{ success: true }' },
        { method: 'DELETE', path: '/api/v1/tags/:id', auth: 'Key (admin)', desc: 'V1: Delete tag', body: '', resp: '{ success: true }' },
      ]
    },
    {
      id: 'checkout',
      title: 'Checkout & Download',
      desc: 'Free product checkout returns download URL directly. Paid returns payment link.',
      items: [
        { method: 'POST', path: '/api/checkout/:shortId', auth: 'None', desc: 'Checkout product (free or paid)', body: '{ email: "user@example.com" }', resp: 'Free: { free:true, downloadUrl, token } | Paid: { free:false, stripeLink/kofiLink, paymentMode }' },
        { method: 'POST', path: '/api/verify-download', auth: 'None', desc: 'Verify download token, return product files', body: '{ shortId, token?, lang? }', resp: '{ authorized, free, product, downloads }' },
        { method: 'POST', path: '/api/recover-download', auth: 'None', desc: 'Recover downloads by email', body: '{ email: "user@example.com" }', resp: '{ downloads: [...] }' },
      ]
    },
    {
      id: 'orders',
      title: 'Orders',
      desc: 'Order management (admin only).',
      items: [
        { method: 'GET', path: '/api/orders', auth: 'JWT', desc: 'List orders (?refundStatus= filter)', body: '', resp: '[{ id, productId, amount, customerEmail, refundStatus, ... }]' },
        { method: 'GET', path: '/api/orders/stats', auth: 'JWT', desc: 'Order statistics', body: '', resp: '{ totalSales, totalRefunds, totalRefunded, netRevenue, ... }' },
        { method: 'PUT', path: '/api/orders/:id/status', auth: 'JWT', desc: 'Update order status (e.g. refund)', body: '{ refundStatus: "refunded", refundNote: "..." }', resp: '{ success: true }' },
      ]
    },
    {
      id: 'config',
      title: 'Site Config',
      desc: 'Site-wide settings: branding, payment, FAQ, refund policy, SEO, i18n.',
      items: [
        { method: 'GET', path: '/api/config/site', auth: 'None', desc: 'Get public site config (sensitive fields masked)', body: '', resp: '{ siteName, siteDescription, heroTagline, paymentMode, faq, refundPolicy, ... }' },
        { method: 'PUT', path: '/api/config/site', auth: 'JWT', desc: 'Update site config', body: '{ siteName: "...", paymentMode: "kofi", ... }', resp: '{ success: true, data: {...} }' },
        { method: 'GET', path: '/api/v1/config/site', auth: 'Key (read)', desc: 'V1: Get site config', body: '', resp: '{ ... }' },
        { method: 'PUT', path: '/api/v1/config/site', auth: 'Key (admin)', desc: 'V1: Update site config', body: '{ siteName: "..." }', resp: '{ success, data }' },
      ]
    },
    {
      id: 'keys',
      title: 'API Keys',
      desc: 'Manage API keys for V1 access. Scopes: read, write, admin, *.',
      items: [
        { method: 'GET', path: '/api/config/keys', auth: 'JWT', desc: 'List API keys', body: '', resp: '[{ id, name, keyPreview, scopes, enabled, lastUsedAt }]' },
        { method: 'POST', path: '/api/config/keys', auth: 'JWT', desc: 'Create API key (key shown only once!)', body: '{ name: "My Key", scopes: ["read","write"] }', resp: '{ success: true, key: { id, key: "aeox_...", scopes } }' },
        { method: 'DELETE', path: '/api/config/keys/:id', auth: 'JWT', desc: 'Revoke API key', body: '', resp: '{ success: true }' },
      ]
    },
    {
      id: 'shortlinks',
      title: 'Short Links',
      desc: 'URL shortener for marketing. Target URLs must start with http:// or https://.',
      items: [
        { method: 'GET', path: '/api/short-links', auth: 'JWT', desc: 'List short links', body: '', resp: '[{ slug, url, description, clicks, createdAt }]' },
        { method: 'POST', path: '/api/short-links', auth: 'JWT', desc: 'Create short link', body: '{ slug: "promo", url: "https://...", description: "..." }', resp: '{ success: true, link: {...} }' },
        { method: 'PUT', path: '/api/short-links/:slug', auth: 'JWT', desc: 'Update short link', body: '{ url: "https://...", description: "..." }', resp: '{ success: true, link: {...} }' },
        { method: 'DELETE', path: '/api/short-links/:slug', auth: 'JWT', desc: 'Delete short link', body: '', resp: '{ success: true }' },
        { method: 'GET', path: '/s/:slug', auth: 'None', desc: 'Visit short link (302 redirect)', body: '', resp: '302 → target URL' },
      ]
    },
    {
      id: 'stats',
      title: 'Stats & Dashboard',
      desc: 'Analytics and dashboard data.',
      items: [
        { method: 'GET', path: '/api/dashboard', auth: 'JWT', desc: 'Dashboard stats (?range=today|week|month|all)', body: '', resp: '{ overview: { totalProducts, totalPv, totalOrders, totalRevenue, ... }, trend, top5, funnel }' },
        { method: 'GET', path: '/api/v1/stats/dashboard', auth: 'Key (read)', desc: 'V1: Dashboard stats', body: '', resp: '{ ...same }' },
        { method: 'POST', path: '/api/track/pv', auth: 'None', desc: 'Track page view', body: '{ productId: "..." }', resp: '{ ok: true }' },
        { method: 'POST', path: '/api/track/checkout', auth: 'None', desc: 'Track checkout event', body: '{ productId: "..." }', resp: '{ ok: true }' },
        { method: 'POST', path: '/api/track/download', auth: 'None', desc: 'Track download event', body: '{ productId: "..." }', resp: '{ ok: true }' },
      ]
    },
    {
      id: 'i18n',
      title: 'i18n',
      desc: 'Frontend translation strings.',
      items: [
        { method: 'GET', path: '/api/i18n?lang=zh', auth: 'None', desc: 'Get translation strings for a language', body: '', resp: '{ lang: "zh", t: { nav: {...}, hero: {...}, product: {...}, ... } }' },
      ]
    },
  ];

  const activeKey = apiKeys.find(k => k.enabled !== false);

  function methodColor(m) {
    if (m === 'GET') return '#61affe';
    if (m === 'POST') return '#49cc90';
    if (m === 'PUT') return '#fca130';
    if (m === 'DELETE') return '#f93e3e';
    return '#999';
  }

  return html`
    <div class="admin-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 class="admin-card-title" style="margin-bottom:0;">API Documentation</h3>
        ${activeKey && html`
          <div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);background:var(--surface);padding:4px 10px;border:1px solid var(--border);border-radius:4px;">
            x-api-key: ${activeKey.keyPreview || '***'}
          </div>
        `}
      </div>
      <p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">
        Base URL: <code style="font-family:var(--font-mono);font-size:12px;background:var(--surface);padding:2px 6px;border:1px solid var(--border);border-radius:4px;">${origin}</code>
        ${' '} | ${' '}
        V1 Auth: <code style="font-family:var(--font-mono);font-size:12px;background:var(--surface);padding:2px 6px;border:1px solid var(--border);border-radius:4px;">x-api-key: aeox_...</code>
        ${' '} | ${' '}
        Admin Auth: <code style="font-family:var(--font-mono);font-size:12px;background:var(--surface);padding:2px 6px;border:1px solid var(--border);border-radius:4px;">Authorization: Bearer jwt...</code>
      </p>

      ${!activeKey && html`
        <div style="padding:10px 14px;background:var(--surface);border:1px solid var(--border);font-size:12px;color:var(--text-light);margin-bottom:16px;border-radius:8px;">
          No active API key found. Create one above to use V1 endpoints.
        </div>
      `}

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${sections.map(sec => html`
          <div key=${sec.id} style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
            <button onClick=${() => setExpanded(expanded === sec.id ? null : sec.id)}
              style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--surface);border:none;cursor:pointer;color:var(--text);text-align:left;">
              <span style="font-size:13px;font-weight:600;">${sec.title}</span>
              <span style="font-size:11px;color:var(--text-muted);">${expanded === sec.id ? '▲' : '▼'}</span>
            </button>
            ${expanded === sec.id && html`
              <div style="padding:12px 16px;">
                <p style="font-size:12px;color:var(--text-light);margin-bottom:12px;">${sec.desc}</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${sec.items.map((item, i) => html`
                    <div key=${i} style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:10px 12px;">
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
                        <span style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;border-radius:4px;color:#fff;background:${methodColor(item.method)};font-family:var(--font-mono);">${item.method}</span>
                        <code style="font-family:var(--font-mono);font-size:12px;color:var(--accent);word-break:break-all;">${item.path}</code>
                        <span style="font-size:10px;color:var(--text-light);background:var(--surface);padding:1px 6px;border:1px solid var(--border);border-radius:20px;margin-left:auto;">${item.auth}</span>
                      </div>
                      <p style="font-size:12px;color:var(--text);margin-bottom:${item.body || item.resp ? '6px' : '0'};">${item.desc}</p>
                      ${item.body && html`
                        <div style="margin-bottom:4px;">
                          <span style="font-size:10px;color:var(--text-muted);font-weight:600;">Request:</span>
                          <pre style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);background:var(--surface);padding:6px 8px;border-radius:4px;margin:4px 0 0;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">${item.body}</pre>
                        </div>
                      `}
                      ${item.resp && html`
                        <div>
                          <span style="font-size:10px;color:var(--text-muted);font-weight:600;">Response:</span>
                          <pre style="font-family:var(--font-mono);font-size:11px;color:var(--text-light);background:var(--surface);padding:6px 8px;border-radius:4px;margin:4px 0 0;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">${item.resp}</pre>
                        </div>
                      `}
                    </div>
                  `)}
                </div>
              </div>
            `}
          </div>
        `)}
      </div>

      <div style="margin-top:20px;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">
        <p style="font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:8px;">AI Automation Quick Reference</p>
        <p style="font-size:11px;color:var(--text-muted);line-height:1.6;">
          1. Create API Key (scopes: ['*']) → <code style="font-family:var(--font-mono);font-size:10px;">POST /api/config/keys</code><br/>
          2. Batch preview → <code style="font-family:var(--font-mono);font-size:10px;">POST /api/v1/imports/preview</code> with x-api-key header<br/>
          3. Batch import → <code style="font-family:var(--font-mono);font-size:10px;">POST /api/v1/imports/</code> with products array, each product has:<br/>
          ${'   '}<code style="font-family:var(--font-mono);font-size:10px;">cover</code> = image CDN URL, <code style="font-family:var(--font-mono);font-size:10px;">downloads</code> = {"en": [{"url": "cloud drive URL", "label": "PDF"}]},<br/>
          ${'   '}<code style="font-family:var(--font-mono);font-size:10px;">title</code>/<code style="font-family:var(--font-mono);font-size:10px;">desc</code>/<code style="font-family:var(--font-mono);font-size:10px;">whatYouLearn</code> = i18n objects {"en":"...", "zh":"..."}<br/>
          4. Manage categories/tags → <code style="font-family:var(--font-mono);font-size:10px;">POST /api/v1/categories</code> / <code style="font-family:var(--font-mono);font-size:10px;">POST /api/v1/tags</code><br/>
          5. Update single product → <code style="font-family:var(--font-mono);font-size:10px;">PUT /api/v1/products/:id</code>
        </p>
      </div>
    </div>
  `;
}

export { ApiDocs };
