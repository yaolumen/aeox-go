const http = require('http');
const fssync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const ADMIN_PWD = 'test10users_clean';
const DATA_DIR = path.join(__dirname, 'data');

let passed = 0;
let failed = 0;
const failures = [];

function log(uid, name, ok, detail) {
  if (ok) { passed++; console.log(`  PASS [U${String(uid).padStart(2,'0')}] ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; failures.push(`[U${String(uid).padStart(2,'0')}] ${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL [U${String(uid).padStart(2,'0')}] ${name}${detail ? ' — ' + detail : ''}`); }
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function resetPassword() {
  const hashFile = path.join(DATA_DIR, 'admin-password.json');
  const hash = await bcrypt.hash(ADMIN_PWD, 10);
  fssync.writeFileSync(hashFile, JSON.stringify({ hash, source: 'test', initialPassword: ADMIN_PWD, createdAt: new Date().toISOString() }, null, 2));
  await delay(300);
}

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(d); } catch { parsed = d; }
        resolve({ status: res.statusCode, body: parsed, raw: d });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function requestV1(method, urlPath, body, apiKey) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey } };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { let p; try { p = JSON.parse(d); } catch { p = d; } resolve({ status: res.statusCode, body: p }); });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login() {
  const res = await request('POST', '/api/login', { password: ADMIN_PWD });
  if (res.status !== 200 || !res.body.token) throw new Error('Login failed');
  return res.body.token;
}

// ══════════════════════════════════════════════════════════════
//  U01 — 管理员初始化
// ══════════════════════════════════════════════════════════════
async function runU01_AdminSetup(token) {
  console.log('\n--- U01 Admin: 初始化分类/标签/产品 ---');
  const uid = 1;

  const cat1 = await request('POST', '/api/config/categories', { name: { en: 'Programming', zh: '编程', es: 'Programación' } }, token);
  log(uid, '创建分类 Programming', cat1.body?.success && cat1.body?.category?.id, `id=${cat1.body?.category?.id}`);

  const cat2 = await request('POST', '/api/config/categories', { name: { en: 'AI & ML', zh: 'AI与机器学习' } }, token);
  log(uid, '创建分类 AI & ML', cat2.body?.success && cat2.body?.category?.id, `id=${cat2.body?.category?.id}`);

  const cat3 = await request('POST', '/api/config/categories', { name: { en: 'Free Guides', zh: '免费指南' } }, token);
  log(uid, '创建分类 Free Guides', cat3.body?.success && cat3.body?.category?.id, `id=${cat3.body?.category?.id}`);

  const tag1 = await request('POST', '/api/config/tags', { name: 'Python' }, token);
  log(uid, '创建标签 Python', tag1.body?.success);

  const tag2 = await request('POST', '/api/config/tags', { name: 'JavaScript' }, token);
  log(uid, '创建标签 JavaScript', tag2.body?.success);

  const tag3 = await request('POST', '/api/config/tags', { name: 'React' }, token);
  log(uid, '创建标签 React', tag3.body?.success);

  const p1 = await request('POST', '/api/products', {
    title: { en: 'Python Mastery', zh: 'Python精通之路' },
    desc: { en: 'Complete guide to Python programming', zh: 'Python编程完全指南' },
    price: 9.99, categoryId: cat1.body?.category?.id, format: 'PDF', featured: true,
    locales: ['en', 'zh'], bookLang: 'en',
    stripeLink: 'https://buy.stripe.com/test_python',
    downloads: { en: [{ url: 'https://example.com/python-en.pdf', label: 'PDF' }], zh: [{ url: 'https://example.com/python-zh.pdf', label: 'PDF' }] },
    whatYouLearn: { en: 'Python basics to advanced' }, whatYouGet: { en: '300+ pages PDF' }
  }, token);
  log(uid, '创建付费产品 Python Mastery', p1.body?.success && p1.body?.product?.id);

  const p2 = await request('POST', '/api/products', {
    title: { en: 'React Patterns', zh: 'React设计模式' },
    desc: { en: 'Advanced React design patterns' },
    price: 14.99, categoryId: cat1.body?.category?.id, format: 'PDF', featured: true,
    locales: ['en', 'zh'], bookLang: 'en',
    stripeLink: 'https://buy.stripe.com/test_react',
    downloads: { en: [{ url: 'https://example.com/react-en.pdf', label: 'PDF' }] }
  }, token);
  log(uid, '创建付费产品 React Patterns', p2.body?.success && p2.body?.product?.id);

  const p3 = await request('POST', '/api/products', {
    title: { en: 'AI Engineering Handbook', zh: 'AI工程手册' },
    desc: { en: 'Build production AI systems' },
    price: 24.99, categoryId: cat2.body?.category?.id, format: 'PDF',
    locales: ['en', 'zh'], bookLang: 'en',
    stripeLink: 'https://buy.stripe.com/test_ai',
    downloads: { en: [{ url: 'https://example.com/ai-en.pdf', label: 'PDF' }] }
  }, token);
  log(uid, '创建付费产品 AI Engineering', p3.body?.success && p3.body?.product?.id);

  const p4 = await request('POST', '/api/products', {
    title: { en: 'Python Quick Start', zh: 'Python快速入门' },
    desc: { en: 'Free beginner guide to Python' },
    price: 0, categoryId: cat3.body?.category?.id, format: 'PDF',
    locales: ['en', 'zh'], bookLang: 'en',
    downloads: { en: [{ url: 'https://example.com/python-quick.pdf', label: 'PDF' }] }
  }, token);
  log(uid, '创建免费产品 Python Quick Start', p4.body?.success && p4.body?.product?.id);

  const p5 = await request('POST', '/api/products', {
    title: { en: 'JavaScript Cheat Sheet' },
    desc: { en: 'Quick reference for JS developers' },
    price: 0, categoryId: cat3.body?.category?.id, format: 'PDF',
    locales: ['en'], bookLang: 'en',
    downloads: { en: [{ url: 'https://example.com/js-cheat.pdf', label: 'PDF' }] }
  }, token);
  log(uid, '创建免费产品 JS Cheat Sheet', p5.body?.success && p5.body?.product?.id);

  return {
    cats: [cat1.body?.category, cat2.body?.category, cat3.body?.category],
    products: [p1.body?.product, p2.body?.product, p3.body?.product, p4.body?.product, p5.body?.product]
  };
}

// ══════════════════════════════════════════════════════════════
//  U02 — 访客浏览
// ══════════════════════════════════════════════════════════════
async function runU02_VisitorBrowse(seed) {
  console.log('\n--- U02 访客: 浏览/搜索 ---');
  const uid = 2;

  const prods = await request('GET', '/api/products');
  log(uid, '获取产品列表', prods.body.length >= 5, `count=${prods.body.length}`);

  const cats = await request('GET', '/api/config/categories');
  log(uid, '获取分类列表', cats.body.length >= 3, `count=${cats.body.length}`);

  const site = await request('GET', '/api/config/site');
  log(uid, '获取站点配置', !!site.body.siteName, `name=${site.body.siteName}`);

  const i18n = await request('GET', '/api/i18n?lang=zh');
  log(uid, '获取中文i18n', !!i18n.body.t, `keys=${Object.keys(i18n.body.t || {}).length}`);

  const p = seed.products[0];
  log(uid, '产品有shortId', !!p?.shortId, `shortId=${p?.shortId}`);
  log(uid, '产品有i18n标题', !!p?.title?.en && !!p?.title?.zh, `en=${p?.title?.en} zh=${p?.title?.zh}`);
}

// ══════════════════════════════════════════════════════════════
//  U03 — 付费购买
// ══════════════════════════════════════════════════════════════
async function runU03_PaidCheckout(seed, token) {
  console.log('\n--- U03 买家: 付费产品购买 ---');
  const uid = 3;

  const p = seed.products[0];
  const checkout = await request('POST', `/api/checkout/${p.shortId}`, { email: 'buyer@test.com' });
  const hasLink = checkout.body?.stripeLink || checkout.body?.kofiLink;
  log(uid, '付费产品checkout返回支付链接', checkout.status === 200 && !!hasLink, `stripe=${!!checkout.body?.stripeLink} kofi=${!!checkout.body?.kofiLink}`);
}

// ══════════════════════════════════════════════════════════════
//  U04 — 免费下载
// ══════════════════════════════════════════════════════════════
async function runU04_FreeCheckout(seed) {
  console.log('\n--- U04 用户: 免费产品下载 ---');
  const uid = 4;

  const p = seed.products[3]; // Python Quick Start (free)
  const checkout = await request('POST', `/api/checkout/${p.shortId}`, { email: 'free@test.com' });
  log(uid, '免费产品checkout', checkout.status === 200 && !!checkout.body?.downloadUrl, `url=${checkout.body?.downloadUrl ? 'ok' : 'missing'}`);

  if (checkout.body?.downloadUrl) {
    const dlCheck = await request('GET', checkout.body.downloadUrl);
    log(uid, '下载页面可访问', dlCheck.status === 200, `status=${dlCheck.status}`);
  }

  // 免费下载无邮箱
  const checkout2 = await request('POST', `/api/checkout/${p.shortId}`, {});
  log(uid, '免费下载(无邮箱)', checkout2.status === 200 && !!checkout2.body?.downloadUrl, `url=${checkout2.body?.downloadUrl ? 'ok' : 'missing'}`);
}

// ══════════════════════════════════════════════════════════════
//  U05 — 下载恢复
// ══════════════════════════════════════════════════════════════
async function runU05_DownloadRecovery() {
  console.log('\n--- U05 用户: 下载恢复 ---');
  const uid = 5;

  const recover = await request('POST', '/api/recover-download', { email: 'free@test.com' });
  log(uid, '邮箱找回下载链接', recover.status === 200, `found=${recover.body?.downloads?.length || recover.body?.orders?.length || 0}`);
}

// ══════════════════════════════════════════════════════════════
//  U06 — 导入导出
// ══════════════════════════════════════════════════════════════
async function runU06_ImportExport(token) {
  console.log('\n--- U06 管理员: 导入导出 ---');
  const uid = 6;

  const exported = await request('GET', '/api/products/export', null, token);
  log(uid, '导出产品数据', exported.status === 200 && !!exported.body?._meta, `total=${exported.body?.products?.length}`);

  const importData = {
    _meta: { version: '2.0', exportedAt: new Date().toISOString(), source: 'test' },
    products: [{
      title: { en: 'Imported Book', zh: '导入的书籍' },
      desc: { en: 'A book from import' },
      price: 7.99, format: 'PDF', locales: ['en', 'zh'], bookLang: 'en',
      downloads: { en: [{ url: 'https://example.com/imported.pdf', label: 'PDF' }] }
    }],
    categories: [{ name: { en: 'Imported Category' } }],
    tags: [{ name: 'ImportedTag' }]
  };

  const preview = await request('POST', '/api/products/import-preview', importData, token);
  log(uid, '导入预览', preview.status === 200, `new=${preview.body?.newCount} existing=${preview.body?.existingCount}`);

  const imported = await request('POST', '/api/products/import', { ...importData, mode: 'merge' }, token);
  log(uid, '导入执行(merge)', imported.status === 200, `added=${imported.body?.added} updated=${imported.body?.updated}`);

  const afterImport = await request('GET', '/api/products');
  log(uid, '导入后产品增加', afterImport.body.length >= 6, `count=${afterImport.body.length}`);

  // overwrite 模式
  const overwriteImport = await request('POST', '/api/products/import', { ...importData, mode: 'overwrite' }, token);
  log(uid, '导入执行(overwrite)', overwriteImport.status === 200, `added=${overwriteImport.body?.added} updated=${overwriteImport.body?.updated}`);

  // skip 模式
  const skipImport = await request('POST', '/api/products/import', { ...importData, mode: 'skip' }, token);
  log(uid, '导入执行(skip)', skipImport.status === 200, `added=${skipImport.body?.added} skipped=${skipImport.body?.skipped}`);
}

// ══════════════════════════════════════════════════════════════
//  U07 — API Key + V1
// ══════════════════════════════════════════════════════════════
async function runU07_ApiKeyAndV1(token) {
  console.log('\n--- U07 开发者: API Key + V1 ---');
  const uid = 7;

  const key = await request('POST', '/api/config/keys', { name: 'Test Key', description: 'For testing' }, token);
  const apiKey = key.body?.key?.key;
  log(uid, '创建API Key', !!apiKey, `key=${apiKey ? apiKey.substring(0,8) + '...' : 'missing'}`);

  if (apiKey) {
    const v1prods = await requestV1('GET', '/api/v1/products', null, apiKey);
    log(uid, 'V1 API 调用', v1prods.status === 200, `products=${Array.isArray(v1prods.body) ? v1prods.body.length : 'N/A'}`);

    // V1 单产品
    if (Array.isArray(v1prods.body) && v1prods.body.length > 0) {
      const v1p = await requestV1('GET', '/api/v1/products/' + v1prods.body[0].id, null, apiKey);
      log(uid, 'V1 单产品详情', v1p.status === 200, `title=${v1p.body?.title?.en || 'N/A'}`);
    }

    const del = await request('DELETE', `/api/config/keys/${key.body.key.id}`, null, token);
    log(uid, '删除API Key', del.body?.success);

    // 删除后V1应拒绝
    const v1after = await requestV1('GET', '/api/v1/products', null, apiKey);
    log(uid, '删除Key后V1拒绝', v1after.status === 401, `status=${v1after.status}`);
  }
}

// ══════════════════════════════════════════════════════════════
//  U08 — 分类/标签/产品编辑
// ══════════════════════════════════════════════════════════════
async function runU08_Edits(token, seed) {
  console.log('\n--- U08 管理员: 分类标签产品编辑 ---');
  const uid = 8;

  const cat = seed.cats[0];
  const updatedCat = await request('PUT', `/api/config/categories/${cat.id}`, {
    ...cat, name: { en: 'Programming & Coding', zh: '编程与代码', es: 'Programación y Código' }
  }, token);
  log(uid, '更新分类名称', updatedCat.body?.success, `name=${updatedCat.body?.category?.name?.en}`);

  const tags = await request('GET', '/api/config/tags');
  log(uid, '获取标签列表', tags.body?.length >= 2, `count=${tags.body?.length}`);

  if (tags.body?.length > 0) {
    const delTag = await request('DELETE', `/api/config/tags/${tags.body[0].id}`, null, token);
    log(uid, '删除标签', delTag.body?.success);
  }

  const p = seed.products[4];
  const archived = await request('PUT', `/api/products/${p.id}`, { status: 'archived' }, token);
  log(uid, '归档产品', archived.body?.success, `status=${archived.body?.product?.status}`);

  const prods = await request('GET', '/api/products');
  const stillActive = prods.body.find(pp => pp.id === p.id);
  log(uid, '归档产品不在列表中', !stillActive);
}

// ══════════════════════════════════════════════════════════════
//  U09 — 站点配置 + Dashboard + 短链接
// ══════════════════════════════════════════════════════════════
async function runU09_ConfigDashboard(token) {
  console.log('\n--- U09 管理员: 站点配置+Dashboard+短链接 ---');
  const uid = 9;

  const config = await request('PUT', '/api/config/site', {
    siteName: 'Test Store',
    siteDescription: 'A test store for comprehensive testing',
    heroTagline: 'Quality Ebooks',
    faq: { enabled: true, items: [
      { q: { en: 'How to download?', zh: '如何下载？' }, a: { en: 'Click the buy button', zh: '点击购买按钮' } }
    ]},
    refundPolicy: { enabled: true, text: 'Full refund within 7 days' },
    paymentMode: 'stripe'
  }, token);
  log(uid, '更新站点配置', config.body?.success, `name=${config.body?.data?.siteName}`);

  const site = await request('GET', '/api/config/site');
  log(uid, '配置已生效', site.body.siteName === 'Test Store', `name=${site.body.siteName}`);
  log(uid, 'FAQ已配置', site.body.faq?.enabled && site.body.faq?.items?.length > 0, `items=${site.body.faq?.items?.length}`);
  log(uid, '退款政策已配置', site.body.refundPolicy?.enabled, `text=${site.body.refundPolicy?.text ? 'ok' : 'missing'}`);

  const dash = await request('GET', '/api/dashboard', null, token);
  log(uid, 'Dashboard统计', dash.status === 200 && !!dash.body?.overview, `products=${dash.body?.overview?.totalProducts} orders=${dash.body?.overview?.totalOrders}`);

  const sl = await request('POST', '/api/short-links', { slug: 'python', url: 'https://example.com/books/python', description: 'Python book' }, token);
  log(uid, '创建短链接', sl.body?.success, `slug=${sl.body?.link?.slug}`);

  const slVisit = await request('GET', '/s/python');
  log(uid, '短链接可访问', slVisit.status === 302, `status=${slVisit.status}`);
}

// ══════════════════════════════════════════════════════════════
//  U10 — 数据一致性 + 认证
// ══════════════════════════════════════════════════════════════
async function runU10_Consistency(token) {
  console.log('\n--- U10 验证: 数据一致性+认证 ---');
  const uid = 10;

  const badLogin = await request('POST', '/api/login', { password: 'wrong_password' });
  log(uid, '错误密码拒绝', badLogin.status === 401);

  const noToken = await request('GET', '/api/dashboard');
  log(uid, '无token拒绝访问', noToken.status === 401);

  const prods = await request('GET', '/api/products');
  const activeProds = prods.body.filter(p => p.status !== 'archived');
  log(uid, '产品数据完整', activeProds.length >= 5, `active=${activeProds.length}`);

  const allHaveLocales = activeProds.every(p => Array.isArray(p.locales) && p.locales.length > 0);
  log(uid, '所有产品有locales', allHaveLocales);

  const paidProds = activeProds.filter(p => Number(p.price) > 0);
  const paidHaveDownloads = paidProds.every(p => p.downloads && Object.keys(p.downloads).length > 0);
  log(uid, '付费产品有downloads', paidHaveDownloads, `paid=${paidProds.length}`);

  const cats = await request('GET', '/api/config/categories');
  const catsHaveI18n = cats.body.every(c => c.name && typeof c.name === 'object');
  log(uid, '分类有i18n名称', catsHaveI18n, `cats=${cats.body.length}`);

  // 订单存在
  const orders = await request('GET', '/api/orders', null, token);
  log(uid, '订单数据存在', Array.isArray(orders.body) && orders.body.length > 0, `orders=${orders.body?.length}`);

  const enI18n = await request('GET', '/api/i18n?lang=en');
  const zhI18n = await request('GET', '/api/i18n?lang=zh');
  log(uid, '英文i18n有内容', Object.keys(enI18n.body?.t || {}).length > 0);
  log(uid, '中文i18n有内容', Object.keys(zhI18n.body?.t || {}).length > 0);
}

// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   AEOX Store Lite — 10用户多维度测试（清空数据）      ║');
  console.log('║   覆盖: 管理初始化/浏览/购买/下载/恢复/导入导出/     ║');
  console.log('║   API Key/分类标签/配置/一致性/认证                    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('--- 初始化 ---');
  await resetPassword();
  const token = await login();
  log(0, '管理员登录', !!token, 'token=ok');

  const seed = await runU01_AdminSetup(token);
  await delay(300);

  await runU02_VisitorBrowse(seed);
  await delay(300);

  await runU03_PaidCheckout(seed, token);
  await delay(300);

  await runU04_FreeCheckout(seed);
  await delay(300);

  await runU05_DownloadRecovery();
  await delay(300);

  await runU06_ImportExport(token);
  await delay(300);

  await runU07_ApiKeyAndV1(token);
  await delay(300);

  await runU08_Edits(token, seed);
  await delay(300);

  await runU09_ConfigDashboard(token);
  await delay(300);

  await runU10_Consistency(token);

  console.log('\n' + '█'.repeat(60));
  console.log('  AEOX Store Lite — 10用户多维度测试汇总');
  console.log('█'.repeat(60));
  console.log(`\n  总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}\n`);
  if (failures.length > 0) {
    console.log('  失败项:');
    failures.forEach(f => console.log(`    ✗ FAIL ${f}`));
  } else {
    console.log('  ✓ 全部通过！');
  }
  console.log('');

  await request('PUT', '/api/config/site', { siteName: 'AEOX Store', siteDescription: 'Curated digital reads, instant delivery.' }, token);
}

main().catch(e => { console.error('测试异常:', e.message); process.exit(1); });
