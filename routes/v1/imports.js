// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock } = require('../../lib/store');
const { generateId } = require('../../lib/utils');
const { apiKeyAuth } = require('../../lib/auth');
const { validate, ImportPreviewSchema, ImportSchema } = require('../../lib/schemas');

router.post('/preview', apiKeyAuth, validate(ImportPreviewSchema), async (req, res) => {
  const { products: importProducts, categories: importCategories, tags: importTags } = req.body;
  const products = await loadJson('products.json', []);
  const existingIds = new Set(products.map(p => p.id));
  const existingShortIds = new Set(products.map(p => p.shortId));
  const preview = [];

  for (const item of importProducts) {
    const id = item.id || '';
    const shortId = item.shortId || '';
    const exists = existingIds.has(id) || existingShortIds.has(shortId);
    const existing = exists
      ? products.find(p => p.id === id || p.shortId === shortId)
      : null;
    preview.push({
      id,
      shortId,
      title: item.title?.en || item.title?.zh || '',
      price: item.price || 0,
      exists,
      currentTitle: existing ? (existing.title?.en || existing.title?.zh || '') : '',
      currentPrice: existing ? existing.price : null,
      action: exists ? 'update' : 'add'
    });
  }

  const categories = await loadJson('categories.json', []);
  const existingCatSlugs = new Set(categories.map(c => c.slug));
  const catPreview = [];
  if (Array.isArray(importCategories)) {
    for (const cat of importCategories) {
      const slug = cat.slug || '';
      catPreview.push({
        slug,
        name: cat.name?.en || cat.name?.zh || '',
        exists: existingCatSlugs.has(slug),
        action: existingCatSlugs.has(slug) ? 'skip' : 'add'
      });
    }
  }

  const tags = await loadJson('tags.json', []);
  const existingTagNames = new Set(tags.map(t => t.name));
  const tagPreview = [];
  if (Array.isArray(importTags)) {
    for (const tag of importTags) {
      const name = tag.name || '';
      tagPreview.push({
        name,
        exists: existingTagNames.has(name),
        action: existingTagNames.has(name) ? 'skip' : 'add'
      });
    }
  }

  res.json({
    total: importProducts.length,
    newCount: preview.filter(p => !p.exists).length,
    existingCount: preview.filter(p => p.exists).length,
    newCategories: catPreview.filter(c => !c.exists).length,
    existingCategories: catPreview.filter(c => c.exists).length,
    newTags: tagPreview.filter(t => !t.exists).length,
    existingTags: tagPreview.filter(t => t.exists).length,
    preview,
    categories: catPreview,
    tags: tagPreview
  });
});

router.post('/', apiKeyAuth, validate(ImportSchema), async (req, res) => {
  const { products: importProducts, categories: importCategories, tags: importTags, mode } = req.body;
  const importMode = mode || 'merge';
  await withLock('products.json', async () => {
    let products = await loadJson('products.json', []);
    const existingIds = new Set(products.map(p => p.id));
    const existingShortIds = new Set(products.map(p => p.shortId));
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const results = [];

    for (const item of importProducts) {
      const id = item.id || '';
      const shortId = item.shortId || '';
      const exists = existingIds.has(id) || existingShortIds.has(shortId);
      const existingIdx = id ? products.findIndex(p => p.id === id) : -1;
      const existingByShort = shortId ? products.findIndex(p => p.shortId === shortId) : -1;
      const matchIdx = existingIdx >= 0 ? existingIdx : existingByShort;

      if (exists && matchIdx >= 0) {
        if (importMode === 'skip') {
          skipped++;
          results.push({ id: id || shortId, action: 'skipped', reason: 'already_exists' });
          continue;
        }
        if (importMode === 'overwrite') {
          products[matchIdx] = { ...products[matchIdx], ...item, id: products[matchIdx].id };
          updated++;
          results.push({ id: id || shortId, action: 'updated' });
          continue;
        }
        if (importMode === 'merge') {
          for (const [key, value] of Object.entries(item)) {
            if (key === 'id') continue;
            const current = products[matchIdx][key];
            if (typeof value === 'object' && value !== null && typeof current === 'object' && current !== null) {
              if (Array.isArray(value) && Array.isArray(current)) {
                const merged = [...current];
                for (const v of value) {
                  if (!merged.some(m => JSON.stringify(m) === JSON.stringify(v))) merged.push(v);
                }
                products[matchIdx][key] = merged;
              } else if (!Array.isArray(value) && !Array.isArray(current)) {
                products[matchIdx][key] = { ...current, ...value };
              } else {
                products[matchIdx][key] = value;
              }
            } else if (value !== undefined && value !== '' && value !== null) {
              products[matchIdx][key] = value;
            }
          }
          updated++;
          results.push({ id: id || shortId, action: 'merged' });
          continue;
        }
      }

      const newId = existingIds.has(id) ? generateId('p') : (id || generateId('p'));
      const newShortId = existingShortIds.has(shortId) ? Math.random().toString(36).slice(2, 8) : (shortId || Math.random().toString(36).slice(2, 8));
      const locales = Array.isArray(item.locales) && item.locales.length > 0 ? item.locales : ['en'];
      const downloads = item.downloads && typeof item.downloads === 'object' && !Array.isArray(item.downloads)
        ? item.downloads
        : item.downloads && Array.isArray(item.downloads)
          ? { en: item.downloads }
          : {};
      const newProduct = {
        ...item,
        id: newId,
        shortId: newShortId,
        locales,
        title: item.title || { en: '' },
        desc: item.desc || { en: '' },
        cover: item.cover || '',
        price: Number(item.price) || 0,
        format: item.format || '',
        bookLang: item.bookLang || locales[0] || 'en',
        fileSize: item.fileSize || '',
        whatYouLearn: item.whatYouLearn || { en: '' },
        whatYouGet: item.whatYouGet || { en: '' },
        whoIsFor: item.whoIsFor || { en: '' },
        downloads,
        drive: item.drive || { primary: '', backup: '' },
        stripeLink: item.stripeLink || '',
        kofiLink: item.kofiLink || '',
        stats: item.stats || { pv: 0, sales: 0 },
        status: item.status || 'active',
        tags: Array.isArray(item.tags) ? item.tags : [],
        categoryId: item.categoryId || '',
        featured: item.featured === true,
        upsell: item.upsell || { mode: 'auto', products: [] },
        createdAt: item.createdAt || new Date().toISOString().slice(0, 10)
      };
      products.unshift(newProduct);
      existingIds.add(newId);
      existingShortIds.add(newShortId);
      added++;
      results.push({ id: newId, action: 'added' });
    }

    await saveJson('products.json', products);

    if (Array.isArray(importCategories) && importCategories.length > 0) {
      await withLock('categories.json', async () => {
        let categories = await loadJson('categories.json', []);
        const existingCatIds = new Set(categories.map(c => c.id));
        for (const cat of importCategories) {
          if (!existingCatIds.has(cat.id)) {
            categories.push(cat);
            existingCatIds.add(cat.id);
          }
        }
        await saveJson('categories.json', categories);
      });
    }

    if (Array.isArray(importTags) && importTags.length > 0) {
      await withLock('tags.json', async () => {
        let tags = await loadJson('tags.json', []);
        const existingTagIds = new Set(tags.map(t => t.id));
        for (const tag of importTags) {
          if (!existingTagIds.has(tag.id)) {
            tags.push(tag);
            existingTagIds.add(tag.id);
          }
        }
        await saveJson('tags.json', tags);
      });
    }

    res.json({ success: true, added, updated, skipped, results });
  });
});

module.exports = router;
