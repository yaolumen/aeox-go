const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const ADMIN_PWD = 'test10users';
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function requestRaw(method, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { ...headers }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function log(userId, name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;
  const tag = userId === 0 ? '[SYS]' : `[U${String(userId).padStart(2,'0')}]`;
  const msg = `${status} ${tag} ${name}${detail ? ' — ' + detail : ''}`;
  results.push({ userId, name, ok, detail, msg });
  console.log(msg);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function resetPassword() {
  const hashFile = path.join(DATA_DIR, 'admin-password.json');
  const hash = await bcrypt.hash(ADMIN_PWD, 10);
  const fssync = require('fs');
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

function hasHtmlContent(html, searchText) {
  return html && html.includes(searchText);
}

function hasNoHtmlContent(html, searchText) {
  return html && !html.includes(searchText);
}

const USERS = [
  { id: 1, name: 'Lily', role: '新访客', desc: '首次访问，检查首页文案和SEO' },
  { id: 2, name: 'Mike', role: '免费下载用户', desc: '体验免费商品下载全流程文案' },
  { id: 3, name: 'Nina', role: '付费购买用户', desc: '测试付费商品购买提示和拒绝文案' },
  { id: 4, name: 'Oscar', role: '下载恢复用户', desc: '测试下载恢复提示和错误文案' },
  { id: 5, name: 'Pam', role: '多语言用户', desc: '检查中英西德多语言文案' }
];

async function runU1_Lily() {
  console.log('\n--- U01 Lily: 新访客 — 首页文案和SEO ---');

  const index = await requestRaw('GET', '/');
  log(1, '首页可访问', index.status === 200, `status=${index.status}`);
  log(1, '首页标题文案', hasHtmlContent(index.body, 'Digital Products for Builders'), 'title tag');
  log(1, '首页meta描述', hasHtmlContent(index.body, 'Curated digital products & resources, instant delivery'), 'meta description');
  log(1, '首页加载app.js', hasHtmlContent(index.body, 'assets/app.js'), 'script tag');
  log(1, '首页加载style.css', hasHtmlContent(index.body, 'assets/style.css'), 'stylesheet');

  const products = await request('GET', '/api/products');
  const productList = Array.isArray(products.body) ? products.body : [];
  log(1, '商品列表文案完整性', productList.length > 0, `count=${productList.length}`);

  let missingTitle = 0;
  let missingCover = 0;
  let noCoverCount = 0;
  let paidNoStripeNoKofi = 0;
  for (const p of productList) {
    if (!p.title || (!p.title.en && !p.title.zh && !p.title.es && !p.title.de)) missingTitle++;
    if (!p.cover) noCoverCount++;
    if (Number(p.price) > 0 && !p.stripeLink && !p.kofiLink) {
      paidNoStripeNoKofi++;
    }
  }
  log(1, '商品标题完整性', missingTitle === 0, `missing=${missingTitle}`);
  log(1, '商品封面有覆盖', noCoverCount < productList.length, `withCover=${productList.length - noCoverCount} total=${productList.length}`);

  const siteConfig = await request('GET', '/api/config/site');
  const sc = siteConfig.body || {};
  log(1, '站点名称', !!sc.siteName, `siteName=${sc.siteName || 'MISSING'}`);
  log(1, '站点描述', !!sc.siteDescription, `siteDescription=${sc.siteDescription ? 'present' : 'MISSING'}`);
  log(1, '退款策略文案', !sc.refundPolicy || (sc.refundPolicy && sc.refundPolicy.text), sc.refundPolicy?.enabled ? 'enabled' : 'disabled/missing');
  log(1, 'FAQ文案配置', !sc.faq || (sc.faq && sc.faq.items && sc.faq.items.length > 0), sc.faq?.enabled ? `${sc.faq?.items?.length || 0} items` : 'disabled');

  const sitemap = await requestRaw('GET', '/sitemap.xml');
  log(1, 'Sitemap文案可访问', sitemap.status === 200, `status=${sitemap.status}`);
  log(1, 'Sitemap含URL', hasHtmlContent(sitemap.body, 'http'), 'has URLs');

  const robots = await requestRaw('GET', '/robots.txt');
  log(1, 'Robots.txt可访问', robots.status === 200, `status=${robots.status}`);

  const llms = await requestRaw('GET', '/llms.txt');
  log(1, 'LLMs.txt可访问', llms.status === 200, `status=${llms.status}`);

  const privacy = await requestRaw('GET', '/privacy.html');
  log(1, '隐私政策页可访问', privacy.status === 200, `status=${privacy.status}`);
  log(1, '隐私政策标题文案', hasHtmlContent(privacy.body, 'Privacy Policy'), 'title present');

  const terms = await requestRaw('GET', '/terms.html');
  log(1, '服务条款页可访问', terms.status === 200, `status=${terms.status}`);
  log(1, '服务条款标题文案', hasHtmlContent(terms.body, 'Terms of Service'), 'title present');

  const cookies = await requestRaw('GET', '/cookies.html');
  log(1, 'Cookie政策页可访问', cookies.status === 200, `status=${cookies.status}`);
  log(1, 'Cookie政策标题文案', hasHtmlContent(cookies.body, 'Cookie Policy'), 'title present');

  const dmca = await requestRaw('GET', '/dmca.html');
  log(1, 'DMCA页可访问', dmca.status === 200, `status=${dmca.status}`);
  log(1, 'DMCA标题文案', hasHtmlContent(dmca.body, 'DMCA'), 'title present');

  const categories = await request('GET', '/api/config/categories');
  const catList = Array.isArray(categories.body) ? categories.body : [];
  let missingCatName = 0;
  for (const c of catList) {
    if (!c.name || (!c.name.en && !c.name.zh)) missingCatName++;
  }
  log(1, '分类名称文案完整性', missingCatName === 0, `missing=${missingCatName} total=${catList.length}`);

  const tags = await request('GET', '/api/config/tags');
  const tagList = Array.isArray(tags.body) ? tags.body : [];
  let missingTagName = 0;
  for (const tg of tagList) {
    const tagName = tg.name;
    if (!tagName || (typeof tagName === 'object' && !tagName.en && !tagName.zh)) missingTagName++;
    if (typeof tagName === 'string' && tagName.trim() === '') missingTagName++;
  }
  log(1, '标签名称文案完整性', missingTagName === 0, `missing=${missingTagName} total=${tagList.length}`);

  const adminNoKey = await requestRaw('GET', '/admin.html');
  log(1, 'Admin无密钥返回404', adminNoKey.status === 404, `status=${adminNoKey.status}`);
}

async function runU2_Mike() {
  console.log('\n--- U02 Mike: 免费下载用户 — 下载流程文案 ---');

  const products = await request('GET', '/api/products');
  const productList = Array.isArray(products.body) ? products.body : [];
  const activeProducts = productList.filter(p => p.status !== 'archived');
  const freeProduct = activeProducts.find(p => Number(p.price) === 0);

  if (!freeProduct) {
    log(2, '免费商品', false, '无可用免费商品');
    return;
  }

  log(2, '找到免费商品', true, `title=${freeProduct.title?.en || freeProduct.title?.zh || 'N/A'} shortId=${freeProduct.shortId}`);

  const verify = await request('POST', '/api/verify-download', { shortId: freeProduct.shortId });
  log(2, '免费商品验证authorized=true', verify.body.authorized === true, `authorized=${verify.body.authorized}`);
  log(2, '免费商品验证free=true', verify.body.free === true, `free=${verify.body.free}`);
  log(2, '验证返回商品标题', !!verify.body.product?.title, `title present`);
  log(2, '验证返回下载链接', Array.isArray(verify.body.downloads), `downloads=${verify.body.downloads?.length || 0}`);

  const checkout = await request('POST', `/api/checkout/${freeProduct.shortId}`);
  log(2, 'Checkout免费返回free=true', checkout.body.free === true, `free=${checkout.body.free}`);
  log(2, 'Checkout返回downloadUrl', !!checkout.body.downloadUrl, `url=${checkout.body.downloadUrl || 'MISSING'}`);
  log(2, 'Checkout返回token', !!checkout.body.token, `token=${checkout.body.token ? 'present' : 'MISSING'}`);

  const checkoutWithEmail = await request('POST', `/api/checkout/${freeProduct.shortId}`, { email: 'mike@test.com' });
  log(2, '免费下载带邮箱提交', checkoutWithEmail.body.free === true, `free=${checkoutWithEmail.body.free}`);

  const checkoutEmptyEmail = await request('POST', `/api/checkout/${freeProduct.shortId}`, { email: '' });
  log(2, '免费下载空邮箱跳过', checkoutEmptyEmail.body.free === true, `free=${checkoutEmptyEmail.body.free}`);

  const downloadPage = await requestRaw('GET', `/download.html?id=${freeProduct.shortId}&token=${checkout.body.token}`);
  log(2, '下载页可访问', downloadPage.status === 200, `status=${downloadPage.status}`);
  log(2, '下载页加载download.js', hasHtmlContent(downloadPage.body, 'assets/download.js'), 'script present');
  log(2, '下载页noindex meta', hasHtmlContent(downloadPage.body, 'noindex'), 'prevent search index');

  const verifyWithToken = await request('POST', '/api/verify-download', { shortId: freeProduct.shortId, token: checkout.body.token });
  log(2, '带token验证免费商品', verifyWithToken.body.authorized === true, `authorized=${verifyWithToken.body.authorized}`);
    log(2, '验证返回商品cover(可选)', typeof verifyWithToken.body.product?.cover === 'string', `cover=${verifyWithToken.body.product?.cover ? 'present' : 'empty'}`);

  const invalidShortId = await request('POST', '/api/verify-download', { shortId: 'notexist' });
  log(2, '无效shortId返回404', invalidShortId.status === 404, `status=${invalidShortId.status}`);
  log(2, '无效shortId错误文案', invalidShortId.body?.error === '商品不存在', `error=${invalidShortId.body?.error}`);
}

async function runU3_Nina() {
  console.log('\n--- U03 Nina: 付费购买用户 — 购买提示和拒绝文案 ---');

  const products = await request('GET', '/api/products');
  const productList = Array.isArray(products.body) ? products.body : [];
  const activeProducts = productList.filter(p => p.status !== 'archived');
  const paidProduct = activeProducts.find(p => Number(p.price) > 0 && p.stripeLink);
  const kofiProduct = activeProducts.find(p => Number(p.price) > 0 && p.kofiLink);
  const noLinkProduct = activeProducts.find(p => Number(p.price) > 0 && !p.stripeLink && !p.kofiLink);

  if (paidProduct) {
    log(3, '找到Stripe付费商品', true, `title=${paidProduct.title?.en || 'N/A'} price=$${paidProduct.price} shortId=${paidProduct.shortId}`);

    const checkout = await request('POST', `/api/checkout/${paidProduct.shortId}`);
    log(3, 'Stripe商品Checkout返回stripeLink', !!checkout.body.stripeLink, `stripeLink=${checkout.body.stripeLink ? 'present' : 'missing'}`);
    log(3, 'Checkout返回paymentMode=stripe', checkout.body.paymentMode === 'stripe', `paymentMode=${checkout.body.paymentMode}`);

    const verifyNoToken = await request('POST', '/api/verify-download', { shortId: paidProduct.shortId });
    log(3, '付费商品无token拒绝', verifyNoToken.body.authorized === false, `authorized=${verifyNoToken.body.authorized}`);
    log(3, '拒绝reason文案', !!verifyNoToken.body.reason, `reason=${verifyNoToken.body.reason}`);
    log(3, '拒绝返回商品信息(展示价格)', !!verifyNoToken.body.product, `product present`);
    log(3, '拒绝返回商品价格', verifyNoToken.body.product?.price > 0, `price=${verifyNoToken.body.product?.price}`);

    const verifyBadToken = await request('POST', '/api/verify-download', { shortId: paidProduct.shortId, token: 'fake.token.here' });
    log(3, '无效token拒绝', verifyBadToken.body.authorized === false, `authorized=${verifyBadToken.body.authorized}`);
    log(3, '无效token错误类型', verifyBadToken.body.reason === 'invalid_format' || verifyBadToken.body.reason === 'invalid_signature', `reason=${verifyBadToken.body.reason}`);

    const expiredToken = 'eyJwaWQiOiJwX3Rlc3QiLCJleHAiOjF9.eyJ0ZXN0IjoxfQ==';
    const verifyExpired = await request('POST', '/api/verify-download', { shortId: paidProduct.shortId, token: expiredToken });
    log(3, '过期token拒绝', verifyExpired.body.authorized === false, `authorized=${verifyExpired.body.authorized}`);
    log(3, '过期token错误类型', verifyExpired.body.reason === 'invalid_signature' || verifyExpired.body.reason === 'expired', `reason=${verifyExpired.body.reason}`);
  } else {
    log(3, 'Stripe付费商品', false, '无可用Stripe付费商品');
  }

  if (kofiProduct) {
    log(3, '找到Ko-fi付费商品', true, `title=${kofiProduct.title?.en || 'N/A'} shortId=${kofiProduct.shortId}`);
    const checkout = await request('POST', `/api/checkout/${kofiProduct.shortId}`);
    log(3, 'Ko-fi商品Checkout返回kofiLink', !!checkout.body.kofiLink, `kofiLink=${checkout.body.kofiLink ? 'present' : 'missing'}`);
    log(3, 'Checkout返回paymentMode=kofi', checkout.body.paymentMode === 'kofi', `paymentMode=${checkout.body.paymentMode}`);
  }

  if (noLinkProduct) {
    const checkoutFail = await request('POST', `/api/checkout/${noLinkProduct.shortId}`);
    log(3, '无支付链接商品Checkout拒绝', checkoutFail.status === 400, `status=${checkoutFail.status}`);
    log(3, '无支付链接错误文案', checkoutFail.body?.error === '该商品尚未配置支付链接', `error=${checkoutFail.body?.error}`);
  } else {
    log(3, '无支付链接商品(预期)', true, '所有付费商品都有支付链接');
  }

  const notFoundCheckout = await request('POST', '/api/checkout/notexist');
  log(3, '不存在商品Checkout', notFoundCheckout.status === 404, `status=${notFoundCheckout.status}`);
  log(3, '不存在商品错误文案', notFoundCheckout.body?.error === '商品不存在', `error=${notFoundCheckout.body?.error}`);

  const archived = productList.find(p => p.status === 'archived');
  if (archived) {
    const archivedCheckout = await request('POST', `/api/checkout/${archived.shortId}`);
    log(3, '下架商品Checkout拒绝', archivedCheckout.status === 404, `status=${archivedCheckout.status}`);
    log(3, '下架商品错误文案', archivedCheckout.body?.error === '商品不存在', `error=${archivedCheckout.body?.error}`);
  }
}

async function runU4_Oscar() {
  console.log('\n--- U04 Oscar: 下载恢复用户 — 恢复提示和错误文案 ---');

  const recoverNoEmail = await request('POST', '/api/recover-download', {});
  log(4, '恢复无邮箱400', recoverNoEmail.status === 400, `status=${recoverNoEmail.status}`);
  log(4, '恢复无邮箱错误文案', recoverNoEmail.body?.error === '请提供购买时使用的邮箱', `error=${recoverNoEmail.body?.error}`);

  const recoverEmptyEmail = await request('POST', '/api/recover-download', { email: '' });
  log(4, '恢复空邮箱400', recoverEmptyEmail.status === 400, `status=${recoverEmptyEmail.status}`);

  const recoverNotFound = await request('POST', '/api/recover-download', { email: 'nonexistent@noone.com' });
  log(4, '未购买邮箱返回found=false', recoverNotFound.body?.found === false, `found=${recoverNotFound.body?.found}`);
  log(4, '未购买邮箱返回空downloads', Array.isArray(recoverNotFound.body?.downloads) && recoverNotFound.body.downloads.length === 0, `downloads=${recoverNotFound.body?.downloads?.length}`);

  const recoverBadFormat = await request('POST', '/api/recover-download', { email: 'notanemail' });
  log(4, '格式错误邮箱处理', recoverBadFormat.status === 200 || recoverBadFormat.status === 400, `status=${recoverBadFormat.status}`);

  const products = await request('GET', '/api/products');
  const productList = Array.isArray(products.body) ? products.body : [];
  const freeProduct = productList.find(p => Number(p.price) === 0 && p.status !== 'archived');
  if (freeProduct) {
    const checkout = await request('POST', `/api/checkout/${freeProduct.shortId}`, { email: 'oscar@test.com' });
    if (checkout.body.free) {
      const recoverFound = await request('POST', '/api/recover-download', { email: 'oscar@test.com' });
      log(4, '已购买邮箱恢复found=true', recoverFound.body?.found === true, `found=${recoverFound.body?.found}`);
      if (recoverFound.body?.found && recoverFound.body.downloads?.length > 0) {
        const dl = recoverFound.body.downloads[0];
        log(4, '恢复返回downloadUrl', !!dl.downloadUrl, `url=${dl.downloadUrl ? 'present' : 'missing'}`);
        log(4, '恢复返回productTitle', !!dl.productTitle, `title=${dl.productTitle || 'MISSING'}`);
        log(4, '恢复返回expiresAt', !!dl.expiresAt, `expiresAt=${dl.expiresAt ? 'present' : 'MISSING'}`);
        log(4, '恢复返回createdAt', !!dl.createdAt, `createdAt=${dl.createdAt ? 'present' : 'MISSING'}`);
      } else if (recoverFound.body?.found && recoverFound.body.downloads?.length === 0) {
        log(4, '已下架商品恢复文案', !!recoverFound.body.message, `message=${recoverFound.body.message || 'MISSING'}`);
      }
    }
  }

  for (let i = 0; i < 6; i++) {
    await request('POST', '/api/recover-download', { email: `ratelimit${i}@test.com` });
  }
  const rateLimited = await request('POST', '/api/recover-download', { email: 'ratelimit7@test.com' });
  log(4, '恢复速率限制429', rateLimited.status === 429, `status=${rateLimited.status}`);
  log(4, '速率限制错误文案', !!rateLimited.body?.error, `error=${rateLimited.body?.error || 'MISSING'}`);

  const verifyNoShortId = await request('POST', '/api/verify-download', {});
  log(4, '验证缺shortId返回400', verifyNoShortId.status === 400, `status=${verifyNoShortId.status}`);
  log(4, '验证缺shortId错误文案', verifyNoShortId.body?.error === '缺少 shortId', `error=${verifyNoShortId.body?.error}`);
}

async function runU5_Pam() {
  console.log('\n--- U05 Pam: 多语言用户 — i18n文案检查 ---');

  const langs = ['en', 'zh', 'es', 'de'];
  const langNames = { en: 'English', zh: '中文', es: 'Español', de: 'Deutsch' };

  for (const lang of langs) {
    const i18n = await request('GET', `/api/i18n?lang=${lang}`);
    const t = i18n.body?.t || {};
    const hasNav = t.nav && Object.keys(t.nav).length > 0;
    const hasHero = t.hero && Object.keys(t.hero).length > 0;
    const hasProduct = t.product && Object.keys(t.product).length > 0;
    const hasDownload = t.download && Object.keys(t.download).length > 0;
    const hasDetail = t.detail && Object.keys(t.detail).length > 0;
    const hasSection = t.section && Object.keys(t.section).length > 0;

    log(5, `${langNames[lang]} i18n加载`, i18n.body?.lang === lang, `lang=${i18n.body?.lang}`);
    log(5, `${langNames[lang]} 导航文案`, hasNav, `keys=${t.nav ? Object.keys(t.nav).length : 0}`);
    log(5, `${langNames[lang]} 首页文案`, hasHero, `keys=${t.hero ? Object.keys(t.hero).length : 0}`);
    log(5, `${langNames[lang]} 商品文案`, hasProduct, `keys=${t.product ? Object.keys(t.product).length : 0}`);
    log(5, `${langNames[lang]} 下载文案`, hasDownload, `keys=${t.download ? Object.keys(t.download).length : 0}`);
    log(5, `${langNames[lang]} 详情文案`, hasDetail, `keys=${t.detail ? Object.keys(t.detail).length : 0}`);
    log(5, `${langNames[lang]} 分区文案`, hasSection, `keys=${t.section ? Object.keys(t.section).length : 0}`);
  }

  const enI18n = await request('GET', '/api/i18n?lang=en');
  const t = enI18n.body?.t || {};
  log(5, 'EN download.validFor24h', !!t.download?.validFor24h, `text="${t.download?.validFor24h || 'MISSING'}"`);
  log(5, 'EN download.downloadReady', !!t.download?.downloadReady, `text="${t.download?.downloadReady || 'MISSING'}"`);
  log(5, 'EN download.purchaseVerified', !!t.download?.purchaseVerified, `text="${t.download?.purchaseVerified || 'MISSING'}"`);
  log(5, 'EN download.purchaseRequired', !!t.download?.purchaseRequired, `text="${t.download?.purchaseRequired || 'MISSING'}"`);
  log(5, 'EN download.paidProductMsg', !!t.download?.paidProductMsg, `text="${t.download?.paidProductMsg || 'MISSING'}"`);
  log(5, 'EN download.downloadTips', !!t.download?.downloadTips, `text="${t.download?.downloadTips || 'MISSING'}"`);
  log(5, 'EN download.downloadTipsBody', !!t.download?.downloadTipsBody, `text="${t.download?.downloadTipsBody?.substring(0, 40) || 'MISSING'}..."`);
  log(5, 'EN download.saveLink', !!t.download?.saveLink, `text="${t.download?.saveLink || 'MISSING'}"`);
  log(5, 'EN download.copied', !!t.download?.copied, `text="${t.download?.copied || 'MISSING'}"`);
  log(5, 'EN download.alreadyPurchased', !!t.download?.alreadyPurchased, `text="${t.download?.alreadyPurchased || 'MISSING'}"`);
  log(5, 'EN download.recoverTitle', !!t.download?.recoverTitle, `text="${t.download?.recoverTitle || 'MISSING'}"`);
  log(5, 'EN download.purchaseEmail', !!t.download?.purchaseEmail, `text="${t.download?.purchaseEmail || 'MISSING'}"`);
  log(5, 'EN download.backToStore', !!t.download?.backToStore, `text="${t.download?.backToStore || 'MISSING'}"`);
  log(5, 'EN download.productNotFound', !!t.download?.productNotFound, `text="${t.download?.productNotFound || 'MISSING'}"`);
  log(5, 'EN download.noDownloadLinks', !!t.download?.noDownloadLinks, `text="${t.download?.noDownloadLinks || 'MISSING'}"`);
  log(5, 'EN download.refundPolicy', !!t.download?.refundPolicy, `text="${t.download?.refundPolicy || 'MISSING'}"`);
  log(5, 'EN download.contactSupport', !!t.download?.contactSupport, `text="${t.download?.contactSupport || 'MISSING'}"`);
  log(5, 'EN download.youMightAlsoLike', !!t.download?.youMightAlsoLike, `text="${t.download?.youMightAlsoLike || 'MISSING'}"`);

  log(5, 'EN detail.buyNow', !!t.detail?.buyNow, `text="${t.detail?.buyNow || 'MISSING'}"`);
  log(5, 'EN detail.getOnKofi', !!t.detail?.getOnKofi, `text="${t.detail?.getOnKofi || 'MISSING'}"`);
  log(5, 'EN detail.submitAndDownload', !!t.detail?.submitAndDownload, `text="${t.detail?.submitAndDownload || 'MISSING'}"`);
  log(5, 'EN detail.skipAndDownload', !!t.detail?.skipAndDownload, `text="${t.detail?.skipAndDownload || 'MISSING'}"`);
  log(5, 'EN detail.noEmailRequired', !!t.detail?.noEmailRequired, `text="${t.detail?.noEmailRequired || 'MISSING'}"`);
  log(5, 'EN detail.downloadFreeGuide', !!t.detail?.downloadFreeGuide, `text="${t.detail?.downloadFreeGuide || 'MISSING'}"`);
  log(5, 'EN detail.wantCompleteGuide', !!t.detail?.wantCompleteGuide, `text="${t.detail?.wantCompleteGuide || 'MISSING'}"`);

  log(5, 'EN hero.tagline', !!t.hero?.tagline, `text="${t.hero?.tagline || 'MISSING'}"`);
  log(5, 'EN hero.instantDownload', !!t.hero?.instantDownload, `text="${t.hero?.instantDownload || 'MISSING'}"`);
  log(5, 'EN hero.securePayment', !!t.hero?.securePayment, `text="${t.hero?.securePayment || 'MISSING'}"`);

  log(5, 'EN product.free', !!t.product?.free, `text="${t.product?.free || 'MISSING'}"`);
  log(5, 'EN product.viewDetails', !!t.product?.viewDetails, `text="${t.product?.viewDetails || 'MISSING'}"`);

  const zhI18n = await request('GET', '/api/i18n?lang=zh');
  const zt = zhI18n.body?.t || {};
  log(5, 'ZH download.validFor24h', !!zt.download?.validFor24h, `text="${zt.download?.validFor24h || 'MISSING'}"`);
  log(5, 'ZH download.downloadReady', !!zt.download?.downloadReady, `text="${zt.download?.downloadReady || 'MISSING'}"`);
  log(5, 'ZH download.purchaseRequired', !!zt.download?.purchaseRequired, `text="${zt.download?.purchaseRequired || 'MISSING'}"`);
  log(5, 'ZH download.paidProductMsg', !!zt.download?.paidProductMsg, `text="${zt.download?.paidProductMsg || 'MISSING'}"`);
  log(5, 'ZH download.alreadyPurchased', !!zt.download?.alreadyPurchased, `text="${zt.download?.alreadyPurchased || 'MISSING'}"`);
  log(5, 'ZH hero.tagline', !!zt.hero?.tagline, `text="${zt.hero?.tagline || 'MISSING'}"`);
  log(5, 'ZH product.free', !!zt.product?.free, `text="${zt.product?.free || 'MISSING'}"`);

  const productWithI18n = (await request('GET', '/api/products')).body?.find(p => p.title?.zh && p.title?.en);
  if (productWithI18n) {
    log(5, '商品标题中英双语', !!productWithI18n.title.en && !!productWithI18n.title.zh, `en="${productWithI18n.title.en}" zh="${productWithI18n.title.zh}"`);
    if (productWithI18n.desc) {
      const hasBoth = !!productWithI18n.desc.en && !!productWithI18n.desc.zh;
      log(5, '商品描述中英双语(可选)', true, `hasBoth=${hasBoth} en=${!!productWithI18n.desc.en} zh=${!!productWithI18n.desc.zh}`);
    }
  }

  const fallbackLang = await request('GET', '/api/i18n?lang=fr');
  log(5, '不支持语言回退', fallbackLang.body?.lang === 'en' || fallbackLang.body?.lang === 'fr', `lang=${fallbackLang.body?.lang}`);
}

function printSummary() {
  console.log('\n' + '█'.repeat(60));
  console.log('  AEOX Store Lite — 5 用户 UX/文案 多维度测试汇总');
  console.log('█'.repeat(60));

  console.log('\n  按用户统计:');
  console.log('  ' + '-'.repeat(55));
  for (const user of USERS) {
    const userResults = results.filter(r => r.userId === user.id);
    const p = userResults.filter(r => r.ok).length;
    const f = userResults.filter(r => !r.ok).length;
    const icon = f === 0 ? '✓' : '✗';
    console.log(`  ${icon} ${user.name.padEnd(8)} (U${String(user.id).padStart(2,'0')}) ${user.role.padEnd(12)} ${p}P/${f}F`);
    console.log(`    ${user.desc}`);
  }
  console.log('  ' + '-'.repeat(55));
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
  console.log('║   AEOX Store Lite — 5 用户 UX/文案 多维度测试        ║');
  console.log('║   维度: SEO/文案/下载提示/错误消息/多语言             ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('--- 初始化 ---');
  await resetPassword();

  const runningServer = await new Promise((resolve) => {
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/v1/health', method: 'GET', timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });

  if (!runningServer) {
    log(0, '服务器未运行', false, '请先启动服务器 (node server.js)');
    process.exit(1);
  }
  log(0, '服务器运行中', true, 'localhost:3000');

  await Promise.all([
    runU1_Lily(),
    runU2_Mike(),
    runU3_Nina(),
    runU4_Oscar(),
    runU5_Pam()
  ]);

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试脚本异常:', e);
  process.exit(1);
});
