const http = require('http');
const fssync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const ADMIN_PWD = 'test10users';
const DATA_DIR = path.join(__dirname, 'data');
const USER_COUNT = 10;

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
  const tag = userId === 0 ? '[ADMIN]' : `[U${String(userId).padStart(2,'0')}]`;
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

const USER_PROFILES = [
  { id: 1, name: 'Alice', role: 'visitor', apiKey: null },
  { id: 2, name: 'Bob', role: 'visitor', apiKey: null },
  { id: 3, name: 'Carol', role: 'buyer', apiKey: null },
  { id: 4, name: 'Dave', role: 'buyer', apiKey: null },
  { id: 5, name: 'Eve', role: 'api_read', apiKey: 'aeox_e941082a3b04ad88ee3cc0df57f009f1af96fd0c05f174072f517509fb7973a6' },
  { id: 6, name: 'Frank', role: 'api_read', apiKey: 'aeox_f649a90927a80283fd6e782c9d2c2e0aad3757fc060eba81319345b21db19b47' },
  { id: 7, name: 'Grace', role: 'api_write', apiKey: 'aeox_a62ce5ee5bce3792b5f16f5694b0a7f15c28d2baf504e4d2157c715361350e91' },
  { id: 8, name: 'Hank', role: 'api_write', apiKey: 'aeox_915ea0c6f49bd3209ca75b18c8b4ddb82be393b4becce157212cfeffe7bc48d0' },
  { id: 9, name: 'Ivy', role: 'admin', apiKey: null },
  { id: 10, name: 'Jack', role: 'admin', apiKey: null }
];

async function runVisitor(user) {
  const products = await request('GET', '/api/products');
  log(user.id, '浏览商品列表', Array.isArray(products.body) && products.body.length > 0, `count=${products.body.length}`);

  const cats = await request('GET', '/api/config/categories');
  log(user.id, '浏览分类', Array.isArray(cats.body), `count=${cats.body.length}`);

  const tags = await request('GET', '/api/config/tags');
  log(user.id, '浏览标签', Array.isArray(tags.body), `count=${tags.body.length}`);

  const siteConfig = await request('GET', '/api/config/site');
  log(user.id, '站点配置', siteConfig.status === 200 && !!siteConfig.body.siteName, `siteName=${siteConfig.body.siteName}`);

  const activeProducts = (products.body || []).filter(p => p.status !== 'archived');
  const freeProduct = activeProducts.find(p => Number(p.price) === 0);
  const paidProduct = activeProducts.find(p => Number(p.price) > 0 && p.stripeLink);

  if (freeProduct) {
    const verify = await request('POST', '/api/verify-download', { shortId: freeProduct.shortId });
    log(user.id, '免费商品下载校验', verify.body.authorized === true && verify.body.free === true, `shortId=${freeProduct.shortId}`);

    const checkout = await request('POST', `/api/checkout/${freeProduct.shortId}`);
    log(user.id, 'Checkout免费商品', checkout.body.free === true, `shortId=${freeProduct.shortId}`);
  }

  if (paidProduct) {
    const verifyNoToken = await request('POST', '/api/verify-download', { shortId: paidProduct.shortId });
    log(user.id, '付费商品无token拒绝', verifyNoToken.body.authorized === false, `reason=${verifyNoToken.body.reason}`);

    const noStripeProduct = activeProducts.find(p => Number(p.price) > 0 && !p.stripeLink);
    if (noStripeProduct) {
      const checkoutFail = await request('POST', `/api/checkout/${noStripeProduct.shortId}`);
      log(user.id, '无Stripe链接商品Checkout', checkoutFail.status === 400, `status=${checkoutFail.status}`);
    }
  }

  const sitemap = await request('GET', '/sitemap.xml');
  log(user.id, 'Sitemap', sitemap.status === 200, `status=${sitemap.status}`);

  const robots = await request('GET', '/robots.txt');
  log(user.id, 'Robots.txt', robots.status === 200, `status=${robots.status}`);

  const llms = await request('GET', '/llms.txt');
  log(user.id, 'LLMs.txt', llms.status === 200, `status=${llms.status}`);

  const dashboard = await request('GET', '/api/dashboard');
  log(user.id, 'Dashboard无权限', dashboard.status === 401, `status=${dashboard.status}`);

  const adminNoKey = await request('GET', '/admin.html');
  log(user.id, 'Admin无密钥404', adminNoKey.status === 404, `status=${adminNoKey.status}`);
}

async function runBuyer(user) {
  await runVisitor(user);

  const products = await request('GET', '/api/products');
  const activeProducts = (products.body || []).filter(p => p.status !== 'archived');
  const paidProduct = activeProducts.find(p => Number(p.price) > 0 && p.stripeLink);

  if (paidProduct) {
    const checkout = await request('POST', `/api/checkout/${paidProduct.shortId}`);
    log(user.id, 'Checkout付费商品', checkout.status === 200 && checkout.body.stripeLink, `stripeLink=${checkout.body.stripeLink ? 'present' : 'missing'}`);
  }

  const health = await request('GET', '/api/v1/health');
  log(user.id, 'API健康检查', health.body.status === 'ok', `status=${health.body.status}`);

  const noKeyAccess = await request('GET', '/api/v1/products');
  log(user.id, 'API无Key拒绝', noKeyAccess.status === 401, `status=${noKeyAccess.status}`);
}

async function runApiReadUser(user) {
  const products = await request('GET', '/api/products');
  log(user.id, '浏览商品列表', Array.isArray(products.body), `count=${products.body.length}`);

  const apiProducts = await request('GET', '/api/v1/products', null, { 'x-api-key': user.apiKey });
  log(user.id, 'API读取商品', apiProducts.status === 200, `count=${Array.isArray(apiProducts.body) ? apiProducts.body.length : 0}`);

  const apiCats = await request('GET', '/api/v1/categories', null, { 'x-api-key': user.apiKey });
  log(user.id, 'API读取分类', apiCats.status === 200, `count=${Array.isArray(apiCats.body) ? apiCats.body.length : 0}`);

  const apiTags = await request('GET', '/api/v1/tags', null, { 'x-api-key': user.apiKey });
  log(user.id, 'API读取标签', apiTags.status === 200, `count=${Array.isArray(apiTags.body) ? apiTags.body.length : 0}`);

  const apiStats = await request('GET', '/api/v1/stats', null, { 'x-api-key': user.apiKey });
  log(user.id, 'API读取统计', apiStats.status === 200, `status=${apiStats.status}`);

  const apiWrite = await request('POST', '/api/v1/products', { title: 'hack' }, { 'x-api-key': user.apiKey });
  log(user.id, '只读Key写保护', apiWrite.status === 403, `status=${apiWrite.status}`);

  const badKey = await request('GET', '/api/v1/products', null, { 'x-api-key': 'aeox_invalidkey' });
  log(user.id, '无效Key拒绝', badKey.status === 401, `status=${badKey.status}`);

  const sitemap = await request('GET', '/sitemap.xml');
  log(user.id, 'Sitemap', sitemap.status === 200, `status=${sitemap.status}`);

  const health = await request('GET', '/api/v1/health');
  log(user.id, 'API健康检查', health.body.status === 'ok', `status=${health.body.status}`);
}

async function runApiWriteUser(user) {
  const apiProducts = await request('GET', '/api/v1/products', null, { 'x-api-key': user.apiKey });
  log(user.id, 'API读取商品', apiProducts.status === 200, `count=${Array.isArray(apiProducts.body) ? apiProducts.body.length : 0}`);

  const createRes = await request('POST', '/api/v1/products', {
    title: { en: `Book by ${user.name}`, zh: `${user.name}的书` },
    price: 5.99,
    drive: { primary: 'https://drive.google.com/test', backup: '' }
  }, { 'x-api-key': user.apiKey });
  const createdOk = createRes.status === 201 && !!createRes.body.id;
  log(user.id, 'API创建商品', createdOk, `id=${createRes.body.id || 'N/A'} status=${createRes.status}`);

  const createdId = createRes.body.id;
  if (createdId) {
    const updateRes = await request('PUT', `/api/v1/products/${createdId}`, {
      price: 3.99,
      desc: { en: 'Updated by ' + user.name, zh: '' }
    }, { 'x-api-key': user.apiKey });
    log(user.id, 'API更新商品', updateRes.status === 200 && updateRes.body.price === 3.99, `price=${updateRes.body.price}`);

    const delRes = await request('DELETE', `/api/v1/products/${createdId}`, null, { 'x-api-key': user.apiKey });
    log(user.id, 'API删除商品', delRes.status === 200 && delRes.body.success === true, `status=${delRes.status}`);
  }

  const stats = await request('GET', '/api/v1/stats', null, { 'x-api-key': user.apiKey });
  log(user.id, 'API读取统计', stats.status === 200, `status=${stats.status}`);

  const health = await request('GET', '/api/v1/health');
  log(user.id, 'API健康检查', health.body.status === 'ok', `status=${health.body.status}`);
}

async function runAdminUser(user, token) {
  const authHeader = { Authorization: `Bearer ${token}` };

  const sessionStatus = await request('GET', '/api/auth/status', null, authHeader);
  log(user.id, '会话状态', sessionStatus.status === 200 && sessionStatus.body.valid === true, `valid=${sessionStatus.body.valid}`);

  const orders = await request('GET', '/api/orders', null, authHeader);
  log(user.id, '获取订单列表', orders.status === 200 && Array.isArray(orders.body), `count=${orders.body.length}`);

  const allOrders = orders.body || [];
  const paidOrders = allOrders.filter(o => o.refundStatus !== 'refunded');
  const refundedOrders = allOrders.filter(o => o.refundStatus === 'refunded');

  let testOrderId = null;

  if (paidOrders.length > 0) {
    testOrderId = paidOrders[0].id;
  } else if (allOrders.length > 0) {
    testOrderId = allOrders[0].id;
  }

  if (testOrderId) {
    const markPending = await request('PUT', `/api/orders/${testOrderId}/status`, { refundStatus: 'none' }, authHeader);
    log(user.id, '标记订单无退款', markPending.status === 200 && markPending.body.success, `orderId=${testOrderId}`);

    const markRefunded = await request('PUT', `/api/orders/${testOrderId}/status`, { refundStatus: 'refunded', stripeRefunded: true }, authHeader);
    log(user.id, '标记订单已退款+Stripe', markRefunded.status === 200 && markRefunded.body.success, `orderId=${testOrderId} status=${markRefunded.body.order?.status} refundStatus=${markRefunded.body.order?.refundStatus} stripeRefunded=${markRefunded.body.order?.stripeRefunded}`);

    const refundedOrder = markRefunded.body.order;
    const statusSyncOk = refundedOrder && refundedOrder.status === 'refunded' && refundedOrder.refundStatus === 'refunded' && !!refundedOrder.refundedAt;
    log(user.id, '退款状态双向联动', statusSyncOk, `status=${refundedOrder?.status} refundStatus=${refundedOrder?.refundStatus} refundedAt=${refundedOrder?.refundedAt ? 'present' : 'missing'}`);

    const addNote = await request('PUT', `/api/orders/${testOrderId}/status`, { refundNote: `Processed by ${user.name}` }, authHeader);
    log(user.id, '添加退款备注', addNote.status === 200 && addNote.body.success, `note=${addNote.body.order?.refundNote}`);

    const revertNone = await request('PUT', `/api/orders/${testOrderId}/status`, { refundStatus: 'none' }, authHeader);
    const revertOk = revertNone.status === 200 && revertNone.body.order && revertNone.body.order.status === 'paid' && revertNone.body.order.refundStatus === 'none';
    log(user.id, '回退退款状态→paid', revertOk, `status=${revertNone.body.order?.status} refundStatus=${revertNone.body.order?.refundStatus}`);
  } else {
    log(user.id, '订单退款流程', false, '无可用订单');
  }

  const filteredOrders = await request('GET', '/api/orders?refundStatus=refunded', null, authHeader);
  log(user.id, '按退款状态筛选订单', filteredOrders.status === 200 && Array.isArray(filteredOrders.body), `refundedCount=${filteredOrders.body.length}`);

  const invalidStatus = await request('PUT', '/api/orders/nonexistent/status', { refundStatus: 'refunded' }, authHeader);
  log(user.id, '不存在订单返回404', invalidStatus.status === 404, `status=${invalidStatus.status}`);

  const badStatus = await request('PUT', `/api/orders/${allOrders[0]?.id || 'x'}/status`, { refundStatus: 'invalid_val' }, authHeader);
  log(user.id, '无效退款状态拒绝', badStatus.status === 400, `status=${badStatus.status}`);

  const dashboard = await request('GET', '/api/dashboard', null, authHeader);
  log(user.id, 'Dashboard数据', dashboard.status === 200 && !!dashboard.body.overview, `orders=${dashboard.body.overview?.totalOrders}`);

  const keys = await request('GET', '/api/config/keys', null, authHeader);
  log(user.id, '获取API密钥列表', keys.status === 200 && Array.isArray(keys.body), `count=${keys.body.length}`);

  const adminInfo = await request('GET', '/api/auth/admin-info', null, authHeader);
  log(user.id, '管理员信息', adminInfo.status === 200 && !!adminInfo.body.entryUrl, `source=${adminInfo.body.passwordSource}`);

  const badToken = await request('GET', '/api/orders', null, { Authorization: 'Bearer invalidtoken' });
  log(user.id, '无效Token拒绝', badToken.status === 401, `status=${badToken.status}`);

  const pvTrack = await request('POST', '/api/track/pv', { productId: 'p_meditation' });
  log(user.id, 'PV统计', pvTrack.body.ok === true, `ok=${pvTrack.body.ok}`);
}

async function runPhase1_concurrentVisitors() {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 1: 并发访客模拟 (U01-U04 同时浏览)');
  console.log('='.repeat(60));

  const visitors = USER_PROFILES.filter(u => u.role === 'visitor' || u.role === 'buyer');
  const promises = visitors.map(user => (async () => {
    try {
      if (user.role === 'buyer') await runBuyer(user);
      else await runVisitor(user);
    } catch (e) {
      log(user.id, '异常', false, e.message);
    }
  })());
  await Promise.all(promises);
}

async function runPhase2_apiUsers() {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 2: API 用户测试 (U05-U08 读写)');
  console.log('='.repeat(60));

  const readUsers = USER_PROFILES.filter(u => u.role === 'api_read');
  const writeUsers = USER_PROFILES.filter(u => u.role === 'api_write');

  for (const user of readUsers) {
    try { await runApiReadUser(user); } catch (e) { log(user.id, '异常', false, e.message); }
    await delay(200);
  }

  for (const user of writeUsers) {
    try { await runApiWriteUser(user); } catch (e) { log(user.id, '异常', false, e.message); }
    await delay(200);
  }
}

async function runPhase3_concurrentApiRead() {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 3: 并发 API 读取 (U05+U06 同时读)');
  console.log('='.repeat(60));

  const readUsers = USER_PROFILES.filter(u => u.role === 'api_read');
  const promises = readUsers.map(user => (async () => {
    try {
      const res = await request('GET', '/api/v1/products', null, { 'x-api-key': user.apiKey });
      log(user.id, '并发API读取', res.status === 200, `count=${Array.isArray(res.body) ? res.body.length : 0}`);
    } catch (e) { log(user.id, '并发API异常', false, e.message); }
  })());
  await Promise.all(promises);
}

async function runPhase4_adminOperations(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 4: 管理员操作 (U09+U10 订单/退款)');
  console.log('='.repeat(60));

  for (const user of USER_PROFILES.filter(u => u.role === 'admin')) {
    try { await runAdminUser(user, token); } catch (e) { log(user.id, '异常', false, e.message); }
    await delay(200);
  }
}

async function runPhase5_concurrentMixed(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 5: 混合并发 (10用户同时操作)');
  console.log('='.repeat(60));

  const promises = USER_PROFILES.map(user => (async () => {
    try {
      if (user.role === 'visitor') {
        const res = await request('GET', '/api/products');
        log(user.id, '并发浏览', res.status === 200, `count=${Array.isArray(res.body) ? res.body.length : 0}`);
      } else if (user.role === 'api_read' && user.apiKey) {
        const res = await request('GET', '/api/v1/products', null, { 'x-api-key': user.apiKey });
        log(user.id, '并发API读', res.status === 200, `count=${Array.isArray(res.body) ? res.body.length : 0}`);
      } else if (user.role === 'api_write' && user.apiKey) {
        const res = await request('POST', '/api/v1/products', {
          title: { en: `Concurrent ${user.name}`, zh: '' }, price: 1.99
        }, { 'x-api-key': user.apiKey });
        log(user.id, '并发API写', res.status === 201 && !!res.body.id, `id=${res.body.id || 'N/A'}`);
        if (res.body.id) {
          await request('DELETE', `/api/v1/products/${res.body.id}`, null, { 'x-api-key': user.apiKey });
        }
      } else if (user.role === 'admin') {
        const res = await request('GET', '/api/orders', null, { Authorization: `Bearer ${token}` });
        log(user.id, '并发管理员', res.status === 200, `count=${Array.isArray(res.body) ? res.body.length : 0}`);
      }
    } catch (e) { log(user.id, '并发异常', false, e.message); }
  })());
  await Promise.all(promises);
}

async function runPhase6_rateLimit() {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 6: 速率限制验证');
  console.log('='.repeat(60));

  for (let i = 0; i < 6; i++) {
    const r = await request('POST', '/api/login', { password: 'wrongpwd' });
    if (i === 5) {
      log(0, '登录速率限制(第6次)', r.status === 429, `status=${r.status}`);
    }
  }
}

async function runPhase7_dataConsistency(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 7: 数据一致性验证');
  console.log('='.repeat(60));

  const authHeader = { Authorization: `Bearer ${token}` };
  const orders = await request('GET', '/api/orders', null, authHeader);
  const allOrders = orders.body || [];

  let consistentCount = 0;
  let inconsistentCount = 0;
  for (const o of allOrders) {
    const refundRefunded = o.refundStatus === 'refunded';
    const statusRefunded = o.status === 'refunded';
    if (refundRefunded === statusRefunded) {
      consistentCount++;
    } else {
      inconsistentCount++;
      console.log(`  INCONSISTENT: ${o.id} status=${o.status} refundStatus=${o.refundStatus}`);
    }
  }
  log(0, '数据一致性检查', inconsistentCount === 0, `consistent=${consistentCount} inconsistent=${inconsistentCount}`);

  const products = await request('GET', '/api/products');
  const activeProducts = (products.body || []).filter(p => p.status !== 'archived');
  const freeProduct = activeProducts.find(p => Number(p.price) === 0);
  if (freeProduct) {
    const verify = await request('POST', '/api/verify-download', { shortId: freeProduct.shortId });
    log(0, '免费商品始终可下载', verify.body.authorized === true, `shortId=${freeProduct.shortId}`);
  }
}

function printSummary() {
  console.log('\n' + '█'.repeat(60));
  console.log('  AEOX Store Lite — 10 用户模拟测试汇总');
  console.log('█'.repeat(60));

  console.log('\n  按用户统计:');
  console.log('  ' + '-'.repeat(50));
  for (const user of USER_PROFILES) {
    const r = userResults[user.id] || { passed: 0, failed: 0 };
    const icon = r.failed === 0 ? '✓' : '✗';
    console.log(`  ${icon} ${user.name.padEnd(8)} (U${String(user.id).padStart(2,'0')}) ${user.role.padEnd(12)} ${r.passed}P/${r.failed}F`);
  }
  console.log('  ' + '-'.repeat(50));
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
  console.log('║   AEOX Store Lite — 10 用户全流程模拟测试             ║');
  console.log('║   覆盖: 浏览/购买/API读/API写/管理/退款/并发/限流    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('--- 初始化 ---');
  await resetPassword();
  const token = await login();
  log(0, '管理员登录', true, `token=${token ? 'ok' : 'fail'}`);

  await runPhase1_concurrentVisitors();
  await runPhase2_apiUsers();
  await runPhase3_concurrentApiRead();
  await runPhase4_adminOperations(token);
  await runPhase5_concurrentMixed(token);
  await runPhase6_rateLimit();
  await runPhase7_dataConsistency(token);

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试脚本异常:', e);
  process.exit(1);
});
