const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

async function migrateLocales() {
  try {
    const fp = path.join(DATA_DIR, 'products.json');
    if (!fssync.existsSync(fp)) return;
    const raw = await fs.readFile(fp, 'utf8');
    const products = JSON.parse(raw);
    if (!Array.isArray(products)) return;
    let changed = false;

    for (const p of products) {
      if (p.locales) continue;

      const locales = deriveLocales(p);
      p.locales = locales;
      changed = true;

      if (p.downloads && !Array.isArray(p.downloads) && typeof p.downloads === 'object') {
        continue;
      }

      const oldDownloads = resolveOldDownloads(p);
      const newDownloads = {};
      const primaryLocale = locales[0] || 'en';
      if (oldDownloads.length > 0) {
        newDownloads[primaryLocale] = oldDownloads;
      }
      p.downloads = newDownloads;
    }

    if (changed) {
      await fs.writeFile(fp, JSON.stringify(products, null, 2));
      console.log('[Migration] products.json: locales + downloads-by-lang migration applied');
    }
  } catch (e) {
    console.error('[Migration] locales migration failed:', e.message);
  }
}

function deriveLocales(product) {
  const seen = new Set();
  const textFields = ['title', 'desc', 'whatYouLearn', 'whatYouGet', 'whoIsFor'];
  for (const field of textFields) {
    const val = product[field];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const [lang, text] of Object.entries(val)) {
        if (typeof text === 'string' && text.trim()) {
          seen.add(lang);
        }
      }
    }
  }
  if (product.bookLang && typeof product.bookLang === 'string' && product.bookLang.trim()) {
    seen.add(product.bookLang.trim());
  }
  if (seen.size === 0) {
    seen.add('en');
  }
  return [...seen];
}

function resolveOldDownloads(product) {
  if (Array.isArray(product.downloads) && product.downloads.length > 0) {
    return product.downloads;
  }
  if (product.drive) {
    if (typeof product.drive === 'string' && product.drive) {
      return [{ url: product.drive, label: '' }];
    }
    const list = [];
    if (product.drive.primary) list.push({ url: product.drive.primary, label: '' });
    if (product.drive.backup) list.push({ url: product.drive.backup, label: '' });
    return list;
  }
  return [];
}

module.exports = { migrateLocales, deriveLocales, resolveOldDownloads };
