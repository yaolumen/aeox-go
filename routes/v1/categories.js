// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock } = require('../../lib/store');
const { generateId, generateSlug } = require('../../lib/utils');
const { apiKeyAuth, apiKeyAdminAuth } = require('../../lib/auth');
const { validate, CategoryCreateSchema, CategoryUpdateSchema } = require('../../lib/schemas');

router.get('/', apiKeyAuth, async (req, res) => {
  const cats = await loadJson('categories.json', []);
  res.json(cats);
});

router.post('/', apiKeyAuth, validate(CategoryCreateSchema), async (req, res) => {
  const { name, slug, description, sort } = req.body;
  await withLock('categories.json', async () => {
    const cats = await loadJson('categories.json', []);
    const finalSlug = slug || generateSlug(name.en || name.zh || name);
    if (cats.some((c) => c.slug === finalSlug)) return res.status(409).json({ error: 'slug 已存在' });
    const cat = {
      id: generateId('cat'),
      slug: finalSlug,
      name: typeof name === 'string' ? { zh: name, en: name } : (name || { zh: '', en: '' }),
      description: description || '',
      sort: sort || cats.length + 1,
      status: 'active',
      createdAt: new Date().toISOString().slice(0, 10)
    };
    cats.push(cat);
    await saveJson('categories.json', cats);
    res.status(201).json(cat);
  });
});

router.put('/:id', apiKeyAuth, validate(CategoryUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  await withLock('categories.json', async () => {
    const cats = await loadJson('categories.json', []);
    const idx = cats.findIndex((c) => c.id === id);
    if (idx === -1) return res.status(404).json({ error: '分类不存在' });
    for (const field of ['name', 'slug', 'description', 'sort', 'status']) {
      if (updates[field] !== undefined) cats[idx][field] = updates[field];
    }
    await saveJson('categories.json', cats);
    res.json(cats[idx]);
  });
});

router.delete('/:id', apiKeyAuth, apiKeyAdminAuth, async (req, res) => {
  const { id } = req.params;
  await withLock('categories.json', async () => {
    const cats = await loadJson('categories.json', []);
    const filtered = cats.filter((c) => c.id !== id);
    if (filtered.length === cats.length) return res.status(404).json({ error: '分类不存在' });
    const products = await loadJson('products.json', []);
    const usedCount = products.filter((p) => p.categoryId === id && p.status !== 'archived').length;
    if (usedCount > 0) {
      return res.status(409).json({ error: `该分类下还有 ${usedCount} 个商品，请先移除或更换分类后再删除` });
    }
    await saveJson('categories.json', filtered);
    res.json({ success: true });
  });
});

module.exports = router;
