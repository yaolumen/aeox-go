const { request, assert, summary, login, delay, resetPassword } = require('./helpers');
const S = Date.now().toString(36);

async function main() {
  console.log('=== 并发与边界测试 ===\n');

  await resetPassword();
  const { token, authHeader: auth } = await login();

  console.log('\n--- 并发分类创建 ---');

  const promises = [];
  for (let i = 1; i <= 5; i++) {
    promises.push(request('POST', '/api/config/categories', {
      name: { zh: `并发分类${i}-${S}`, en: `Concurrent Cat ${i}-${S}` }
    }, auth));
  }
  const results = await Promise.all(promises);
  let successCount = 0;
  results.forEach((r, i) => {
    if (r.status === 200 && r.body.success) successCount++;
    console.log(`  并发分类${i + 1}: status=${r.status} success=${r.body.success}`);
  });
  assert('并发分类创建全部成功', successCount === 5, `${successCount}/5 成功`);

  console.log('\n--- 并发商品创建 ---');

  const prodPromises = [];
  for (let i = 1; i <= 5; i++) {
    prodPromises.push(request('POST', '/api/products', {
      title: { zh: `并发商品${i}`, en: `Concurrent Prod ${i}` },
      price: i
    }, auth));
  }
  const prodResults = await Promise.all(prodPromises);
  let prodSuccess = 0;
  prodResults.forEach((r, i) => {
    if (r.status === 200 && r.body.success) prodSuccess++;
  });
  assert('并发商品创建全部成功', prodSuccess === 5, `${prodSuccess}/5 成功`);

  console.log('\n--- 并发商品更新(同一商品) ---');

  const testProd = await request('POST', '/api/products', {
    title: { zh: '并发更新测试', en: 'Concurrent Update' },
    price: 10
  }, auth);
  const testProdId = testProd.body?.product?.id;

  if (testProdId) {
    const updatePromises = [];
    for (let i = 1; i <= 3; i++) {
      updatePromises.push(request('PUT', `/api/products/${testProdId}`, {
        price: 10 + i
      }, auth));
    }
    const updateResults = await Promise.all(updatePromises);
    let updateSuccess = 0;
    updateResults.forEach(r => { if (r.status === 200 && r.body.success) updateSuccess++; });
    assert('并发更新同一商品全部成功(withLock)', updateSuccess === 3, `${updateSuccess}/3 成功`);

    const finalProd = await request('GET', '/api/products');
    const found = finalProd.body.find(p => p.id === testProdId);
    assert('并发更新后商品存在', !!found, `price=${found?.price}`);
  }

  console.log('\n--- 空body请求 ---');

  const emptyCreate = await request('POST', '/api/products', {}, auth);
  assert('空body创建商品(用默认值)', emptyCreate.status === 200, `status=${emptyCreate.status}`);

  const emptyLogin = await request('POST', '/api/login', {});
  assert('空body登录失败', emptyLogin.status === 401, `status=${emptyLogin.status}`);

  console.log('\n--- 特殊字符处理 ---');

  const specialCat = await request('POST', '/api/config/categories', {
    name: { zh: '测试<>&"特殊-' + S, en: 'Test<>&"Special-' + S },
    description: '<script>alert(1)</script>'
  }, auth);
  assert('特殊字符创建分类成功', specialCat.status === 200 && specialCat.body.success, `status=${specialCat.status}`);

  const specialTag = await request('POST', '/api/config/tags', { name: 'C++ / AI & ML-' + S }, auth);
  assert('特殊字符标签创建成功', specialTag.status === 200 && specialTag.body.success, `status=${specialTag.status}`);

  console.log('\n--- 中文slug自动生成 ---');

  const zhCat = await request('POST', '/api/config/categories', {
    name: { zh: '人工智能与机器学习', en: '' }
  }, auth);
  assert('中文分类创建成功', zhCat.status === 200, `status=${zhCat.status}`);
  assert('中文slug自动生成(非空)', typeof zhCat.body.category?.slug === 'string' && zhCat.body.category.slug.length > 0, `slug=${zhCat.body.category?.slug}`);

  console.log('\n--- 大量标签批量打标 ---');

  const batchTags = [];
  for (let i = 0; i < 5; i++) {
    const t = await request('POST', '/api/config/tags', { name: `batch-tag-${Date.now()}-${i}` }, auth);
    if (t.body.tag) batchTags.push(t.body.tag.id);
  }

  if (batchTags.length > 0 && testProdId) {
    const batch = await request('POST', '/api/products/batch-tags', {
      productIds: [testProdId],
      tagIds: batchTags,
      mode: 'add'
    }, auth);
    assert('批量添加5个标签', batch.status === 200 && batch.body.success, `count=${batch.body.count}`);

    const removeBatch = await request('POST', '/api/products/batch-tags', {
      productIds: [testProdId],
      tagIds: batchTags,
      mode: 'remove'
    }, auth);
    assert('批量移除5个标签', removeBatch.status === 200 && removeBatch.body.success, `count=${removeBatch.body.count}`);
  }

  console.log('\n--- Dashboard 数据一致性 ---');

  const dash = await request('GET', '/api/dashboard', null, auth);
  const overview = dash.body.overview;
  if (overview) {
    assert('totalProducts >= 0', typeof overview.totalProducts === 'number' && overview.totalProducts >= 0, `total=${overview.totalProducts}`);
    assert('totalPv >= 0', typeof overview.totalPv === 'number' && overview.totalPv >= 0, `pv=${overview.totalPv}`);
    assert('conversionRate 是数字或0', !isNaN(parseFloat(overview.conversionRate)), `rate=${overview.conversionRate}`);
  }

  console.log('\n--- 下载令牌边界 ---');

  const { signDownloadToken, verifyDownloadToken } = require('../lib/token');

  const validToken = signDownloadToken('test_product_id');
  const verifyResult = verifyDownloadToken(validToken);
  assert('有效token验证通过', verifyResult.ok === true, `ok=${verifyResult.ok}`);
  assert('验证返回正确productId', verifyResult.productId === 'test_product_id', `pid=${verifyResult.productId}`);

  const nullToken = verifyDownloadToken(null);
  assert('null token 验证失败', nullToken.ok === false, `ok=${nullToken.ok}`);

  const emptyToken = verifyDownloadToken('');
  assert('空token验证失败', emptyToken.ok === false, `ok=${emptyToken.ok}`);

  const tamperedToken = validToken.slice(0, -2) + 'xx';
  const tamperResult = verifyDownloadToken(tamperedToken);
  assert('篡改token验证失败', tamperResult.ok === false, `ok=${tamperResult.ok} error=${tamperResult.error}`);

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
