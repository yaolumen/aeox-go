const http = require('http');

const BASE = 'http://localhost:3000';
const ADMIN_PWD = process.env.ADMIN_PASSWORD || 'testpwd123';
const READ_ONLY_KEY = 'aeox_f8c5bf8084a8f892785985edea9dad1f7328524e1b9b8c81c13d3f8cefaab935';

let passed = 0;
let failed = 0;
const results = [];

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
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

function log(user, name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;
  const msg = `[${status}] User${user} ${name} ${detail || ''}`;
  results.push(msg);
  console.log(msg);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function resetPassword() {
  console.log('--- 初始化：重置管理员密码 ---');
  const fssync = require('fs');
  const path = require('path');
  const bcrypt = require('bcryptjs');
  const dataDir = path.join(__dirname, 'data');
  const hashFile = path.join(dataDir, 'admin-password.json');
  const hash = await bcrypt.hash(ADMIN_PWD, 10);
  fssync.writeFileSync(hashFile, JSON.stringify({
    hash,
    source: 'default',
    initialPassword: ADMIN_PWD,
    createdAt: new Date().toISOString()
  }, null, 2));
  console.log(`  密码已重置为: ${ADMIN_PWD}`);
  await delay(500);
}

let sharedToken = null;

async function runUser(userId) {
  try {
    // 1. 登录
    const login = await request('POST', '/api/login', { password: ADMIN_PWD });
    const loginOk = login.status === 200 && login.body.success;
    log(userId, '登录', loginOk, `status=${login.status}`);
    const token = login.body.token || '';
    const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
    if (token && !sharedToken) sharedToken = token;

    // 2. 获取站点配置
    const siteConfig = await request('GET', '/api/config/site');
    log(userId, '获取站点配置', siteConfig.status === 200 && siteConfig.body.siteName, `siteName=${siteConfig.body.siteName}`);

    // 3. 浏览商品列表
    const products = await request('GET', '/api/products');
    log(userId, '浏览商品列表', Array.isArray(products.body) && products.body.length > 0, `count=${products.body.length}`);
    const activeProducts = (products.body || []).filter(p => p.status !== 'archived');

    // 4. 浏览分类
    const categories = await request('GET', '/api/config/categories');
    log(userId, '浏览分类', Array.isArray(categories.body), `count=${categories.body.length}`);

    // 5. 浏览标签
    const tags = await request('GET', '/api/config/tags');
    log(userId, '浏览标签', Array.isArray(tags.body), `count=${tags.body.length}`);

    // 6. 免费商品下载校验
    const freeProduct = activeProducts.find(p => Number(p.price) === 0);
    if (freeProduct) {
      const verifyFree = await request('POST', '/api/verify-download', { shortId: freeProduct.shortId });
      log(userId, '免费商品下载校验', verifyFree.body.authorized === true && verifyFree.body.free === true, `product=${freeProduct.shortId}`);
    } else {
      log(userId, '免费商品下载校验', false, '无免费商品');
    }

    // 7. 付费商品下载校验（无 token）
    const paidProduct = activeProducts.find(p => Number(p.price) > 0);
    if (paidProduct) {
      const verifyPaid = await request('POST', '/api/verify-download', { shortId: paidProduct.shortId });
      log(userId, '付费商品无token下载', verifyPaid.body.authorized === false, `product=${paidProduct.shortId} reason=${verifyPaid.body.reason}`);
    }

    // 8. Checkout 免费商品
    if (freeProduct) {
      const checkout = await request('POST', `/api/checkout/${freeProduct.shortId}`);
      log(userId, 'Checkout免费商品', checkout.body.free === true, `shortId=${freeProduct.shortId}`);
    }

    // 9. Checkout 付费商品（无 Stripe link）
    const noStripeProduct = activeProducts.find(p => Number(p.price) > 0 && !p.stripeLink);
    if (noStripeProduct) {
      const checkout = await request('POST', `/api/checkout/${noStripeProduct.shortId}`);
      log(userId, 'Checkout无Stripe商品', checkout.status === 400, `status=${checkout.status}`);
    }

    // 10. Dashboard（公开接口）
    const dashboard = await request('GET', '/api/dashboard');
    log(userId, 'Dashboard数据', dashboard.status === 200 && dashboard.body.overview, `status=${dashboard.status}`);

    // 11. SEO
    const sitemap = await request('GET', '/sitemap.xml');
    log(userId, 'Sitemap', sitemap.status === 200, `status=${sitemap.status}`);

    const robots = await request('GET', '/robots.txt');
    log(userId, 'Robots.txt', robots.status === 200, `status=${robots.status}`);

    const llms = await request('GET', '/llms.txt');
    log(userId, 'LLMs.txt', llms.status === 200, `status=${llms.status}`);

    // 12. 会话状态
    if (token) {
      const sessionStatus = await request('GET', '/api/auth/status', null, authHeader);
      log(userId, '会话状态', sessionStatus.status === 200 && sessionStatus.body.valid === true, `valid=${sessionStatus.body.valid}`);
    }

    // 13. API v1 健康检查
    const health = await request('GET', '/api/v1/health');
    log(userId, 'API健康检查', health.body.status === 'ok', `status=${health.body.status}`);

    // 14. API v1 无 Key 访问
    const noKey = await request('GET', '/api/v1/products');
    log(userId, 'API无Key访问', noKey.status === 401, `status=${noKey.status}`);

    // 15. API v1 读取商品
    const apiProducts = await request('GET', '/api/v1/products', null, { 'x-api-key': READ_ONLY_KEY });
    log(userId, 'API读取商品', apiProducts.status === 200, `count=${Array.isArray(apiProducts.body) ? apiProducts.body.length : 0}`);

    // 16. API v1 只读 Key 写保护
    const apiWrite = await request('POST', '/api/v1/products', { title: 'hack' }, { 'x-api-key': READ_ONLY_KEY });
    log(userId, 'API只读Key写保护', apiWrite.status === 403, `status=${apiWrite.status}`);

    // 17. PV 统计
    if (activeProducts.length > 0) {
      const pvTrack = await request('POST', '/api/track/pv', { productId: activeProducts[0].id });
      log(userId, 'PV统计', pvTrack.body.ok === true, `ok=${pvTrack.body.ok}`);
    }

    // 18. 无效 Token 访问受保护接口（GET /api/config/keys 需要 adminSession）
    const badToken = await request('GET', '/api/config/keys', null, { Authorization: 'Bearer invalidtoken' });
    log(userId, '无效Token拒绝', badToken.status === 401, `status=${badToken.status}`);

    // 19. admin 入口无密钥
    const adminNoKey = await request('GET', '/admin.html');
    log(userId, 'Admin无密钥访问', adminNoKey.status === 404, `status=${adminNoKey.status}`);

  } catch (e) {
    log(userId, '异常', false, e.message);
  }
}

async function runRateLimitTest() {
  console.log('\n--- 速率限制测试（最后一个用户执行） ---');
  // 等速率限制窗口重置
  await delay(62000);
  for (let i = 0; i < 6; i++) {
    const r = await request('POST', '/api/login', { password: 'wrongpwd' });
    if (i === 5) {
      log(6, '登录速率限制', r.status === 429, `status=${r.status} (6th wrong attempt)`);
    }
  }
}

async function runConcurrencyTest() {
  console.log('\n--- 并发写入测试：3 用户同时创建分类 ---');
  if (!sharedToken) {
    log(0, '并发分类创建', false, '无可用 token');
    return;
  }
  const authHeader = { Authorization: `Bearer ${sharedToken}` };

  const promises = [];
  for (let i = 1; i <= 3; i++) {
    promises.push(request('POST', '/api/config/categories', { name: `并发分类${i}` }, authHeader));
  }
  const res = await Promise.all(promises);
  let successCount = 0;
  res.forEach((r, i) => {
    if (r.status === 200 && r.body.success) successCount++;
    console.log(`  并发分类${i}: status=${r.status} success=${r.body.success}`);
  });
  log(0, '并发分类创建', successCount === 3, `${successCount}/3 成功`);

  // 清理
  const cats = await request('GET', '/api/config/categories');
  const testCats = (cats.body || []).filter(c => c.name && c.name.zh && c.name.zh.startsWith('并发分类'));
  for (const c of testCats) {
    await request('DELETE', `/api/config/categories/${c.id}`, null, authHeader);
  }
}

async function main() {
  console.log('AEOX Store 5 用户模拟测试');
  console.log('========================\n');

  await resetPassword();

  for (let i = 1; i <= 5; i++) {
    console.log(`\n--- User${i} ---`);
    await runUser(i);
    if (i < 5) await delay(2000);
  }

  await runRateLimitTest();
  await runConcurrencyTest();

  console.log('\n========================');
  console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
  if (failed > 0) {
    console.log('\n失败项:');
    results.filter(r => r.includes('FAIL')).forEach(r => console.log('  ' + r));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试脚本异常:', e);
  process.exit(1);
});
