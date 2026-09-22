// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock, DEFAULT_AI_CONFIG, markDirty } = require('../lib/store');
const { generateId } = require('../lib/utils');
const { adminSession } = require('../lib/auth');
const { callAiProvider, callAiProviderStream, normalizeBaseUrl, PROVIDER_PRESETS } = require('../lib/ai');
const { validate, ProviderCreateSchema, ProviderUpdateSchema, AiChatSchema, AiGenerateSchema, AiTestSchema } = require('../lib/schemas');

router.get('/config/provider-presets', adminSession, async (req, res) => {
  res.json(PROVIDER_PRESETS);
});

router.get('/config/providers', adminSession, async (req, res) => {
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

router.post('/config/providers', adminSession, validate(ProviderCreateSchema), async (req, res) => {
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
    res.json({ success: true, provider: { ...provider, apiKeyPreview: provider.apiKey.slice(0, 8) + '...' + provider.apiKey.slice(-4) } });
  });
});

router.put('/config/providers/:id', adminSession, validate(ProviderUpdateSchema), async (req, res) => {
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
    res.json({ success: true, provider: { ...config.providers[idx], apiKeyPreview: config.providers[idx].apiKey.slice(0, 8) + '...' + config.providers[idx].apiKey.slice(-4) } });
  });
});

router.delete('/config/providers/:id', adminSession, async (req, res) => {
  const { id } = req.params;
  await withLock('ai-providers.json', async () => {
    const config = await loadJson('ai-providers.json', DEFAULT_AI_CONFIG);
    config.providers = config.providers.filter((p) => p.id !== id);
    await saveJson('ai-providers.json', config);
    res.json({ success: true });
  });
});

router.post('/ai/chat', validate(AiChatSchema), async (req, res) => {
  const { message, stream } = req.body;

  const allProducts = (await loadJson('products.json', [])).filter(p => p.status !== 'archived');
  const stats = await loadJson('stats.json', { byProduct: {} });
  const productList = allProducts.slice(0, 30).map((p) => {
    const s = stats.byProduct[p.id] || {};
    const downloads = s.download || 0;
    const checkouts = s.checkout || 0;
    const popularity = downloads + checkouts;
    const tag = p.price > 0 ? '付费' : '免费';
    const hot = popularity >= 10 ? '🔥热门' : popularity >= 3 ? '👍受欢迎' : '';
    return `- id:${p.id} | ${p.title?.zh || ''} / ${p.title?.en || ''} | $${p.price}(${tag}) | ${(p.desc?.zh || '').slice(0, 50)} | ${hot}`;
  }).join('\n');
  const systemPrompt = `你是 AEOX 电子书商城的 AI 选书助手。商城有以下电子书：\n${productList}\n\n用户提问后，你必须返回 JSON 格式：{"reply":"自然语言回复","recommend":["商品id"]}\n规则：1. recommend 里的 id 必须来自上面的列表 2. 不要编造不存在的书 3. reply 用用户问题的语言回复 4. 最多推荐 3 本 5. 可以根据🔥热门/👍受欢迎标记推荐受读者欢迎的书，但不要透露具体下载量或销量数字 6. 不要讨论后台管理数据（如收入、退款、PV、流量统计等）`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ];

  if (stream) {
    const streamResult = await callAiProviderStream('frontend_chat', messages);
    if (!streamResult.ok) {
      return res.status(502).json({ reply: 'AI 连接失败：' + streamResult.error, recommend: [] });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    let fullContent = '';
    streamResult.stream.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          let cleaned = fullContent.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
          }
          try {
            const parsed = JSON.parse(cleaned);
            res.write(`data: ${JSON.stringify({ type: 'done', ...parsed })}\n\n`);
          } catch {
            res.write(`data: ${JSON.stringify({ type: 'done', reply: cleaned, recommend: [] })}\n\n`);
          }
          res.end();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
          }
        } catch {}
      }
    });
    streamResult.stream.on('end', () => {
      if (!res.writableEnded) {
        let cleaned = fullContent.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
        }
        try {
          const parsed = JSON.parse(cleaned);
          res.write(`data: ${JSON.stringify({ type: 'done', ...parsed })}\n\n`);
        } catch {
          res.write(`data: ${JSON.stringify({ type: 'done', reply: cleaned, recommend: [] })}\n\n`);
        }
        res.end();
      }
    });
    streamResult.stream.on('error', (e) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
        res.end();
      }
    });
    req.on('close', () => { streamResult.stream?.destroy?.(); });
    return;
  }

  const result = await callAiProvider('frontend_chat', messages);
  if (!result.ok) return res.status(502).json({ reply: 'AI 连接失败：' + result.error, recommend: [] });
  let content = result.content.trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
  }
  try {
    const parsed = JSON.parse(content);
    res.json(parsed);
  } catch {
    res.json({ reply: content, recommend: [] });
  }
});

router.post('/ai/generate', validate(AiGenerateSchema), async (req, res) => {
  const { prompt } = req.body;
  const result = await callAiProvider('content_generate', [
    { role: 'user', content: prompt }
  ]);
  if (!result.ok) return res.status(502).json({ text: 'AI 生成失败：' + result.error });
  res.json({ text: result.content });
});

router.post('/ai/test', validate(AiTestSchema), async (req, res) => {
  const { apiKey, baseUrl, model, providerId } = req.body;

  if (providerId) {
    const config = await loadJson('ai-providers.json', DEFAULT_AI_CONFIG);
    const provider = config.providers.find((p) => p.id === providerId);
    if (!provider) return res.json({ success: false, message: 'Provider 不存在' });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const r = await fetch(normalizeBaseUrl(provider.baseUrl) + '/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + provider.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: provider.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 10 }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (r.ok) res.json({ success: true, message: `连接成功 (${provider.name})` });
      else {
        const d = await r.json().catch(() => ({}));
        const msg = d.error?.message || r.statusText;
        const code = d.error?.code || '';
        if (r.status === 503) {
          if (code === 'model_not_found') {
            res.json({ success: false, message: `模型不存在 (${provider.model})，请检查模型名称拼写` });
          } else if (code === 'get_channel_failed') {
            res.json({ success: false, message: `免费模型繁忙（${msg}），稍后重试或换付费模型（去掉 :free 后缀）` });
          } else {
            res.json({ success: false, message: `服务繁忙：${msg}` });
          }
        } else if (r.status === 429) {
          const retryAfter = r.headers.get('retry-after');
          res.json({ success: false, message: `速率限制${retryAfter ? `，${retryAfter}秒后重试` : ''}（免费模型约1次/分钟，可换付费模型）` });
        } else if (r.status === 401 || r.status === 403) {
          res.json({ success: false, message: `认证失败 (${r.status})：${msg}` });
        } else {
          res.json({ success: false, message: `请求失败 (${r.status})：${msg}` });
        }
      }
    } catch (e) {
      const reason = e.name === 'AbortError' ? '连接超时（15秒）' : e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ? `无法连接到 ${provider.baseUrl}，请检查接口地址是否正确以及网络是否可达` : '网络错误：' + e.message;
      res.json({ success: false, message: reason });
    }
    return;
  }

  if (apiKey) {
    try {
      const r = await fetch(normalizeBaseUrl(baseUrl) + '/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 10 })
      });
      if (r.ok) res.json({ success: true, message: '连接成功' });
      else {
        const d = await r.json().catch(() => ({}));
        res.json({ success: false, message: `认证失败 (${r.status})：${d.error?.message || r.statusText}` });
      }
    } catch (e) {
      const reason = e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ? `无法连接到 ${baseUrl}，请检查接口地址以及网络可达性` : '网络错误：' + e.message;
      res.json({ success: false, message: reason });
    }
    return;
  }

  res.json({ success: false, message: '缺少 API Key 或 Provider ID' });
});

module.exports = router;
