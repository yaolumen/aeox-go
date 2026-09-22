const { request, assert, summary, login, delay } = require('./helpers');
const S = Date.now().toString(36);

async function main() {
  console.log('=== 分类与标签测试 ===\n');

  const { token, authHeader: auth } = await login();
  const createdCats = [];
  const createdTags = [];

  console.log('\n--- 创建分类 ---');

  const cat1 = await request('POST', '/api/config/categories', {
    name: { zh: '测试分类1-' + S, en: 'Test Category 1-' + S },
    description: '测试用分类',
    sort: 1
  }, auth);
  assert('创建分类1', cat1.status === 200 && cat1.body.success, `status=${cat1.status}`);
  if (cat1.body.category) createdCats.push(cat1.body.category);

  const cat2 = await request('POST', '/api/config/categories', {
    name: { zh: '测试分类2-' + S, en: 'Test Category 2-' + S },
    sort: 2
  }, auth);
  assert('创建分类2', cat2.status === 200 && cat2.body.success, `status=${cat2.status}`);
  if (cat2.body.category) createdCats.push(cat2.body.category);

  const catNoName = await request('POST', '/api/config/categories', { description: 'no name' }, auth);
  assert('无名称创建分类拒绝', catNoName.status === 400, `status=${catNoName.status}`);

  const cat3 = await request('POST', '/api/config/categories', {
    name: { zh: '测试分类3-' + S, en: 'Test Category 3-' + S }
  }, auth);
  if (cat3.body.category) createdCats.push(cat3.body.category);

  console.log('\n--- 分类属性 ---');

  const c1 = cat1.body.category;
  if (c1) {
    assert('分类 id 格式', c1.id.startsWith('cat_'), `id=${c1.id}`);
    assert('分类 slug 存在', typeof c1.slug === 'string' && c1.slug.length > 0, `slug=${c1.slug}`);
    assert('分类 name 双语', c1.name?.zh && c1.name?.en, `name=${JSON.stringify(c1.name)}`);
    assert('分类 status=active', c1.status === 'active', `status=${c1.status}`);
  }

  console.log('\n--- 获取分类列表 ---');

  const catList = await request('GET', '/api/config/categories');
  assert('获取分类列表', catList.status === 200 && Array.isArray(catList.body), `count=${catList.body?.length}`);
  assert('分类1在列表中', catList.body.some(c => c.id === c1?.id), 'found');

  console.log('\n--- slug 重复检测 ---');

  const dupCat = await request('POST', '/api/config/categories', {
    name: { zh: '重复slug-' + S, en: 'Dup Slug-' + S },
    slug: c1?.slug
  }, auth);
  assert('slug重复返回409', dupCat.status === 409, `status=${dupCat.status}`);

  console.log('\n--- 更新分类 ---');

  if (c1) {
    const updateCat = await request('PUT', `/api/config/categories/${c1.id}`, {
      name: { zh: '更新后分类1', en: 'Updated Cat 1' },
      description: '已更新'
    }, auth);
    assert('更新分类', updateCat.status === 200 && updateCat.body.success, `status=${updateCat.status}`);
    assert('分类名已更新', updateCat.body.category?.name?.zh === '更新后分类1', `name=${updateCat.body.category?.name?.zh}`);

    const updateNonExist = await request('PUT', '/api/config/categories/cat_nonexistent', { name: 'x' }, auth);
    assert('更新不存在的分类返回404', updateNonExist.status === 404, `status=${updateNonExist.status}`);
  }

  console.log('\n--- 删除分类(有引用时阻止) ---');

  const product = await request('POST', '/api/products', {
    title: { zh: '分类引用测试书', en: 'Cat Ref Book' },
    price: 0,
    categoryId: c1?.id || ''
  }, auth);
  const testProduct = product.body?.product;

  if (c1 && testProduct) {
    const delRef = await request('DELETE', `/api/config/categories/${c1.id}`, null, auth);
    assert('有商品引用时删除分类返回409', delRef.status === 409, `status=${delRef.status} msg=${delRef.body?.error}`);

    await request('PUT', `/api/products/${testProduct.id}`, { categoryId: '' }, auth);
    const delOk = await request('DELETE', `/api/config/categories/${c1.id}`, null, auth);
    assert('无引用后删除分类成功', delOk.status === 200 && delOk.body.success, `status=${delOk.status}`);
  }

  console.log('\n--- 删除不存在的分类 ---');

  const delNonExist = await request('DELETE', '/api/config/categories/cat_nonexistent', null, auth);
  assert('删除不存在的分类返回404', delNonExist.status === 404, `status=${delNonExist.status}`);

  console.log('\n========== 标签测试 ==========\n');

  console.log('\n--- 创建标签 ---');

  const tag1 = await request('POST', '/api/config/tags', { name: 'AI-' + S }, auth);
  assert('创建标签1', tag1.status === 200 && tag1.body.success, `status=${tag1.status}`);
  if (tag1.body.tag) createdTags.push(tag1.body.tag);

  const tag2 = await request('POST', '/api/config/tags', { name: 'Productivity-' + S, color: '#10b981' }, auth);
  assert('创建标签2', tag2.status === 200 && tag2.body.success, `status=${tag2.status}`);
  if (tag2.body.tag) createdTags.push(tag2.body.tag);

  const tagNoName = await request('POST', '/api/config/tags', {}, auth);
  assert('无名称创建标签拒绝', tagNoName.status === 400, `status=${tagNoName.status}`);

  const dupTag = await request('POST', '/api/config/tags', { name: 'AI-' + S }, auth);
  assert('重复名称创建标签拒绝', dupTag.status === 409, `status=${dupTag.status}`);

  console.log('\n--- 标签属性 ---');

  const t1 = tag1.body.tag;
  if (t1) {
    assert('标签 id 格式', t1.id.startsWith('tag_'), `id=${t1.id}`);
    assert('标签 name', t1.name === 'AI-' + S, `name=${t1.name}`);
    assert('标签 color 存在', typeof t1.color === 'string' && t1.color.startsWith('#'), `color=${t1.color}`);
  }

  console.log('\n--- 获取标签列表 ---');

  const tagList = await request('GET', '/api/config/tags');
  assert('获取标签列表', tagList.status === 200 && Array.isArray(tagList.body), `count=${tagList.body?.length}`);
  assert('标签1在列表中', tagList.body.some(t => t.id === t1?.id), 'found');

  console.log('\n--- 更新标签 ---');

  if (t1) {
    const updateTag = await request('PUT', `/api/config/tags/${t1.id}`, { name: 'Machine Learning', color: '#ef4444' }, auth);
    assert('更新标签', updateTag.status === 200 && updateTag.body.success, `status=${updateTag.status}`);
    assert('标签名已更新', updateTag.body.tag?.name === 'Machine Learning', `name=${updateTag.body.tag?.name}`);
    assert('标签颜色已更新', updateTag.body.tag?.color === '#ef4444', `color=${updateTag.body.tag?.color}`);

    const updateNonExist = await request('PUT', '/api/config/tags/tag_nonexistent', { name: 'x' }, auth);
    assert('更新不存在的标签返回404', updateNonExist.status === 404, `status=${updateNonExist.status}`);
  }

  console.log('\n--- 标签删除级联清理 ---');

  const prodWithTag = await request('POST', '/api/products', {
    title: { zh: '标签测试书', en: 'Tag Test Book' },
    price: 0,
    tags: [t1?.id, tag2.body?.tag?.id].filter(Boolean)
  }, auth);
  const tagTestProduct = prodWithTag.body?.product;

  if (t1 && tagTestProduct) {
    assert('商品有标签', Array.isArray(tagTestProduct.tags) && tagTestProduct.tags.includes(t1.id), `tags=${JSON.stringify(tagTestProduct.tags)}`);

    const delTag = await request('DELETE', `/api/config/tags/${t1.id}`, null, auth);
    assert('删除标签成功', delTag.status === 200 && delTag.body.success, `status=${delTag.status}`);

    const checkProd = await request('GET', '/api/products');
    const updated = checkProd.body.find(p => p.id === tagTestProduct.id);
    assert('商品中标签引用已级联清理', !updated || !updated.tags.includes(t1.id), `tags=${JSON.stringify(updated?.tags)}`);
  }

  console.log('\n--- 删除不存在的标签 ---');

  const delTagNonExist = await request('DELETE', '/api/config/tags/tag_nonexistent', null, auth);
  assert('删除不存在的标签返回404', delTagNonExist.status === 404, `status=${delTagNonExist.status}`);

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
