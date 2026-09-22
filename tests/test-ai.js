const { request, assert, summary, login } = require('./helpers');
const S = Date.now().toString(36);

async function main() {
  console.log('=== AI 供应商管理测试 ===\n');

  const { token, authHeader: auth } = await login();
  const createdProviders = [];

  console.log('\n--- 获取 AI 配置 ---');

  const config = await request('GET', '/api/config/providers', null, auth);
  assert('获取AI配置', config.status === 200, `status=${config.status}`);
  assert('返回 providers 数组', Array.isArray(config.body.providers), `count=${config.body.providers?.length}`);
  assert('Provider apiKey 已掩码', config.body.providers.every(p => p.apiKeyPreview?.includes('...') || !p.apiKeyPreview), 'all masked');

  const existingProviders = config.body.providers || [];
  for (const ep of existingProviders) {
    await request('DELETE', `/api/config/providers/${ep.id}`, null, auth);
  }

  console.log('\n--- 创建 Provider ---');

  const prov1 = await request('POST', '/api/config/providers', {
    name: 'DeepSeek测试-' + S,
    vendor: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    apiKey: 'sk-test-deepseek-key-1234567890abcdef',
    priority: 1
  }, auth);
  assert('创建 Provider1', prov1.status === 200 && prov1.body.success, `status=${prov1.status}`);
  if (prov1.body.provider) createdProviders.push(prov1.body.provider);

  const prov2 = await request('POST', '/api/config/providers', {
    name: 'Qwen测试-' + S,
    vendor: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    apiKey: 'sk-test-qwen-key',
    priority: 2
  }, auth);
  assert('创建 Provider2', prov2.status === 200 && prov2.body.success, `status=${prov2.status}`);
  if (prov2.body.provider) createdProviders.push(prov2.body.provider);

  const noNameProv = await request('POST', '/api/config/providers', { vendor: 'custom' }, auth);
  assert('无名称创建Provider拒绝', noNameProv.status === 400, `status=${noNameProv.status}`);

  console.log('\n--- Provider 属性验证 ---');

  const p1 = prov1.body.provider;
  if (p1) {
    assert('Provider id 格式', p1.id.startsWith('prov_'), `id=${p1.id}`);
    assert('baseUrl 已规范化(无末尾斜杠)', !p1.baseUrl.endsWith('/'), `url=${p1.baseUrl}`);
    assert('apiKeyPreview 掩码', p1.apiKeyPreview?.includes('...'), `preview=${p1.apiKeyPreview}`);
    assert('enabled=true', p1.enabled === true, `enabled=${p1.enabled}`);
  }

  console.log('\n--- baseUrl 规范化 ---');

  const trailSlash = await request('POST', '/api/config/providers', {
    name: '斜杠测试-' + S,
    vendor: 'custom',
    baseUrl: 'https://api.test.com/v1/',
    model: 'test',
    apiKey: 'sk-test'
  }, auth);
  if (trailSlash.body.provider) {
    assert('末尾斜杠已去除', !trailSlash.body.provider.baseUrl.endsWith('/'), `url=${trailSlash.body.provider.baseUrl}`);
    createdProviders.push(trailSlash.body.provider);
  }

  const withChatPath = await request('POST', '/api/config/providers', {
    name: '路径测试-' + S,
    vendor: 'custom',
    baseUrl: 'https://api.test.com/v1/chat/completions',
    model: 'test',
    apiKey: 'sk-test2'
  }, auth);
  if (withChatPath.body.provider) {
    assert('/chat/completions 已去除', !withChatPath.body.provider.baseUrl.includes('/chat/completions'), `url=${withChatPath.body.provider.baseUrl}`);
    createdProviders.push(withChatPath.body.provider);
  }

  console.log('\n--- 最多3个Provider ---');

  if (createdProviders.length >= 3) {
    const prov4 = await request('POST', '/api/config/providers', {
      name: '第4个-' + S,
      vendor: 'custom',
      baseUrl: 'https://api.test4.com',
      model: 'test',
      apiKey: 'sk-test4'
    }, auth);
    assert('超过3个Provider拒绝', prov4.status === 400, `status=${prov4.status}`);
  }

  console.log('\n--- 更新 Provider ---');

  if (p1) {
    const updateProv = await request('PUT', `/api/config/providers/${p1.id}`, {
      name: 'DeepSeek已更新',
      enabled: false,
      model: 'deepseek-reasoner'
    }, auth);
    assert('更新Provider', updateProv.status === 200 && updateProv.body.success, `status=${updateProv.status}`);
    assert('名称已更新', updateProv.body.provider?.name === 'DeepSeek已更新', `name=${updateProv.body.provider?.name}`);
    assert('enabled已更新', updateProv.body.provider?.enabled === false, `enabled=${updateProv.body.provider?.enabled}`);

    const updateNonExist = await request('PUT', '/api/config/providers/prov_nonexistent', { name: 'x' }, auth);
    assert('更新不存在的Provider返回404', updateNonExist.status === 404, `status=${updateNonExist.status}`);
  }

  console.log('\n--- 删除 Provider ---');

  if (p1) {
    const delProv = await request('DELETE', `/api/config/providers/${p1.id}`, null, auth);
    assert('删除Provider成功', delProv.status === 200 && delProv.body.success, `status=${delProv.status}`);

    const configAfter = await request('GET', '/api/config/providers', null, auth);
    assert('Provider已从列表移除', !configAfter.body.providers.some(p => p.id === p1.id), 'removed from list');
  }

  console.log('\n--- AI Chat 接口(无Provider时) ---');

  const chatRes = await request('POST', '/api/ai/chat', {
    message: '推荐一本AI的书',
    products: [{ id: 'test1', title: { zh: 'AI入门', en: 'AI Basics' }, price: 0, desc: { zh: 'AI入门书' } }]
  });
  assert('AI Chat 返回响应(可能失败)', chatRes.status === 200 || chatRes.status === 502, `status=${chatRes.status}`);

  console.log('\n--- AI Generate 接口 ---');

  const genRes = await request('POST', '/api/ai/generate', { prompt: '写一句话' });
  assert('AI Generate 返回响应(可能失败)', genRes.status === 200 || genRes.status === 502, `status=${genRes.status}`);

  console.log('\n--- AI Test 接口 ---');

  const testNoParam = await request('POST', '/api/ai/test', {});
  assert('AI Test 无参数', testNoParam.body.success === false, `success=${testNoParam.body.success}`);

  const testWithKey = await request('POST', '/api/ai/test', {
    apiKey: 'sk-fake-key',
    baseUrl: 'https://api.nonexistent.fake',
    model: 'fake'
  });
  assert('AI Test 无效Key连接失败', testWithKey.body.success === false, `success=${testWithKey.body.success}`);

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
