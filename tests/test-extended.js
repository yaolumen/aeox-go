const http = require('http');
const fssync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const ADMIN_PWD = 'ext-test-pwd';
const DATA_DIR = path.join(__dirname, 'data');

let passed = 0;
let failed = 0;
const results = [];

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body !== undefined && body !== null) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function log(name, ok, detail) {
  const tag = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;
  const msg = `${tag} ${name}${detail ? ' — ' + detail : ''}`;
  results.push({ name, ok, detail, msg });
  console.log(msg);
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function resetPassword() {
  const hashFile = path.join(DATA_DIR, 'admin-password.json');
  const hash = await bcrypt.hash(ADMIN_PWD, 10);
  fssync.writeFileSync(hashFile, JSON.stringify({
    hash,
    source: 'default',
    initialPassword: ADMIN_PWD,
    createdAt: new Date().toISOString()
  }, null, 2));
  await delay(300);
}

async function login() {
  const res = await request('POST', '/api/login', { password: ADMIN_PWD });
  if (res.status !== 200 || !res.body.token) throw new Error('Login failed');
  return res.body.token;
}

async function cleanupTestProducts(token) {
  const auth = { Authorization: `Bearer ${token}` };
  const products = await request('GET', '/api/products?status=archived', null, auth);
  for (const p of (products.body || [])) {
    if (p.title?.en?.startsWith('ExtTest') || p.title?.en?.startsWith('Concurrent') || p.title?.en?.startsWith('XSS') || p.title?.en?.startsWith('Boundary')) {
      // already archived, skip
    }
  }
}

// ===================================================================
// Phase 1: Admin Write Operations — Product CRUD
// ===================================================================
async function phase1_productCRUD(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 1: Admin Write — Product CRUD');
  console.log('='.repeat(60));
  const auth = { Authorization: `Bearer ${token}` };

  const create = await request('POST', '/api/products', {
    title: { en: 'ExtTest Product A', zh: '扩展测试商品A' },
    price: 12.99,
    cover: 'https://example.com/cover.jpg',
    desc: { en: 'Test description', zh: '测试描述' },
    drive: { primary: 'https://drive.google.com/test-a', backup: 'https://backup.com/test-a' },
    stripeLink: 'https://buy.stripe.com/test_a',
    featured: true,
    categoryId: '',
    tags: []
  }, auth);
  log('创建商品', create.status === 200 && create.body.success && !!create.body.product.id, `id=${create.body.product?.id} price=${create.body.product?.price}`);
  const pid = create.body.product?.id;

  const read = await request('GET', `/api/products`, null, auth);
  const found = (read.body || []).find(p => p.id === pid);
  log('商品出现在列表', !!found && found.title?.en === 'ExtTest Product A' && found.featured === true, `found=${!!found}`);

  const update = await request('PUT', `/api/products/${pid}`, {
    price: 9.99,
    desc: { en: 'Updated description', zh: '更新描述' },
    featured: false,
    tags: ['tag_beginner', 'tag_new']
  }, auth);
  log('更新商品', update.status === 200 && update.body.success && update.body.product.price === 9.99 && update.body.product.featured === false, `price=${update.body.product?.price}`);

  const readSingle = await request('GET', `/api/products`, null, auth);
  const updated = (readSingle.body || []).find(p => p.id === pid);
  log('更新持久化', !!updated && updated.price === 9.99 && updated.desc?.en === 'Updated description', `price=${updated?.price}`);

  const del = await request('DELETE', `/api/products/${pid}`, null, auth);
  log('软删除商品', del.status === 200 && del.body.success, `status=${del.status}`);

  const afterDel = await request('GET', `/api/products`, null, auth);
  const gone = (afterDel.body || []).find(p => p.id === pid);
  log('已删除商品不出现在列表', !gone, `gone=${!gone}`);

  const archived = await request('GET', `/api/products?status=archived`, null, auth);
  const archivedFound = (archived.body || []).find(p => p.id === pid);
  log('已删除商品出现在archived列表', !!archivedFound, `found=${!!archivedFound}`);

  const createNoTitle = await request('POST', '/api/products', {}, auth);
  log('创建商品(空body)默认值', createNoTitle.status === 200 && createNoTitle.body.success && createNoTitle.body.product.price === 0, `id=${createNoTitle.body.product?.id}`);
  if (createNoTitle.body.product?.id) {
    await request('DELETE', `/api/products/${createNoTitle.body.product.id}`, null, auth);
  }

  const update404 = await request('PUT', '/api/products/p_nonexistent', { price: 1 }, auth);
  log('更新不存在商品404', update404.status === 404, `status=${update404.status}`);

  const del404 = await request('DELETE', '/api/products/p_nonexistent', null, auth);
  log('删除不存在商品404', del404.status === 404, `status=${del404.status}`);

  const batchTags = await request('POST', '/api/products/batch-tags', {
    productIds: ['p_meditation'],
    tagIds: ['tag_beginner'],
    mode: 'add'
  }, auth);
  log('批量打标签', batchTags.status === 200 && batchTags.body.success, `count=${batchTags.body.count}`);

  const batchRemove = await request('POST', '/api/products/batch-tags', {
    productIds: ['p_meditation'],
    tagIds: ['tag_beginner'],
    mode: 'remove'
  }, auth);
  log('批量移除标签', batchRemove.status === 200 && batchRemove.body.success, `count=${batchRemove.body.count}`);

  const batchInvalid = await request('POST', '/api/products/batch-tags', {}, auth);
  log('批量打标签(缺少参数)400', batchInvalid.status === 400, `status=${batchInvalid.status}`);
}

// ===================================================================
// Phase 2: Admin Write — Category CRUD
// ===================================================================
async function phase2_categoryCRUD(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 2: Admin Write — Category CRUD');
  console.log('='.repeat(60));
  const auth = { Authorization: `Bearer ${token}` };

  const create = await request('POST', '/api/config/categories', {
    name: { en: 'ExtTest Category', zh: '扩展测试分类' },
    description: 'Test category for extended tests'
  }, auth);
  log('创建分类', create.status === 200 && create.body.success && !!create.body.category.id, `id=${create.body.category?.id} slug=${create.body.category?.slug}`);
  const cid = create.body.category?.id;

  const duplicateSlug = await request('POST', '/api/config/categories', {
    name: { en: 'ExtTest Category Duplicate', zh: '' },
    slug: create.body.category?.slug
  }, auth);
  log('重复slug返回409', duplicateSlug.status === 409, `status=${duplicateSlug.status}`);

  const update = await request('PUT', `/api/config/categories/${cid}`, {
    name: { en: 'Updated ExtTest Category', zh: '更新测试分类' },
    description: 'Updated description',
    sort: 99
  }, auth);
  log('更新分类', update.status === 200 && update.body.success && update.body.category.name?.en === 'Updated ExtTest Category', `name=${update.body.category?.name?.en}`);

  const createWithName = await request('POST', '/api/config/categories', {
    name: 'String Name Category'
  }, auth);
  log('创建分类(字符串name)', createWithName.status === 200 && createWithName.body.category?.name?.en === 'String Name Category', `id=${createWithName.body.category?.id}`);
  const cid2 = createWithName.body.category?.id;

  const noName = await request('POST', '/api/config/categories', {}, auth);
  log('创建分类(无name)400', noName.status === 400, `status=${noName.status}`);

  const update404 = await request('PUT', '/api/config/categories/cat_nonexistent', { name: 'x' }, auth);
  log('更新不存在分类404', update404.status === 404, `status=${update404.status}`);

  const del2 = await request('DELETE', `/api/config/categories/${cid2}`, null, auth);
  log('删除空分类', del2.status === 200 && del2.body.success, `status=${del2.status}`);

  const del = await request('DELETE', `/api/config/categories/${cid}`, null, auth);
  log('删除测试分类', del.status === 200 && del.body.success, `status=${del.status}`);

  const del404 = await request('DELETE', '/api/config/categories/cat_nonexistent', null, auth);
  log('删除不存在分类404', del404.status === 404, `status=${del404.status}`);

  const catWithProducts = 'cat_ai_prod';
  const delConflict = await request('DELETE', `/api/config/categories/${catWithProducts}`, null, auth);
  log('删除有商品的分类409', delConflict.status === 409, `status=${delConflict.status} error=${delConflict.body?.error?.substring(0, 30)}`);
}

// ===================================================================
// Phase 3: Admin Write — Tag CRUD
// ===================================================================
async function phase3_tagCRUD(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 3: Admin Write — Tag CRUD');
  console.log('='.repeat(60));
  const auth = { Authorization: `Bearer ${token}` };

  const create = await request('POST', '/api/config/tags', {
    name: 'ExtTest Tag',
    color: '#ff0000'
  }, auth);
  log('创建标签', create.status === 200 && create.body.success && create.body.tag.color === '#ff0000', `id=${create.body.tag?.id} color=${create.body.tag?.color}`);
  const tid = create.body.tag?.id;

  const duplicate = await request('POST', '/api/config/tags', { name: 'ExtTest Tag' }, auth);
  log('重复标签名409', duplicate.status === 409, `status=${duplicate.status}`);

  const update = await request('PUT', `/api/config/tags/${tid}`, {
    name: 'Updated ExtTest Tag',
    color: '#00ff00'
  }, auth);
  log('更新标签', update.status === 200 && update.body.success && update.body.tag.name === 'Updated ExtTest Tag' && update.body.tag.color === '#00ff00', `name=${update.body.tag?.name}`);

  const noName = await request('POST', '/api/config/tags', {}, auth);
  log('创建标签(无name)400', noName.status === 400, `status=${noName.status}`);

  const update404 = await request('PUT', '/api/config/tags/tag_nonexistent', { name: 'x' }, auth);
  log('更新不存在标签404', update404.status === 404, `status=${update404.status}`);

  const del = await request('DELETE', `/api/config/tags/${tid}`, null, auth);
  log('删除标签', del.status === 200 && del.body.success, `status=${del.status}`);

  const del404 = await request('DELETE', '/api/config/tags/tag_nonexistent', null, auth);
  log('删除不存在标签404', del404.status === 404, `status=${del404.status}`);
}

// ===================================================================
// Phase 4: Admin Write — Site Config + Password + API Keys
// ===================================================================
async function phase4_siteConfigAndKeys(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 4: Admin Write — Site Config / Password / API Keys');
  console.log('='.repeat(60));
  const auth = { Authorization: `Bearer ${token}` };

  const origConfig = await request('GET', '/api/config/site');
  const origName = origConfig.body.siteName;

  const saveConfig = await request('PUT', '/api/config/site', {
    siteName: 'ExtTest Store',
    siteDescription: 'Extended test store',
    keywords: 'test, extended',
    supportEmail: 'test@example.com',
    heroCtaPrimary: 'Test Browse',
    footerCopyright: 'Test 2026',
    noteFromSam: { enabled: true, text: 'Hello from test', author: 'Tester' },
    howItWorks: { enabled: true, title: 'Test How', step1Title: 'Step1' },
    refundPolicy: { enabled: true, text: 'Test refund' },
    seo: { blockAI: true, blockedBots: ['TestBot'], blockedPaths: ['/admin.html'] }
  }, auth);
  log('保存站点配置', saveConfig.status === 200 && saveConfig.body.success && saveConfig.body.data.siteName === 'ExtTest Store', `name=${saveConfig.body.data?.siteName}`);

  const verifyConfig = await request('GET', '/api/config/site');
  log('配置持久化', verifyConfig.body.siteName === 'ExtTest Store' && verifyConfig.body.noteFromSam?.text === 'Hello from test', `name=${verifyConfig.body.siteName}`);

  const restoreConfig = await request('PUT', '/api/config/site', {
    siteName: origName || 'AEOX',
    siteDescription: origConfig.body.siteDescription
  }, auth);
  log('恢复站点配置', restoreConfig.status === 200 && restoreConfig.body.success, `name=${restoreConfig.body.data?.siteName}`);

  const changePwdShort = await request('POST', '/api/auth/change-password', {
    currentPassword: ADMIN_PWD,
    newPassword: 'short'
  }, auth);
  log('修改密码(太短)400', changePwdShort.status === 400, `status=${changePwdShort.status}`);

  const changePwdWrong = await request('POST', '/api/auth/change-password', {
    currentPassword: 'wrongpassword',
    newPassword: 'newpassword123'
  }, auth);
  log('修改密码(旧密码错误)401', changePwdWrong.status === 401, `status=${changePwdWrong.status}`);

  const resetEntry = await request('POST', '/api/auth/reset-entry-key', null, auth);
  log('重置入口密钥', resetEntry.status === 200 && resetEntry.body.success && !!resetEntry.body.entryKey, `key=${resetEntry.body.entryKey}`);

  const createKey = await request('POST', '/api/config/keys', {
    name: 'ExtTest Key',
    scopes: ['read', 'write']
  }, auth);
  log('创建API Key', createKey.status === 200 && createKey.body.success && !!createKey.body.key?.key, `id=${createKey.body.key?.id}`);
  const kid = createKey.body.key?.id;
  const keyVal = createKey.body.key?.key;

  const noKeyName = await request('POST', '/api/config/keys', {}, auth);
  log('创建Key(无name)400', noKeyName.status === 400, `status=${noKeyName.status}`);

  const newKeyRead = await request('GET', '/api/v1/products', null, { 'x-api-key': keyVal });
  log('新Key可读取', newKeyRead.status === 200, `count=${Array.isArray(newKeyRead.body) ? newKeyRead.body.length : 0}`);

  const newKeyWrite = await request('POST', '/api/v1/products', { title: { en: 'KeyTest' }, price: 0 }, { 'x-api-key': keyVal });
  log('新Key可写入', newKeyWrite.status === 201 && !!newKeyWrite.body.id, `id=${newKeyWrite.body.id}`);
  if (newKeyWrite.body.id) {
    await request('DELETE', `/api/v1/products/${newKeyWrite.body.id}`, null, { 'x-api-key': keyVal });
  }

  const updateKey = await request('PUT', `/api/config/keys/${kid}`, { name: 'Updated ExtTest Key', scopes: ['read'] }, auth);
  log('更新Key', updateKey.status === 200 && updateKey.body.success, `name=${updateKey.body.key?.name}`);

  const writeAfterScopeChange = await request('POST', '/api/v1/products', { title: { en: 'ShouldFail' } }, { 'x-api-key': keyVal });
  log('Scope改为read后写拒绝403', writeAfterScopeChange.status === 403, `status=${writeAfterScopeChange.status}`);

  const revokeKey = await request('DELETE', `/api/config/keys/${kid}`, null, auth);
  log('撤销Key', revokeKey.status === 200 && revokeKey.body.success, `status=${revokeKey.status}`);

  const revokedAccess = await request('GET', '/api/v1/products', null, { 'x-api-key': keyVal });
  log('已撤销Key拒绝401', revokedAccess.status === 401, `status=${revokedAccess.status}`);

  const updateKey404 = await request('PUT', '/api/config/keys/key_nonexistent', { name: 'x' }, auth);
  log('更新不存在Key 404', updateKey404.status === 404, `status=${updateKey404.status}`);

  const delKey404 = await request('DELETE', '/api/config/keys/key_nonexistent', null, auth);
  log('删除不存在Key 404', delKey404.status === 404, `status=${delKey404.status}`);

  const logs = await request('GET', '/api/config/logs?limit=10', null, auth);
  log('访问日志', logs.status === 200 && Array.isArray(logs.body), `count=${logs.body.length}`);

  const aiLogs = await request('GET', '/api/config/ai-logs?limit=10', null, auth);
  log('AI日志', aiLogs.status === 200 && Array.isArray(aiLogs.body), `count=${aiLogs.body.length}`);
}

// ===================================================================
// Phase 5: Concurrent Write Conflicts — withLock verification
// ===================================================================
async function phase5_concurrentWrites(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 5: Concurrent Write Conflicts (withLock)');
  console.log('='.repeat(60));
  const auth = { Authorization: `Bearer ${token}` };

  const createPromises = [];
  for (let i = 0; i < 5; i++) {
    createPromises.push(request('POST', '/api/products', {
      title: { en: `Concurrent Product ${i}`, zh: '' },
      price: Number(`1.${i}9`)
    }, auth));
  }
  const createResults = await Promise.all(createPromises);
  const createOk = createResults.filter(r => r.status === 200 && r.body.success);
  log('5并发创建商品', createOk.length === 5, `${createOk.length}/5 成功`);
  const createdIds = createOk.map(r => r.body.product?.id).filter(Boolean);

  const productsAfter = await request('GET', '/api/products', null, auth);
  const allPresent = createdIds.every(id => (productsAfter.body || []).some(p => p.id === id));
  log('所有并发创建商品持久化', allPresent, `ids=${createdIds.length}`);

  for (const id of createdIds) {
    await request('DELETE', `/api/products/${id}`, null, auth);
  }

  const tagPromises = [];
  for (let i = 0; i < 5; i++) {
    tagPromises.push(request('POST', '/api/config/tags', { name: `ConcurrentTag_${Date.now()}_${i}`, color: '#336699' }, auth));
  }
  const tagResults = await Promise.all(tagPromises);
  const tagOk = tagResults.filter(r => r.status === 200 && r.body.success);
  const tag409 = tagResults.filter(r => r.status === 409);
  log('5并发创建标签(唯一名)', tagOk.length === 5, `${tagOk.length}/5 成功, 409=${tag409.length}`);
  for (const r of tagOk) {
    await request('DELETE', `/api/config/tags/${r.body.tag?.id}`, null, auth);
  }

  const catPromises = [];
  for (let i = 0; i < 3; i++) {
    catPromises.push(request('POST', '/api/config/categories', { name: { en: `ConcurrentCat${i}`, zh: '' } }, auth));
  }
  const catResults = await Promise.all(catPromises);
  const catOk = catResults.filter(r => r.status === 200 && r.body.success);
  log('3并发创建分类', catOk.length === 3, `${catOk.length}/3 成功`);
  for (const r of catOk) {
    await request('DELETE', `/api/config/categories/${r.body.category?.id}`, null, auth);
  }

  const medProduct = (productsAfter.body || []).find(p => p.shortId === 'medt04');
  if (medProduct) {
    const updatePromises = [];
    for (let i = 0; i < 5; i++) {
      updatePromises.push(request('PUT', `/api/products/${medProduct.id}`, {
        price: 4.9 + i * 0.01
      }, auth));
    }
    const updateResults = await Promise.all(updatePromises);
    const updateOk = updateResults.filter(r => r.status === 200 && r.body.success);
    log('5并发更新同商品', updateOk.length === 5, `${updateOk.length}/5 成功`);

    const finalProduct = await request('GET', '/api/products', null, auth);
    const finalP = (finalProduct.body || []).find(p => p.id === medProduct.id);
    log('并发更新后商品存在', !!finalP && finalP.price >= 4.9, `price=${finalP?.price}`);

    await request('PUT', `/api/products/${medProduct.id}`, { price: 4.9 }, auth);
  }

  const configPromises = [];
  for (let i = 0; i < 3; i++) {
    configPromises.push(request('PUT', '/api/config/site', {
      keywords: `concurrent test ${i}`
    }, auth));
  }
  const configResults = await Promise.all(configPromises);
  const configOk = configResults.filter(r => r.status === 200 && r.body.success);
  log('3并发更新配置', configOk.length === 3, `${configOk.length}/3 成功`);
}

// ===================================================================
// Phase 6: Boundary & Edge Cases
// ===================================================================
async function phase6_boundaryAndEdge(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 6: Boundary & Edge Cases');
  console.log('='.repeat(60));
  const auth = { Authorization: `Bearer ${token}` };

  const emptyBody = await request('POST', '/api/products', '', auth);
  log('空body创建商品(空字符串)', emptyBody.status === 200, `status=${emptyBody.status} (defaults applied)`);
  if (emptyBody.body?.product?.id) {
    await request('DELETE', `/api/products/${emptyBody.body.product.id}`, null, auth);
  }

  const invalidJson = await request('POST', '/api/login', 'not json at all');
  log('无效JSON body', invalidJson.status === 400 || invalidJson.status === 500, `status=${invalidJson.status}`);

  const xssTitle = await request('POST', '/api/products', {
    title: { en: '<script>alert("xss")</script>', zh: '<img src=x onerror=alert(1)>' },
    price: 0
  }, auth);
  log('XSS标题创建商品', xssTitle.status === 200 && xssTitle.body.success, `title=${xssTitle.body.product?.title?.en?.substring(0, 30)}`);
  if (xssTitle.body?.product?.id) {
    const xssProduct = await request('GET', '/api/products', null, auth);
    const found = (xssProduct.body || []).find(p => p.id === xssTitle.body.product.id);
    log('XSS内容原样存储(前端负责转义)', !!found && found.title?.en?.includes('<script>'), `stored=${!!found}`);
    await request('DELETE', `/api/products/${xssTitle.body.product.id}`, null, auth);
  }

  const longStr = 'A'.repeat(1000);
  const longName = await request('POST', '/api/config/categories', {
    name: { en: longStr, zh: '' }
  }, auth);
  log('超长名称创建分类', longName.status === 200 && longName.body.success, `id=${longName.body.category?.id}`);
  if (longName.body?.category?.id) {
    await request('DELETE', `/api/config/categories/${longName.body.category.id}`, null, auth);
  }

  const specialChars = await request('POST', '/api/config/tags', {
    name: 'Tag with "quotes" & <angles> and 🎉emoji',
    color: '#000000'
  }, auth);
  log('特殊字符标签', specialChars.status === 200 && specialChars.body.success, `name=${specialChars.body.tag?.name}`);
  if (specialChars.body?.tag?.id) {
    await request('DELETE', `/api/config/tags/${specialChars.body.tag.id}`, null, auth);
  }

  const negativePrice = await request('POST', '/api/products', {
    title: { en: 'Boundary Negative Price', zh: '' },
    price: -10
  }, auth);
  log('负价格商品(Number(-10)=-10)', negativePrice.status === 200 && negativePrice.body?.product?.price === -10, `price=${negativePrice.body?.product?.price}`);

  const zeroPrice = await request('POST', '/api/products', {
    title: { en: 'Boundary Zero Price', zh: '' },
    price: 0
  }, auth);
  log('零价格商品', zeroPrice.status === 200 && zeroPrice.body?.product?.price === 0, `price=${zeroPrice.body?.product?.price}`);

  if (negativePrice.body?.product?.id) await request('DELETE', `/api/products/${negativePrice.body.product.id}`, null, auth);
  if (zeroPrice.body?.product?.id) await request('DELETE', `/api/products/${zeroPrice.body.product.id}`, null, auth);

  const sqlInjection = await request('POST', '/api/login', {
    password: "' OR 1=1 --"
  });
  log('SQL注入密码拒绝', sqlInjection.status === 401, `status=${sqlInjection.status}`);

  const pathTraversal = await request('GET', '/api/products/..%2F..%2Fdata%2Forders.json', null, auth);
  log('路径遍历(无匹配id返回空列表200)', pathTraversal.status === 200 && Array.isArray(pathTraversal.body), `status=${pathTraversal.status} body=Array=${Array.isArray(pathTraversal.body)}`);

  const methodNotAllowed = await request('PATCH', '/api/products', {}, auth);
  log('不支持的方法', methodNotAllowed.status === 404, `status=${methodNotAllowed.status}`);

  const checkout404 = await request('POST', '/api/checkout/nonexistent');
  log('Checkout不存在商品404', checkout404.status === 404, `status=${checkout404.status}`);

  const verifyMissingShortId = await request('POST', '/api/verify-download', { token: 'whatever' });
  log('下载校验缺少shortId 400', verifyMissingShortId.status === 400, `status=${verifyMissingShortId.status}`);

  const ordersFilter = await request('GET', '/api/orders?limit=1', null, auth);
  log('订单分页limit=1', ordersFilter.status === 200 && ordersFilter.body.length <= 1, `count=${ordersFilter.body.length}`);

  const ordersLargeLimit = await request('GET', '/api/orders?limit=9999', null, auth);
  log('订单limit>200截断为200', ordersLargeLimit.status === 200 && ordersLargeLimit.body.length <= 200, `count=${ordersLargeLimit.body.length}`);

  const dashboardRange = await request('GET', '/api/dashboard?range=today');
  log('Dashboard range=today', dashboardRange.status === 200 && !!dashboardRange.body.overview, `orders=${dashboardRange.body.overview?.totalOrders}`);

  const dashboardInvalid = await request('GET', '/api/dashboard?range=invalid');
  log('Dashboard range=invalid(fallback)', dashboardInvalid.status === 200, `status=${dashboardInvalid.status}`);
}

// ===================================================================
// Phase 7: Auth & Session Edge Cases
// ===================================================================
async function phase7_authEdgeCases(token) {
  console.log('\n' + '='.repeat(60));
  console.log('  Phase 7: Auth & Session Edge Cases');
  console.log('='.repeat(60));
  const auth = { Authorization: `Bearer ${token}` };

  const noToken = await request('GET', '/api/orders');
  log('无Token访问受保护接口401', noToken.status === 401, `status=${noToken.status}`);

  const expiredToken = await request('GET', '/api/orders', null, { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMTAwfQ.fake' });
  log('伪造Token拒绝401', expiredToken.status === 401, `status=${expiredToken.status}`);

  const noBody = await request('POST', '/api/login');
  log('登录无body', noBody.status === 401, `status=${noBody.status}`);

  const emptyPwd = await request('POST', '/api/login', { password: '' });
  log('登录空密码', emptyPwd.status === 401, `status=${emptyPwd.status}`);

  const noAuthChangePwd = await request('POST', '/api/auth/change-password', {
    currentPassword: ADMIN_PWD,
    newPassword: 'newpassword123'
  });
  log('未登录修改密码401', noAuthChangePwd.status === 401, `status=${noAuthChangePwd.status}`);

  const sessionValid = await request('GET', '/api/auth/status', null, auth);
  log('有效会话查询', sessionValid.status === 200 && sessionValid.body.valid === true, `expiresIn=${sessionValid.body.expiresIn}`);

  const v1NoKey = await request('GET', '/api/v1/products');
  log('V1无Key 401', v1NoKey.status === 401, `status=${v1NoKey.status}`);

  const v1EmptyKey = await request('GET', '/api/v1/products', null, { 'x-api-key': '' });
  log('V1空Key 401', v1EmptyKey.status === 401, `status=${v1EmptyKey.status}`);

  const v1WrongKey = await request('GET', '/api/v1/products', null, { 'x-api-key': 'aeox_wrong' });
  log('V1错误Key 401', v1WrongKey.status === 401, `status=${v1WrongKey.status}`);

  const v1RevokedKey = 'aeox_4b4b283d76cfdcd1f14797b0fc03c3bc33712cb795d0d0e35b01994916a5d060';
  const v1Revoked = await request('GET', '/api/v1/products', null, { 'x-api-key': v1RevokedKey });
  log('V1已撤销Key 401', v1Revoked.status === 401, `status=${v1Revoked.status}`);

  const v1Stats = await request('GET', '/api/v1/stats', null, { 'x-api-key': 'aeox_f8c5bf8084a8f892785985edea9dad1f7328524e1b9b8c81c13d3f8cefaab935' });
  log('V1 Stats API', v1Stats.status === 200, `status=${v1Stats.status}`);

  const v1Config = await request('GET', '/api/v1/config', null, { 'x-api-key': 'aeox_f8c5bf8084a8f892785985edea9dad1f7328524e1b9b8c81c13d3f8cefaab935' });
  log('V1 Config API', v1Config.status === 200, `status=${v1Config.status}`);

  const v1Providers = await request('GET', '/api/v1/providers', null, { 'x-api-key': 'aeox_f8c5bf8084a8f892785985edea9dad1f7328524e1b9b8c81c13d3f8cefaab935' });
  log('V1 Providers API(需admin scope)403', v1Providers.status === 403, `status=${v1Providers.status}`);

  const friendlyUrl = await request('GET', '/d/medt04');
  log('友好URL /d/:shortId', friendlyUrl.status === 200, `status=${friendlyUrl.status}`);

  const health = await request('GET', '/api/v1/health');
  log('Health check', health.body?.status === 'ok', `status=${health.body?.status}`);
}

function printSummary() {
  console.log('\n' + '█'.repeat(60));
  console.log('  AEOX Store Lite — 扩展测试汇总');
  console.log('█'.repeat(60));
  console.log(`  总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);

  if (failed > 0) {
    console.log('\n  失败项:');
    results.filter(r => !r.ok).forEach(r => console.log(`    ✗ ${r.msg}`));
  } else {
    console.log('\n  全部通过!');
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   AEOX Store Lite — 扩展范围测试                      ║');
  console.log('║   覆盖: 管理员写操作/并发冲突/边界输入/鉴权边界        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('--- 初始化 ---');
  await resetPassword();
  const token = await login();
  log('管理员登录', true, `token=${token ? 'ok' : 'fail'}`);

  await phase1_productCRUD(token);
  await phase2_categoryCRUD(token);
  await phase3_tagCRUD(token);
  await phase4_siteConfigAndKeys(token);
  await phase5_concurrentWrites(token);
  await phase6_boundaryAndEdge(token);
  await phase7_authEdgeCases(token);

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试脚本异常:', e);
  process.exit(1);
});
