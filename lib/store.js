// @ts-check
'use strict';

require('./types.js');

const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
/** @type {Record<string, any>} */
const cache = {};
/** @type {Set<string>} */
const dirtyFiles = new Set();
/** @type {NodeJS.Timeout|null} */
let flushTimer = null;

const DEFAULT_SITE_CONFIG = {
  siteName: 'AEOX',
  siteDescription: 'Curated digital products & resources, instant delivery.',
  heroTagline: 'Curated Digital Products & Resources',
  keywords: 'digital products, ebooks, ai, prompts, productivity, digital goods',
  supportEmail: '',
  heroCtaPrimary: 'Browse Collection',
  heroCtaSecondary: 'Free Products',
  socialLinks: { twitter: '', instagram: '' },
  footerCopyright: '© 2026 AEOX. All rights reserved.',
  logo: { selectedId: '', src: '', darkSrc: '', bannerSrc: '', bannerDarkSrc: '' },
  defaultLang: 'en',
  availableLangs: ['en', 'zh', 'es', 'de'],
  paymentMode: 'kofi',
  kofiLink: '',
  security: {
    sessionTimeout: 240,
    adminEntryKey: ''
  },
  seo: {
    blockedPaths: ['/admin.html', '/download.html', '/api/'],
    blockAI: true,
    blockedBots: ['GPTBot', 'ClaudeBot', 'CCBot', 'PerplexityBot', 'Google-Extended'],
    customRobotsAppend: '',
    customLlmsIntro: '',
    customLlmsSections: '',
    aiAllowCrawling: true,
    aiAllowTraining: false,
    aiCustomRules: '',
    sitemapExcludes: [],
    crossSiteSitemaps: []
  },
  stripe: {
    secretKey: '',
    mode: 'live'
  },
  refundPolicy: {
    enabled: true,
    text: 'If you need a refund, please contact our support team within 7 days of purchase. By accessing your download, you consent to immediate performance and waive your statutory 14-day right of withdrawal. Refunds for downloaded products are limited to cases such as duplicate charges, file corruption that cannot be resolved, or significant misrepresentation. For products downloaded without quality issues, refunds are generally not granted.',
    contactEmail: ''
  }
};

const DEFAULT_AI_CONFIG = {
  providers: []
};

/** @param {string} name */
function markDirty(name) {
  dirtyFiles.add(name);
  if (!flushTimer) {
    flushTimer = setTimeout(flushDirty, 30000);
    flushTimer.unref();
  }
}

/** @returns {Promise<void>} */
async function flushDirty() {
  flushTimer = null;
  if (dirtyFiles.size === 0) return;
  const files = [...dirtyFiles];
  dirtyFiles.clear();
  for (const name of files) {
    if (cache[name] !== undefined) {
      try {
        await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(cache[name], null, 2));
      } catch (e) {
        console.error(`[flushDirty] 写入 ${name} 失败:`, e.message);
      }
    }
  }
}

/**
 * @param {string} name
 * @param {any} fallback
 * @returns {Promise<any>}
 */
async function loadJson(name, fallback) {
  if (cache[name] !== undefined) return cache[name];
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, name), 'utf8');
    cache[name] = JSON.parse(raw);
    return cache[name];
  } catch (e) {
    return fallback;
  }
}

/**
 * @param {string} name
 * @param {any} data
 * @returns {Promise<boolean>}
 */
async function saveJson(name, data) {
  const oldCache = cache[name];
  cache[name] = data;
  const targetPath = path.join(DATA_DIR, name);
  const pid = process.pid;
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const tmpPath = targetPath + `.tmp.${pid}.${ts}.${rnd}`;
  for (let i = 0; i < 3; i++) {
    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
      await fs.rename(tmpPath, targetPath);
      return true;
    } catch (e) {
      console.error(`写入 ${name} 失败 (尝试 ${i + 1}/3):`, e.message);
      try { await fs.unlink(tmpPath); } catch (_) {}
      if (i < 2) await new Promise((r) => setTimeout(r, 500));
    }
  }
  cache[name] = oldCache;
  return false;
}

/** @param {string} name */
function invalidateCache(name) {
  delete cache[name];
}

/** @type {Record<string, { queue: Array<{fn: Function, resolve: Function, reject: Function}>, running: boolean }>} */
const writeLocks = {};
/**
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withLock(name, fn) {
  if (!writeLocks[name]) {
    writeLocks[name] = { queue: [], running: false };
  }
  const lock = writeLocks[name];
  return new Promise((resolve, reject) => {
    lock.queue.push({ fn, resolve, reject });
    if (!lock.running) {
      lock.running = true;
      drainQueue(lock);
    }
  });
}

function drainQueue(lock) {
  if (lock.queue.length === 0) {
    lock.running = false;
    return;
  }
  const { fn, resolve, reject } = lock.queue.shift();
  fn().then(resolve, reject).finally(() => drainQueue(lock));
}

/** @returns {Promise<void>} */
async function ensureDataDir() {
  try {
    if (!fssync.existsSync(DATA_DIR)) await fs.mkdir(DATA_DIR, { recursive: true });
    const files = {
      'site-config.json': DEFAULT_SITE_CONFIG,
      'products.json': [],
      'api-keys.json': [],
      'ai-providers.json': DEFAULT_AI_CONFIG,
      'categories.json': [],
      'tags.json': [],
      'orders.json': [],
      'short-links.json': [],
      'i18n.json': null
    };
    for (const [name, content] of Object.entries(files)) {
      const fp = path.join(DATA_DIR, name);
      if (!fssync.existsSync(fp)) await fs.writeFile(fp, JSON.stringify(content, null, 2));
    }
    const { runAllMigrations } = require('./migrations');
    await runAllMigrations();
  } catch (e) {
    console.error('数据目录初始化失败:', e.message);
  }
}

module.exports = {
  loadJson, saveJson, withLock, markDirty, flushDirty,
  invalidateCache, cache, DATA_DIR,
  DEFAULT_SITE_CONFIG, DEFAULT_AI_CONFIG,
  ensureDataDir
};
