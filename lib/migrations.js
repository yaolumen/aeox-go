// @ts-check
'use strict';

const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function migrateSeoFields() {
  try {
    const fp = path.join(DATA_DIR, 'site-config.json');
    if (!fssync.existsSync(fp)) return;
    const raw = await fs.readFile(fp, 'utf8');
    const cfg = JSON.parse(raw);
    if (!cfg.seo) return;
    let changed = false;
    if (cfg.seo.excludedPaths && !cfg.seo.blockedPaths) {
      cfg.seo.blockedPaths = cfg.seo.excludedPaths;
      delete cfg.seo.excludedPaths;
      changed = true;
    }
    if (cfg.seo.excludedAiBots && !cfg.seo.blockedBots) {
      cfg.seo.blockedBots = cfg.seo.excludedAiBots;
      delete cfg.seo.excludedAiBots;
      changed = true;
    }
    if (cfg.seo.blockAiCrawlers !== undefined && cfg.seo.blockAI === undefined) {
      cfg.seo.blockAI = cfg.seo.blockAiCrawlers;
      delete cfg.seo.blockAiCrawlers;
      changed = true;
    }
    if (changed) {
      await fs.writeFile(fp, JSON.stringify(cfg, null, 2));
      console.log('[SEO] 旧字段已迁移至新字段名');
    }
  } catch (e) {
    console.error('[SEO] 字段迁移失败:', e.message);
  }
}

async function migrateDownloadsFields() {
  try {
    const fp = path.join(DATA_DIR, 'products.json');
    if (!fssync.existsSync(fp)) return;
    const raw = await fs.readFile(fp, 'utf8');
    const products = JSON.parse(raw);
    if (!Array.isArray(products)) return;
    let changed = false;
    for (const p of products) {
      if (!p.downloads && p.drive) {
        const list = [];
        if (typeof p.drive === 'string' && p.drive) {
          list.push({ url: p.drive, label: '' });
        } else if (p.drive) {
          if (p.drive.primary) list.push({ url: p.drive.primary, label: '' });
          if (p.drive.backup) list.push({ url: p.drive.backup, label: '' });
        }
        p.downloads = list;
        changed = true;
      }
      if (!p.upsell) {
        p.upsell = { mode: 'auto', products: [] };
        changed = true;
      }
    }
    if (changed) {
      await fs.writeFile(fp, JSON.stringify(products, null, 2));
      console.log('[Migration] products.json: drive→downloads + upsell fields applied');
    }
  } catch (e) {
    console.error('[Migration] products migration failed:', e.message);
  }
}

async function migrateKofiFields() {
  try {
    const fp = path.join(DATA_DIR, 'products.json');
    if (!fssync.existsSync(fp)) return;
    const raw = await fs.readFile(fp, 'utf8');
    const products = JSON.parse(raw);
    if (!Array.isArray(products)) return;
    let changed = false;
    for (const p of products) {
      if (p.kofiLink === undefined) { p.kofiLink = ''; changed = true; }
      if (p.bookLang === undefined) { p.bookLang = 'en'; changed = true; }
      if (p.format === undefined) { p.format = 'PDF / EPUB / MOBI'; changed = true; }
      if (p.fileSize === undefined) { p.fileSize = ''; changed = true; }
      if (p.whatYouLearn === undefined) { p.whatYouLearn = { en: '', zh: '', es: '', de: '' }; changed = true; }
      if (p.whatYouGet === undefined) { p.whatYouGet = { en: '', zh: '', es: '', de: '' }; changed = true; }
      if (p.whoIsFor === undefined) { p.whoIsFor = { en: '', zh: '', es: '', de: '' }; changed = true; }
    }
    if (changed) {
      await fs.writeFile(fp, JSON.stringify(products, null, 2));
      console.log('[Migration] products.json: kofi + multilang fields applied');
    }
  } catch (e) {
    console.error('[Migration] kofi/multilang migration failed:', e.message);
  }
}

async function migrateMultilangFields() {
  try {
    const fp = path.join(DATA_DIR, 'products.json');
    if (!fssync.existsSync(fp)) return;
    const raw = await fs.readFile(fp, 'utf8');
    const products = JSON.parse(raw);
    if (!Array.isArray(products)) return;
    let changed = false;
    const langs = ['en', 'zh', 'es', 'de'];
    for (const p of products) {
      for (const field of ['title', 'desc']) {
        if (!p[field] || typeof p[field] !== 'object') {
          const oldVal = typeof p[field] === 'string' ? p[field] : '';
          p[field] = { en: oldVal, zh: '', es: '', de: '' };
          changed = true;
        } else {
          for (const lang of langs) {
            if (p[field][lang] === undefined) { p[field][lang] = ''; changed = true; }
          }
        }
      }
    }
    const cfgFp = path.join(DATA_DIR, 'site-config.json');
    if (fssync.existsSync(cfgFp)) {
      const cfgRaw = await fs.readFile(cfgFp, 'utf8');
      const cfg = JSON.parse(cfgRaw);
      if (!cfg.availableLangs) { cfg.availableLangs = ['en', 'zh', 'es', 'de']; changed = true; await fs.writeFile(cfgFp, JSON.stringify(cfg, null, 2)); }
      if (!cfg.paymentMode) { cfg.paymentMode = 'kofi'; changed = true; await fs.writeFile(cfgFp, JSON.stringify(cfg, null, 2)); }
      if (!cfg.kofiLink) { cfg.kofiLink = ''; changed = true; await fs.writeFile(cfgFp, JSON.stringify(cfg, null, 2)); }
    }
    const catFp = path.join(DATA_DIR, 'categories.json');
    if (fssync.existsSync(catFp)) {
      const catRaw = await fs.readFile(catFp, 'utf8');
      const cats = JSON.parse(catRaw);
      if (Array.isArray(cats)) {
        let catChanged = false;
        for (const c of cats) {
          if (!c.name || typeof c.name !== 'object') {
            const oldName = c.name || '';
            c.name = { en: typeof oldName === 'string' ? oldName : '', zh: '', es: '', de: '' };
            catChanged = true;
          } else {
            for (const lang of langs) {
              if (c.name[lang] === undefined) { c.name[lang] = ''; catChanged = true; }
            }
          }
        }
        if (catChanged) {
          await fs.writeFile(catFp, JSON.stringify(cats, null, 2));
          console.log('[Migration] categories.json: multilang fields applied');
        }
      }
    }
    if (changed) {
      await fs.writeFile(fp, JSON.stringify(products, null, 2));
      console.log('[Migration] products.json: multilang fields applied');
    }
  } catch (e) {
    console.error('[Migration] multilang migration failed:', e.message);
  }
}

async function runAllMigrations() {
  await migrateSeoFields();
  await migrateDownloadsFields();
  await migrateMultilangFields();
  await migrateKofiFields();
  const { migrateLocales } = require('./migrate-locales');
  await migrateLocales();
}

module.exports = {
  migrateSeoFields,
  migrateDownloadsFields,
  migrateMultilangFields,
  migrateKofiFields,
  runAllMigrations
};
