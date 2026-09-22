// @ts-check
const express = require('express');
const path = require('path');
const router = express.Router();

const { loadJson, saveJson, withLock, DEFAULT_SITE_CONFIG } = require('../lib/store');
const { signDownloadToken, verifyDownloadToken, DOWNLOAD_TOKEN_TTL } = require('../lib/token');
const { createOrder, getOrders } = require('../lib/orders');
const { rateLimit, generateId, BASE_URL, isValidEmail } = require('../lib/utils');
const { validate, CheckoutSchema, VerifyDownloadSchema, RecoverDownloadSchema } = require('../lib/schemas');


router.post('/checkout/:shortId', validate(CheckoutSchema), async (req, res) => {
  const { shortId } = req.params;
  const lang = req.body?.lang || req.query.lang || undefined;

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
  if (!rateLimit('checkout:' + ip, 10, 60000)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const products = await loadJson('products.json', []);
  const product = products.find((p) => p.shortId === shortId && p.status !== 'archived');
  if (!product) return res.status(404).json({ error: '商品不存在' });

  if (Number(product.price) === 0) {
    const email = req.body?.email || '';
    const normalizedEmail = (typeof email === 'string' && email.trim()) ? email.trim() : '';
    const token = signDownloadToken(product.id);
    const downloadUrl = `/download.html?id=${product.shortId}&token=${token}`;
    try {
      await createOrder({
        productId: product.id,
        productTitle: product.title?.en || product.title?.zh || '',
        shortId,
        amount: 0,
        currency: 'usd',
        customerEmail: normalizedEmail || 'anonymous',
        downloadToken: token,
        leadType: normalizedEmail ? 'opted_in' : 'skipped'
      });
    } catch (e) {
      console.error('[checkout] Free order creation failed:', e.message);
    }

    if (normalizedEmail && isValidEmail(normalizedEmail)) {
      try {
        const EMAILS_FILE = 'sample-emails.json';
        const emails = await loadJson(EMAILS_FILE, []);
        const existing = emails.find(e => e.email === normalizedEmail.toLowerCase() && e.shortId === shortId);
        if (!existing) {
          const tags = await loadJson('tags.json', []);
          const categories = await loadJson('categories.json', []);
          const productTags = (product.tags || []).map(tid => {
            const tag = tags.find(t => t.id === tid);
            return tag ? String(tag.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
          }).filter(Boolean);
          const cat = categories.find(c => c.id === product.categoryId);
          const catSlug = cat?.slug || '';
          const existingAll = emails.find(e => e.email === normalizedEmail.toLowerCase());
          const mergedTags = existingAll
            ? [...new Set([...(existingAll.tags || []), ...productTags])]
            : productTags;
          emails.unshift({
            id: generateId('em'),
            email: normalizedEmail.toLowerCase(),
            shortId,
            source: 'free_download',
            tags: mergedTags,
            category: catSlug,
            notified: false,
            createdAt: new Date().toISOString()
          });
          await withLock(EMAILS_FILE, async () => await saveJson(EMAILS_FILE, emails));
        }
      } catch (e) {
        console.error('[checkout] Email collection failed:', e.message);
      }
    }

    return res.json({ free: true, downloadUrl, token });
  }

  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const paymentMode = config.paymentMode || 'kofi';

  const kofiLink = product.kofiLink || config.kofiLink || '';
  if (paymentMode === 'kofi' && kofiLink) {
    return res.json({ free: false, kofiLink, paymentMode: 'kofi' });
  }

  if (!product.stripeLink) {
    return res.status(400).json({ error: '该商品尚未配置支付链接' });
  }

  return res.json({
    free: false,
    stripeLink: product.stripeLink,
    paymentMode: 'stripe'
  });
});

router.get('/stripe-return', async (req, res) => {
  const { sid: shortId, session_id: sessionId } = req.query;
  if (!shortId) {
    return res.redirect(`/download.html?id=&error=missing_params`);
  }

  const products = await loadJson('products.json', []);
  const product = products.find((p) => p.shortId === shortId && p.status !== 'archived');
  if (!product) {
    return res.redirect(`/download.html?id=${shortId}&error=product_not_found`);
  }

  if (Number(product.price) === 0) {
    return res.redirect(`/download.html?id=${shortId}`);
  }

  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const secretKey = config.stripe?.secretKey || '';

  async function issueTokenAndRedirect(stripeSession) {
    const token = signDownloadToken(product.id);
    try {
      await createOrder({
        productId: product.id,
        productTitle: product.title?.en || product.title?.zh || '',
        shortId,
        stripeSessionId: stripeSession?.id || sessionId || '',
        stripePaymentIntent: stripeSession?.payment_intent || '',
        amount: Number(product.price),
        currency: stripeSession?.currency || 'usd',
        customerEmail: stripeSession?.customer_details?.email || stripeSession?.customer_email || '',
        customerName: stripeSession?.customer_details?.name || '',
        downloadToken: token
      });
    } catch (e) {
      console.error('[stripe-return] Order creation failed:', e.message);
    }
    return res.redirect(`/d/${shortId}?t=${token}`);
  }

  if (!sessionId) {
    if (secretKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const listUrl = 'https://api.stripe.com/v1/checkout/sessions?limit=5&created%5Bgte%5D=' + (Math.floor(Date.now()/1000) - 300);
        const listRes = await fetch(listUrl, {
          headers: { 'Authorization': `Bearer ${secretKey}` },
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (listRes.ok) {
          const listData = await listRes.json();
          const recent = (listData.data || []).find((s) => s.payment_status === 'paid');
          if (recent) {
            const detailCtrl = new AbortController();
            const detailTimeout = setTimeout(() => detailCtrl.abort(), 10000);
            const detailUrl = 'https://api.stripe.com/v1/checkout/sessions/' + recent.id + '?expand[]=customer_details';
            const detailRes = await fetch(detailUrl, {
              headers: { 'Authorization': `Bearer ${secretKey}` },
              signal: detailCtrl.signal
            });
            clearTimeout(detailTimeout);
            if (detailRes.ok) {
              return issueTokenAndRedirect(await detailRes.json());
            }
            return issueTokenAndRedirect(recent);
          }
          console.warn('[stripe-return] No recent paid session found, but trusting Payment Link redirect');
        }
      } catch (e) {
        console.warn('[stripe-return] Session list query failed:', e.message);
      }
    }
    return issueTokenAndRedirect(null);
  }

  if (!secretKey) {
    console.error('[stripe-return] Stripe secret key not configured');
    return res.redirect(`/download.html?id=${shortId}&error=stripe_not_configured`);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!stripeRes.ok) {
      console.error(`[stripe-return] Stripe API ${stripeRes.status}: ${await stripeRes.text()}`);
      return res.redirect(`/download.html?id=${shortId}&error=stripe_api_failed`);
    }
    const session = await stripeRes.json();

    if (session.payment_status !== 'paid') {
      console.warn(`[stripe-return] Payment not paid: ${session.payment_status}`);
      return res.redirect(`/download.html?id=${shortId}&error=not_paid`);
    }

    const expectedAmount = Math.round(Number(product.price) * 100);
    const actualAmount = session.amount_total || 0;
    if (expectedAmount > 0 && actualAmount > 0 && actualAmount < expectedAmount) {
      console.warn(`[stripe-return] Amount mismatch: expected ${expectedAmount}, got ${actualAmount}`);
      return res.redirect(`/download.html?id=${shortId}&error=amount_mismatch`);
    }

    return issueTokenAndRedirect(session);
  } catch (e) {
    console.error('[stripe-return] Error:', e.message);
    return res.redirect(`/download.html?id=${shortId}&error=exception`);
  }
});

function getProductDownloads(product, lang) {
  if (product.downloads && typeof product.downloads === 'object' && !Array.isArray(product.downloads)) {
    const locales = product.locales || ['en'];
    const targetLang = lang && product.downloads[lang] ? lang : locales.find((l) => product.downloads[l] && product.downloads[l].length > 0) || locales[0] || 'en';
    const list = product.downloads[targetLang];
    if (Array.isArray(list) && list.length > 0) return list;
  }
  if (Array.isArray(product.downloads) && product.downloads.length > 0) return product.downloads;
  if (product.drive) {
    if (typeof product.drive === 'string' && product.drive) return [{ url: product.drive, label: '' }];
    if (product.drive.primary || product.drive.backup) {
      const list = [];
      if (product.drive.primary) list.push({ url: product.drive.primary, label: '' });
      if (product.drive.backup) list.push({ url: product.drive.backup, label: '' });
      return list;
    }
  }
  return [];
}

router.post('/verify-download', validate(VerifyDownloadSchema), async (req, res) => {
  const { shortId, token, lang } = req.body;

  const products = await loadJson('products.json', []);
  const product = products.find((p) => p.shortId === shortId && p.status !== 'archived');
  if (!product) return res.status(404).json({ error: '商品不存在' });

  const downloads = getProductDownloads(product, lang || undefined);
  const productDownloads = product.downloads;

  if (Number(product.price) === 0) {
    if (token) {
      const result = verifyDownloadToken(token);
      if (result.ok && result.productId === product.id) {
        return res.json({
          authorized: true,
          free: true,
          product: { id: product.id, shortId: product.shortId, title: product.title, cover: product.cover, price: product.price, downloads: productDownloads, locales: product.locales || ['en'] },
          downloads
        });
      }
    }
    return res.json({
      authorized: true,
      free: true,
      product: { id: product.id, shortId: product.shortId, title: product.title, cover: product.cover, price: product.price, downloads: productDownloads, locales: product.locales || ['en'] },
      downloads
    });
  }

  const result = verifyDownloadToken(token);
  if (!result.ok || result.productId !== product.id) {
    return res.json({
      authorized: false,
      free: false,
      reason: result.error || 'invalid_token',
      product: { id: product.id, shortId: product.shortId, title: product.title, cover: product.cover, price: product.price, downloads: productDownloads, locales: product.locales || ['en'] }
    });
  }

  return res.json({
    authorized: true,
    free: false,
    product: { id: product.id, shortId: product.shortId, title: product.title, cover: product.cover, price: product.price, downloads: productDownloads, locales: product.locales || ['en'] },
    downloads
  });
});

router.post('/recover-download', validate(RecoverDownloadSchema), async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
  if (!rateLimit('recover:' + ip, 5, 60000)) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  const { email } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  if (!rateLimit('recover-email:' + normalizedEmail, 3, 300000)) {
    return res.status(429).json({ error: '该邮箱恢复请求过于频繁，请5分钟后再试' });
  }
  const orders = await getOrders({ status: 'paid' });
  const matched = orders.filter(o => (o.customerEmail || '').trim().toLowerCase() === normalizedEmail);

  if (!matched.length) {
    return res.json({ found: false, downloads: [] });
  }

  const products = await loadJson('products.json', []);
  const downloads = [];

  for (const order of matched) {
    const product = products.find(p => p.id === order.productId && p.status !== 'archived');
    if (!product) continue;

    let token = order.downloadToken || '';
    let tokenValid = false;

    if (token) {
      const result = verifyDownloadToken(token);
      tokenValid = result.ok && result.productId === product.id;
    }

    if (!tokenValid) {
      token = signDownloadToken(product.id);
    }

    const shortId = order.shortId || product.shortId;
    const productDownloads = getProductDownloads(product);
    const hasDownloads = productDownloads.length > 0;
    downloads.push({
      productTitle: order.productTitle || product.title?.en || product.title?.zh || '',
      downloadUrl: `${BASE_URL}/d/${shortId}?t=${token}`,
      createdAt: order.createdAt,
      expiresAt: new Date(Date.now() + DOWNLOAD_TOKEN_TTL * 1000).toISOString()
    });
  }

  if (!downloads.length) {
    return res.json({ found: true, downloads: [], message: '关联商品已下架或不可用，请联系 support@aeox.uk' });
  }

  res.json({ found: true, downloads });
});

module.exports = router;
