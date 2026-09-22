// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock } = require('../../lib/store');
const { generateId } = require('../../lib/utils');
const { apiKeyAuth } = require('../../lib/auth');
const { validate, ProductCreateSchema, ProductUpdateSchema } = require('../../lib/schemas');

router.get('/', apiKeyAuth, async (req, res) => {
  const products = await loadJson('products.json', []);
  const status = req.query.status;
  const list = status ? products.filter((p) => p.status === status) : products.filter((p) => p.status !== 'archived');
  res.json(list.map((p) => ({ ...p, locales: p.locales || ['en'] })));
});

router.get('/:id', apiKeyAuth, async (req, res) => {
  const products = await loadJson('products.json', []);
  const p = products.find((x) => x.id === req.params.id || x.shortId === req.params.id);
  if (!p) return res.status(404).json({ error: '商品不存在' });
  res.json({ ...p, locales: p.locales || ['en'] });
});

router.post('/', apiKeyAuth, validate(ProductCreateSchema), async (req, res) => {
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
    res.status(201).json(product);
  });
});

router.put('/:id', apiKeyAuth, validate(ProductUpdateSchema), async (req, res) => {
  const data = req.body;
  await withLock('products.json', async () => {
    const products = await loadJson('products.json', []);
    const idx = products.findIndex((p) => p.id === req.params.id || p.shortId === req.params.id);
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
    res.json(products[idx]);
  });
});

router.delete('/:id', apiKeyAuth, async (req, res) => {
  await withLock('products.json', async () => {
    const products = await loadJson('products.json', []);
    const idx = products.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '商品不存在' });
    products[idx].status = 'archived';
    await saveJson('products.json', products);
    res.json({ success: true });
  });
});

module.exports = router;
