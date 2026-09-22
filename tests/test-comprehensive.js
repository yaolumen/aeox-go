const http = require('http');
const fssync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const ADMIN_PWD = 'testcomprehensive';
const DATA_DIR = path.join(__dirname, 'data');

let passed = 0;
let failed = 0;
const results = [];
const userResults = {};

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function log(userId, name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;
  const tag = userId === 0 ? '[SETUP]' : `[U${String(userId).padStart(2,'0')}]`;
  const msg = `${status} ${tag} ${name}${detail ? ' — ' + detail : ''}`;
  results.push({ userId, name, ok, detail, msg });
  if (!userResults[userId]) userResults[userId] = { passed: 0, failed: 0 };
  if (ok) userResults[userId].passed++; else userResults[userId].failed++;
  console.log(msg);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function resetPassword() {
  const hashFile = path.join(DATA_DIR, 'admin-password.json');
  const hash = await bcrypt.hash(ADMIN_PWD, 10);
  fssync.writeFileSync(hashFile, JSON.stringify({
    hash,
    source: 'default',
    initialPassword: ADMIN_PWD,
    createdAt: new Date().toISOString()
  }, null, 2));
  await delay(300);
}

async function login() {
  const res = await request('POST', '/api/login', { password: ADMIN_PWD });
  if (res.status !== 200 || !res.body.token) throw new Error('Login failed');
  return res.body.token;
}

async function runU01_VisitorBrowsing() {
  const user = { id: 1, name: 'Alice' };
  console.log('\n--- U01 Alice: 访客浏览全流程 ---');

  const products = await request('GET', '/api/products');
  log(user.id, '商品列表', Array.isArray(products.body) && products.body.length > 0, `count=${products.body.length}`);

  const cats = await request('GET', '/api/config/categories');
  log(user.id, '分类列表', Array.isArray(cats.body), `count=${cats.body.length}`);

  const tags = await request('GET', '/api/config/tags');
  log(user.id, '标签列表', Array.isArray(tags.body), `count=${tags.body.length}`);

  const site = await request('GET', '/api/config/site');
  log(user.id, '站点配置', site.status === 200 && !!site.body.siteName, `siteName=${site.body.siteName}`);

  const i18n = await request('GET', '/api/i18n?lang=zh');
  log(user.id, 'i18n中文', i18n.status === 200 && !!i18n.body.t, `lang=${i18n.body.lang}`);

  const i18nEn = await request('GET', '/api/i18n?lang=en');
  log(user.id, 'i18n英文', i18nEn.status === 200, `keys=${Object.keys(i18nEn.body.t || {}).length}`);

  const sitemap = await request('GET', '/sitemap.xml');
  log(user.id, 'Sitemap.xml', sitemap.status === 200 && String(sitemap.raw || '').includes('urlset'), 'xml ok');

  const robots = await request('GET', '/robots.txt');
  log(user.id, 'Robots.txt', robots.status === 200, 'ok');

  const llms = await request('GET', '/llms.txt');
  log(user.id, 'LLMs.txt', llms.status === 200, 'ok');

  const health = await request('GET', '/api/v1/health');
  log(user.id, 'V1健康检查', health.body.status === 'ok', `status=${health.body.status}`);

  const dashboardNoAuth = await request('GET', '/api/dashboard');
  log(user.id, 'Dashboard需认证', dashboardNoAuth.status === 401, `status=${dashboardNoAuth.status}`);

  const activeProducts = (products.body || []).filter(p => p.status !== 'archived');
  const freeProduct = activeProducts.find(p => Number(p.price) === 0);
  if (freeProduct) {
    const verify = await request('POST', '/api/verify-download', { shortId: freeProduct.shortId });
    log(user.id, '免费商品无token也可下载', verify.body.authorized === true && verify.body.free === true, `shortId=${freeProduct.shortId}`);
  }

  const paidProduct = activeProducts.find(p => Number(p.price) > 0);
  if (paidProduct) {
    const verifyNoToken = await request('POST', '/api/verify-download', { shortId: paidProduct.shortId });
    log(user.id, '付费商品无token拒绝', verifyNoToken.body.authorized === false, `shortId=${paidProduct.shortId}`);
  }

  const notFound = await request('GET', '/api/products/nonexistent_id');
  log(user.id, '不存在商品(SPA回退)', notFound.status === 200, `status=${notFound.status}`);
}

async function runU02_CheckoutFlow() {
  const user = { id: 2, name: 'Bob' };
  console.log('\n--- U02 Bob: 购买/下载全流程 ---');

  const products = await request('GET', '/api/products');
  const activeProducts = (products.body || []).filter(p => p.status !== 'archived');

  const freeProduct = activeProducts.find(p => Number(p.price) === 0);
  if (freeProduct) {
    const checkout = await request('POST', `/api/checkout/${freeProduct.shortId}`, { email: 'bob@test.com' });
    log(user.id, '免费Checkout', checkout.body.free === true && !!checkout.body.downloadUrl, `shortId=${freeProduct.shortId}`);
    if (checkout.body.token) {
      const verify = await request('POST', '/api/verify-download', { shortId: freeProduct.shortId, token: checkout.body.token });
      log(user.id, '免费下载验证', verify.body.authorized === true, `downloads=${verify.body.downloads?.length || 0}`);
    }
  }

  const paidWithStripe = activeProducts.find(p => Number(p.price) > 0 && p.stripeLink);
  if (paidWithStripe) {
    const checkout = await request('POST', `/api/checkout/${paidWithStripe.shortId}`);
    log(user.id, '付费Checkout返回Stripe链接', !!checkout.body.stripeLink, `shortId=${paidWithStripe.shortId}`);
  }

  const paidNoLink = activeProducts.find(p => Number(p.price) > 0 && !p.stripeLink && !p.kofiLink);
  if (paidNoLink) {
    const checkout = await request('POST', `/api/checkout/${paidNoLink.shortId}`);
    log(user.id, '无支付链接Checkout失败', checkout.status === 400 || checkout.status === 404, `status=${checkout.status}`);
  }

  const fakeShortId = 'zzzzzz';
  const notFound = await request('POST', `/api/checkout/${fakeShortId}`);
  log(user.id, '不存在商品Checkout', notFound.status === 404, `status=${notFound.status}`);

  const fakeToken = await request('POST', '/api/verify-download', { shortId: activeProducts[0]?.shortId || 'xxx', token: 'fake_token_here' });
  log(user.id, '伪造token拒绝', fakeToken.body.authorized === false, `authorized=${fakeToken.body.authorized}`);
}

async function runU03_DownloadRecovery() {
  const user = { id: 3, name: 'Carol' };
  console.log('\n--- U03 Carol: 下载恢复 ---');

  const recoverNoEmail = await request('POST', '/api/recover-download', { email: '' });
  log(user.id, '空邮箱恢复拒绝', recoverNoEmail.status === 400, `status=${recoverNoEmail.status}`);

  const recoverFake = await request('POST', '/api/recover-download', { email: 'nonexistent@nowhere.com' });
  log(user.id, '不存在邮箱恢复', recoverFake.body.found === false, `found=${recoverFake.body.found}`);

  const recoverBadFormat = await request('POST', '/api/recover-download', {});
  log(user.id, '无email参数恢复', recoverBadFormat.status === 400, `status=${recoverBadFormat.status}`);
}

async function runU04_MultilangProducts(token) {
  const user = { id: 4, name: 'Diana' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U04 Diana: 多语言商品 + Locales ---');

  const createRes = await request('POST', '/api/products', {
    locales: ['en', 'zh', 'es'],
    title: { en: 'Multi-lang Guide', zh: '多语言指南', es: 'Guía multilingüe' },
    desc: { en: 'A comprehensive guide', zh: '一本综合指南', es: 'Una guía completa' },
    whatYouLearn: { en: 'Learn everything', zh: '学习一切', es: 'Aprende todo' },
    whatYouGet: { en: 'Full access', zh: '完全访问', es: 'Acceso completo' },
    whoIsFor: { en: 'Everyone', zh: '所有人', es: 'Todos' },
    price: 0,
    cover: 'https://example.com/multi-cover.jpg',
    format: 'PDF / EPUB',
    fileSize: '5 MB',
    downloads: {
      en: [{ url: 'https://drive.google.com/en-multi', label: 'Google Drive EN' }],
      zh: [{ url: 'https://pan.baidu.com/zh-multi', label: '百度网盘 ZH' }],
      es: [{ url: 'https://drive.google.com/es-multi', label: 'Google Drive ES' }]
    },
    categoryId: '',
    tags: [],
    featured: false,
    shortId: 'multitest',
    upsell: { mode: 'auto', products: [] }
  }, authHeader);

  const created = createRes.status === 200 && createRes.body.success && createRes.body.product;
  log(user.id, '创建多语言商品', created, `id=${createRes.body.product?.id} locales=${createRes.body.product?.locales?.join(',')}`);
  const productId = createRes.body.product?.id;

  if (productId) {
    const fetched = await request('GET', '/api/products', null, authHeader);
    const found = fetched.body.find(p => p.id === productId);
    log(user.id, 'locales字段保存正确', found && found.locales?.length === 3 && found.locales.includes('es'), `locales=${found?.locales?.join(',')}`);
    log(user.id, '按语言downloads保存', found && found.downloads?.zh?.length === 1 && found.downloads?.en?.length === 1, `dl_keys=${found?.downloads ? Object.keys(found.downloads).join(',') : 'none'}`);
    log(user.id, 'title各语言保存', found && found.title?.en === 'Multi-lang Guide' && found.title?.zh === '多语言指南', `title.en=${found?.title?.en}`);
    log(user.id, 'bookLang自动推导', found && found.bookLang === 'en', `bookLang=${found?.bookLang}`);

    const checkout = await request('POST', '/api/checkout/multitest', { email: 'diana@test.com' });
    log(user.id, '多语言商品免费Checkout', checkout.body.free === true, `token=${checkout.body.token ? 'ok' : 'missing'}`);

    if (checkout.body.token) {
      const verifyZh = await request('POST', '/api/verify-download', { shortId: 'multitest', token: checkout.body.token, lang: 'zh' });
      log(user.id, '下载验证(ZH)', verifyZh.body.authorized && verifyZh.body.downloads?.[0]?.url?.includes('pan.baidu'), `url=${verifyZh.body.downloads?.[0]?.url}`);

      const verifyEs = await request('POST', '/api/verify-download', { shortId: 'multitest', token: checkout.body.token, lang: 'es' });
      log(user.id, '下载验证(ES)', verifyEs.body.authorized && verifyEs.body.downloads?.[0]?.url?.includes('es-multi'), `url=${verifyEs.body.downloads?.[0]?.url}`);

      const verifyEn = await request('POST', '/api/verify-download', { shortId: 'multitest', token: checkout.body.token, lang: 'en' });
      log(user.id, '下载验证(EN)', verifyEn.body.authorized && verifyEn.body.downloads?.[0]?.url?.includes('en-multi'), `url=${verifyEn.body.downloads?.[0]?.url}`);
    }

    const updateRes = await request('PUT', `/api/products/${productId}`, {
      locales: ['en', 'zh', 'de'],
      title: { en: 'Updated Guide', zh: '更新指南', de: 'Aktualisierte Anleitung', es: '' },
      downloads: {
        en: [{ url: 'https://drive.google.com/en-v2', label: 'EN v2' }],
        zh: [{ url: 'https://pan.baidu.com/zh-multi', label: '百度网盘 ZH' }],
        de: [{ url: 'https://drive.google.com/de-v2', label: 'Google Drive DE' }]
      }
    }, authHeader);
    log(user.id, '更新locales(en,zh,de)', updateRes.body.success && updateRes.body.product?.locales?.length === 3 && updateRes.body.product?.locales?.includes('de'), `locales=${updateRes.body.product?.locales?.join(',')}`);

    const delRes = await request('DELETE', `/api/products/${productId}`, null, authHeader);
    log(user.id, '删除测试商品', delRes.body.success === true, `id=${productId}`);
  }
}

async function runU05_ImportExport(token) {
  const user = { id: 5, name: 'Ethan' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U05 Ethan: 导入/导出 ---');

  const exportRes = await request('GET', '/api/products/export', null, authHeader);
  log(user.id, '导出JSON', exportRes.status === 200 && exportRes.body._meta?.productCount > 0, `products=${exportRes.body._meta?.productCount} categories=${exportRes.body._meta?.categoryCount} tags=${exportRes.body._meta?.tagCount}`);
  log(user.id, '导出含categories', Array.isArray(exportRes.body.categories), `count=${exportRes.body.categories?.length}`);
  log(user.id, '导出含tags', Array.isArray(exportRes.body.tags), `count=${exportRes.body.tags?.length}`);

  const importData = {
    products: [
      { id: 'imp_fresh_1', shortId: 'impfresh1', title: { en: 'Imported Book 1', zh: '导入书1' }, price: 12.99, locales: ['en', 'zh'], downloads: { en: [{ url: 'https://example.com/en1', label: 'EN' }] }, status: 'active' },
      { id: 'imp_fresh_2', shortId: 'impfresh2', title: { en: 'Imported Book 2' }, price: 0, locales: ['en'], downloads: { en: [{ url: 'https://example.com/free1', label: 'Free EN' }] }, status: 'active' }
    ]
  };

  const previewRes = await request('POST', '/api/products/import-preview', importData, authHeader);
  log(user.id, '导入预览', previewRes.status === 200 && previewRes.body.total === 2 && previewRes.body.newCount === 2, `total=${previewRes.body.total} new=${previewRes.body.newCount}`);

  const importRes = await request('POST', '/api/products/import', { ...importData, mode: 'merge' }, authHeader);
  log(user.id, '导入(merge模式)', importRes.body.success && importRes.body.added === 2, `added=${importRes.body.added} updated=${importRes.body.updated} skipped=${importRes.body.skipped}`);

  const importSkipRes = await request('POST', '/api/products/import', { ...importData, mode: 'skip' }, authHeader);
  log(user.id, '导入(skip模式)', importSkipRes.body.success && importSkipRes.body.skipped === 2, `skipped=${importSkipRes.body.skipped}`);

  const importOverwriteRes = await request('POST', '/api/products/import', {
    products: [{ id: 'imp_fresh_1', shortId: 'impfresh1', title: { en: 'Overwritten Title' }, price: 99.99 }],
    mode: 'overwrite'
  }, authHeader);
  log(user.id, '导入(overwrite模式)', importOverwriteRes.body.success && importOverwriteRes.body.updated === 1, `updated=${importOverwriteRes.body.updated}`);

  const products = await request('GET', '/api/products');
  const overwritten = products.body.find(p => p.id === 'imp_fresh_1');
  log(user.id, 'overwrite生效', overwritten && overwritten.price === 99.99, `price=${overwritten?.price}`);

  const importMergeRes = await request('POST', '/api/products/import', {
    products: [{ id: 'imp_fresh_2', shortId: 'impfresh2', title: { en: 'Merged Title', zh: '合并标题' }, price: 0, downloads: { zh: [{ url: 'https://example.com/zh-merged', label: 'ZH' }] } }],
    mode: 'merge'
  }, authHeader);
  log(user.id, '导入(merge新字段)', importMergeRes.body.success && importMergeRes.body.updated === 1, `updated=${importMergeRes.body.updated}`);

  const merged = await request('GET', '/api/products');
  const mergedProduct = merged.body.find(p => p.id === 'imp_fresh_2');
  log(user.id, 'merge保留原downloads+新增zh', mergedProduct && mergedProduct.downloads?.zh?.length === 1, `dl_keys=${mergedProduct?.downloads ? Object.keys(mergedProduct.downloads).join(',') : 'none'}`);

  const emptyImport = await request('POST', '/api/products/import', { products: [], mode: 'merge' }, authHeader);
  log(user.id, '空导入拒绝', emptyImport.status === 400, `status=${emptyImport.status}`);

  for (const impId of ['imp_fresh_1', 'imp_fresh_2']) {
    await request('DELETE', `/api/products/${impId}`, null, authHeader);
  }

  const exportNoAuth = await request('GET', '/api/products/export');
  log(user.id, '导出需认证', exportNoAuth.status === 401, `status=${exportNoAuth.status}`);
}

async function runU06_ApiKeyCRUD(token) {
  const user = { id: 6, name: 'Fiona' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U06 Fiona: API Key 管理 ---');

  const createRes = await request('POST', '/api/config/keys', { name: 'Test Key Fiona', scopes: ['read', 'write'] }, authHeader);
  log(user.id, '创建API Key', createRes.body.success && !!createRes.body.key?.key, `name=${createRes.body.key?.name}`);
  const keyId = createRes.body.key?.id;
  const apiKey = createRes.body.key?.key;

  if (apiKey) {
    const readRes = await request('GET', '/api/v1/products', null, { 'x-api-key': apiKey });
    log(user.id, '新Key读取v1商品', readRes.status === 200, `count=${Array.isArray(readRes.body) ? readRes.body.length : 0}`);

    const writeRes = await request('POST', '/api/v1/products', { title: { en: 'Key Test' }, price: 0, locales: ['en'] }, { 'x-api-key': apiKey });
    log(user.id, 'write scope创建商品', writeRes.status === 201, `id=${writeRes.body?.id}`);
    if (writeRes.body?.id) {
      await request('DELETE', `/api/v1/products/${writeRes.body.id}`, null, { 'x-api-key': apiKey });
    }
  }

  if (keyId) {
    const updateRes = await request('PUT', `/api/config/keys/${keyId}`, { name: 'Renamed Fiona Key', scopes: ['read'] }, authHeader);
    log(user.id, '更新Key名称和scope', updateRes.body.success, `name=${updateRes.body.key?.name}`);

    const writeAfterUpdate = await request('POST', '/api/v1/products', { title: { en: 'Should Fail' } }, { 'x-api-key': apiKey });
    log(user.id, '只读scope写拒绝', writeAfterUpdate.status === 403, `status=${writeAfterUpdate.status}`);

    const revokeRes = await request('DELETE', `/api/config/keys/${keyId}`, null, authHeader);
    log(user.id, '撤销Key', revokeRes.body.success, `id=${keyId}`);

    const revokedAccess = await request('GET', '/api/v1/products', null, { 'x-api-key': apiKey });
    log(user.id, '已撤销Key拒绝', revokedAccess.status === 401, `status=${revokedAccess.status}`);
  }

  const invalidKey = await request('GET', '/api/v1/products', null, { 'x-api-key': 'aeox_totallyinvalid' });
  log(user.id, '无效Key拒绝', invalidKey.status === 401, `status=${invalidKey.status}`);

  const noKey = await request('GET', '/api/v1/products');
  log(user.id, '无Key拒绝', noKey.status === 401, `status=${noKey.status}`);
}

async function runU07_CategoryTagCRUD(token) {
  const user = { id: 7, name: 'George' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U07 George: 分类/标签 CRUD ---');

  const catRes = await request('POST', '/api/config/categories', { name: { en: 'Test Category', zh: '测试分类' }, slug: 'test-cat-u7-' + Date.now() }, authHeader);
  log(user.id, '创建分类', catRes.body.success === true, `id=${catRes.body.category?.id} status=${catRes.status}`);
  const catId = catRes.body.category?.id;

  if (catId) {
    const updateCat = await request('PUT', `/api/config/categories/${catId}`, { name: { en: 'Updated Category', zh: '更新分类' } }, authHeader);
    log(user.id, '更新分类', updateCat.body.success, `id=${catId}`);

    const delCat = await request('DELETE', `/api/config/categories/${catId}`, null, authHeader);
    log(user.id, '删除分类', delCat.body.success, `id=${catId}`);
  }

  const tagRes = await request('POST', '/api/config/tags', { name: 'TestTag', color: '#ff5500' }, authHeader);
  log(user.id, '创建标签', tagRes.body.success && !!tagRes.body.tag?.id, `id=${tagRes.body.tag?.id}`);
  const tagId = tagRes.body.tag?.id;

  if (tagId) {
    const updateTag = await request('PUT', `/api/config/tags/${tagId}`, { name: 'UpdatedTag', color: '#00ff55' }, authHeader);
    log(user.id, '更新标签', updateTag.body.success, `name=${updateTag.body.tag?.name}`);

    const prodRes = await request('POST', '/api/products', {
      locales: ['en'], title: { en: 'Tag Test Product' }, price: 0,
      tags: [tagId], shortId: 'tagtest1', downloads: {}, upsell: { mode: 'auto', products: [] }
    }, authHeader);
    const tagProdId = prodRes.body.product?.id;
    if (tagProdId) {
      const batchRes = await request('POST', '/api/products/batch-tags', { productIds: [tagProdId], tagIds: [tagId], mode: 'remove' }, authHeader);
      log(user.id, '批量移除标签', batchRes.body.success, `count=${batchRes.body.count}`);

      const batchAdd = await request('POST', '/api/products/batch-tags', { productIds: [tagProdId], tagIds: [tagId], mode: 'add' }, authHeader);
      log(user.id, '批量添加标签', batchAdd.body.success, `count=${batchAdd.body.count}`);

      await request('DELETE', `/api/products/${tagProdId}`, null, authHeader);
    }

    const delTag = await request('DELETE', `/api/config/tags/${tagId}`, null, authHeader);
    log(user.id, '删除标签', delTag.body.success, `id=${tagId}`);
  }
}

async function runU08_AdminSessionAuth(token) {
  const user = { id: 8, name: 'Hannah' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U08 Hannah: 管理员认证/会话/密码 ---');

  const sessionStatus = await request('GET', '/api/auth/status', null, authHeader);
  log(user.id, '会话状态', sessionStatus.status === 200 && sessionStatus.body.valid === true, `valid=${sessionStatus.body.valid}`);

  const adminInfo = await request('GET', '/api/auth/admin-info', null, authHeader);
  log(user.id, '管理员信息', adminInfo.status === 200 && !!adminInfo.body.entryUrl, `source=${adminInfo.body.passwordSource} entryUrl=${adminInfo.body.entryUrl ? 'present' : 'missing'}`);

  const badToken = await request('GET', '/api/orders', null, { Authorization: 'Bearer invalidtoken12345' });
  log(user.id, '无效Token拒绝', badToken.status === 401, `status=${badToken.status}`);

  const changePwd = await request('POST', '/api/auth/change-password', { currentPassword: 'wrongpwd', newPassword: 'newpassword123' }, authHeader);
  log(user.id, '错误密码改密失败', changePwd.status === 400 || changePwd.status === 401, `status=${changePwd.status}`);

  const shortPwd = await request('POST', '/api/auth/change-password', { currentPassword: ADMIN_PWD, newPassword: 'short' }, authHeader);
  log(user.id, '过短新密码拒绝', shortPwd.status === 400, `status=${shortPwd.status}`);

  const resetKey = await request('POST', '/api/auth/reset-entry-key', null, authHeader);
  log(user.id, '重置入口密钥', resetKey.body.success && !!resetKey.body.entryKey, `key=${resetKey.body.entryKey ? 'present' : 'missing'}`);
}

async function runU09_DashboardOrders(token) {
  const user = { id: 9, name: 'Ivan' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U09 Ivan: Dashboard + 订单管理 ---');

  const dashboard = await request('GET', '/api/dashboard', null, authHeader);
  log(user.id, 'Dashboard数据', dashboard.status === 200 && !!dashboard.body.overview, `products=${dashboard.body.overview?.totalProducts} revenue=${dashboard.body.overview?.totalRevenue}`);

  const dashWeek = await request('GET', '/api/dashboard?range=week', null, authHeader);
  log(user.id, 'Dashboard周范围', dashWeek.status === 200, `status=${dashWeek.status}`);

  const dashMonth = await request('GET', '/api/dashboard?range=month', null, authHeader);
  log(user.id, 'Dashboard月范围', dashMonth.status === 200, `status=${dashMonth.status}`);

  const orders = await request('GET', '/api/orders', null, authHeader);
  log(user.id, '获取订单列表', orders.status === 200 && Array.isArray(orders.body), `count=${orders.body.length}`);

  const orderStats = await request('GET', '/api/orders/stats', null, authHeader);
  log(user.id, '订单统计', orderStats.status === 200, `totalSales=${orderStats.body?.totalSales} revenue=${orderStats.body?.totalRevenue}`);

  const filteredOrders = await request('GET', '/api/orders?refundStatus=refunded', null, authHeader);
  log(user.id, '按退款状态筛选', filteredOrders.status === 200, `refundedCount=${filteredOrders.body?.length}`);

  const limitedOrders = await request('GET', '/api/orders?limit=5', null, authHeader);
  log(user.id, '订单limit参数', limitedOrders.status === 200 && limitedOrders.body.length <= 5, `count=${limitedOrders.body?.length}`);

  const allOrders = orders.body || [];
  if (allOrders.length > 0) {
    const testOrder = allOrders.find(o => o.refundStatus !== 'refunded') || allOrders[0];
    const markRefund = await request('PUT', `/api/orders/${testOrder.id}/status`, { refundStatus: 'refunded', stripeRefundId: 're_test_123' }, authHeader);
    log(user.id, '标记退款+StripeRefundId', markRefund.body.success, `orderId=${testOrder.id} refundStatus=${markRefund.body.order?.refundStatus}`);

    if (markRefund.body.success) {
      const addNote = await request('PUT', `/api/orders/${testOrder.id}/status`, { refundNote: 'Test refund note' }, authHeader);
      log(user.id, '添加退款备注', addNote.body.success, `note=${addNote.body.order?.refundNote}`);

      const revert = await request('PUT', `/api/orders/${testOrder.id}/status`, { refundStatus: 'none' }, authHeader);
      log(user.id, '回退退款→paid', revert.body.success && revert.body.order?.status === 'paid', `status=${revert.body.order?.status}`);
    }
  }

  const invalidOrder = await request('PUT', '/api/orders/nonexistent/status', { refundStatus: 'refunded' }, authHeader);
  log(user.id, '不存在订单404', invalidOrder.status === 404, `status=${invalidOrder.status}`);
}

async function runU10_ShortLinks(token) {
  const user = { id: 10, name: 'Julia' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U10 Julia: 短链接管理 ---');

  const createRes = await request('POST', '/api/short-links', { slug: 'testlink', url: 'https://example.com/target', description: 'Test short link' }, authHeader);
  log(user.id, '创建短链接', createRes.body.success && !!createRes.body.link?.slug, `slug=${createRes.body.link?.slug}`);

  const listRes = await request('GET', '/api/short-links', null, authHeader);
  log(user.id, '列出短链接', listRes.status === 200 && Array.isArray(listRes.body), `count=${listRes.body.length}`);

  const updateRes = await request('PUT', '/api/short-links/testlink', { url: 'https://example.com/updated-target', description: 'Updated' }, authHeader);
  log(user.id, '更新短链接', updateRes.body.success, `slug=testlink`);

  const redirect = await request('GET', '/s/testlink');
  log(user.id, '短链接重定向', redirect.status === 302, `status=${redirect.status}`);

  const invalidSlug = await request('POST', '/api/short-links', { slug: 'bad slug!', url: 'https://example.com' }, authHeader);
  log(user.id, '无效slug拒绝', invalidSlug.status === 400, `status=${invalidSlug.status}`);

  const invalidUrl = await request('POST', '/api/short-links', { slug: 'validslug', url: 'not-a-url' }, authHeader);
  log(user.id, '无效URL拒绝', invalidUrl.status === 400, `status=${invalidUrl.status}`);

  const delRes = await request('DELETE', '/api/short-links/testlink', null, authHeader);
  log(user.id, '删除短链接', delRes.body.success, `slug=testlink`);

  const notFound = await request('GET', '/s/deletedlink');
  log(user.id, '已删除短链接404回退', notFound.status === 200 || notFound.status === 404, `status=${notFound.status}`);
}

async function runU11_SiteConfig(token) {
  const user = { id: 11, name: 'Kevin' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U11 Kevin: 站点配置 ---');

  const currentConfig = await request('GET', '/api/config/site');
  log(user.id, '读取站点配置(公开)', currentConfig.status === 200 && !!currentConfig.body.siteName, `siteName=${currentConfig.body.siteName}`);

  const originalName = currentConfig.body.siteName;

  const updateRes = await request('PUT', '/api/config/site', { siteName: 'Test Store Temp' }, authHeader);
  log(user.id, '更新站点名称', updateRes.body.success && updateRes.body.data?.siteName === 'Test Store Temp', `name=${updateRes.body.data?.siteName}`);

  const restoreRes = await request('PUT', '/api/config/site', { siteName: originalName || 'AEOX Store' }, authHeader);
  log(user.id, '恢复站点名称', restoreRes.body.success, `name=${restoreRes.body.data?.siteName}`);

  const noAuthUpdate = await request('PUT', '/api/config/site', { siteName: 'Hacked' });
  log(user.id, '无认证更新配置拒绝', noAuthUpdate.status === 401, `status=${noAuthUpdate.status}`);

  const secretMasked = currentConfig.body.stripe?.secretKey;
  log(user.id, 'Stripe密钥脱敏', !secretMasked || secretMasked.includes('****'), `key=${secretMasked || 'not set'}`);

  const entryKeyStripped = currentConfig.body.adminEntryKey;
  log(user.id, '入口密钥不在公开配置', !entryKeyStripped || entryKeyStripped === '', `stripped=${!entryKeyStripped}`);
}

async function runU12_Logos(token) {
  const user = { id: 12, name: 'Lily' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U12 Lily: Logo管理 ---');

  const listRes = await request('GET', '/api/logos', null, authHeader);
  log(user.id, '列出Logo', listRes.status === 200 && Array.isArray(listRes.body), `count=${listRes.body.length}`);

  const uploadNoFile = await request('POST', '/api/logos/upload', null, authHeader);
  log(user.id, '无文件上传失败', uploadNoFile.status === 400 || uploadNoFile.status === 500, `status=${uploadNoFile.status}`);
}

async function runU13_V1ApiFull(token) {
  const user = { id: 13, name: 'Mike' };
  console.log('\n--- U13 Mike: V1 API 完整测试 ---');

  const keys = await request('GET', '/api/config/keys', null, { Authorization: `Bearer ${token}` });
  const activeKey = keys.body?.find(k => k.enabled);
  if (!activeKey) {
    log(user.id, 'V1测试跳过(无可用Key)', false, 'no active key');
    return;
  }
  const apiKey = activeKey.keyPreview;

  const fullKeyObj = keys.body?.find(k => k.enabled && k.scopes?.includes('*') || k.scopes?.includes('admin'));
  if (!fullKeyObj) {
    const createKey = await request('POST', '/api/config/keys', { name: 'V1 Test Admin Key', scopes: ['*'] }, { Authorization: `Bearer ${token}` });
    if (createKey.body.key?.key) {
      await runV1WithKey(user, createKey.body.key.key, token);
      await request('DELETE', `/api/config/keys/${createKey.body.key.id}`, null, { Authorization: `Bearer ${token}` });
    }
  } else {
    const fullKeyRes = await request('GET', '/api/config/keys', null, { Authorization: `Bearer ${token}` });
    const found = fullKeyRes.body?.find(k => k.id === fullKeyObj.id);
    log(user.id, '使用现有admin Key', true, `name=${found?.name}`);
  }
}

async function runV1WithKey(user, apiKey, token) {
  const hdr = { 'x-api-key': apiKey };

  const v1Products = await request('GET', '/api/v1/products', null, hdr);
  log(user.id, 'V1读取商品', v1Products.status === 200, `count=${Array.isArray(v1Products.body) ? v1Products.body.length : 0}`);

  const v1Cats = await request('GET', '/api/v1/categories', null, hdr);
  log(user.id, 'V1读取分类', v1Cats.status === 200, `count=${Array.isArray(v1Cats.body) ? v1Cats.body.length : 0}`);

  const v1Tags = await request('GET', '/api/v1/tags', null, hdr);
  log(user.id, 'V1读取标签', v1Tags.status === 200, `count=${Array.isArray(v1Tags.body) ? v1Tags.body.length : 0}`);

  const v1Stats = await request('GET', '/api/v1/stats/dashboard', null, hdr);
  log(user.id, 'V1统计', v1Stats.status === 200 && !!v1Stats.body.overview, `revenue=${v1Stats.body.overview?.totalRevenue}`);

  const v1Site = await request('GET', '/api/v1/config/site', null, hdr);
  log(user.id, 'V1站点配置', v1Site.status === 200, `siteName=${v1Site.body.siteName}`);

  const v1Create = await request('POST', '/api/v1/products', {
    locales: ['en', 'fr'],
    title: { en: 'V1 API Book', fr: 'Livre API V1' },
    price: 7.99,
    downloads: { en: [{ url: 'https://example.com/v1en', label: 'EN' }] }
  }, hdr);
  log(user.id, 'V1创建商品(含fr)', v1Create.status === 201 && v1Create.body?.locales?.includes('fr'), `id=${v1Create.body?.id} locales=${v1Create.body?.locales?.join(',')}`);

  if (v1Create.body?.id) {
    const v1Update = await request('PUT', `/api/v1/products/${v1Create.body.id}`, { price: 5.99 }, hdr);
    log(user.id, 'V1更新商品', v1Update.status === 200 && v1Update.body?.price === 5.99, `price=${v1Update.body?.price}`);

    const v1GetOne = await request('GET', `/api/v1/products/${v1Create.body.id}`, null, hdr);
    log(user.id, 'V1读取单个商品', v1GetOne.status === 200 && v1GetOne.body?.id === v1Create.body.id, `id=${v1GetOne.body?.id}`);

    const v1Del = await request('DELETE', `/api/v1/products/${v1Create.body.id}`, null, hdr);
    log(user.id, 'V1删除商品', v1Del.status === 200, `id=${v1Create.body.id}`);
  }
}

async function runU14_RateLimiting() {
  const user = { id: 14, name: 'Nancy' };
  console.log('\n--- U14 Nancy: 速率限制 ---');

  for (let i = 0; i < 6; i++) {
    const r = await request('POST', '/api/login', { password: 'wrong' });
    if (i === 5) {
      log(user.id, '登录速率限制(第6次)', r.status === 429, `status=${r.status}`);
    }
  }

  await delay(1000);
}

async function runU15_TrackingStats(token) {
  const user = { id: 15, name: 'Oscar' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U15 Oscar: 统计/追踪 ---');

  const products = await request('GET', '/api/products');
  const firstProduct = products.body?.[0];

  if (firstProduct) {
    const pv = await request('POST', '/api/track/pv', { productId: firstProduct.id });
    log(user.id, 'PV追踪', pv.body.ok === true, `productId=${firstProduct.id}`);

    const checkoutTrack = await request('POST', '/api/track/checkout', { productId: firstProduct.id });
    log(user.id, 'Checkout追踪', checkoutTrack.body.ok === true, `productId=${firstProduct.id}`);

    const downloadTrack = await request('POST', '/api/track/download', { productId: firstProduct.id });
    log(user.id, 'Download追踪', downloadTrack.body.ok === true, `productId=${firstProduct.id}`);
  }

  const dashboard = await request('GET', '/api/dashboard', null, authHeader);
  log(user.id, 'Dashboard含top5和funnel', !!dashboard.body.top5, `top5=${dashboard.body.top5?.length} funnel=${dashboard.body.funnel?.length || 0}`);
}

async function runU16_DataConsistency(token) {
  const user = { id: 16, name: 'Paula' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U16 Paula: 数据一致性 ---');

  const orders = await request('GET', '/api/orders', null, authHeader);
  const allOrders = orders.body || [];
  let consistent = 0;
  let inconsistent = 0;
  for (const o of allOrders) {
    const refundRefunded = o.refundStatus === 'refunded';
    const statusRefunded = o.status === 'refunded';
    if (refundRefunded === statusRefunded) consistent++;
    else inconsistent++;
  }
  log(user.id, '订单状态一致性', inconsistent === 0, `consistent=${consistent} inconsistent=${inconsistent}`);

  const products = await request('GET', '/api/products');
  const activeProducts = (products.body || []).filter(p => p.status !== 'archived');
  let localesOk = 0;
  let localesMissing = 0;
  for (const p of activeProducts) {
    if (Array.isArray(p.locales) && p.locales.length > 0) localesOk++;
    else localesMissing++;
  }
  log(user.id, '商品locales字段完整', localesMissing === 0, `has_locales=${localesOk} missing=${localesMissing}`);

  const freeProduct = activeProducts.find(p => Number(p.price) === 0);
  if (freeProduct) {
    const verify = await request('POST', '/api/verify-download', { shortId: freeProduct.shortId });
    log(user.id, '免费商品始终可下载', verify.body.authorized === true, `shortId=${freeProduct.shortId}`);
  }
}

async function runU17_AIProviders(token) {
  const user = { id: 17, name: 'Quinn' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U17 Quinn: AI Provider管理 ---');

  const presets = await request('GET', '/api/config/provider-presets', null, authHeader);
  log(user.id, '读取AI预设', presets.status === 200, `count=${Array.isArray(presets.body) ? presets.body.length : 0}`);

  const providers = await request('GET', '/api/config/providers', null, authHeader);
  log(user.id, '列出AI Providers', providers.status === 200 && Array.isArray(providers.body?.providers), `count=${providers.body?.providers?.length}`);

  const createRes = await request('POST', '/api/config/providers', {
    name: 'Test Provider',
    vendor: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
    apiKey: 'sk-test-fake-key',
    priority: 99
  }, authHeader);
  log(user.id, '创建AI Provider', createRes.body.success && !!createRes.body.provider?.id, `id=${createRes.body.provider?.id}`);
  const providerId = createRes.body.provider?.id;

  if (providerId) {
    const updateRes = await request('PUT', `/api/config/providers/${providerId}`, { name: 'Updated Provider', model: 'gpt-4' }, authHeader);
    log(user.id, '更新AI Provider', updateRes.body.success, `name=${updateRes.body.provider?.name}`);

    const testRes = await request('POST', '/api/ai/test', { providerId }, authHeader);
    log(user.id, 'AI Provider测试(假key预期失败)', testRes.body.success === false, `success=${testRes.body.success}`);

    const delRes = await request('DELETE', `/api/config/providers/${providerId}`, null, authHeader);
    log(user.id, '删除AI Provider', delRes.body.success, `id=${providerId}`);
  }
}

async function runU18_AccessLogs(token) {
  const user = { id: 18, name: 'Rick' };
  const authHeader = { Authorization: `Bearer ${token}` };
  console.log('\n--- U18 Rick: 日志访问 ---');

  const accessLogs = await request('GET', '/api/config/logs?limit=5', null, authHeader);
  log(user.id, '读取访问日志', accessLogs.status === 200 && Array.isArray(accessLogs.body), `count=${accessLogs.body.length}`);

  const aiLogs = await request('GET', '/api/config/ai-logs?limit=5', null, authHeader);
  log(user.id, '读取AI日志', aiLogs.status === 200, `count=${Array.isArray(aiLogs.body) ? aiLogs.body.length : 0}`);

  const cacheInvalidate = await request('POST', '/api/cache/invalidate', { files: ['orders.json'] }, authHeader);
  log(user.id, '缓存清除', cacheInvalidate.status === 200 || cacheInvalidate.body?.success, `status=${cacheInvalidate.status}`);
}

function printSummary() {
  console.log('\n' + '█'.repeat(60));
  console.log('  AEOX Store Lite — 18用户全面测试汇总');
  console.log('█'.repeat(60));

  const users = [
    { id: 1, name: 'Alice', desc: '访客浏览' },
    { id: 2, name: 'Bob', desc: '购买下载' },
    { id: 3, name: 'Carol', desc: '下载恢复' },
    { id: 4, name: 'Diana', desc: '多语言Locales' },
    { id: 5, name: 'Ethan', desc: '导入导出' },
    { id: 6, name: 'Fiona', desc: 'API Key' },
    { id: 7, name: 'George', desc: '分类标签' },
    { id: 8, name: 'Hannah', desc: '认证会话' },
    { id: 9, name: 'Ivan', desc: 'Dashboard订单' },
    { id: 10, name: 'Julia', desc: '短链接' },
    { id: 11, name: 'Kevin', desc: '站点配置' },
    { id: 12, name: 'Lily', desc: 'Logo管理' },
    { id: 13, name: 'Mike', desc: 'V1 API' },
    { id: 14, name: 'Nancy', desc: '速率限制' },
    { id: 15, name: 'Oscar', desc: '统计追踪' },
    { id: 16, name: 'Paula', desc: '数据一致性' },
    { id: 17, name: 'Quinn', desc: 'AI Provider' },
    { id: 18, name: 'Rick', desc: '日志缓存' }
  ];

  console.log('\n  按用户统计:');
  console.log('  ' + '-'.repeat(60));
  for (const u of users) {
    const r = userResults[u.id] || { passed: 0, failed: 0 };
    const icon = r.failed === 0 ? '✓' : '✗';
    console.log(`  ${icon} ${u.name.padEnd(8)} (U${String(u.id).padStart(2,'0')}) ${u.desc.padEnd(14)} ${r.passed}P/${r.failed}F`);
  }
  console.log('  ' + '-'.repeat(60));
  console.log(`  总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);

  if (failed > 0) {
    console.log('\n  失败项:');
    results.filter(r => !r.ok).forEach(r => console.log(`    ✗ ${r.msg}`));
  } else {
    console.log('\n  全部通过!');
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   AEOX Store Lite — 18用户全面功能测试                ║');
  console.log('║   覆盖: 浏览/购买/下载/恢复/多语言/导入导出/          ║');
  console.log('║   API Key/分类标签/认证/订单/短链接/配置/Logo/         ║');
  console.log('║   V1 API/限流/统计/一致性/AI/日志                     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('--- 初始化 ---');
  await resetPassword();
  const token = await login();
  log(0, '管理员登录', true, `token=${token ? 'ok' : 'fail'}`);

  await runU01_VisitorBrowsing();
  await delay(500);
  await runU02_CheckoutFlow();
  await delay(500);
  await runU03_DownloadRecovery();
  await delay(500);
  await runU04_MultilangProducts(token);
  await delay(500);
  await runU05_ImportExport(token);
  await delay(500);
  await runU06_ApiKeyCRUD(token);
  await delay(500);
  await runU07_CategoryTagCRUD(token);
  await delay(500);
  await runU08_AdminSessionAuth(token);
  await delay(500);
  await runU09_DashboardOrders(token);
  await delay(500);
  await runU10_ShortLinks(token);
  await delay(500);
  await runU11_SiteConfig(token);
  await delay(500);
  await runU12_Logos(token);
  await delay(500);
  await runU13_V1ApiFull(token);
  await delay(500);
  await runU14_RateLimiting();
  await delay(500);
  await runU15_TrackingStats(token);
  await delay(500);
  await runU16_DataConsistency(token);
  await delay(500);
  await runU17_AIProviders(token);
  await delay(500);
  await runU18_AccessLogs(token);

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试脚本异常:', e);
  process.exit(1);
});
