// @ts-check
'use strict';

const { loadJson, markDirty, DEFAULT_AI_CONFIG } = require('./store');
const { appendAiCallLog } = require('./utils');

const PROVIDER_PRESETS = [
  { vendor: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { vendor: 'qwen', name: '通义千问 Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', models: ['qwen-plus', 'qwen-turbo', 'qwen-max'] },
  { vendor: 'nvidia', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com', models: ['meta/llama-3.1-8b-instruct', 'mistralai/mixtral-8x7b-instruct'] },
  { vendor: 'unorouter', name: 'UnoRouter', baseUrl: 'https://api.unorouter.com/v1', models: ['gpt-oss-120b:free', 'deepseek-chat:free', 'deepseek-chat', 'gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet'] },
  { vendor: 'agnes-cn', name: 'Agnes AI（国内版）', baseUrl: 'https://api.agnes-ai.cn/v1', models: ['agnes-2.5-flash', 'agnes-2.5-pro', 'agnes-2.0-flash', 'gpt-4o', 'claude-3-5-sonnet'] },
  { vendor: 'agnes-global', name: 'Agnes AI（国际版）', baseUrl: 'https://api.agnes.ai/v1', models: ['agnes-2.5-flash', 'agnes-2.5-pro', 'agnes-2.0-flash', 'gpt-4o', 'claude-3-5-sonnet'] },
  { vendor: 'custom', name: '自定义', baseUrl: '', models: [] }
];

/**
 * @param {string} url
 * @returns {string}
 */
function normalizeBaseUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '').replace(/\/chat\/completions\/?$/i, '');
}

/**
 * @param {string} purpose
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ maxRetries?: number, timeout?: number, temperature?: number, maxTokens?: number }} [options]
 * @returns {Promise<{ok: boolean, content?: string, error?: string}>}
 */
async function callAiProvider(purpose, messages, options = {}) {
  const config = await loadJson('ai-providers.json', DEFAULT_AI_CONFIG);
  const providers = (config.providers || [])
    .filter(p => p.enabled && p.apiKey)
    .sort((a, b) => (a.priority || 1) - (b.priority || 1));

  const maxRetries = options.maxRetries ?? 1;

  for (const provider of providers) {
    const baseUrl = normalizeBaseUrl(provider.baseUrl);
    if (!baseUrl) continue;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutMs = options.timeout ?? 60000;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const startTime = Date.now();
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens || 1500
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (resp.ok) {
          const data = await resp.json();
          provider.lastUsedAt = new Date().toISOString();
          markDirty('ai-providers.json');
          appendAiCallLog({ provider: provider.name, purpose, ok: true, duration: Date.now() - startTime, timestamp: new Date().toISOString() });
          return { ok: true, content: data.choices?.[0]?.message?.content || '' };
        }

        const d = await resp.json().catch(() => ({}));
        const code = d.error?.code || '';

        if (resp.status === 429 && attempt < maxRetries) {
          const retryAfter = parseInt(resp.headers.get('retry-after') || '5', 10) * 1000;
          appendAiCallLog({ provider: provider.name, purpose, ok: false, error: `429 rate limited, retry in ${retryAfter}ms`, timestamp: new Date().toISOString() });
          await new Promise(r => setTimeout(r, Math.min(retryAfter, 10000)));
          continue;
        }

        if (resp.status === 503 && code === 'get_channel_failed' && attempt < maxRetries) {
          appendAiCallLog({ provider: provider.name, purpose, ok: false, error: `503 get_channel_failed, retrying`, timestamp: new Date().toISOString() });
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }

        if (resp.status === 503 && code === 'model_not_found') {
          appendAiCallLog({ provider: provider.name, purpose, ok: false, error: `model_not_found: ${provider.model}`, timestamp: new Date().toISOString() });
          break;
        }

        if (resp.status >= 500 && attempt < maxRetries) {
          appendAiCallLog({ provider: provider.name, purpose, ok: false, error: `${resp.status} server error, retrying`, timestamp: new Date().toISOString() });
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        appendAiCallLog({ provider: provider.name, purpose, ok: false, error: `${resp.status}: ${d.error?.message || resp.statusText}`, timestamp: new Date().toISOString() });
        break;
      } catch (e) {
        const isTimeout = e.name === 'AbortError';
        appendAiCallLog({ provider: provider.name, purpose, ok: false, error: `${isTimeout ? 'timeout' : e.name}: ${e.message}`, timestamp: new Date().toISOString() });
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, isTimeout ? 500 : 2000));
          continue;
        }
        break;
      }
    }
  }
  return { ok: false, error: 'All AI providers failed' };
}

/**
 * @param {string} purpose
 * @param {Array<{role: string, content: string}>} messages
 * @param {{ temperature?: number, maxTokens?: number }} [options]
 * @returns {Promise<{ok: boolean, stream?: import('stream').Readable, error?: string}>}
 */
async function callAiProviderStream(purpose, messages, options = {}) {
  const config = await loadJson('ai-providers.json', DEFAULT_AI_CONFIG);
  const providers = (config.providers || [])
    .filter(p => p.enabled && p.apiKey)
    .sort((a, b) => (a.priority || 1) - (b.priority || 1));

  const provider = providers[0];
  if (!provider) return { ok: false, error: '未配置可用的 AI Provider' };

  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  if (!baseUrl) return { ok: false, error: 'Provider baseUrl 为空' };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 1500,
        stream: true
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const d = await resp.text().catch(() => '');
      appendAiCallLog({ provider: provider.name, purpose, ok: false, error: `HTTP ${resp.status}: ${d.slice(0, 100)}`, timestamp: new Date().toISOString() });
      return { ok: false, error: `AI 接口返回 ${resp.status}` };
    }

    provider.lastUsedAt = new Date().toISOString();
    markDirty('ai-providers.json');
    appendAiCallLog({ provider: provider.name, purpose, ok: true, stream: true, timestamp: new Date().toISOString() });
    return { ok: true, stream: resp.body };
  } catch (e) {
    appendAiCallLog({ provider: provider.name, purpose, ok: false, error: e.message, timestamp: new Date().toISOString() });
    return { ok: false, error: `AI 流式调用失败: ${e.message}` };
  }
}

module.exports = {
  callAiProvider,
  callAiProviderStream,
  normalizeBaseUrl,
  PROVIDER_PRESETS
};
