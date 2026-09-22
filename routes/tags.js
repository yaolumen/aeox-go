// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock } = require('../lib/store');
const { generateId, TAG_COLORS } = require('../lib/utils');
const { adminSession } = require('../lib/auth');
const { validate, TagCreateSchema, TagUpdateSchema } = require('../lib/schemas');

router.get('/config/tags', async (req, res) => {
  const tags = await loadJson('tags.json', []);
  res.json(tags);
});

router.post('/config/tags', adminSession, validate(TagCreateSchema), async (req, res) => {
  const { name, color } = req.body;
  await withLock('tags.json', async () => {
    const tags = await loadJson('tags.json', []);
    if (tags.some((t) => t.name === name)) return res.status(409).json({ error: '标签已存在' });
    const tag = {
      id: generateId('tag'),
      name,
      color: color || TAG_COLORS[tags.length % TAG_COLORS.length],
      createdAt: new Date().toISOString().slice(0, 10)
    };
    tags.push(tag);
    await saveJson('tags.json', tags);
    res.json({ success: true, tag });
  });
});

router.put('/config/tags/:id', adminSession, validate(TagUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;
  await withLock('tags.json', async () => {
    const tags = await loadJson('tags.json', []);
    const idx = tags.findIndex((t) => t.id === id);
    if (idx === -1) return res.status(404).json({ error: '标签不存在' });
    if (name !== undefined) tags[idx].name = name;
    if (color !== undefined) tags[idx].color = color;
    await saveJson('tags.json', tags);
    res.json({ success: true, tag: tags[idx] });
  });
});

router.delete('/config/tags/:id', adminSession, async (req, res) => {
  const { id } = req.params;
  await withLock('tags.json', async () => {
    const tags = await loadJson('tags.json', []);
    const filtered = tags.filter((t) => t.id !== id);
    if (filtered.length === tags.length) return res.status(404).json({ error: '标签不存在' });
    await saveJson('tags.json', filtered);
    const products = await loadJson('products.json', []);
    let prodChanged = false;
    for (const p of products) {
      if (p.tags && p.tags.includes(id)) {
        p.tags = p.tags.filter((t) => t !== id);
        prodChanged = true;
      }
    }
    if (prodChanged) await saveJson('products.json', products);
    res.json({ success: true });
  });
});

module.exports = router;
