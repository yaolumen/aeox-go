// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock } = require('../lib/store');
const { generateId } = require('../lib/utils');
const { adminSession } = require('../lib/auth');
const { validate, ProductCreateSchema, ProductUpdateSchema, BatchTagsSchema, ImportSchema, ImportPreviewSchema } = require('../lib/schemas');

router.get('/i18n', async (req, res) => {
  const lang = req.query.lang || 'en';
  const i18n = await loadJson('i18n.json', null);
  if (!i18n || !i18n[lang]) {
    const fallback = (i18n && i18n['en']) ? i18n['en'] : {};
    return res.json({ lang: 'en', t: fallback });
  }
  res.json({ lang, t: i18n[lang] });
});

router.get('/products', async (req, res) => {
  const products = await loadJson('products.json', []);
  const status = req.query.status;
  const list = status ? products.filter((p) => p.status === status) : products.filter((p) => p.status !== 'archived');
  res.json(list);
});

router.post('/products', adminSession, validate(ProductCreateSchema), async (req, res) => {
  const data = req.body;
  await withLock('products.json', async () => {
    const products = await loadJson('products.json', []);
    const locales = Array.isArray(data.locales) && data.locales.length > 0 ? data.locales : ['en'];
    const downloads = data.downloads && typeof data.downloads === 'object' && !Array.isArray(data.downloads)
      ? data.downloads
      : data.downloads && Array.isArray(data.downloads)
        ? { en: data.downloads }
        : {};
    const product = {
      id: data.id || generateId('p'),
      shortId: data.shortId || Math.random().toString(36).slice(2, 8),
      locales,
      title: data.title || { en: '' },
      cover: data.cover || '',
      price: Number(data.price) || 0,
      desc: data.desc || { en: '' },
      whatYouLearn: data.whatYouLearn || { en: '' },
      whatYouGet: data.whatYouGet || { en: '' },
      whoIsFor: data.whoIsFor || { en: '' },
      bookLang: data.bookLang || locales[0] || 'en',
      format: data.format || 'PDF / EPUB / MOBI',
      fileSize: data.fileSize || '',
      downloads,
      drive: data.drive || { primary: '', backup: '' },
      stripeLink: data.stripeLink || '',
      kofiLink: data.kofiLink || '',
      stats: data.stats || { pv: 0, sales: 0 },
      status: data.status || 'active',
      tags: Array.isArray(data.tags) ? data.tags : [],
      categoryId: data.categoryId || '',
      featured: data.featured === true,
      upsell: data.upsell || { mode: 'auto', products: [] },
      createdAt: data.createdAt || new Date().toISOString().slice(0, 10)
    };
    products.unshift(product);
    await saveJson('products.json', products);
    res.json({ success: true, product });
  });
});

router.put('/products/:id', adminSession, validate(ProductUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  await withLock('products.json', async () => {
    const products = await loadJson('products.json', []);
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: '商品不存在' });
    const locales = Array.isArray(data.locales) && data.locales.length > 0 ? data.locales : data.locales === undefined ? products[idx].locales : ['en'];
    const downloads = data.downloads && typeof data.downloads === 'object' && !Array.isArray(data.downloads)
      ? data.downloads
      : data.downloads && Array.isArray(data.downloads)
        ? { en: data.downloads }
        : data.downloads === undefined ? products[idx].downloads : {};
    products[idx] = {
      ...products[idx],
      ...data,
      id: products[idx].id,
      locales,
      downloads,
      bookLang: data.bookLang || locales[0] || products[idx].bookLang || 'en'
    };
    await saveJson('products.json', products);
    res.json({ success: true, product: products[idx] });
  });
});

router.delete('/products/:id', adminSession, async (req, res) => {
  const { id } = req.params;
  await withLock('products.json', async () => {
    const products = await loadJson('products.json', []);
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: '商品不存在' });
    if (products[idx].status === 'archived') return res.status(404).json({ error: '商品已删除' });
    products[idx].status = 'archived';
    await saveJson('products.json', products);
    res.json({ success: true });
  });
});

router.get('/products/export', adminSession, async (req, res) => {
  const products = await loadJson('products.json', []);
  const categories = await loadJson('categories.json', []);
  const tags = await loadJson('tags.json', []);
  const activeProducts = products.filter(p => p.status !== 'archived');
  res.setHeader('Content-Disposition', 'attachment; filename="aeox-products-export-' + new Date().toISOString().slice(0, 10) + '.json"');
  res.json({
    _meta: {
      version: '2.3.0',
      exportedAt: new Date().toISOString(),
      productCount: activeProducts.length,
      categoryCount: categories.length,
      tagCount: tags.length
    },
    categories,
    tags,
    products: activeProducts
  });
});

router.post('/products/import', adminSession, validate(ImportSchema), async (req, res) => {
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
      const newProduct = {
        ...item,
        id: newId,
        shortId: newShortId,
        locales: Array.isArray(item.locales) && item.locales.length > 0 ? item.locales : ['en'],
        title: item.title || { en: '' },
        desc: item.desc || { en: '' },
        price: Number(item.price) || 0,
        cover: item.cover || '',
        stats: item.stats || { pv: 0, sales: 0 },
        status: item.status || 'active',
        tags: Array.isArray(item.tags) ? item.tags : [],
        categoryId: item.categoryId || '',
        featured: item.featured === true,
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

router.post('/products/import-preview', adminSession, validate(ImportPreviewSchema), async (req, res) => {
  const { products: importProducts } = req.body;
  if (!Array.isArray(importProducts) || importProducts.length === 0) {
    return res.status(400).json({ error: '导入数据为空' });
  }
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

  res.json({
    total: importProducts.length,
    newCount: preview.filter(p => !p.exists).length,
    existingCount: preview.filter(p => p.exists).length,
    preview
  });
});

router.post('/products/batch-tags', adminSession, validate(BatchTagsSchema), async (req, res) => {
  const { productIds, tagIds, mode } = req.body;
  await withLock('products.json', async () => {
    const products = await loadJson('products.json', []);
    for (const p of products) {
      if (!productIds.includes(p.id)) continue;
      if (!p.tags) p.tags = [];
      if (mode === 'remove') {
        p.tags = p.tags.filter((t) => !tagIds.includes(t));
      } else {
        for (const tid of tagIds) {
          if (!p.tags.includes(tid)) p.tags.push(tid);
        }
      }
    }
    await saveJson('products.json', products);
    res.json({ success: true, count: productIds.length });
  });
});

module.exports = router;
