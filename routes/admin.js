// @ts-check
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const LOGO_DIR = path.join(__dirname, '..', 'assets', 'logos');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(LOGO_DIR, { recursive: true });
      cb(null, LOGO_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
        return cb(new Error('Only image files allowed'));
      }
      const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      cb(null, name + ext);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 }
});

const { loadJson, saveJson, withLock, DEFAULT_SITE_CONFIG, invalidateCache } = require('../lib/store');
const { loadSync, saveSync, getClientIp, rateLimit, maskSecretKey, rot13, BASE_URL } = require('../lib/utils');
const { adminSession, verifyAdminPassword, setAdminPassword, isAdminPasswordInitial, JWT_SECRET, ADMIN_ENTRY_KEY, ADMIN_HASH_FILE, reloadPasswordFromDisk } = require('../lib/auth');
const { recordStat } = require('../lib/stats');
const { getOrders, getOrderStats, updateOrderStatus } = require('../lib/orders');
const { validate, LoginSchema, ChangePasswordSchema, CacheInvalidateSchema, TrackEventSchema, OrderStatusUpdateSchema } = require('../lib/schemas');

router.get('/logos', adminSession, (req, res) => {
  try {
    if (!fs.existsSync(LOGO_DIR)) return res.json([]);
    const files = fs.readdirSync(LOGO_DIR).filter(f => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f));
    const seen = new Set();
    const logos = [];
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      const baseId = f.replace(/\.[^.]+$/, '');
      if (seen.has(baseId)) {
        if (ext === '.svg') {
          const existing = logos.find(l => l.id === baseId);
          if (existing) {
            existing.svgUrl = `/uploads/logos/${f}`;
            existing.isSvg = true;
          }
        }
        continue;
      }
      seen.add(baseId);
      logos.push({
        id: baseId,
        filename: f,
        url: `/uploads/logos/${f}`,
        svgUrl: '',
        ext,
        isSvg: ext === '.svg',
        isLight: baseId.includes('-light') || baseId.includes('-indigo') || baseId.includes('-blue') || (!baseId.includes('-dark') && !baseId.includes('-cyan') && !baseId.includes('-violet') && !baseId.includes('-card') && !baseId.includes('-deep')),
        isDark: baseId.includes('-dark') || baseId.includes('-cyan') || baseId.includes('-violet') || baseId.includes('-card'),
        isBanner: baseId.includes('banner'),
        isSquare: !baseId.includes('banner')
      });
    }
    res.json(logos);
  } catch (e) {
    res.json([]);
  }
});

router.post('/logos/upload', adminSession, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const f = req.file.filename;
  res.json({
    success: true,
    logo: {
      id: f.replace(/\.[^.]+$/, ''),
      filename: f,
      url: `/uploads/logos/${f}`,
      ext: path.extname(f).toLowerCase(),
      isSvg: f.endsWith('.svg'),
      isLight: true,
      isDark: false,
      isBanner: false,
      isSquare: true
    }
  });
});

router.delete('/logos/:filename', adminSession, (req, res) => {
  const f = path.basename(req.params.filename);
  const fp = path.join(LOGO_DIR, f);
  if (!fs.existsSync(fp)) return res.status(404).json({ success: false, message: 'File not found' });
  fs.unlinkSync(fp);
  res.json({ success: true });
});

router.post('/login', validate(LoginSchema), async (req, res) => {
  const { password } = req.body;
  const ip = getClientIp(req);
  if (!rateLimit(`login:${ip}`, 5, 60000)) {
    return res.status(429).json({ success: false, message: '尝试过于频繁，请稍后再试' });
  }
  const ok = await verifyAdminPassword(password || '');
  if (!ok) {
    return res.status(401).json({ success: false, message: '密码错误' });
  }
  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const sec = config.security || DEFAULT_SITE_CONFIG.security;
  const ttlMin = sec.sessionTimeout || 240;
  const expiresIn = ttlMin * 60;
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { sub: 'admin', ip },
    JWT_SECRET,
    { expiresIn }
  );
  res.json({
    success: true,
    token,
    expiresIn,
    needsPasswordChange: isAdminPasswordInitial(),
    entryKey: (config.security && config.security.adminEntryKey) || ADMIN_ENTRY_KEY
  });
});

router.get('/auth/status', adminSession, (req, res) => {
  const exp = req.adminSession.exp;
  const now = Math.floor(Date.now() / 1000);
  res.json({
    valid: true,
    expiresIn: exp - now,
    expiresAt: new Date(exp * 1000).toISOString()
  });
});

router.post('/auth/change-password', adminSession, validate(ChangePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: '新密码至少 8 位' });
  }
  const ok = await verifyAdminPassword(currentPassword || '');
  if (!ok) {
    return res.status(401).json({ success: false, message: '当前密码错误' });
  }
  await setAdminPassword(newPassword);
  res.json({ success: true, message: '密码修改成功' });
});

router.post('/auth/reset-entry-key', adminSession, async (req, res) => {
  const newKey = crypto.randomBytes(6).toString('hex');
  await withLock('site-config.json', async () => {
    const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
    config.security = { ...(config.security || {}), adminEntryKey: newKey };
    await saveJson('site-config.json', config);
  });
  res.json({ success: true, entryKey: newKey, entryUrl: `/admin.html?k=${newKey}` });
});

router.post('/auth/reload-password', adminSession, async (req, res) => {
  const ok = await reloadPasswordFromDisk();
  res.json({ success: ok });
});

router.post('/cache/invalidate', adminSession, validate(CacheInvalidateSchema), async (req, res) => {
  const { files } = req.body;
  if (Array.isArray(files)) {
    files.forEach(f => invalidateCache(f));
  } else {
    invalidateCache('orders.json');
  }
  res.json({ success: true });
});

router.get('/auth/admin-info', adminSession, async (req, res) => {
  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const entryKey = (config.security && config.security.adminEntryKey) || ADMIN_ENTRY_KEY;
  const stored = loadSync(ADMIN_HASH_FILE, null);
  const baseUrl = (BASE_URL || '').replace(/\/+$/, '');
  res.json({
    entryKey,
    entryUrl: `${baseUrl}/admin.html?k=${entryKey}`,
    passwordSource: stored?.source || 'unknown',
    passwordUpdatedAt: stored?.updatedAt || stored?.createdAt || null
  });
});

router.get('/config/site', async (req, res) => {
  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const merged = {
    ...DEFAULT_SITE_CONFIG,
    ...config,
    security: { ...DEFAULT_SITE_CONFIG.security, ...(config.security || {}) },
    seo: { ...DEFAULT_SITE_CONFIG.seo, ...(config.seo || {}) },
    socialLinks: { ...DEFAULT_SITE_CONFIG.socialLinks, ...(config.socialLinks || {}) },
    stripe: { ...DEFAULT_SITE_CONFIG.stripe, ...(config.stripe || {}) },
    logo: { ...DEFAULT_SITE_CONFIG.logo, ...(config.logo || {}) },
    refundPolicy: { ...DEFAULT_SITE_CONFIG.refundPolicy, ...(config.refundPolicy || {}) }
  };
  if (!merged.availableLangs) merged.availableLangs = DEFAULT_SITE_CONFIG.availableLangs;
  if (!merged.paymentMode) merged.paymentMode = DEFAULT_SITE_CONFIG.paymentMode;
  if (merged.security.sessionTimeoutWhitelist !== undefined && !merged.security.sessionTimeout) {
    merged.security.sessionTimeout = merged.security.sessionTimeoutWhitelist;
  }
  delete merged.security.sessionTimeoutWhitelist;
  delete merged.security.sessionTimeoutNormal;
  delete merged.security.ipWhitelistEnabled;
  delete merged.security.ipWhitelist;
  if (merged.security) merged.security.adminEntryKey = '';
  if (merged.stripe && merged.stripe.secretKey) {
    const realKey = merged.stripe.secretKey;
    if (realKey.startsWith('rk_test_')) merged.stripe.mode = 'test';
    else if (realKey.startsWith('rk_live_')) merged.stripe.mode = 'live';
    merged.stripe.secretKey = maskSecretKey(realKey);
  }
  if (merged.refundPolicy && merged.refundPolicy.contactEmail) {
    merged.refundPolicy._emailEnc = rot13(merged.refundPolicy.contactEmail);
    delete merged.refundPolicy.contactEmail;
  }
  res.json(merged);
});

router.put('/config/site', adminSession, async (req, res) => {
  const data = req.body || {};
  const old = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const incomingSec = { ...(data.security || {}) };
  if (!incomingSec.adminEntryKey && (old.security || {}).adminEntryKey) {
    incomingSec.adminEntryKey = old.security.adminEntryKey;
  } else if (!incomingSec.adminEntryKey) {
    delete incomingSec.adminEntryKey;
  }
  const incomingStripe = { ...(data.stripe || {}) };
  const oldStripe = old.stripe || {};
  if (incomingStripe.secretKey !== undefined) {
    const k = incomingStripe.secretKey;
    if (k.includes('****') || (k && !k.startsWith('rk_') && !k.startsWith('sk_'))) {
      incomingStripe.secretKey = oldStripe.secretKey || '';
    }
  } else {
    incomingStripe.secretKey = oldStripe.secretKey || '';
  }
  const merged = {
    ...DEFAULT_SITE_CONFIG,
    ...old,
    ...data,
    security: { ...(old.security || {}), ...incomingSec },
    seo: { ...(old.seo || {}), ...(data.seo || {}) },
    socialLinks: { ...(old.socialLinks || {}), ...(data.socialLinks || {}) },
    stripe: { ...DEFAULT_SITE_CONFIG.stripe, ...oldStripe, ...incomingStripe },
    logo: { ...DEFAULT_SITE_CONFIG.logo, ...(old.logo || {}), ...(data.logo || {}) },
    refundPolicy: { ...DEFAULT_SITE_CONFIG.refundPolicy, ...(old.refundPolicy || {}), ...(data.refundPolicy || {}) }
  };
  if (merged.stripe.secretKey && merged.stripe.secretKey.startsWith('rk_test_')) {
    merged.stripe.mode = 'test';
  } else if (merged.stripe.secretKey && merged.stripe.secretKey.startsWith('rk_live_')) {
    merged.stripe.mode = 'live';
  }
  const ok = await withLock('site-config.json', async () => await saveJson('site-config.json', merged));
  if (merged.security) merged.security.adminEntryKey = '';
  if (merged.stripe && merged.stripe.secretKey) {
    merged.stripe.secretKey = maskSecretKey(merged.stripe.secretKey);
  }
  res.json({ success: ok, data: merged });
});

router.post('/track/pv', validate(TrackEventSchema), async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.json({ ok: false });
  await recordStat('pv', productId);
  res.json({ ok: true });
});

router.post('/track/checkout', validate(TrackEventSchema), async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.json({ ok: false });
  await recordStat('checkout', productId);
  res.json({ ok: true });
});

router.post('/track/download', validate(TrackEventSchema), async (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.json({ ok: false });
  await recordStat('download', productId);
  res.json({ ok: true });
});

router.get('/dashboard', adminSession, async (req, res) => {
  const range = req.query.range || 'all';
  const products = await loadJson('products.json', []);
  const stats = await loadJson('stats.json', { events: [], byDay: {}, byProduct: {} });

  const now = new Date();
  let startDate = new Date(0);
  if (range === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'week') startDate = new Date(now - 7 * 86400000);
  if (range === 'month') startDate = new Date(now - 30 * 86400000);

  const startTs = startDate.getTime();
  const events = (stats.events || []).filter(e => e.ts >= startTs);

  const totalPv = events.filter(e => e.type === 'pv').length;
  const totalCheckout = events.filter(e => e.type === 'checkout').length;
  const totalDownload = events.filter(e => e.type === 'download').length;
  const totalRevenue = products.reduce((sum, p) => sum + (Number(p.stats?.sales || 0) * Number(p.price || 0)), 0);
  const orderStats = await getOrderStats();

  const trend = [];
  const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const dayData = stats.byDay?.[d] || { pv: 0, checkout: 0, download: 0 };
    trend.push({ date: d, pv: dayData.pv || 0, checkout: dayData.checkout || 0, download: dayData.download || 0, revenue: 0 });
  }

  const productStats = stats.byProduct || {};
  const top5 = Object.entries(productStats)
    .map(([pid, s]) => {
      const p = products.find(x => x.id === pid);
      return { id: pid, title: p?.title?.zh || p?.title?.en || pid, pv: s.pv || 0, checkout: s.checkout || 0, download: s.download || 0 };
    })
    .sort((a, b) => b.pv - a.pv)
    .slice(0, 5);

  const funnel = {
    visit: totalPv,
    detail: totalPv,
    checkout: totalCheckout,
    download: totalDownload
  };

  res.json({
    overview: {
      totalProducts: products.length,
      totalPv,
      totalOrders: totalDownload,
      totalRevenue,
      totalSales: orderStats.totalSales,
      totalRefunds: orderStats.totalRefunds,
      totalRefunded: orderStats.totalRefunded,
      netRevenue: orderStats.netRevenue,
      leadsOptedIn: orderStats.leadsOptedIn || 0,
      leadsSkipped: orderStats.leadsSkipped || 0,
      conversionRate: totalPv > 0 ? (totalDownload / totalPv * 100).toFixed(1) : 0
    },
    trend,
    top5,
    funnel
  });
});

router.get('/orders/stats', adminSession, async (req, res) => {
  const stats = await getOrderStats();
  res.json(stats);
});

router.get('/orders', adminSession, async (req, res) => {
  const status = req.query.status;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  let orders = await getOrders(status ? { status } : {});
  if (req.query.refundStatus) {
    orders = orders.filter(o => o.refundStatus === req.query.refundStatus);
  }
  if (req.query.leadType) {
    orders = orders.filter(o => o.leadType === req.query.leadType);
  }
  orders = orders.slice(0, limit);
  res.json(orders);
});

router.put('/orders/:id/status', adminSession, validate(OrderStatusUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const { refundStatus, refundNote, stripeRefundId } = req.body;
  const updates = {};
  if (refundStatus) {
    const validStatuses = ['none', 'refunded'];
    if (!validStatuses.includes(refundStatus)) {
      return res.status(400).json({ error: '无效的 refundStatus 值' });
    }
    updates.refundStatus = refundStatus;
    if (refundStatus === 'refunded') updates.status = 'refunded';
  }
  if (refundNote !== undefined) updates.refundNote = refundNote;
  if (stripeRefundId !== undefined) updates.stripeRefundId = stripeRefundId;
  const order = await updateOrderStatus(id, updates);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  res.json({ success: true, order });
});

module.exports = router;
