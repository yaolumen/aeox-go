const { request, assert, summary, login } = require('./helpers');

async function main() {
  console.log('=== API Key 管理测试 ===\n');

  const { token, authHeader: auth } = await login();
  const createdKeys = [];

  console.log('\n--- 创建 API Key ---');

  const rwKey = await request('POST', '/api/config/keys', {
    name: '读写测试Key',
    scopes: ['read', 'write']
  }, auth);
  assert('创建读写Key', rwKey.status === 200 && rwKey.body.success, `status=${rwKey.status}`);
  if (rwKey.body.key) createdKeys.push(rwKey.body.key);

  const roKey = await request('POST', '/api/config/keys', {
    name: '只读测试Key',
    scopes: ['read']
  }, auth);
  assert('创建只读Key', roKey.status === 200 && roKey.body.success, `status=${roKey.status}`);
  if (roKey.body.key) createdKeys.push(roKey.body.key);

  const noNameKey = await request('POST', '/api/config/keys', { scopes: ['read'] }, auth);
  assert('无名称创建Key拒绝', noNameKey.status === 400, `status=${noNameKey.status}`);

  console.log('\n--- Key 属性验证 ---');

  const k1 = rwKey.body.key;
  if (k1) {
    assert('Key id 格式', k1.id.startsWith('key_'), `id=${k1.id}`);
    assert('Key 格式 aeox_', k1.key.startsWith('aeox_'), `key prefix=${k1.key.slice(0, 5)}`);
    assert('Key 长度足够', k1.key.length > 40, `length=${k1.key.length}`);
    assert('Key keyPreview 掩码', k1.keyPreview?.includes('...'), `preview=${k1.keyPreview}`);
    assert('Key enabled=true', k1.enabled === true, `enabled=${k1.enabled}`);
    assert('Key scopes 包含读写', k1.scopes.includes('read') && k1.scopes.includes('write'), `scopes=${k1.scopes}`);
  }

  console.log('\n--- 获取 Key 列表 ---');

  const keyList = await request('GET', '/api/config/keys', null, auth);
  assert('获取Key列表', keyList.status === 200 && Array.isArray(keyList.body), `count=${keyList.body?.length}`);
  assert('列表中Key已掩码', keyList.body.every(k => k.keyPreview?.includes('...')), 'all masked');
  assert('列表中不含完整key', keyList.body.every(k => !k.key || k.key.length < 70), 'no raw key');

  console.log('\n--- 更新 Key ---');

  if (k1) {
    const updateKey = await request('PUT', `/api/config/keys/${k1.id}`, { name: '更新后Key名' }, auth);
    assert('更新Key名称', updateKey.status === 200 && updateKey.body.success, `status=${updateKey.status}`);
    assert('名称已更新', updateKey.body.key?.name === '更新后Key名', `name=${updateKey.body.key?.name}`);

    const updateNonExist = await request('PUT', '/api/config/keys/key_nonexistent', { name: 'x' }, auth);
    assert('更新不存在的Key返回404', updateNonExist.status === 404, `status=${updateNonExist.status}`);
  }

  console.log('\n--- 撤销 Key(软删除) ---');

  const k2 = roKey.body.key;
  if (k2) {
    const revokeKey = await request('DELETE', `/api/config/keys/${k2.id}`, null, auth);
    assert('撤销Key成功', revokeKey.status === 200 && revokeKey.body.success, `status=${revokeKey.status}`);

    const keyListAfter = await request('GET', '/api/config/keys', null, auth);
    const revoked = keyListAfter.body.find(k => k.id === k2.id);
    assert('撤销后 enabled=false', revoked?.enabled === false, `enabled=${revoked?.enabled}`);
    assert('撤销后有 revokedAt', !!revoked?.revokedAt, `revokedAt=${revoked?.revokedAt}`);

    const delNonExist = await request('DELETE', '/api/config/keys/key_nonexistent', null, auth);
    assert('删除不存在的Key返回404', delNonExist.status === 404, `status=${delNonExist.status}`);
  }

  console.log('\n--- 撤销的 Key 不能认证 ---');

  if (k2) {
    const useRevoked = await request('GET', '/api/v1/products', null, { 'x-api-key': k2.key });
    assert('已撤销Key访问拒绝', useRevoked.status === 401, `status=${useRevoked.status}`);
  }

  console.log('\n--- 访问日志 ---');

  const logs = await request('GET', '/api/config/logs', null, auth);
  assert('获取访问日志', logs.status === 200 && Array.isArray(logs.body), `count=${logs.body?.length}`);

  const logsLimit = await request('GET', '/api/config/logs?limit=5', null, auth);
  assert('访问日志限制条数', logsLimit.status === 200, `status=${logsLimit.status}`);

  console.log('\n--- AI 调用日志 ---');

  const aiLogs = await request('GET', '/api/config/ai-logs', null, auth);
  assert('获取AI调用日志', aiLogs.status === 200 && Array.isArray(aiLogs.body), `count=${aiLogs.body?.length}`);

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
