const { request, assert, summary, login } = require('./helpers');

async function main() {
  console.log('=== 购买流程与下载令牌测试 ===\n');

  const { token, authHeader: auth } = await login();

  console.log('\n--- 准备测试商品 ---');

  const freeProd = await request('POST', '/api/products', {
    title: { zh: '免费下载测试书', en: 'Free Download Test' },
    price: 0,
    drive: { primary: 'https://drive.google.com/free', backup: 'https://onedrive.com/free' },
    status: 'active'
  }, auth);
  const freeP = freeProd.body?.product;
  assert('创建免费商品', !!freeP, `shortId=${freeP?.shortId}`);

  const paidProd = await request('POST', '/api/products', {
    title: { zh: '付费下载测试书', en: 'Paid Download Test' },
    price: 19.99,
    drive: { primary: 'https://drive.google.com/paid', backup: 'https://onedrive.com/paid' },
    stripeLink: 'https://buy.stripe.com/test_paid',
    status: 'active'
  }, auth);
  const paidP = paidProd.body?.product;
  assert('创建付费商品(有Stripe)', !!paidP, `shortId=${paidP?.shortId}`);

  const paidNoStripe = await request('POST', '/api/products', {
    title: { zh: '付费无链接测试书', en: 'Paid No Stripe Test' },
    price: 5.99,
    drive: { primary: 'https://drive.google.com/paidns', backup: '' },
    status: 'active'
  }, auth);
  const paidNS = paidNoStripe.body?.product;
  assert('创建付费商品(无Stripe)', !!paidNS, `shortId=${paidNS?.shortId}`);

  console.log('\n--- Checkout: 免费商品 ---');

  if (freeP) {
    const checkout = await request('POST', `/api/checkout/${freeP.shortId}`);
    assert('免费商品checkout返回free=true', checkout.body.free === true, `free=${checkout.body.free}`);
    assert('免费商品返回downloadUrl', typeof checkout.body.downloadUrl === 'string', `url=${checkout.body.downloadUrl}`);
  }

  console.log('\n--- Checkout: 付费商品(有Stripe) ---');

  if (paidP) {
    const checkout = await request('POST', `/api/checkout/${paidP.shortId}`);
    assert('付费商品checkout返回stripeLink', checkout.body.free === false && typeof checkout.body.stripeLink === 'string', `stripe=${checkout.body.stripeLink}`);
  }

  console.log('\n--- Checkout: 付费商品(无Stripe) ---');

  if (paidNS) {
    const checkout = await request('POST', `/api/checkout/${paidNS.shortId}`);
    assert('无Stripe付费商品返回400', checkout.status === 400, `status=${checkout.status} error=${checkout.body?.error}`);
  }

  console.log('\n--- Checkout: 不存在的商品 ---');

  const notExist = await request('POST', '/api/checkout/nonexist');
  assert('不存在的商品返回404', notExist.status === 404, `status=${notExist.status}`);

  console.log('\n--- 下载验证: 免费商品 ---');

  if (freeP) {
    const verify = await request('POST', '/api/verify-download', { shortId: freeP.shortId });
    assert('免费商品直接授权', verify.body.authorized === true && verify.body.free === true, `authorized=${verify.body.authorized} free=${verify.body.free}`);
    assert('返回 downloads 链接', Array.isArray(verify.body.downloads) && verify.body.downloads.length > 0, `downloads=${JSON.stringify(verify.body.downloads)}`);
    assert('返回商品信息', verify.body.product?.title, `title=${JSON.stringify(verify.body.product?.title)}`);
  }

  console.log('\n--- 下载验证: 付费商品无token ---');

  if (paidP) {
    const verify = await request('POST', '/api/verify-download', { shortId: paidP.shortId });
    assert('付费商品无token拒绝', verify.body.authorized === false, `authorized=${verify.body.authorized}`);
    assert('拒绝原因: invalid_token', verify.body.reason === 'invalid_token' || verify.body.reason === 'no_token', `reason=${verify.body.reason}`);
  }

  console.log('\n--- 下载验证: 伪造token ---');

  if (paidP) {
    const verify = await request('POST', '/api/verify-download', { shortId: paidP.shortId, token: 'fake.token.here' });
    assert('伪造token拒绝', verify.body.authorized === false, `authorized=${verify.body.authorized} reason=${verify.body.reason}`);
  }

  console.log('\n--- 下载验证: 篡改token(product id不匹配) ---');

  if (paidP && freeP) {
    const { signDownloadToken } = require('../lib/token');
    const validToken = signDownloadToken(freeP.id);
    const verify = await request('POST', '/api/verify-download', { shortId: paidP.shortId, token: validToken });
    assert('token pid不匹配拒绝', verify.body.authorized === false, `authorized=${verify.body.authorized} reason=${verify.body.reason}`);
  }

  console.log('\n--- 下载验证: 有效token ---');

  if (paidP) {
    const { signDownloadToken } = require('../lib/token');
    const validToken = signDownloadToken(paidP.id);
    const verify = await request('POST', '/api/verify-download', { shortId: paidP.shortId, token: validToken });
    assert('有效token授权成功', verify.body.authorized === true, `authorized=${verify.body.authorized}`);
    assert('返回 downloads 链接', Array.isArray(verify.body.downloads) && verify.body.downloads.length > 0, `downloads=${JSON.stringify(verify.body.downloads)}`);
  }

  console.log('\n--- 下载验证: 缺少shortId ---');

  const noShortId = await request('POST', '/api/verify-download', {});
  assert('缺少shortId返回400', noShortId.status === 400, `status=${noShortId.status}`);

  console.log('\n--- Stripe 回跳 ---');

  if (paidP) {
    const stripeReturn = await request('GET', `/api/stripe-return?sid=${paidP.shortId}`);
    assert('Stripe回跳返回302重定向', stripeReturn.status === 302, `status=${stripeReturn.status}`);
    const location = stripeReturn.headers?.location || '';
    assert('重定向包含token', location.includes('t=') || location.includes('token='), `location=${location}`);

    const freeReturn = await request('GET', `/api/stripe-return?sid=${freeP?.shortId}`);
    assert('免费商品Stripe回跳重定向', freeReturn.status === 302, `status=${freeReturn.status}`);

    const noSid = await request('GET', '/api/stripe-return');
    assert('无sid回跳重定向(带error)', noSid.status === 302, `status=${noSid.status}`);
  }

  console.log('\n--- SEO 文件 ---');

  const sitemap = await request('GET', '/sitemap.xml');
  assert('Sitemap 返回200', sitemap.status === 200, `status=${sitemap.status}`);
  assert('Sitemap 包含 xml 标记', typeof sitemap.raw === 'string' && sitemap.raw.includes('<urlset'), 'has urlset');

  const robots = await request('GET', '/robots.txt');
  assert('Robots.txt 返回200', robots.status === 200, `status=${robots.status}`);
  assert('Robots.txt 包含 Disallow', typeof robots.raw === 'string' && robots.raw.includes('Disallow'), 'has Disallow');

  const llms = await request('GET', '/llms.txt');
  assert('LLMs.txt 返回200', llms.status === 200, `status=${llms.status}`);

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
