// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock } = require('../lib/store');
const { adminSession } = require('../lib/auth');
const { generateId, rateLimit, isValidEmail } = require('../lib/utils');
const { recordStat } = require('../lib/stats');
const { validate, SampleCreateSchema, SampleUpdateSchema, SampleNotifySchema, SampleViewSchema, BatchDeleteEmailsSchema } = require('../lib/schemas');

const SAMPLES_FILE = 'samples.json';
const EMAILS_FILE = 'sample-emails.json';

function tagSlug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function getSamples() {
  return loadJson(SAMPLES_FILE, []);
}

async function getEmails() {
  return loadJson(EMAILS_FILE, []);
}

router.get('/samples', async (req, res) => {
  const samples = await getSamples();
  res.json(samples);
});

router.get('/samples/:shortId', async (req, res) => {
  const samples = await getSamples();
  const sample = samples.find(s => s.shortId === req.params.shortId);
  if (!sample) return res.status(404).json({ error: '试读不存在' });
  res.json(sample);
});

router.post('/samples', adminSession, validate(SampleCreateSchema), async (req, res) => {
  const { shortId, title, cover, buyLink, content, enabled, relatedProducts, upsellMode } = req.body;

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
    upsellMode: upsellMode || 'auto',
    autoTags: sampleAutoTags,
    category: sampleCategory,
    createdAt: new Date().toISOString()
  };

  const samples = await getSamples();
  samples.push(sample);
  await withLock(SAMPLES_FILE, async () => await saveJson(SAMPLES_FILE, samples));
  res.json({ success: true, sample });
});

router.put('/samples/:shortId', adminSession, validate(SampleUpdateSchema), async (req, res) => {
  const samples = await getSamples();
  const idx = samples.findIndex(s => s.shortId === req.params.shortId);
  if (idx < 0) return res.status(404).json({ error: '试读不存在' });

  const { content, enabled, relatedProducts, title, cover, buyLink, upsellMode } = req.body;
  if (content !== undefined) samples[idx].content = content;
  if (enabled !== undefined) samples[idx].enabled = enabled;
  if (relatedProducts !== undefined) samples[idx].relatedProducts = relatedProducts;
  if (title !== undefined) samples[idx].title = title;
  if (cover !== undefined) samples[idx].cover = cover;
  if (buyLink !== undefined) samples[idx].buyLink = buyLink;
  if (upsellMode !== undefined) samples[idx].upsellMode = upsellMode;
  samples[idx].updatedAt = new Date().toISOString();

  await withLock(SAMPLES_FILE, async () => await saveJson(SAMPLES_FILE, samples));
  res.json({ success: true, sample: samples[idx] });
});

router.delete('/samples/:shortId', adminSession, async (req, res) => {
  const samples = await getSamples();
  const filtered = samples.filter(s => s.shortId !== req.params.shortId);
  if (filtered.length === samples.length) return res.status(404).json({ error: '试读不存在' });
  await withLock(SAMPLES_FILE, async () => await saveJson(SAMPLES_FILE, filtered));
  res.json({ success: true });
});

router.post('/sample/notify', validate(SampleNotifySchema), async (req, res) => {
  const { shortId, email, lang } = req.body;

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
  if (!rateLimit('sample-email:' + ip, 5, 60000)) {
    return res.status(429).json({ error: '请求过于频繁' });
  }

  const samples = await getSamples();
  const sample = samples.find(s => s.shortId === shortId && s.enabled);
  if (!sample) return res.status(404).json({ error: '试读不存在或未启用' });

  const normalizedEmail = email.trim().toLowerCase();
  const emails = await getEmails();

  const existing = emails.find(e => e.email === normalizedEmail && e.shortId === shortId);
  if (existing) {
    return res.json({ success: true, duplicate: true });
  }

  const productTags = sample.autoTags || [];
  const productCategory = sample.category || '';

  const existingAll = emails.find(e => e.email === normalizedEmail);
  const mergedTags = existingAll
    ? [...new Set([...(existingAll.tags || []), ...productTags])]
    : productTags;

  if (existingAll) {
    existingAll.tags = mergedTags;
    existingAll.sources = [...new Set([...(existingAll.sources || []), shortId])];
    if (!existingAll.sources.includes(shortId)) {
      existingAll.sources.push(shortId);
    }
  }

  const entry = {
    id: generateId('em'),
    email: normalizedEmail,
    shortId,
    source: 'trial_read',
    tags: mergedTags,
    category: productCategory,
    notified: false,
    createdAt: new Date().toISOString()
  };

  if (lang) entry.lang = lang;

  emails.unshift(entry);
  await withLock(EMAILS_FILE, async () => await saveJson(EMAILS_FILE, emails));

  try { recordStat('sample_email', sample.productId); } catch (e) {}

  res.json({ success: true });
});

router.post('/sample/view', validate(SampleViewSchema), async (req, res) => {
  const { shortId } = req.body;
  const samples = await getSamples();
  const sample = samples.find(s => s.shortId === shortId);
  if (!sample) return res.status(404).json({ error: '试读不存在' });
  try { recordStat('sample_view', sample.productId); } catch (e) {}
  res.json({ success: true });
});

router.get('/sample-emails', adminSession, async (req, res) => {
  const emails = await getEmails();
  const { source, tag, category, shortId } = req.query;
  let filtered = emails;
  if (source) filtered = filtered.filter(e => e.source === source);
  if (tag) filtered = filtered.filter(e => (e.tags || []).includes(tag));
  if (category) filtered = filtered.filter(e => e.category === category);
  if (shortId) filtered = filtered.filter(e => e.shortId === shortId);

  const allTags = [...new Set(emails.flatMap(e => e.tags || []))].sort();
  const allCategories = [...new Set(emails.map(e => e.category).filter(Boolean))].sort();
  const allSources = [...new Set(emails.map(e => e.source).filter(Boolean))].sort();
  const allShortIds = [...new Set(emails.map(e => e.shortId).filter(Boolean))].sort();
  const uniqueEmails = new Set(emails.map(e => e.email)).size;

  res.json({
    emails: filtered,
    meta: { total: emails.length, filtered: filtered.length, unique: uniqueEmails, tags: allTags, categories: allCategories, sources: allSources, shortIds: allShortIds }
  });
});

router.get('/sample-emails/export', adminSession, async (req, res) => {
  const emails = await getEmails();
  const { source, tag, category, shortId, format } = req.query;
  let filtered = emails;
  if (source) filtered = filtered.filter(e => e.source === source);
  if (tag) filtered = filtered.filter(e => (e.tags || []).includes(tag));
  if (category) filtered = filtered.filter(e => e.category === category);
  if (shortId) filtered = filtered.filter(e => e.shortId === shortId);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=emails.json');
    return res.send(JSON.stringify(filtered, null, 2));
  }

  const header = 'email,source,product,tags,category,notified,date';
  const rows = filtered.map(e =>
    [e.email, e.source, e.shortId, (e.tags || []).join(';'), e.category || '', e.notified ? 'yes' : 'no', e.createdAt ? e.createdAt.slice(0, 10) : ''].join(',')
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=emails.csv');
  res.send([header, ...rows].join('\n'));
});

router.delete('/sample-emails/:id', adminSession, async (req, res) => {
  const emails = await getEmails();
  const filtered = emails.filter(e => e.id !== req.params.id);
  if (filtered.length === emails.length) return res.status(404).json({ error: '不存在' });
  await withLock(EMAILS_FILE, async () => await saveJson(EMAILS_FILE, filtered));
  res.json({ success: true });
});

router.post('/sample-emails/batch-delete', adminSession, validate(BatchDeleteEmailsSchema), async (req, res) => {
  const { ids } = req.body;
  const emails = await getEmails();
  const idSet = new Set(ids);
  const filtered = emails.filter(e => !idSet.has(e.id));
  await withLock(EMAILS_FILE, async () => await saveJson(EMAILS_FILE, filtered));
  res.json({ success: true, deleted: emails.length - filtered.length });
});

router.put('/sample-emails/:id/notify', adminSession, async (req, res) => {
  const emails = await getEmails();
  const entry = emails.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: '不存在' });
  entry.notified = true;
  await withLock(EMAILS_FILE, async () => await saveJson(EMAILS_FILE, emails));
  res.json({ success: true });
});

module.exports = router;
