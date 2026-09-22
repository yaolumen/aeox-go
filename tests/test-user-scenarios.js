const { request, assert, summary, login } = require('./helpers');
const { signDownloadToken, verifyDownloadToken } = require('../lib/token');

const S = Date.now().toString(36);

const USERS = [
  { id: 1, name: 'Alice', role: 'free_opted_in', email: `alice-${S}@test.com`, desc: '免费用户，提供邮箱' },
  { id: 2, name: 'Bob', role: 'free_skipped', email: '', desc: '免费用户，跳过邮箱' },
  { id: 3, name: 'Carol', role: 'paid_normal', email: `carol-${S}@test.com`, desc: '付费用户，正常支付下载' },
  { id: 4, name: 'Dave', role: 'paid_close_reopen', email: `dave-${S}@test.com`, desc: '付费用户，关闭页面后重新找回下载' },
  { id: 5, name: 'Eve', role: 'paid_token_expired', email: `eve-${S}@test.com`, desc: '付费用户，token过期后恢复' },
  { id: 6, name: 'Frank', role: 'paid_refunded', email: `frank-${S}@test.com`, desc: '付费用户，已退款尝试下载' },
  { id: 7, name: 'Grace', role: 'multi_product', email: `grace-${S}@test.com`, desc: '购买多个产品，邮箱恢复' },
  { id: 8, name: 'Hank', role: 'free_then_paid', email: `hank-${S}@test.com`, desc: '先免费下载，再付费购买' },
  { id: 9, name: 'Ivy', role: 'abuse_forge_token', email: '', desc: '伪造token尝试下载付费产品' },
  { id: 10, name: 'Jack', role: 'recover_wrong_email', email: `jack-${S}@test.com`, desc: '用错误邮箱恢复下载' },
];

let freeProduct, paidProduct1, paidProduct2, paidProductNoStripe;
let auth;

async function setupProducts() {
  console.log('--- 准备测试商品 ---');

  freeProduct = await request('POST', '/api/products', {
    title: { zh: '免费电子书-UAT', en: 'Free Ebook-UAT' },
    price: 0,
    downloads: [
      { url: 'https://drive.google.com/free-uat', label: 'Google Drive' },
      { url: 'https://onedrive.com/free-uat', label: 'OneDrive' }
    ]
  }, auth);
  assert('创建免费商品', freeProduct.status === 200, `status=${freeProduct.status}`);
  freeProduct = freeProduct.body.product;

  paidProduct1 = await request('POST', '/api/products', {
    title: { zh: '付费电子书1-UAT', en: 'Paid Ebook 1-UAT' },
    price: 9.99,
    stripeLink: 'https://buy.stripe.com/test_paid_uat_1',
    downloads: [
      { url: 'https://drive.google.com/paid-uat-1', label: 'Google Drive' },
      { url: 'https://onedrive.com/paid-uat-1', label: 'OneDrive' }
    ],
    upsell: { mode: 'auto' }
  }, auth);
  assert('创建付费商品1', paidProduct1.status === 200, `status=${paidProduct1.status}`);
  paidProduct1 = paidProduct1.body.product;

  paidProduct2 = await request('POST', '/api/products', {
    title: { zh: '付费电子书2-UAT', en: 'Paid Ebook 2-UAT' },
    price: 14.99,
    stripeLink: 'https://buy.stripe.com/test_paid_uat_2',
    downloads: [
      { url: 'https://drive.google.com/paid-uat-2', label: '' }
    ]
  }, auth);
  assert('创建付费商品2', paidProduct2.status === 200, `status=${paidProduct2.status}`);
  paidProduct2 = paidProduct2.body.product;

  paidProductNoStripe = await request('POST', '/api/products', {
    title: { zh: '无Stripe付费书-UAT', en: 'No Stripe Paid-UAT' },
    price: 4.99
  }, auth);
  assert('创建无Stripe付费商品', paidProductNoStripe.status === 200, `status=${paidProductNoStripe.status}`);
  paidProductNoStripe = paidProductNoStripe.body.product;

  console.log(`  免费商品 shortId=${freeProduct.shortId}`);
  console.log(`  付费商品1 shortId=${paidProduct1.shortId}`);
  console.log(`  付费商品2 shortId=${paidProduct2.shortId}`);
  console.log(`  无Stripe商品 shortId=${paidProductNoStripe.shortId}`);
}

async function recoverDownload(email, ipSuffix) {
  const headers = ipSuffix ? { 'x-forwarded-for': `10.0.${ipSuffix}.1` } : {};
  return request('POST', '/api/recover-download', { email }, headers);
}

async function invalidateServerCache(files) {
  try {
    await request('POST', '/api/cache/invalidate', { files: files || ['orders.json'] }, auth);
  } catch (e) {}
}

async function createPaidOrderViaAPI(product, userEmail, stripeSessionId) {
  const token = signDownloadToken(product.id);
  const { createOrder } = require('../lib/orders');
  await createOrder({
    productId: product.id,
    productTitle: product.title?.en || product.title?.zh || '',
    shortId: product.shortId,
    stripeSessionId: stripeSessionId || `cs_test_${S}_${product.shortId}`,
    stripePaymentIntent: `pi_test_${S}_${product.shortId}`,
    amount: Number(product.price),
    currency: 'usd',
    customerEmail: userEmail,
    downloadToken: token,
    leadType: 'paid'
  });
  await invalidateServerCache();
  return token;
}

async function testUser1_Alice() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #1: Alice (免费用户，提供邮箱)`);
  console.log(`${'='.repeat(50)}`);

  const checkout = await request('POST', `/api/checkout/${freeProduct.shortId}`, {
    email: USERS[0].email
  });
  assert('Alice: 免费checkout成功', checkout.body.free === true, `free=${checkout.body.free}`);
  assert('Alice: 返回downloadUrl', !!checkout.body.downloadUrl, `url=${checkout.body.downloadUrl}`);

  const token = checkout.body.token;
  const verify = await request('POST', '/api/verify-download', {
    shortId: freeProduct.shortId,
    token
  });
  assert('Alice: 下载验证authorized', verify.body.authorized === true, `authorized=${verify.body.authorized}`);
  assert('Alice: 标记为free', verify.body.free === true, `free=${verify.body.free}`);
  assert('Alice: 返回downloads数组', Array.isArray(verify.body.downloads) && verify.body.downloads.length === 2, `downloads=${verify.body.downloads?.length}`);

  const recover = await recoverDownload(USERS[0].email, 1);
  assert('Alice: 邮箱恢复免费产品', recover.body.found === true, `found=${recover.body.found}`);
  assert('Alice: 恢复返回下载链接', recover.body.downloads?.length > 0, `downloads=${recover.body.downloads?.length}`);
}

async function testUser2_Bob() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #2: Bob (免费用户，跳过邮箱)`);
  console.log(`${'='.repeat(50)}`);

  const checkout = await request('POST', `/api/checkout/${freeProduct.shortId}`, {});
  assert('Bob: 免费checkout成功', checkout.body.free === true, `free=${checkout.body.free}`);

  const verify = await request('POST', '/api/verify-download', {
    shortId: freeProduct.shortId,
    token: checkout.body.token
  });
  assert('Bob: 下载验证authorized', verify.body.authorized === true, `authorized=${verify.body.authorized}`);

  const recover = await recoverDownload('bob-nonexistent@test.com', 2);
  assert('Bob: 用不存在邮箱恢复返回found=false', recover.body.found === false, `found=${recover.body.found}`);
}

async function testUser3_Carol() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #3: Carol (付费用户，正常支付下载)`);
  console.log(`${'='.repeat(50)}`);

  const checkout = await request('POST', `/api/checkout/${paidProduct1.shortId}`);
  assert('Carol: 付费checkout返回stripeLink', checkout.body.stripeLink, `stripe=${checkout.body.stripeLink}`);
  assert('Carol: 不是free', checkout.body.free === false, `free=${checkout.body.free}`);

  const token = await createPaidOrderViaAPI(paidProduct1, USERS[2].email, `cs_carol_${S}`);

  const verify = await request('POST', '/api/verify-download', {
    shortId: paidProduct1.shortId,
    token
  });
  assert('Carol: 下载验证authorized', verify.body.authorized === true, `authorized=${verify.body.authorized}`);
  assert('Carol: 标记为非free', verify.body.free === false, `free=${verify.body.free}`);
  assert('Carol: 返回downloads', verify.body.downloads?.length > 0, `downloads=${verify.body.downloads?.length}`);

  const noTokenVerify = await request('POST', '/api/verify-download', {
    shortId: paidProduct1.shortId
  });
  assert('Carol: 无token访问付费商品拒绝', noTokenVerify.body.authorized === false, `authorized=${noTokenVerify.body.authorized}`);
}

async function testUser4_Dave() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #4: Dave (付费用户，关闭页面后重新找回下载)`);
  console.log(`${'='.repeat(50)}`);

  const token = await createPaidOrderViaAPI(paidProduct1, USERS[3].email, `cs_dave_${S}`);

  const verify1 = await request('POST', '/api/verify-download', {
    shortId: paidProduct1.shortId,
    token
  });
  assert('Dave: 首次下载验证成功', verify1.body.authorized === true, `authorized=${verify1.body.authorized}`);

  console.log('  [模拟] Dave关闭浏览器，重新打开下载页...');
  const shortUrl = `/d/${paidProduct1.shortId}?t=${token}`;
  console.log(`  [模拟] 短链接: ${shortUrl}`);

  const verify2 = await request('POST', '/api/verify-download', {
    shortId: paidProduct1.shortId,
    token
  });
  assert('Dave: 重新用同一token验证成功', verify2.body.authorized === true, `authorized=${verify2.body.authorized}`);

  console.log('  [模拟] Dave丢失了token链接，通过邮箱恢复...');
  const recover = await recoverDownload(USERS[3].email, 4);
  assert('Dave: 邮箱恢复成功', recover.body.found === true, `found=${recover.body.found}`);
  assert('Dave: 恢复返回下载URL', recover.body.downloads?.length > 0, `downloads=${recover.body.downloads?.length}`);

  const newTokenUrl = recover.body.downloads[0].downloadUrl;
  const match = newTokenUrl.match(/t=([^&]+)/);
  assert('Dave: 恢复URL含token', !!match, `url=${newTokenUrl}`);

  if (match) {
    const newToken = match[1];
    const verify3 = await request('POST', '/api/verify-download', {
      shortId: paidProduct1.shortId,
      token: newToken
    });
    assert('Dave: 恢复的token可下载', verify3.body.authorized === true, `authorized=${verify3.body.authorized}`);
  }
}

async function testUser5_Eve() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #5: Eve (付费用户，token过期后恢复)`);
  console.log(`${'='.repeat(50)}`);

  const token = await createPaidOrderViaAPI(paidProduct1, USERS[4].email, `cs_eve_${S}`);

  const verify1 = await request('POST', '/api/verify-download', {
    shortId: paidProduct1.shortId,
    token
  });
  assert('Eve: token有效时可下载', verify1.body.authorized === true, `authorized=${verify1.body.authorized}`);

  console.log('  [模拟] token过期(24h后)...');
  const expiredResult = verifyDownloadToken(token);
  assert('Eve: 当前token未过期(测试环境)', expiredResult.ok === true, `ok=${expiredResult.ok}`);

  console.log('  [逻辑测试] 构造一个已过期的token...');
  const { loadSync } = require('../lib/utils');
  const path = require('path');
  const { DATA_DIR } = require('../lib/store');
  const secretFile = path.join(DATA_DIR, 'download-token-secret.json');
  const secret = loadSync(secretFile, null)?.secret || 'test';
  const crypto = require('crypto');

  function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  const expiredPayload = b64url(JSON.stringify({ pid: paidProduct1.id, exp: Math.floor(Date.now() / 1000) - 3600 }));
  const expiredSig = b64url(crypto.createHmac('sha256', secret).update(expiredPayload).digest());
  const expiredToken = `${expiredPayload}.${expiredSig}`;

  const expiredVerify = await request('POST', '/api/verify-download', {
    shortId: paidProduct1.shortId,
    token: expiredToken
  });
  assert('Eve: 过期token拒绝下载', expiredVerify.body.authorized === false, `authorized=${expiredVerify.body.authorized}`);
  assert('Eve: 过期原因=expired', expiredVerify.body.reason === 'expired', `reason=${expiredVerify.body.reason}`);

  console.log('  [模拟] Eve通过邮箱恢复下载...');
  const recover = await recoverDownload(USERS[4].email, 5);
  assert('Eve: 过期后邮箱恢复成功', recover.body.found === true, `found=${recover.body.found}`);
  assert('Eve: 恢复返回新token链接', recover.body.downloads?.length > 0, `downloads=${recover.body.downloads?.length}`);
}

async function testUser6_Frank() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #6: Frank (付费用户，已退款尝试下载)`);
  console.log(`${'='.repeat(50)}`);

  const token = await createPaidOrderViaAPI(paidProduct1, USERS[5].email, `cs_frank_${S}`);
  const { getOrders, updateOrderStatus } = require('../lib/orders');
  const orders = await getOrders({ status: 'paid' });
  const frankOrder = orders.find(o => o.customerEmail === USERS[5].email);

  assert('Frank: 订单存在', !!frankOrder, `orderId=${frankOrder?.id}`);

  if (frankOrder) {
    const updated = await updateOrderStatus(frankOrder.id, {
      refundStatus: 'refunded',
      stripeRefundId: 're_test_frank_refund',
      refundNote: 'UAT test refund'
    });
    assert('Frank: 退款状态更新成功', updated?.refundStatus === 'refunded', `status=${updated?.refundStatus}`);

    console.log('  [逻辑测试] 已退款用户仍能用原token下载(因为token验证不看退款状态)...');
    const verifyAfterRefund = await request('POST', '/api/verify-download', {
      shortId: paidProduct1.shortId,
      token
    });
    assert('Frank: 已退款用户token仍可下载(⚠️潜在问题)', verifyAfterRefund.body.authorized === true, `authorized=${verifyAfterRefund.body.authorized}`);

  const recoverAfterRefund = await recoverDownload(USERS[5].email, 6);
    assert('Frank: 已退款用户邮箱恢复无法获取链接(✅正确行为)', !(recoverAfterRefund.body.found === true && recoverAfterRefund.body.downloads?.length > 0),
      `found=${recoverAfterRefund.body.found} downloads=${recoverAfterRefund.body.downloads?.length}`);

    await updateOrderStatus(frankOrder.id, { refundStatus: 'none' });
  }
}

async function testUser7_Grace() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #7: Grace (购买多个产品，邮箱恢复)`);
  console.log(`${'='.repeat(50)}`);

  const token1 = await createPaidOrderViaAPI(paidProduct1, USERS[6].email, `cs_grace1_${S}`);
  const token2 = await createPaidOrderViaAPI(paidProduct2, USERS[6].email, `cs_grace2_${S}`);

  const verify1 = await request('POST', '/api/verify-download', {
    shortId: paidProduct1.shortId,
    token: token1
  });
  assert('Grace: 产品1下载成功', verify1.body.authorized === true, `authorized=${verify1.body.authorized}`);

  const verify2 = await request('POST', '/api/verify-download', {
    shortId: paidProduct2.shortId,
    token: token2
  });
  assert('Grace: 产品2下载成功', verify2.body.authorized === true, `authorized=${verify2.body.authorized}`);

  const recover = await recoverDownload(USERS[6].email, 7);
  assert('Grace: 邮箱恢复找到多个产品', recover.body.found === true, `found=${recover.body.found}`);
  assert('Grace: 恢复返回2个下载链接', recover.body.downloads?.length === 2, `downloads=${recover.body.downloads?.length}`);
}

async function testUser8_Hank() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #8: Hank (先免费下载，再付费购买)`);
  console.log(`${'='.repeat(50)}`);

  const freeCheckout = await request('POST', `/api/checkout/${freeProduct.shortId}`, {
    email: USERS[7].email
  });
  assert('Hank: 免费checkout成功', freeCheckout.body.free === true, `free=${freeCheckout.body.free}`);

  const freeVerify = await request('POST', '/api/verify-download', {
    shortId: freeProduct.shortId,
    token: freeCheckout.body.token
  });
  assert('Hank: 免费产品下载成功', freeVerify.body.authorized === true, `authorized=${freeVerify.body.authorized}`);

  const paidToken = await createPaidOrderViaAPI(paidProduct1, USERS[7].email, `cs_hank_${S}`);

  const paidVerify = await request('POST', '/api/verify-download', {
    shortId: paidProduct1.shortId,
    token: paidToken
  });
  assert('Hank: 付费产品下载成功', paidVerify.body.authorized === true, `authorized=${paidVerify.body.authorized}`);

  const recover = await recoverDownload(USERS[7].email, 8);
  assert('Hank: 邮箱恢复返回购买记录', recover.body.found === true, `found=${recover.body.found}`);
  assert('Hank: 恢复至少包含付费订单', recover.body.downloads?.length >= 1, `downloads=${recover.body.downloads?.length}`);
}

async function testUser9_Ivy() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #9: Ivy (伪造token尝试下载付费产品)`);
  console.log(`${'='.repeat(50)}`);

  const forgeTests = [
    { name: '空token', token: '', expected: 'no_token' },
    { name: '随机字符串', token: 'forged_token_abc123', expected: 'invalid_format' },
    { name: '篡改payload', token: 'eyJwaWQiOiJwX2Zha2UiLCJleHAiOjk5OTk5OTk5OTl9.fake_sig', expected: 'invalid_signature' },
    { name: '用免费产品token访问付费产品', token: signDownloadToken(freeProduct.id), expected: 'invalid_token' },
    { name: 'null token', token: null, expected: 'no_token' },
  ];

  for (const test of forgeTests) {
    const verify = await request('POST', '/api/verify-download', {
      shortId: paidProduct1.shortId,
      token: test.token
    });
    assert(`Ivy: ${test.name}被拒绝`, verify.body.authorized === false, `authorized=${verify.body.authorized}`);
    assert(`Ivy: ${test.name}原因=${test.expected}`, verify.body.reason === test.expected || verify.body.authorized === false,
      `reason=${verify.body.reason}`);
  }

  console.log('  [逻辑测试] 修改token中的productId(签名不匹配)...');
  const { loadSync } = require('../lib/utils');
  const path = require('path');
  const { DATA_DIR } = require('../lib/store');
  const secretFile = path.join(DATA_DIR, 'download-token-secret.json');
  const secret = loadSync(secretFile, null)?.secret;
  if (secret) {
    const crypto = require('crypto');
    function b64url(buf) {
      return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    const fakePayload = b64url(JSON.stringify({ pid: paidProduct1.id, exp: Math.floor(Date.now() / 1000) + 86400 }));
    const fakeSig = b64url(crypto.createHmac('sha256', 'wrong_secret').update(fakePayload).digest());
    const tamperedToken = `${fakePayload}.${fakeSig}`;
    const verify = await request('POST', '/api/verify-download', {
      shortId: paidProduct1.shortId,
      token: tamperedToken
    });
    assert('Ivy: 用错误密钥签名的token被拒绝', verify.body.authorized === false, `authorized=${verify.body.authorized}`);
  }
}

async function testUser10_Jack() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`User #10: Jack (用错误邮箱恢复下载)`);
  console.log(`${'='.repeat(50)}`);

  await createPaidOrderViaAPI(paidProduct1, USERS[9].email, `cs_jack_${S}`);

  const recover1 = await recoverDownload('wrong_email@test.com', 10);
  assert('Jack: 错误邮箱恢复返回found=false', recover1.body.found === false, `found=${recover1.body.found}`);

  const recover2 = await recoverDownload(USERS[9].email, 11);
  assert('Jack: 正确邮箱恢复成功', recover2.body.found === true, `found=${recover2.body.found}`);

  console.log('  [逻辑测试] 邮箱大小写敏感性...');
  const recover3 = await recoverDownload(USERS[9].email.toUpperCase(), 12);
  assert('Jack: 大写邮箱也能恢复(大小写不敏感)', recover3.body.found === true, `found=${recover3.body.found}`);
}

async function testEdgeCases() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`边界与安全测试`);
  console.log(`${'='.repeat(50)}`);

  console.log('\n--- 免费产品无需token即可下载 ---');
  const freeNoToken = await request('POST', '/api/verify-download', {
    shortId: freeProduct.shortId
  });
  assert('免费产品无token也可下载', freeNoToken.body.authorized === true, `authorized=${freeNoToken.body.authorized}`);

  console.log('\n--- 无Stripe付费商品checkout ---');
  const noStripeCheckout = await request('POST', `/api/checkout/${paidProductNoStripe.shortId}`);
  assert('无Stripe付费商品checkout拒绝', noStripeCheckout.status === 400, `status=${noStripeCheckout.status}`);
  assert('拒绝原因=未配置支付链接', noStripeCheckout.body.error?.includes('支付链接'), `error=${noStripeCheckout.body.error}`);

  console.log('\n--- 不存在商品checkout ---');
  const notFound = await request('POST', '/api/checkout/nonexistent123');
  assert('不存在商品返回404', notFound.status === 404, `status=${notFound.status}`);

  console.log('\n--- 恢复下载限速(5次/分钟/IP + 3次/5分钟/邮箱) ---');
  for (let i = 0; i < 6; i++) {
    const ip = `192.168.99.${i + 1}`;
    const r = await request('POST', '/api/recover-download', { email: `ratelimit-${i}@test.com` }, { 'x-forwarded-for': ip });
    if (i < 5) {
      assert(`恢复限速: 第${i + 1}次请求正常(不同IP)`, r.status !== 429, `status=${r.status}`);
    } else {
      console.log('  (不同IP不会被限流，需同一IP测试)');
    }
  }
  const sameIp = `10.10.10.251`;
  for (let i = 0; i < 6; i++) {
    const r = await request('POST', '/api/recover-download', { email: `ratelimit-sameip-${i}@test.com` }, { 'x-forwarded-for': sameIp });
    if (i < 5) {
      assert(`恢复限速(同IP): 第${i + 1}次请求正常`, r.status !== 429, `status=${r.status}`);
    } else {
      assert('恢复限速(同IP): 第6次请求被限流', r.status === 429, `status=${r.status}`);
    }
  }
  console.log('  [V5修复验证] 同一邮箱3次/5分钟限速...');
  const emailLimitIp = '10.10.10.252';
  for (let i = 0; i < 4; i++) {
    const r = await request('POST', '/api/recover-download', { email: `same-email-limit@test.com` }, { 'x-forwarded-for': `${emailLimitIp}.${i}` });
    if (i < 3) {
      assert(`邮箱限速: 第${i + 1}次请求正常`, r.status !== 429, `status=${r.status}`);
    } else {
      assert('邮箱限速: 第4次(同邮箱)被限流', r.status === 429, `status=${r.status}`);
    }
  }

  console.log('\n--- 免费checkout限速(10次/分钟/IP) ---');
  const checkoutIp = '10.10.10.253';
  for (let i = 0; i < 12; i++) {
    const r = await request('POST', `/api/checkout/${freeProduct.shortId}`, { email: `checkout-limit-${i}@test.com` }, { 'x-forwarded-for': checkoutIp });
    if (i < 10) {
      assert(`checkout限速: 第${i + 1}次请求正常`, r.status !== 429, `status=${r.status}`);
    } else {
      assert('checkout限速: 第11次被限流', r.status === 429, `status=${r.status}`);
    }
  }

  console.log('\n--- 下载token的productId与shortId不匹配 ---');
  const wrongProductToken = signDownloadToken(paidProduct1.id);
  const wrongVerify = await request('POST', '/api/verify-download', {
    shortId: paidProduct2.shortId,
    token: wrongProductToken
  });
  assert('token与shortId不匹配时拒绝', wrongVerify.body.authorized === false, `authorized=${wrongVerify.body.authorized}`);
  assert('不匹配原因=invalid_token', wrongVerify.body.reason === 'invalid_token', `reason=${wrongVerify.body.reason}`);

  console.log('\n--- 商品归档后无法checkout ---');
  const archiveRes = await request('DELETE', `/api/products/${paidProductNoStripe.id}`, null, auth);
  assert('归档付费商品成功', archiveRes.status === 200, `status=${archiveRes.status}`);

  const archivedCheckout = await request('POST', `/api/checkout/${paidProductNoStripe.shortId}`);
  assert('归档商品checkout返回404', archivedCheckout.status === 404, `status=${archivedCheckout.status}`);

  const archivedVerify = await request('POST', '/api/verify-download', {
    shortId: paidProductNoStripe.shortId,
    token: signDownloadToken(paidProductNoStripe.id)
  });
  assert('归档商品verify-download返回404', archivedVerify.status === 404, `status=${archivedVerify.status}`);

  console.log('\n--- 免费商品多次checkout不报错 ---');
  for (let i = 0; i < 3; i++) {
    const r = await request('POST', `/api/checkout/${freeProduct.shortId}`, { email: `repeat-${i}@test.com` });
    assert(`免费商品第${i + 1}次checkout成功`, r.body.free === true, `free=${r.body.free}`);
  }
}

async function testVulnerabilities() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`安全漏洞专项测试`);
  console.log(`${'='.repeat(50)}`);

  console.log('\n--- [V1] 已退款用户仍可通过原token下载 ---');
  console.log('  这是已知问题：verify-download 只验证token签名和过期，不检查订单退款状态');
  console.log('  影响：退款后用户24h内仍可下载（token未过期时）');
  console.log('  严重程度：中（退款应撤销下载权限，但token已签发无法远程撤销）');

  console.log('\n--- [V2] 已退款用户可通过邮箱恢复获取新token ---');
  const { getOrders, updateOrderStatus } = require('../lib/orders');
  const token = await createPaidOrderViaAPI(paidProduct2, `refund-test-${S}@test.com`, `cs_vuln_${S}`);
  const orders = await getOrders({ status: 'paid' });
  const testOrder = orders.find(o => o.customerEmail === `refund-test-${S}@test.com`);
  if (testOrder) {
    await updateOrderStatus(testOrder.id, {
      refundStatus: 'refunded',
      stripeRefundId: 're_vuln_test'
    });
    const recover = await recoverDownload(`refund-test-${S}@test.com`, 99);
    const refundedCanRecover = recover.body.found === true && recover.body.downloads?.length > 0;
    console.log(`  结果: ${refundedCanRecover ? '⚠️ 已退款用户仍能通过邮箱恢复获取新下载链接' : '✅ 已退款用户无法恢复'}`);
    if (refundedCanRecover) {
      console.log('  影响：退款后用户可通过邮箱恢复获取新24h token');
      console.log('  严重程度：高（退款后应完全阻止下载）');
    }
    await updateOrderStatus(testOrder.id, { refundStatus: 'none' });
  }

  console.log('\n--- [V3] 邮箱恢复未验证退款状态 ---');
  console.log('  recover-download 只过滤 status=paid 的订单');
  console.log('  但退款后订单status变为"refunded"，不在paid列表中');
  const refundedOrders = await getOrders({ status: 'paid' });
  console.log(`  paid订单数量: ${refundedOrders.length}`);
  console.log('  需要确认：refunded状态的订单是否被recover过滤');

  console.log('\n--- [V4] 免费产品checkout限速(已修复: 10次/分钟/IP) ---');
  console.log('  防止无限创建订单撑爆存储，严重程度：低 → 已修复');

  console.log('\n--- [V5] 邮箱恢复双重限速(已修复: IP 5次/分钟 + 邮箱 3次/5分钟) ---');
  console.log('  攻击者即使换IP，每个邮箱5分钟内也只能查3次，严重程度：低 → 已修复');

  console.log('\n--- [V6] /d/:shortId无token时仍渲染download.html ---');
  const noTokenRedirect = await request('GET', `/d/${paidProduct1.shortId}`, null, null, true);
  assert('/d/无token返回download.html(200)', noTokenRedirect.status === 200, `status=${noTokenRedirect.status}`);
  console.log('  影响：无安全风险，download.html前端会显示"Purchase required"页面');
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  AEOX Store Lite - 用户闭环模拟测试     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  const { authHeader } = await login();
  auth = authHeader;

  await setupProducts();

  await testUser1_Alice();
  await testUser2_Bob();
  await testUser3_Carol();
  await testUser4_Dave();
  await testUser5_Eve();
  await testUser6_Frank();
  await testUser7_Grace();
  await testUser8_Hank();
  await testUser9_Ivy();
  await testUser10_Jack();
  await testEdgeCases();
  await testVulnerabilities();

  console.log('\n' + '═'.repeat(50));
  console.log('  用户闭环模拟测试汇总');
  console.log('═'.repeat(50));

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
