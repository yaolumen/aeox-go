// @ts-check
/**
 * AEOX Store Lite - Express 入口
 * 模块化结构：lib/ (数据/认证/令牌/AI/统计/工具) + routes/ (admin/products/categories/tags/keys/checkout/ai/v1)
 */
const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api/v1', (req, res, next) => {
  const origin = req.headers.origin;
  const allowed = process.env.CORS_ORIGINS || '*';
  if (allowed === '*' || (origin && allowed.split(',').some(o => origin.includes(o.trim())))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const { ensureDataDir, flushDirty } = require('./lib/store');
const { debugLogMiddleware } = require('./lib/utils');

app.use(debugLogMiddleware);

process.on('uncaughtException', (err) => {
  const { debugLog } = require('./lib/utils');
  debugLog(`UNCAUGHT ${err.stack || err}`);
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  const { debugLog } = require('./lib/utils');
  debugLog(`UNHANDLED_REJECTION ${reason}`);
  console.error('Unhandled Rejection:', reason);
});
process.on('SIGTERM', async () => { await flushDirty(); removePidFile(); process.exit(0); });
process.on('SIGINT', async () => { await flushDirty(); removePidFile(); process.exit(0); });
process.on('exit', () => { removePidFile(); });

const PID_FILE = path.join(__dirname, '.server.pid');
function writePidFile() {
  try { require('fs').writeFileSync(PID_FILE, String(process.pid)); } catch (e) { console.error('PID 文件写入失败:', e.message); }
}
function removePidFile() {
  try { const fs = require('fs'); if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {}
}

ensureDataDir().then(async () => {
  const { adminEntryMiddleware, initAdminPassword } = require('./lib/auth');
  const { loadSync, BASE_URL } = require('./lib/utils');
  const { DATA_DIR, loadJson, saveJson } = require('./lib/store');
  const { ADMIN_ENTRY_KEY, ADMIN_HASH_FILE } = require('./lib/auth');
  const { migrateOrdersConsistency } = require('./lib/orders');

  await initAdminPassword();
  const migrated = await migrateOrdersConsistency();
  if (migrated) console.log('[Orders] Data consistency migration applied');

  app.use('/admin.html', adminEntryMiddleware);

  const ssr = require('./lib/ssr');

  app.get('/', async (req, res) => {
    try {
      const html = await ssr.renderHomepage(req.query.id || null);
      return res.type('html').send(html);
    } catch (e) {
      console.error('[SSR /]', e.message);
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });

  app.get('/read/:shortId', async (req, res) => {
    try {
      const html = await ssr.renderReadPage(req.params.shortId);
      if (!html) return res.status(404).sendFile(path.join(__dirname, 'index.html'));
      res.type('html').send(html);
    } catch (e) {
      console.error('[SSR /read]', e.message);
      res.sendFile(path.join(__dirname, 'read.html'));
    }
  });

  app.use('/uploads/logos', express.static(path.join(__dirname, 'assets', 'logos'), {
    maxAge: '7d',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }));

  app.use(express.static(path.join(__dirname), {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  }));

  app.get('/d/:shortId', (req, res) => {
    const token = req.query.t;
    if (token) {
      return res.redirect(`/download.html?id=${req.params.shortId}&token=${token}`);
    }
    res.sendFile(path.join(__dirname, 'download.html'));
  });

  const SHORT_LINKS_FILE = 'short-links.json';
  app.get('/s/:slug', async (req, res) => {
    try {
      const links = await loadJson(SHORT_LINKS_FILE, []);
      const link = links.find(l => l.slug === req.params.slug);
      if (!link) return res.status(404).sendFile(path.join(__dirname, 'index.html'));
      link.clicks = (link.clicks || 0) + 1;
      await saveJson(SHORT_LINKS_FILE, links);
      res.redirect(302, link.url);
    } catch (e) {
      res.redirect('/');
    }
  });

  app.use('/api', require('./routes/admin'));
  app.use('/api', require('./routes/products'));
  app.use('/api', require('./routes/categories'));
  app.use('/api', require('./routes/tags'));
  app.use('/api', require('./routes/keys'));
  app.use('/api', require('./routes/checkout'));
  app.use('/api', require('./routes/ai'));
  app.use('/api', require('./routes/short-links'));
  app.use('/api', require('./routes/samples'));
  app.use('/api/v1', require('./routes/v1'));

  const seo = require('./routes/seo');
  app.get('/sitemap.xml', seo.sitemap);
  app.get('/robots.txt', seo.robots);
  app.get('/llms.txt', seo.llms);
  app.get('/ai.txt', seo.aiTxt);

  app.use('/api', require('./routes/seo-admin'));

  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

  app.use((err, req, res, _next) => {
    const { debugLog } = require('./lib/utils');
    debugLog(`ERROR ${req.method} ${req.path} ${err.stack || err}`);
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: '请求体过大 (Request body too large)' });
    }
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.stack || err);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    writePidFile();
    console.log(`AEOX Store running at http://localhost:${PORT} (PID: ${process.pid})`);
    const os = require('os');
    const localIp = Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address;
    if (localIp) console.log(`Local network: http://${localIp}:${PORT}`);
    const entryKey = (loadSync(path.join(DATA_DIR, 'site-config.json'), {}).security?.adminEntryKey) || ADMIN_ENTRY_KEY;
    console.log(`Admin entry: http://localhost:${PORT}/admin.html?k=${entryKey}`);
    console.log(`Open API: /api/v1/* (require x-api-key header)`);
    console.log(`Password source: ${process.env.ADMIN_PASSWORD ? 'env ADMIN_PASSWORD' : (loadSync(ADMIN_HASH_FILE, null)?.source || 'random')}`);
  });
});
