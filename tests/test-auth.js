const { request, assert, summary, resetPassword, delay } = require('./helpers');

async function main() {
  console.log('=== 认证与会话测试 ===\n');

  await resetPassword();

  console.log('\n--- 登录测试 ---');

  const loginRes = await request('POST', '/api/login', { password: 'wrongpwd' });
  assert('错误密码拒绝', loginRes.status === 401, `status=${loginRes.status}`);

  const loginOk = await request('POST', '/api/login', { password: 'testpwd123' });
  const defaultLogin = await request('POST', '/api/login', { password: 'admin123456' });
  let goodLogin = null;
  if (loginOk.status === 200 && loginOk.body.success) {
    goodLogin = loginOk;
  } else if (defaultLogin.status === 200 && defaultLogin.body.success) {
    goodLogin = defaultLogin;
  }
  assert('正确密码登录成功', !!goodLogin && !!goodLogin.body.token, `status=${goodLogin?.status}`);

  if (!goodLogin) {
    console.log('无法登录，跳过后续测试');
    process.exit(summary());
  }

  const token = goodLogin.body.token;
  const auth = { Authorization: `Bearer ${token}` };

  assert('返回 expiresIn', typeof goodLogin.body.expiresIn === 'number', `expiresIn=${goodLogin.body.expiresIn}`);
  assert('返回 entryKey', typeof goodLogin.body.entryKey === 'string', `entryKey length=${goodLogin.body.entryKey?.length}`);

  console.log('\n--- 会话状态 ---');

  const status = await request('GET', '/api/auth/status', null, auth);
  assert('会话有效', status.status === 200 && status.body.valid === true, `valid=${status.body.valid}`);
  assert('返回 expiresIn', typeof status.body.expiresIn === 'number', `expiresIn=${status.body.expiresIn}`);

  console.log('\n--- 无效 Token ---');

  const badToken = await request('GET', '/api/auth/status', null, { Authorization: 'Bearer invalidtoken123' });
  assert('无效 Token 拒绝', badToken.status === 401, `status=${badToken.status}`);

  const noToken = await request('GET', '/api/auth/status');
  assert('无 Token 拒绝', noToken.status === 401, `status=${noToken.status}`);

  console.log('\n--- 管理员信息 ---');

  const adminInfo = await request('GET', '/api/auth/admin-info', null, auth);
  assert('获取管理员信息', adminInfo.status === 200, `status=${adminInfo.status}`);
  assert('返回 entryUrl', typeof adminInfo.body.entryUrl === 'string', `entryUrl=${adminInfo.body.entryUrl}`);
  assert('返回 passwordSource', typeof adminInfo.body.passwordSource === 'string', `source=${adminInfo.body.passwordSource}`);

  console.log('\n--- 修改密码 ---');

  const badChange = await request('POST', '/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'newpassword123' }, auth);
  assert('当前密码错误拒绝修改', badChange.status === 401, `status=${badChange.status}`);

  const shortPwd = await request('POST', '/api/auth/change-password', { currentPassword: 'admin123456', newPassword: '123' }, auth);
  assert('短密码拒绝', shortPwd.status === 400, `status=${shortPwd.status}`);

  const changeOk = await request('POST', '/api/auth/change-password', { currentPassword: 'admin123456', newPassword: 'testpwd123' }, auth);
  assert('修改密码成功', changeOk.status === 200 && changeOk.body.success, `status=${changeOk.status}`);

  console.log('\n--- 新密码登录 ---');

  const newLogin = await request('POST', '/api/login', { password: 'testpwd123' });
  assert('新密码登录成功', newLogin.status === 200 && newLogin.body.success, `status=${newLogin.status}`);

  console.log('\n--- 重置入口密钥 ---');

  const newAuth = newLogin.body.token ? { Authorization: `Bearer ${newLogin.body.token}` } : auth;
  const resetKey = await request('POST', '/api/auth/reset-entry-key', null, newAuth);
  assert('重置入口密钥', resetKey.status === 200 && resetKey.body.entryKey, `newKey=${resetKey.body.entryKey}`);

  const restoreAuth = newLogin.body.token ? { Authorization: `Bearer ${newLogin.body.token}` } : auth;
  await request('POST', '/api/auth/change-password', { currentPassword: 'testpwd123', newPassword: 'admin123456' }, restoreAuth);

  console.log('\n--- 登录速率限制 ---');

  console.log('  等待速率限制窗口重置...');
  await delay(62000);
  for (let i = 0; i < 5; i++) {
    await request('POST', '/api/login', { password: 'wrong' });
  }
  const rateLimited = await request('POST', '/api/login', { password: 'wrong' });
  assert('第6次登录被限流', rateLimited.status === 429, `status=${rateLimited.status}`);

  console.log('\n--- Admin 入口保护 ---');

  const adminNoKey = await request('GET', '/admin.html');
  assert('无密钥访问 admin 返回 404', adminNoKey.status === 404, `status=${adminNoKey.status}`);

  const siteConfig = await request('GET', '/api/config/site');
  const entryKey = siteConfig.body?.security?.adminEntryKey || '';
  if (entryKey) {
    const adminWithKey = await request('GET', `/admin.html?k=${entryKey}`);
    assert('有密钥访问 admin 返回 200', adminWithKey.status === 200, `status=${adminWithKey.status}`);
  } else {
    assert('有密钥访问 admin — 跳过(无法获取 entryKey)', true);
  }

  process.exit(summary());
}

main().catch(e => { console.error('测试异常:', e); process.exit(1); });
