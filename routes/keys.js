// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock } = require('../lib/store');
const { generateId, generateApiKey, readLogTail } = require('../lib/utils');
const { adminSession } = require('../lib/auth');
const { validate, ApiKeyCreateSchema, ApiKeyUpdateSchema } = require('../lib/schemas');

router.get('/config/keys', adminSession, async (req, res) => {
  const keys = await loadJson('api-keys.json', []);
  const safe = keys.map((k) => {
    const { key, ...rest } = k;
    return { ...rest, keyPreview: key.slice(0, 12) + '...' + key.slice(-4) };
  });
  res.json(safe);
});

router.post('/config/keys', adminSession, validate(ApiKeyCreateSchema), async (req, res) => {
  const { name, scopes } = req.body;
  await withLock('api-keys.json', async () => {
    const keys = await loadJson('api-keys.json', []);
    const key = generateApiKey();
    const entry = {
      id: generateId('key'),
      name,
      key,
      scopes: scopes && scopes.length ? scopes : ['read', 'write'],
      enabled: true,
      createdAt: new Date().toISOString().slice(0, 10),
      lastUsedAt: null
    };
    keys.push(entry);
    await saveJson('api-keys.json', keys);
    res.json({ success: true, key: { ...entry, keyPreview: entry.key.slice(0, 12) + '...' + entry.key.slice(-4) } });
  });
});

router.put('/config/keys/:id', adminSession, validate(ApiKeyUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const { name, scopes, enabled } = req.body;
  await withLock('api-keys.json', async () => {
    const keys = await loadJson('api-keys.json', []);
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Key 不存在' });
    if (name !== undefined) keys[idx].name = name;
    if (scopes !== undefined) keys[idx].scopes = scopes;
    if (enabled !== undefined) keys[idx].enabled = enabled;
    await saveJson('api-keys.json', keys);
    res.json({ success: true, key: { ...keys[idx], keyPreview: keys[idx].key.slice(0, 12) + '...' + keys[idx].key.slice(-4) } });
  });
});

router.delete('/config/keys/:id', adminSession, async (req, res) => {
  const { id } = req.params;
  await withLock('api-keys.json', async () => {
    const keys = await loadJson('api-keys.json', []);
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Key 不存在' });
    keys[idx].enabled = false;
    keys[idx].revokedAt = new Date().toISOString();
    await saveJson('api-keys.json', keys);
    res.json({ success: true });
  });
});

router.get('/config/logs', adminSession, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const logs = await readLogTail('api-access.log', limit);
  res.json(logs.reverse());
});

router.get('/config/ai-logs', adminSession, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const logs = await readLogTail('ai-calls.log', limit);
  res.json(logs.reverse());
});

module.exports = router;
