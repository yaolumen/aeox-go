// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock, DEFAULT_AI_CONFIG } = require('../../lib/store');
const { generateId } = require('../../lib/utils');
const { apiKeyAuth, apiKeyAdminAuth } = require('../../lib/auth');
const { normalizeBaseUrl } = require('../../lib/ai');
const { validate, ProviderCreateSchema, ProviderUpdateSchema } = require('../../lib/schemas');

router.get('/', apiKeyAuth, apiKeyAdminAuth, async (req, res) => {
  const config = await loadJson('ai-providers.json', DEFAULT_AI_CONFIG);
  const safe = {
    ...config,
    providers: (config.providers || []).map((p) => ({
      ...p,
      apiKeyPreview: p.apiKey ? p.apiKey.slice(0, 8) + '...' + p.apiKey.slice(-4) : ''
    }))
  };
  res.json(safe);
});

router.post('/', apiKeyAuth, apiKeyAdminAuth, validate(ProviderCreateSchema), async (req, res) => {
  const { name, vendor, baseUrl, model, apiKey, priority } = req.body;
  await withLock('ai-providers.json', async () => {
    const currentConfig = await loadJson('ai-providers.json', DEFAULT_AI_CONFIG);
    if ((currentConfig.providers || []).length >= 4) {
      return res.status(400).json({ error: 'Maximum 4 AI providers allowed' });
    }
    const provider = {
      id: generateId('prov'),
      name,
      vendor: vendor || 'custom',
      baseUrl: normalizeBaseUrl(baseUrl),
      model: model || '',
      apiKey: apiKey || '',
      priority: priority || (currentConfig.providers.length + 1),
      enabled: true,
      lastUsedAt: null,
      createdAt: new Date().toISOString().slice(0, 10)
    };
    currentConfig.providers.push(provider);
    await saveJson('ai-providers.json', currentConfig);
    res.status(201).json({ ...provider, apiKeyPreview: provider.apiKey.slice(0, 8) + '...' + provider.apiKey.slice(-4) });
  });
});

router.put('/:id', apiKeyAuth, apiKeyAdminAuth, validate(ProviderUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  await withLock('ai-providers.json', async () => {
    const config = await loadJson('ai-providers.json', DEFAULT_AI_CONFIG);
    const idx = config.providers.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Provider 不存在' });
    const allowed = ['name', 'vendor', 'baseUrl', 'model', 'apiKey', 'priority', 'enabled'];
    for (const field of allowed) {
      if (updates[field] !== undefined) {
        config.providers[idx][field] = field === 'baseUrl' ? normalizeBaseUrl(updates[field]) : updates[field];
      }
    }
    await saveJson('ai-providers.json', config);
    res.json({ ...config.providers[idx], apiKeyPreview: config.providers[idx].apiKey.slice(0, 8) + '...' + config.providers[idx].apiKey.slice(-4) });
  });
});

router.delete('/:id', apiKeyAuth, apiKeyAdminAuth, async (req, res) => {
  const { id } = req.params;
  await withLock('ai-providers.json', async () => {
    const config = await loadJson('ai-providers.json', DEFAULT_AI_CONFIG);
    config.providers = config.providers.filter((p) => p.id !== id);
    await saveJson('ai-providers.json', config);
    res.json({ success: true });
  });
});

module.exports = router;
