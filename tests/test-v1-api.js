const { request, assert, summary, login } = require('./helpers');

async function main() {
  console.log('=== Open API v1 测试 ===\n');

  const { token, authHeader: auth } = await login();

  console.log('\n--- 健康检查(免鉴权) ---');

  const health = await request('GET', '/api/v1/health');
  assert('健康检查返回200', health.status === 200, `status=${health.status}`);
  assert('status=ok', health.body.status === 'ok', `status=${health.body.status}`);
  assert('包含 timestamp', typeof health.body.timestamp === 'string', `ts=${health.body.timestamp}`);
  assert('包含 version', typeof health.body.version === 'string', `ver=${health.body.version}`);

  console.log('\n--- 创建 API Key 供 v1 测试 ---');

  const rwKeyRes = await request('POST', '/api/config/keys', {
    name: 'v1读写测试Key',
    scopes: ['read', 'write']
  }, auth);
  const rwKey = rwKeyRes.body?.key?.key;
  assert('创建v1读写Key', !!rwKey, `keyPrefix=${rwKey?.slice(0, 10)}...`);

  const roKeyRes = await request('POST', '/api/config/keys', {
    name: 'v1只读测试Key',
    scopes: ['read']
  }, auth);
  const roKey = roKeyRes.body?.key?.key;
  assert('创建v1只读Key', !!roKey, `keyPrefix=${roKey?.slice(0, 10)}...`);

  console.log('\n--- 无 API Key 访问 ---');

  const noKey = await request('GET', '/api/v1/products');
  assert('无Key访问拒绝', noKey.status === 401, `status=${noKey.status}`);
  assert('错误码 NO_API_KEY', noKey.body.code === 'NO_API_KEY', `code=${noKey.body.code}`);

  console.log('\n--- 无效 API Key ---');

  const badKey = await request('GET', '/api/v1/products', null, { 'x-api-key': 'aeox_invalid_key' });
  assert('无效Key拒绝', badKey.status === 401, `status=${badKey.status}`);
  assert('错误码 INVALID_API_KEY', badKey.body.code === 'INVALID_API_KEY', `code=${badKey.body.code}`);

  console.log('\n--- 读取商品(只读Key) ---');

  const readProducts = await request('GET', '/api/v1/products', null, { 'x-api-key': roKey });
  assert('只读Key读取商品', readProducts.status === 200 && Array.isArray(readProducts.body), `count=${readProducts.body?.length}`);

  console.log('\n--- 写保护(只读Key) ---');

  const writeWithRo = await request('POST', '/api/v1/products', {
    title: { zh: '未授权写入', en: 'Unauthorized Write' },
    price: 0
  }, { 'x-api-key': roKey });
  assert('只读Key写入拒绝', writeWithRo.status === 403, `status=${writeWithRo.status}`);
  assert('错误码 INSUFFICIENT_SCOPE', writeWithRo.body.code === 'INSUFFICIENT_SCOPE', `code=${writeWithRo.body.code}`);

  console.log('\n--- CRUD: 读写Key ---');

  const createRes = await request('POST', '/api/v1/products', {
    title: { zh: 'v1测试书', en: 'v1 Test Book' },
    cover: 'https://example.com/v1.jpg',
    price: 4.99,
    desc: { zh: 'v1接口测试', en: 'v1 API test' },
    drive: { primary: 'https://drive.google.com/v1', backup: '' }
  }, { 'x-api-key': rwKey });
  assert('v1创建商品', createRes.status === 201, `status=${createRes.status}`);
  assert('返回商品对象', typeof createRes.body.id === 'string', `id=${createRes.body.id}`);
  const v1Product = createRes.body;

  if (v1Product) {
    assert('商品 shortId 存在', typeof v1Product.shortId === 'string', `shortId=${v1Product.shortId}`);
    assert('商品 status=active', v1Product.status === 'active', `status=${v1Product.status}`);

    console.log('\n--- 按id获取商品 ---');

    const getById = await request('GET', `/api/v1/products/${v1Product.id}`, null, { 'x-api-key': roKey });
    assert('按id获取商品', getById.status === 200, `status=${getById.status}`);
    assert('商品id匹配', getById.body.id === v1Product.id, `id=${getById.body.id}`);

    console.log('\n--- 按 shortId 获取商品 ---');

    const getByShort = await request('GET', `/api/v1/products/${v1Product.shortId}`, null, { 'x-api-key': roKey });
    assert('按shortId获取商品', getByShort.status === 200, `status=${getByShort.status}`);
    assert('shortId匹配商品', getByShort.body.id === v1Product.id, `id=${getByShort.body.id}`);

    console.log('\n--- 获取不存在的商品 ---');

    const notFound = await request('GET', '/api/v1/products/p_nonexistent', null, { 'x-api-key': roKey });
    assert('不存在商品返回404', notFound.status === 404, `status=${notFound.status}`);

    console.log('\n--- 更新商品 ---');

    const updateRes = await request('PUT', `/api/v1/products/${v1Product.id}`, {
      title: { zh: 'v1更新后', en: 'v1 Updated' },
      price: 7.99
    }, { 'x-api-key': rwKey });
    assert('v1更新商品', updateRes.status === 200, `status=${updateRes.status}`);
    assert('标题已更新', updateRes.body.title?.zh === 'v1更新后', `title=${JSON.stringify(updateRes.body.title)}`);
    assert('价格已更新', updateRes.body.price === 7.99, `price=${updateRes.body.price}`);

    console.log('\n--- 删除商品(软删除) ---');

    const deleteRes = await request('DELETE', `/api/v1/products/${v1Product.id}`, null, { 'x-api-key': rwKey });
    assert('v1删除商品', deleteRes.status === 200 && deleteRes.body.success, `status=${deleteRes.status}`);

    const delNonExist = await request('DELETE', '/api/v1/products/p_nonexistent', null, { 'x-api-key': rwKey });
    assert('删除不存在商品返回404', delNonExist.status === 404, `status=${delNonExist.status}`);
  }

  console.log('\n--- 分类和标签 ---');

  const v1Cats = await request('GET', '/api/v1/categories', null, { 'x-api-key': roKey });
  assert('v1获取分类', v1Cats.status === 200 && Array.isArray(v1Cats.body), `count=${v1Cats.body?.length}`);

  const v1Tags = await request('GET', '/api/v1/tags', null, { 'x-api-key': roKey });
  assert('v1获取标签', v1Tags.status === 200 && Array.isArray(v1Tags.body), `count=${v1Tags.body?.length}`);

  console.log('\n--- 商品过滤(status) ---');

  const activeList = await request('GET', '/api/v1/products?status=active', null, { 'x-api-key': roKey });
  assert('v1获取活跃商品', activeList.status === 200, `count=${activeList.body?.length}`);

  const archivedList = await request('GET', '/api/v1/products?status=archived', null, { 'x-api-key': roKey });
  assert('v1获取归档商品', archivedList.status === 200, `count=${archivedList.body?.length}`);

  console.log('\n--- 访问日志记录 ---');

  const logs = await request('GET', '/api/config/logs?limit=10', null, auth);
  assert('访问日志有记录', Array.isArray(logs.body) && logs.body.length > 0, `count=${logs.body?.length}`);
  if (logs.body.length > 0) {
    const latest = logs.body[0];
    assert('日志包含 method', typeof latest.method === 'string', `method=${latest.method}`);
    assert('日志包含 path', typeof latest.path === 'string', `path=${latest.path}`);
    assert('日志包含 status', typeof latest.status === 'number', `status=${latest.status}`);
  }

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
