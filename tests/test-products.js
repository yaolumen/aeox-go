const { request, assert, summary, login, delay } = require('./helpers');

async function main() {
  console.log('=== 商品 CRUD 测试 ===\n');

  const { token, authHeader: auth } = await login();
  const created = [];

  console.log('\n--- 创建商品 ---');

  const freeProduct = await request('POST', '/api/products', {
    title: { zh: '免费测试书', en: 'Free Test Book' },
    cover: 'https://example.com/free.jpg',
    price: 0,
    desc: { zh: '免费测试', en: 'Free test' },
    drive: { primary: 'https://drive.google.com/free', backup: 'https://onedrive.com/free' },
    status: 'active',
    featured: true
  }, auth);
  assert('创建免费商品', freeProduct.status === 200 && freeProduct.body.success, `status=${freeProduct.status}`);
  if (freeProduct.body.product) created.push(freeProduct.body.product);

  const paidProduct = await request('POST', '/api/products', {
    title: { zh: '付费测试书', en: 'Paid Test Book' },
    cover: 'https://example.com/paid.jpg',
    price: 9.99,
    desc: { zh: '付费测试', en: 'Paid test' },
    drive: { primary: 'https://drive.google.com/paid', backup: 'https://onedrive.com/paid' },
    stripeLink: 'https://buy.stripe.com/test_link',
    status: 'active',
    featured: false
  }, auth);
  assert('创建付费商品', paidProduct.status === 200 && paidProduct.body.success, `status=${paidProduct.status}`);
  if (paidProduct.body.product) created.push(paidProduct.body.product);

  const noTitleProduct = await request('POST', '/api/products', { price: 5 }, auth);
  assert('创建商品(无title被zod拒绝)', noTitleProduct.status === 400, `status=${noTitleProduct.status}`);
  if (noTitleProduct.body.product) created.push(noTitleProduct.body.product);

  console.log('\n--- 获取商品列表 ---');

  const allProducts = await request('GET', '/api/products');
  assert('获取全部商品', allProducts.status === 200 && Array.isArray(allProducts.body), `count=${allProducts.body?.length}`);

  const activeProducts = await request('GET', '/api/products?status=active');
  assert('获取活跃商品', activeProducts.status === 200 && Array.isArray(activeProducts.body), `count=${activeProducts.body?.length}`);

  const archivedProducts = await request('GET', '/api/products?status=archived');
  assert('获取归档商品', archivedProducts.status === 200 && Array.isArray(archivedProducts.body), `count=${archivedProducts.body?.length}`);

  assert('免费商品在列表中', allProducts.body.some(p => p.title?.zh === '免费测试书'), 'found in list');
  assert('付费商品在列表中', allProducts.body.some(p => p.title?.zh === '付费测试书'), 'found in list');

  console.log('\n--- 商品属性验证 ---');

  const freeP = freeProduct.body.product;
  if (freeP) {
    assert('免费商品 shortId 存在', typeof freeP.shortId === 'string' && freeP.shortId.length > 0, `shortId=${freeP.shortId}`);
    assert('免费商品 price=0', freeP.price === 0, `price=${freeP.price}`);
    assert('免费商品 status=active', freeP.status === 'active', `status=${freeP.status}`);
    assert('免费商品 featured=true', freeP.featured === true, `featured=${freeP.featured}`);
    assert('免费商品 id 格式', freeP.id.startsWith('p_'), `id=${freeP.id}`);
  }

  const paidP = paidProduct.body.product;
  if (paidP) {
    assert('付费商品 price=9.99', paidP.price === 9.99, `price=${paidP.price}`);
    assert('付费商品 stripeLink', paidP.stripeLink === 'https://buy.stripe.com/test_link', `link=${paidP.stripeLink}`);
    assert('付费商品 featured=false', paidP.featured === false, `featured=${paidP.featured}`);
  }

  console.log('\n--- 更新商品 ---');

  if (freeP) {
    const updateRes = await request('PUT', `/api/products/${freeP.id}`, {
      title: { zh: '更新后免费书', en: 'Updated Free Book' },
      price: 0,
      tags: ['tag1', 'tag2']
    }, auth);
    assert('更新商品标题', updateRes.status === 200 && updateRes.body.success, `status=${updateRes.status}`);
    assert('标题已更新', updateRes.body.product?.title?.zh === '更新后免费书', `title=${updateRes.body.product?.title?.zh}`);
    assert('tags 已设置', Array.isArray(updateRes.body.product?.tags) && updateRes.body.product.tags.length === 2, `tags=${JSON.stringify(updateRes.body.product?.tags)}`);

    const updateNonExist = await request('PUT', '/api/products/p_nonexistent', { title: 'x' }, auth);
    assert('更新不存在的商品返回404', updateNonExist.status === 404, `status=${updateNonExist.status}`);
  }

  console.log('\n--- 批量打标签 ---');

  if (created.length >= 2) {
    const batchRes = await request('POST', '/api/products/batch-tags', {
      productIds: created.map(p => p.id),
      tagIds: ['batchTag1', 'batchTag2'],
      mode: 'add'
    }, auth);
    assert('批量添加标签', batchRes.status === 200 && batchRes.body.success, `count=${batchRes.body.count}`);

    const removeRes = await request('POST', '/api/products/batch-tags', {
      productIds: [created[0].id],
      tagIds: ['batchTag1'],
      mode: 'remove'
    }, auth);
    assert('批量移除标签', removeRes.status === 200 && removeRes.body.success, `count=${removeRes.body.count}`);

    const badBatch = await request('POST', '/api/products/batch-tags', { productIds: 'notarray' }, auth);
    assert('批量标签参数错误', badBatch.status === 400, `status=${badBatch.status}`);
  }

  console.log('\n--- 删除商品(软删除) ---');

  if (freeP) {
    const delRes = await request('DELETE', `/api/products/${freeP.id}`, null, auth);
    assert('删除商品成功', delRes.status === 200 && delRes.body.success, `status=${delRes.status}`);

    const checkList = await request('GET', '/api/products');
    assert('已删除商品不在默认列表', !checkList.body.some(p => p.id === freeP.id && p.status !== 'archived'), 'filtered from active');

    const archivedList = await request('GET', '/api/products?status=archived');
    assert('已删除商品在归档列表', archivedList.body.some(p => p.id === freeP.id), 'found in archived');

    const delAgain = await request('DELETE', `/api/products/${freeP.id}`, null, auth);
    assert('重复删除返回404', delAgain.status === 404, `status=${delAgain.status}`);
  }

  console.log('\n--- 未认证操作 ---');

  const unauthCreate = await request('POST', '/api/products', { title: 'hack' });
  assert('未认证创建商品拒绝', unauthCreate.status === 401, `status=${unauthCreate.status}`);

  const unauthUpdate = await request('PUT', `/api/products/${paidP?.id || 'p_1'}`, { title: 'hack' });
  assert('未认证更新商品拒绝', unauthUpdate.status === 401, `status=${unauthUpdate.status}`);

  const unauthDelete = await request('DELETE', `/api/products/${paidP?.id || 'p_1'}`);
  assert('未认证删除商品拒绝', unauthDelete.status === 401, `status=${unauthDelete.status}`);

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
