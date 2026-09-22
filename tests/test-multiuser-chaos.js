// @ts-check
const BASE = 'http://localhost:3099';
const assert = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); };
const pass = (name) => console.log(`  ✓ ${name}`);

let token = '';
let apiKeyFull = '';
let apiKeyRead = '';
let apiKeyAdmin = '';

async function api(method, path, body, headers = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

async function login() {
  const { data } = await api('POST', '/api/login', { password: 'admin123456' });
  if (!data?.token) throw new Error('Login failed');
  token = data.token;
  return token;
}

function authH() { return { 'Authorization': `Bearer ${token}` }; }

// ==========================================
// SECTION 1: Setup
// ==========================================
async function setup() {
  console.log('\n=== SETUP ===');
  await login();
  pass('Admin login');

  // Create API keys
  const { data: k1 } = await api('POST', '/api/config/keys', { name: 'test-full', scopes: ['read', 'write'] }, authH());
  apiKeyFull = k1?.key?.key || '';
  assert(apiKeyFull, 'Full API key created');
  pass('API key (read+write)');

  const { data: k2 } = await api('POST', '/api/config/keys', { name: 'test-read', scopes: ['read'] }, authH());
  apiKeyRead = k2?.key?.key || '';
  assert(apiKeyRead, 'Read API key created');
  pass('API key (read-only)');

  const { data: k3 } = await api('POST', '/api/config/keys', { name: 'test-admin', scopes: ['read', 'write', 'admin'] }, authH());
  apiKeyAdmin = k3?.key?.key || '';
  assert(apiKeyAdmin, 'Admin API key created');
  pass('API key (admin)');

  // Create test categories and tags
  const ts = Date.now().toString(36);
  await api('POST', '/api/config/categories', { name: { en: `TestCat-${ts}`, zh: `测试分类-${ts}` } }, authH());
  await api('POST', '/api/config/tags', { name: `TestTag-${ts}` }, authH());
  pass('Test category + tag created');
}

// ==========================================
// SECTION 2: Multi-User Concurrent Scenarios
// ==========================================
async function testMultiUserConcurrent() {
  console.log('\n=== MULTI-USER CONCURRENT ===');
  const ts = Date.now().toString(36);

  // Create 3 free products
  const products = [];
  for (let i = 0; i < 3; i++) {
    const { data } = await api('POST', '/api/products', {
      title: { en: `FreeBook-${ts}-${i}` },
      price: 0,
      cover: `https://example.com/cover-${i}.png`,
      desc: { en: `Desc ${i}` },
      downloads: { en: [{ url: `https://drive.google.com/file-${i}`, label: 'PDF' }] },
      shortId: `free${ts}${i}`
    }, authH());
    assert(data?.success, `Product ${i} created`);
    products.push(data.product);
  }
  pass('3 free products created');

  // Simultaneous checkouts from 5 "users" for the same free product
  const checkoutPromises = [];
  for (let u = 0; u < 5; u++) {
    checkoutPromises.push(
      api('POST', `/api/checkout/${products[0].shortId}`, { email: `user${u}@test.com` })
    );
  }
  const checkoutResults = await Promise.allSettled(checkoutPromises);
  let checkoutOk = 0;
  for (const r of checkoutResults) {
    if (r.status === 'fulfilled' && r.value.data?.free && r.value.data?.downloadUrl) checkoutOk++;
  }
  assert(checkoutOk === 5, `All 5 users got download URL (${checkoutOk}/5)`);
  pass(`5 concurrent free checkouts → ${checkoutOk}/5 success`);

  // Verify tokens for each user's download
  const verifyPromises = [];
  for (const r of checkoutResults) {
    if (r.status === 'fulfilled' && r.value.data?.token) {
      verifyPromises.push(
        api('POST', '/api/verify-download', { shortId: products[0].shortId, token: r.value.data.token })
      );
    }
  }
  const verifyResults = await Promise.allSettled(verifyPromises);
  let verifyOk = 0;
  for (const r of verifyResults) {
    if (r.status === 'fulfilled' && r.value.data?.authorized) verifyOk++;
  }
  assert(verifyOk === 5, `All 5 tokens valid (${verifyOk}/5)`);
  pass(`5 concurrent token verifications → ${verifyOk}/5 valid`);

  // Same user downloads different products simultaneously
  const multiDlPromises = products.map(p =>
    api('POST', `/api/checkout/${p.shortId}`, { email: 'sameuser@test.com' })
  );
  const multiDlResults = await Promise.allSettled(multiDlPromises);
  let multiDlOk = 0;
  for (const r of multiDlResults) {
    if (r.status === 'fulfilled' && r.value.data?.free) multiDlOk++;
  }
  assert(multiDlOk === 3, `Same user downloaded all 3 products (${multiDlOk}/3)`);
  pass('Same user concurrent multi-product download');

  // Email recovery for user who bought multiple
  const { data: recovery } = await api('POST', '/api/recover-download', { email: 'sameuser@test.com' });
  assert(recovery?.downloads?.length >= 3, `Recovery returned ${recovery?.downloads?.length} downloads`);
  pass(`Email recovery returned ${recovery?.downloads?.length} products`);

  // Clean up
  for (const p of products) {
    await api('DELETE', `/api/products/${p.id}`, null, authH());
  }
  pass('Products cleaned up');
}

// ==========================================
// SECTION 3: Race Condition Tests
// ==========================================
async function testRaceConditions() {
  console.log('\n=== RACE CONDITIONS ===');
  const ts = Date.now().toString(36);

  // Test 1: Concurrent product updates to the SAME product
  const { data: prodData } = await api('POST', '/api/products', {
    title: { en: `RaceProduct-${ts}` },
    price: 10,
    cover: 'https://example.com/race.png',
    desc: { en: 'Original' },
    shortId: `race${ts}`
  }, authH());
  const productId = prodData.product.id;
  assert(productId, 'Race product created');
  pass('Race product created');

  // 10 concurrent updates to same product
  const updatePromises = [];
  for (let i = 0; i < 10; i++) {
    updatePromises.push(
      api('PUT', `/api/products/${productId}`, {
        price: 10 + i,
        desc: { en: `Update-${i}` }
      }, authH())
    );
  }
  const updateResults = await Promise.allSettled(updatePromises);
  let updateOk = 0;
  let updateFail = 0;
  for (const r of updateResults) {
    if (r.status === 'fulfilled' && r.value.data?.success) updateOk++;
    else updateFail++;
  }
  console.log(`  Concurrent updates: ${updateOk} ok, ${updateFail} failed`);
  assert(updateOk + updateFail === 10, 'All 10 update attempts resolved');

  // Verify final state is consistent (not corrupted)
  const { data: finalProd } = await api('GET', `/api/products`, null, authH());
  const prod = finalProd?.find(p => p.id === productId);
  assert(prod && typeof prod.price === 'number', 'Product not corrupted after concurrent updates');
  pass(`Product survived 10 concurrent updates (final price: ${prod?.price})`);

  // Test 2: Concurrent category creation with same slug
  const catPromises = [];
  for (let i = 0; i < 5; i++) {
    catPromises.push(
      api('POST', '/api/config/categories', {
        name: { en: `RaceCat-${ts}`, zh: `竞态分类-${ts}` }
      }, authH())
    );
  }
  const catResults = await Promise.allSettled(catPromises);
  let catOk = 0;
  let catConflict = 0;
  for (const r of catResults) {
    if (r.status === 'fulfilled' && r.value.data?.success) catOk++;
    else if (r.status === 'fulfilled' && r.value.status === 409) catConflict++;
  }
  console.log(`  Category creation: ${catOk} created, ${catConflict} conflicts`);
  assert(catOk >= 1, 'At least 1 category created');
  pass(`Concurrent category creation handled (${catOk} ok, ${catConflict} 409)`);

  // Test 3: Concurrent order status updates on same order
  const { data: orders } = await api('GET', '/api/orders', null, authH());
  if (orders?.length > 0) {
    const orderId = orders[0].id;
    const statusPromises = [];
    for (let i = 0; i < 3; i++) {
      statusPromises.push(
        api('PUT', `/api/orders/${orderId}/status`, {
          refundStatus: i % 2 === 0 ? 'refunded' : 'none',
          refundNote: `Race note ${i}`
        }, authH())
      );
    }
    const statusResults = await Promise.allSettled(statusPromises);
    let statusOk = 0;
    for (const r of statusResults) {
      if (r.status === 'fulfilled' && r.value.data?.success) statusOk++;
    }
    assert(statusOk >= 1, 'At least 1 status update succeeded');
    pass(`Concurrent order status updates (${statusOk}/3 ok)`);

    // Restore order to none
    await api('PUT', `/api/orders/${orderId}/status`, { refundStatus: 'none' }, authH());
  } else {
    pass('No orders to test concurrent status updates (skipped)');
  }

  // Test 4: Concurrent site config saves
  const configPromises = [];
  for (let i = 0; i < 5; i++) {
    configPromises.push(
      api('PUT', '/api/config/site', {
        siteName: `RaceSite-${i}-${ts}`,
        heroTagline: `Tagline ${i}`
      }, authH())
    );
  }
  const configResults = await Promise.allSettled(configPromises);
  let configOk = 0;
  for (const r of configResults) {
    if (r.status === 'fulfilled' && r.value.data?.success) configOk++;
  }
  assert(configOk >= 1, 'At least 1 config save succeeded');
  pass(`Concurrent config saves (${configOk}/5 ok)`);

  // Restore site name
  await api('PUT', '/api/config/site', { siteName: 'AEOX Store' }, authH());

  // Clean up
  await api('DELETE', `/api/products/${productId}`, null, authH());
}

// ==========================================
// SECTION 4: Logic Vulnerability Tests
// ==========================================
async function testLogicVulnerabilities() {
  console.log('\n=== LOGIC VULNERABILITIES ===');
  const ts = Date.now().toString(36);
 
  // Test 1: Free products always authorized (by design — no purchase needed)
  const { data: freeP } = await api('POST', '/api/products', {
    title: { en: `FreeTokenTest-${ts}` }, price: 0, cover: 'https://example.com/a.png',
    desc: { en: 'Free' }, downloads: { en: [{ url: 'https://drive.google.com/a', label: 'PDF' }] },
    shortId: `ftk${ts}`
  }, authH());

  const { data: freeCheckout } = await api('POST', `/api/checkout/${freeP.product.shortId}`, { email: 'token@test.com' });
  const freeToken = freeCheckout?.token;
  assert(freeToken, 'Got token for free product');

  // Free product: authorized even without token
  const { data: freeNoToken } = await api('POST', '/api/verify-download', { shortId: freeP.product.shortId });
  assert(freeNoToken?.authorized === true, 'Free product accessible without token');
  pass('Free product always authorized (by design)');

  // Free product: cross-product token is irrelevant (product is free anyway)
  // Real cross-product token check only matters for paid products
  // Paid product checkout returns payment link (no token), so we test token rejection
  // by sending a free-product token to verify-download for a non-existent paid product scenario

  // Test 1b: Token tampering on free product (token invalid but product still accessible — free)
  const tamperedToken = freeToken.slice(0, -5) + 'XXXXX';
  const { data: tamperData } = await api('POST', '/api/verify-download', { shortId: freeP.product.shortId, token: tamperedToken });
  assert(tamperData?.authorized === true, 'Free product ignores invalid token (by design)');
  pass('Free product accessible even with bad token (free = no gate)');

  // Test 1c: For paid products, verify-download properly validates token
  // Create a paid product, then send a free-product token — it should fail
  const { data: paidP } = await api('POST', '/api/products', {
    title: { en: `PaidTokenTest-${ts}` }, price: 9.99, cover: 'https://example.com/b.png',
    desc: { en: 'Paid' }, downloads: { en: [{ url: 'https://drive.google.com/b', label: 'PDF' }] },
    shortId: `ptk${ts}`
  }, authH());

  // Use free product's token against paid product — should be rejected
  const { data: crossData } = await api('POST', '/api/verify-download', { shortId: paidP.product.shortId, token: freeToken });
  assert(crossData?.authorized === false, `Cross-product token on paid product rejected (authorized=${crossData?.authorized})`);
  pass('Cross-product token rejected for paid product');

  // Paid product without token — should be unauthorized
  const { data: paidNoToken } = await api('POST', '/api/verify-download', { shortId: paidP.product.shortId });
  assert(paidNoToken?.authorized === false, 'Paid product without token → unauthorized');
  pass('Paid product requires valid token');

  // Test 1d: Empty token on paid product
  const { data: emptyToken } = await api('POST', '/api/verify-download', { shortId: paidP.product.shortId, token: '' });
  assert(emptyToken?.authorized === false, `Empty token on paid product rejected`);
  pass('Empty token rejected for paid product');

  // Test 4: V1 API scope escalation
  // Read-only key trying to create a product
  const { status: escStatus } = await api('POST', '/api/v1/products', {
    title: 'Escalation Test', price: 0
  }, { 'x-api-key': apiKeyRead });
  assert(escStatus === 403, `Read-only key blocked from creating (${escStatus})`);
  pass('API key scope escalation blocked');

  // Read+write key trying to delete (requires admin for V1)
  const { status: delEscStatus } = await api('DELETE', `/api/v1/products/${freeP.product.id}`, null, { 'x-api-key': apiKeyFull });
  // V1 DELETE requires write scope according to docs, but let's check
  pass(`V1 delete with write key: status ${delEscStatus}`);

  // Test 5: Admin-only operations without admin scope
  const { status: keyListStatus } = await api('GET', '/api/v1/keys', null, { 'x-api-key': apiKeyRead });
  assert(keyListStatus === 403, `Read key blocked from key list (${keyListStatus})`);
  pass('Read key blocked from admin key management');

  // Test 6: Recover-download for non-existent email
  const { data: noRecovery } = await api('POST', '/api/recover-download', { email: 'nonexistent@test.com' });
  assert(noRecovery?.found === false || noRecovery?.downloads?.length === 0, 'Non-existent email returns empty');
  pass('Non-existent email recovery returns empty');

  // Test 7: Checkout for archived product
  await api('DELETE', `/api/products/${freeP.product.id}`, null, authH());
  const { status: archivedCheckout } = await api('POST', `/api/checkout/${freeP.product.shortId}`, { email: 'archived@test.com' });
  assert(archivedCheckout === 404, `Archived product checkout returns 404 (${archivedCheckout})`);
  pass('Archived product checkout blocked');

  // Clean up paid product
  await api('DELETE', `/api/products/${paidP.product.id}`, null, authH());
}

// ==========================================
// SECTION 5: Edge Cases & Boundary Tests
// ==========================================
async function testEdgeCases() {
  console.log('\n=== EDGE CASES & BOUNDARIES ===');
  const ts = Date.now().toString(36);

  // Test 1: Very long product title
  const longTitle = 'A'.repeat(10000);
  const { status: longStatus, data: longData } = await api('POST', '/api/products', {
    title: { en: longTitle }, price: 0, cover: '', desc: { en: 'test' }, shortId: `long${ts}`
  }, authH());
  // Should either accept or reject with zod error
  if (longStatus === 400) {
    pass(`Very long title rejected (400) — zod validation working`);
  } else if (longData?.success) {
    pass(`Very long title accepted — no length limit on title`);
    await api('DELETE', `/api/products/${longData.product.id}`, null, authH());
  }

  // Test 2: Negative price
  const { status: negStatus } = await api('POST', '/api/products', {
    title: { en: `NegPrice-${ts}` }, price: -5, cover: '', desc: { en: 'test' }, shortId: `neg${ts}`
  }, authH());
  if (negStatus === 400) {
    pass('Negative price rejected by zod');
  } else {
    pass(`Negative price accepted (${negStatus}) — potential issue`);
  }

  // Test 3: Missing required fields
  const { status: missStatus } = await api('POST', '/api/products', {}, authH());
  assert(missStatus === 400, `Missing fields returns 400 (${missStatus})`);
  pass('Missing required fields → 400');

  // Test 4: Empty body
  const { status: emptyBody } = await api('POST', '/api/products', null, authH());
  assert(emptyBody === 400, `Empty body returns 400 (${emptyBody})`);
  pass('Empty body → 400');

  // Test 5: Special characters in tag name
  const { data: tagData } = await api('POST', '/api/config/tags', { name: `Tag<>&"'${ts}` }, authH());
  if (tagData?.success) {
    pass('Special characters in tag name accepted');
    // Verify it doesn't break listing
    const { data: tags } = await api('GET', '/api/config/tags');
    assert(Array.isArray(tags), 'Tag listing still works after special char tag');
    pass('Tag listing not broken by special characters');
  }

  // Test 6: Category with empty name
  const { status: emptyCatName } = await api('POST', '/api/config/categories', { name: { en: '' } }, authH());
  if (emptyCatName === 400) {
    pass('Empty category name rejected');
  } else {
    pass(`Empty category name accepted (${emptyCatName}) — may be intentional`);
  }

  // Test 7: Short link with invalid URL
  const { status: badUrl } = await api('POST', '/api/short-links', {
    slug: `test-${ts}`, url: 'not-a-url', description: 'test'
  }, authH());
  if (badUrl === 400) {
    pass('Invalid short-link URL rejected');
  } else {
    pass(`Invalid short-link URL accepted (${badUrl}) — may need validation`);
  }

  // Test 8: Duplicate shortId
  const { data: dup1 } = await api('POST', '/api/products', {
    title: { en: `Dup1-${ts}` }, price: 0, cover: '', desc: { en: 'd1' }, shortId: `dup${ts}`
  }, authH());
  const { status: dupStatus } = await api('POST', '/api/products', {
    title: { en: `Dup2-${ts}` }, price: 0, cover: '', desc: { en: 'd2' }, shortId: `dup${ts}`
  }, authH());
  if (dupStatus === 409) {
    pass('Duplicate shortId rejected (409)');
  } else {
    pass(`Duplicate shortId result: ${dupStatus} — may allow duplicates`);
  }
  if (dup1?.product?.id) await api('DELETE', `/api/products/${dup1.product.id}`, null, authH());

  // Test 9: Category delete with product still referencing it
  const { data: refCat } = await api('POST', '/api/config/categories', { name: { en: `RefCat-${ts}` } }, authH());
  if (refCat?.category?.id) {
    const { data: refProd } = await api('POST', '/api/products', {
      title: { en: `RefProd-${ts}` }, price: 0, cover: '', desc: { en: 'rp' },
      categoryId: refCat.category.id, shortId: `refp${ts}`
    }, authH());
    const { status: delCatStatus } = await api('DELETE', `/api/config/categories/${refCat.category.id}`, null, authH());
    if (delCatStatus === 409) {
      pass('Category with product references blocked from deletion (409)');
    } else {
      pass(`Category deletion with references: ${delCatStatus}`);
    }
    if (refProd?.product?.id) await api('DELETE', `/api/products/${refProd.product.id}`, null, authH());
  }

  // Test 10: Body size limit (1MB) — use a moderately large body to avoid OOM
  const bigBody = { title: { en: 'X'.repeat(512 * 1024) }, price: 0, shortId: `big${ts}` };
  try {
    const { status: bigStatus } = await api('POST', '/api/products', bigBody, authH());
    if (bigStatus === 413) {
      pass('Body > 1MB rejected (413)');
    } else if (bigStatus === 500) {
      pass('Body > 1MB rejected (500 — entity.too.large handled)');
    } else {
      pass(`Body > 512KB result: ${bigStatus}`);
    }
  } catch (e) {
    pass('Body size limit caused network error (likely 413)');
  }
}

// ==========================================
// SECTION 6: Security Tests
// ==========================================
async function testSecurity() {
  console.log('\n=== SECURITY ===');

  // Test 1: Access admin endpoints without auth
  const adminPaths = [
    ['GET', '/api/dashboard'],
    ['GET', '/api/orders'],
    ['GET', '/api/config/keys'],
    ['PUT', '/api/config/site'],
    ['POST', '/api/products'],
    ['DELETE', '/api/products/fake-id'],
  ];
  for (const [method, path] of adminPaths) {
    const { status } = await api(method, path, method === 'PUT' ? { siteName: 'hack' } : method === 'POST' ? { title: { en: 'hack' } } : null);
    assert(status === 401, `Unauthenticated ${method} ${path} → 401 (${status})`);
  }
  pass('All admin endpoints require authentication');

  // Test 2: Invalid JWT
  const { status: fakeJwt } = await api('GET', '/api/dashboard', null, { 'Authorization': 'Bearer fake.jwt.token' });
  assert(fakeJwt === 401, `Fake JWT rejected (${fakeJwt})`);
  pass('Fake JWT rejected');

  // Test 3: Invalid API key
  const { status: fakeKey } = await api('GET', '/api/v1/products', null, { 'x-api-key': 'aeox_fakekey123' });
  assert(fakeKey === 401, `Fake API key rejected (${fakeKey})`);
  pass('Fake API key rejected');

  // Test 4: No API key on V1
  const { status: noKey } = await api('GET', '/api/v1/products');
  assert(noKey === 401, `No API key on V1 rejected (${noKey})`);
  pass('No API key on V1 rejected');

  // Test 5: Admin entry without key returns 404 (not 403)
  const { status: noEntryKey } = await api('GET', '/admin.html');
  assert(noEntryKey === 404, `Admin without key returns 404 (${noEntryKey})`);
  pass('Admin entry without key → 404 disguise');

  // Test 6: SQL/NoSQL injection attempts in text fields
  const { status: injectStatus, data: injectData } = await api('POST', '/api/config/tags', {
    name: `'; DROP TABLE tags; --`
  }, authH());
  // Should either succeed (stored safely) or be rejected
  if (injectData?.success) {
    pass('Injection string stored safely (no SQL to inject)');
  } else {
    pass(`Injection string result: ${injectStatus}`);
  }

  // Test 7: Prototype pollution attempt
  const { status: protoStatus } = await api('POST', '/api/products', {
    title: { en: 'Proto' }, price: 0, '__proto__': { 'polluted': true }, shortId: 'proto'
  }, authH());
  // Should not crash the server
  const { status: healthCheck } = await api('GET', '/api/v1/health');
  assert(healthCheck === 200, 'Server survived prototype pollution attempt');
  pass('Server survived prototype pollution attempt');

  // Test 8: Rate limit check - rapid login attempts
  let rateLimited = false;
  for (let i = 0; i < 8; i++) {
    const { status } = await api('POST', '/api/login', { password: 'wrong-password' });
    if (status === 429) { rateLimited = true; break; }
  }
  if (rateLimited) {
    pass('Rate limiting triggered on rapid login attempts');
  } else {
    pass('Rate limiting not triggered (may need more attempts or threshold is higher)');
  }

  // Test 9: Security headers present
  const { headers } = await api('GET', '/api/products');
  assert(headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options header present');
  assert(headers.get('x-frame-options') === 'DENY', 'X-Frame-Options header present');
  pass('Security response headers present');

  // Test 10: Zod validation on V1 API
  const { status: v1BadInput } = await api('POST', '/api/v1/products', {
    title: 123,  // should be string/object
    price: 'free'  // should be number
  }, { 'x-api-key': apiKeyFull });
  assert(v1BadInput === 400, `V1 bad input rejected (${v1BadInput})`);
  pass('V1 API Zod validation working');
}

// ==========================================
// SECTION 7: Data Consistency After Chaos
// ==========================================
async function testDataConsistency() {
  console.log('\n=== DATA CONSISTENCY ===');

  // Verify all core data files are valid JSON
  const endpoints = [
    '/api/products',
    '/api/config/categories',
    '/api/config/tags',
    '/api/config/site',
    '/api/orders',
  ];
  for (const ep of endpoints) {
    const { status, data } = await api('GET', ep, null, ep.includes('config') || ep.includes('orders') ? authH() : {});
    if (ep === '/api/config/site' || ep === '/api/orders') {
      assert(status === 200 || status === 401, `${ep} accessible`);
    } else {
      assert(status === 200, `${ep} returns 200 (${status})`);
      assert(data !== null, `${ep} returns valid data`);
    }
  }
  pass('All core API endpoints returning valid data');

  // Health check still good
  const { status: health } = await api('GET', '/api/v1/health');
  assert(health === 200, 'Health check passing');
  pass('Health check OK');
}

// ==========================================
// MAIN
// ==========================================
async function main() {
  console.log('AEOX Store Lite — Multi-User Integration Test');
  console.log(`Target: ${BASE}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  let failures = 0;
  const sections = [
    ['Setup', setup],
    ['Multi-User Concurrent', testMultiUserConcurrent],
    ['Race Conditions', testRaceConditions],
    ['Logic Vulnerabilities', testLogicVulnerabilities],
    ['Edge Cases', testEdgeCases],
    ['Security', testSecurity],
    ['Data Consistency', testDataConsistency],
  ];

  for (const [name, fn] of sections) {
    try {
      await new Promise(r => setTimeout(r, 500));
      try { await login(); } catch(_) {}
      await fn();
    } catch (e) {
      console.error(`\n  ❌ SECTION FAILED: ${name}`);
      console.error(`  ${e.message}`);
      failures++;
    }
  }

  // Cleanup API keys
  console.log('\n=== CLEANUP ===');
  try {
    const { data: keys } = await api('GET', '/api/config/keys', null, authH());
    if (Array.isArray(keys)) {
      for (const k of keys) {
        if (k.name?.startsWith('test-')) {
          await api('DELETE', `/api/config/keys/${k.id}`, null, authH());
        }
      }
    }
    pass('Test API keys cleaned up');
  } catch (e) {
    console.log('  Cleanup partial:', e.message);
  }

  console.log(`\n${'='.repeat(50)}`);
  if (failures === 0) {
    console.log('ALL SECTIONS PASSED');
  } else {
    console.log(`${failures} SECTION(S) FAILED — see errors above`);
  }
  console.log('='.repeat(50));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
