// @ts-check
const express = require('express');
const router = express.Router();
const { loadJson, saveJson, withLock, DATA_DIR } = require('../lib/store');
const { adminSession } = require('../lib/auth');
const { validate, ShortLinkCreateSchema, ShortLinkUpdateSchema } = require('../lib/schemas');
const path = require('path');

const DATA_FILE = 'short-links.json';

function slugValid(slug) {
  return /^[a-zA-Z0-9_-]{1,32}$/.test(slug);
}

router.get('/short-links', adminSession, async (req, res) => {
  const links = await loadJson(DATA_FILE, []);
  res.json(links);
});

router.post('/short-links', adminSession, validate(ShortLinkCreateSchema), async (req, res) => {
  const { slug, url, description } = req.body;

  const result = await withLock(DATA_FILE, async () => {
    const links = await loadJson(DATA_FILE, []);
    if (links.find(l => l.slug === slug)) return { error: 'slug already exists' };
    links.push({ slug, url, description: description || '', clicks: 0, createdAt: new Date().toISOString() });
    await saveJson(DATA_FILE, links);
    return { link: links[links.length - 1] };
  });

  if (result.error) return res.status(409).json({ success: false, error: result.error });
  res.json({ success: true, link: result.link });
});

router.put('/short-links/:slug', adminSession, validate(ShortLinkUpdateSchema), async (req, res) => {
  const { slug } = req.params;
  const { url, description } = req.body;

  const result = await withLock(DATA_FILE, async () => {
    const links = await loadJson(DATA_FILE, []);
    const idx = links.findIndex(l => l.slug === slug);
    if (idx === -1) return { error: 'not found' };
    if (url !== undefined) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) return { error: 'url must start with http:// or https://' };
      links[idx].url = url;
    }
    if (description !== undefined) links[idx].description = description;
    await saveJson(DATA_FILE, links);
    return { link: links[idx] };
  });

  if (result.error) return res.status(result.error === 'not found' ? 404 : 400).json({ success: false, error: result.error });
  res.json({ success: true, link: result.link });
});

router.delete('/short-links/:slug', adminSession, async (req, res) => {
  const { slug } = req.params;
  const result = await withLock(DATA_FILE, async () => {
    const links = await loadJson(DATA_FILE, []);
    const idx = links.findIndex(l => l.slug === slug);
    if (idx === -1) return { error: 'not found' };
    links.splice(idx, 1);
    await saveJson(DATA_FILE, links);
    return {};
  });

  if (result.error) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true });
});

module.exports = router;
