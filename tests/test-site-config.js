const { request, assert, summary, login } = require('./helpers');

async function main() {
  console.log('=== 站点设置测试 ===\n');

  const { token, authHeader: auth } = await login();

  console.log('\n--- 获取站点配置 ---');

  const siteConfig = await request('GET', '/api/config/site');
  assert('获取站点配置', siteConfig.status === 200, `status=${siteConfig.status}`);
  assert('包含 siteName', typeof siteConfig.body.siteName === 'string', `siteName=${siteConfig.body.siteName}`);
  assert('包含 security', typeof siteConfig.body.security === 'object', 'has security');
  assert('包含 seo', typeof siteConfig.body.seo === 'object', 'has seo');
  assert('包含 stripe', typeof siteConfig.body.stripe === 'object', 'has stripe');
  assert('adminEntryKey 已掩码', siteConfig.body.security?.adminEntryKey === '', `entryKey=${siteConfig.body.security?.adminEntryKey}`);
  assert('Stripe key 已掩码', !siteConfig.body.stripe?.secretKey || siteConfig.body.stripe.secretKey.includes('****'), `key=${siteConfig.body.stripe?.secretKey}`);

  console.log('\n--- 更新站点配置 ---');

  const updateRes = await request('PUT', '/api/config/site', {
    siteName: 'Test Store',
    siteDescription: 'Test Description',
    keywords: 'test, ebook',
    footerCopyright: '© 2026 Test',
    security: { sessionTimeout: 120 },
    seo: { blockAI: false }
  }, auth);
  assert('更新站点配置', updateRes.status === 200 && updateRes.body.success, `status=${updateRes.status}`);
  assert('siteName 已更新', updateRes.body.data?.siteName === 'Test Store', `name=${updateRes.body.data?.siteName}`);

  const verifyUpdate = await request('GET', '/api/config/site');
  assert('验证更新: siteName', verifyUpdate.body.siteName === 'Test Store', `name=${verifyUpdate.body.siteName}`);
  assert('验证更新: sessionTimeout', verifyUpdate.body.security?.sessionTimeout === 120, `timeout=${verifyUpdate.body.security?.sessionTimeout}`);

  console.log('\n--- Stripe 密钥保留 ---');

  const stripeUpdate = await request('PUT', '/api/config/site', {
    stripe: { secretKey: 'rk_test_1234567890abcdefghijklmnopqrstuvwxyz' }
  }, auth);
  assert('设置 Stripe test key', stripeUpdate.status === 200, `status=${stripeUpdate.status}`);

  const maskUpdate = await request('PUT', '/api/config/site', {
    stripe: { secretKey: 'rk_test_****efgh' }
  }, auth);
  assert('掩码key不覆盖原值', maskUpdate.status === 200, `status=${maskUpdate.status}`);

  const verifyKey = await request('GET', '/api/config/site');
  const keyVal = verifyKey.body.stripe?.secretKey || '';
  assert('Stripe key 包含掩码', keyVal.includes('****'), `key=${keyVal}`);
  assert('Stripe mode=test', verifyKey.body.stripe?.mode === 'test', `mode=${verifyKey.body.stripe?.mode}`);

  console.log('\n--- 未认证更新站点配置 ---');

  const unauth = await request('PUT', '/api/config/site', { siteName: 'Hack' });
  assert('未认证更新拒绝', unauth.status === 401, `status=${unauth.status}`);

  console.log('\n--- 统计追踪 ---');

  const product = await request('POST', '/api/products', {
    title: { zh: '统计测试书', en: 'Stats Test Book' },
    price: 0
  }, auth);
  const statProduct = product.body?.product;

  if (statProduct) {
    const pvTrack = await request('POST', '/api/track/pv', { productId: statProduct.id });
    assert('PV 统计上报', pvTrack.body.ok === true, `ok=${pvTrack.body.ok}`);

    const checkoutTrack = await request('POST', '/api/track/checkout', { productId: statProduct.id });
    assert('Checkout 统计上报', checkoutTrack.body.ok === true, `ok=${checkoutTrack.body.ok}`);

    const downloadTrack = await request('POST', '/api/track/download', { productId: statProduct.id });
    assert('Download 统计上报', downloadTrack.body.ok === true, `ok=${downloadTrack.body.ok}`);

    const noId = await request('POST', '/api/track/pv', {});
    assert('无 productId 统计返回 ok=false', noId.body.ok === false, `ok=${noId.body.ok}`);
  }

  console.log('\n--- Dashboard ---');

  const dashboard = await request('GET', '/api/dashboard', null, auth);
  assert('Dashboard 返回200', dashboard.status === 200, `status=${dashboard.status}`);
  assert('Dashboard 包含 overview', typeof dashboard.body.overview === 'object', 'has overview');
  assert('overview 包含 totalProducts', typeof dashboard.body.overview.totalProducts === 'number', `total=${dashboard.body.overview.totalProducts}`);
  assert('Dashboard 包含 trend', Array.isArray(dashboard.body.trend), `trend length=${dashboard.body.trend?.length}`);
  assert('Dashboard 包含 funnel', typeof dashboard.body.funnel === 'object', 'has funnel');

  const dashboardWeek = await request('GET', '/api/dashboard?range=week', null, auth);
  assert('Dashboard range=week', dashboardWeek.status === 200, `status=${dashboardWeek.status}`);

  const dashboardToday = await request('GET', '/api/dashboard?range=today', null, auth);
  assert('Dashboard range=today', dashboardToday.status === 200, `status=${dashboardToday.status}`);

  const dashboardMonth = await request('GET', '/api/dashboard?range=month', null, auth);
  assert('Dashboard range=month', dashboardMonth.status === 200, `status=${dashboardMonth.status}`);

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
