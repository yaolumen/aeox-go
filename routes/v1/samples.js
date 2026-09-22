// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock } = require('../../lib/store');
const { apiKeyAuth, apiKeyAdminAuth } = require('../../lib/auth');
const { generateId } = require('../../lib/utils');
const { validate, SampleCreateSchema, SampleUpdateSchema } = require('../../lib/schemas');

const SAMPLES_FILE = 'samples.json';

function tagSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function getSamples() {
  return loadJson(SAMPLES_FILE, []);
}

router.get('/', apiKeyAuth, async (req, res) => {
  const samples = await getSamples();
  const enabled = req.query.enabled;
  const list = enabled !== undefined ? samples.filter(s => String(s.enabled) === enabled) : samples;
  res.json(list);
});

router.get('/:shortId', apiKeyAuth, async (req, res) => {
  const samples = await getSamples();
  const sample = samples.find(s => s.shortId === req.params.shortId);
  if (!sample) return res.status(404).json({ error: '试读不存在' });
  res.json(sample);
});

router.post('/', apiKeyAuth, validate(SampleCreateSchema), async (req, res) => {
  const { shortId, title, cover, buyLink, content, enabled, relatedProducts } = req.body;

  let sampleTitle = title;
  let sampleCover = cover || '';
  let sampleBuyLink = buyLink || '';
  let sampleProductId = null;
  let sampleAutoTags = [];
  let sampleCategory = '';

  if (shortId) {
    const products = await loadJson('products.json', []);
    const product = products.find(p => p.shortId === shortId && p.status !== 'archived');
    if (!product) return res.status(404).json({ error: '商品不存在' });
    if ((await getSamples()).find(s => s.shortId === shortId)) return res.status(409).json({ error: '该商品已有试读' });

    sampleProductId = product.id;
    if (!sampleTitle) sampleTitle = product.title;
    if (!sampleCover) sampleCover = product.cover || '';
    if (!sampleBuyLink) sampleBuyLink = product.kofiLink || product.stripeLink || '';

    const tags = await loadJson('tags.json', []);
    const categories = await loadJson('categories.json', []);
    sampleAutoTags = (product.tags || []).map(tid => {
      const tag = tags.find(t => t.id === tid);
      return tag ? tagSlug(tag.name) : '';
    }).filter(Boolean);
    const cat = categories.find(c => c.id === product.categoryId);
    sampleCategory = cat?.slug || '';
  } else {
    if (!sampleTitle) return res.status(400).json({ error: '请填写标题' });
  }

  const sample = {
    id: generateId('spl'),
    shortId: shortId || generateId('rd'),
    productId: sampleProductId,
    title: sampleTitle,
    cover: sampleCover,
    buyLink: sampleBuyLink,
    enabled: enabled !== false,
    content: content || {},
    relatedProducts: relatedProducts || [],
    autoTags: sampleAutoTags,
    category: sampleCategory,
    createdAt: new Date().toISOString()
  };

  const samples = await getSamples();
  samples.push(sample);
  await withLock(SAMPLES_FILE, async () => await saveJson(SAMPLES_FILE, samples));
  res.status(201).json(sample);
});

router.put('/:shortId', apiKeyAuth, validate(SampleUpdateSchema), async (req, res) => {
  const samples = await getSamples();
  const idx = samples.findIndex(s => s.shortId === req.params.shortId);
  if (idx < 0) return res.status(404).json({ error: '试读不存在' });

  const { content, enabled, relatedProducts, title, cover, buyLink } = req.body;
  if (content !== undefined) samples[idx].content = content;
  if (enabled !== undefined) samples[idx].enabled = enabled;
  if (relatedProducts !== undefined) samples[idx].relatedProducts = relatedProducts;
  if (title !== undefined) samples[idx].title = title;
  if (cover !== undefined) samples[idx].cover = cover;
  if (buyLink !== undefined) samples[idx].buyLink = buyLink;
  samples[idx].updatedAt = new Date().toISOString();

  await withLock(SAMPLES_FILE, async () => await saveJson(SAMPLES_FILE, samples));
  res.json(samples[idx]);
});

router.delete('/:shortId', apiKeyAdminAuth, async (req, res) => {
  const samples = await getSamples();
  const filtered = samples.filter(s => s.shortId !== req.params.shortId);
  if (filtered.length === samples.length) return res.status(404).json({ error: '试读不存在' });
  await withLock(SAMPLES_FILE, async () => await saveJson(SAMPLES_FILE, filtered));
  res.json({ success: true });
});

module.exports = router;
