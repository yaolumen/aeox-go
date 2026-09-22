// @ts-check
import { html, useState, useEffect, authFetch, api, getToken } from './admin-lib.js';

function AIManager({ addToast }) {
  const [providers, setProviders] = useState([]);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState({});

  useEffect(() => { loadProviders(); loadPresets(); }, []);

  async function loadPresets() {
    const data = await authFetch('/api/config/provider-presets').then(r => r.json()).catch(() => []);
    setPresets(Array.isArray(data) ? data : []);
  }

  async function loadProviders() {
    setLoading(true);
    const data = await authFetch('/api/config/providers').then(r => r.json()).catch(() => ({ providers: [] }));
    setProviders(data.providers || []);
    setLoading(false);
  }

  async function saveProvider(idx) {
    const p = providers[idx];
    const updates = { ...p };
    delete updates.apiKeyPreview;
    if (p.id) {
      await authFetch(`/api/config/providers/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
    } else {
      const res = await authFetch('/api/config/providers', {
        method: 'POST',
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success && data.provider) {
        providers[idx] = { ...providers[idx], id: data.provider.id };
      }
    }
     addToast('供应商已保存', 'success');
    loadProviders();
  }

  async function testProvider(idx) {
    const p = providers[idx];
     if (!p.id) { addToast('请先保存供应商', 'error'); return; }
    setTestResult(prev => ({ ...prev, [idx]: 'testing' }));
    try {
      const res = await authFetch('/api/ai/test', {
        method: 'POST',
        body: JSON.stringify({ providerId: p.id })
      });
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [idx]: data.success ? 'ok' : 'fail', message: data.message }));
      addToast(data.message, data.success ? 'success' : 'error');
    } catch (e) {
      setTestResult(prev => ({ ...prev, [idx]: 'fail', message: e.message }));
      addToast(e.message, 'error');
    }
  }

  async function removeProvider(idx) {
    const p = providers[idx];
    if (!p.id) return;
     if (!confirm('确定删除供应商"' + p.name + '"？')) return;
    await authFetch(`/api/config/providers/${p.id}`, { method: 'DELETE' });
     addToast('供应商已删除', 'success');
    loadProviders();
  }

  function updateField(idx, field, val) {
    setProviders(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  }

  function applyPreset(idx, vendor) {
    const preset = presets.find(p => p.vendor === vendor);
    if (!preset) return;
    setProviders(prev => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        name: preset.name,
        vendor: preset.vendor,
        baseUrl: preset.baseUrl,
        model: preset.models?.[0] || ''
      };
      return next;
    });
  }

  if (loading) return html`<div class="empty"><div class="spinner"></div></div>`;

  const slots = [0, 1, 2];

  return html`
    <div style="display:flex;flex-direction:column;gap:20px;">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">最多 3 个 AI 供应商，按顺序决定优先级（1 = 最高）。接口地址填写到 /v1 或域名根路径即可，系统会自动拼接 /chat/completions。<br/><span style="color:var(--accent);">提示：UnoRouter 免费模型需加 :free 后缀（如 deepseek-chat:free），去掉后缀为付费版。Agnes AI 国内版 (api.agnes-ai.cn) 适合国内服务器，国际版 (apihub.agnes-ai.com) 适合海外服务器。</span></p>
      ${slots.map(idx => {
        const p = providers[idx] || { name: '', baseUrl: '', model: '', apiKey: '', vendor: '', enabled: false, priority: idx + 1 };
        const hasId = !!providers[idx]?.id;
        const test = testResult[idx];
        const matchedPreset = presets.find(pr => pr.vendor === p.vendor) || presets.find(pr => pr.baseUrl && p.baseUrl && p.baseUrl.startsWith(pr.baseUrl));

        return html`
          <div key=${idx} class="admin-card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
              <h3 class="admin-card-title" style="margin-bottom:0;">供应商 ${idx + 1}</h3>
              <div style="display:flex;align-items:center;gap:8px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" checked=${p.enabled} onChange=${e => updateField(idx, 'enabled', e.target.checked)} />
                   <span style="font-size:12px;color:var(--text-muted);">启用</span>
                </label>
                ${hasId && html`
                  <button onClick=${() => testProvider(idx)} style="padding:4px 10px;font-size:11px;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;background:var(--surface);">
                     测试
                  </button>
                `}
                ${hasId && html`
                  <button onClick=${() => removeProvider(idx)} style="padding:4px 10px;font-size:11px;border:1px solid rgba(239,68,68,.3);color:var(--red);cursor:pointer;background:transparent;">
                     删除
                  </button>
                `}
              </div>
            </div>
            ${test === 'testing' && html`<p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">测试中...</p>`}
            ${test === 'ok' && html`<p style="font-size:12px;color:var(--green);margin-bottom:8px;">${testResult.message || '连接成功'}</p>`}
            ${test === 'fail' && html`<p style="font-size:12px;color:var(--red);margin-bottom:8px;">${testResult.message || '连接失败'}</p>`}
            <div class="admin-field" style="margin-bottom:12px;">
              <label class="admin-label">快速预设</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${presets.map(pr => html`
                  <button key=${pr.vendor} onClick=${() => applyPreset(idx, pr.vendor)}
                    style="padding:4px 10px;font-size:11px;border:1px solid ${p.vendor === pr.vendor ? 'var(--accent)' : 'var(--border)'};color:${p.vendor === pr.vendor ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;background:${p.vendor === pr.vendor ? 'var(--accent-light)' : 'var(--surface)'};border-radius:4px;">
                    ${pr.name}
                  </button>
                `)}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="admin-field">
               <label class="admin-label">名称</label>
               <input class="admin-input" type="text" value=${p.name} onInput=${e => updateField(idx, 'name', e.target.value)} placeholder="例如 DeepSeek" />
             </div>
             <div class="admin-field">
               <label class="admin-label">模型</label>
               <div style="display:flex;gap:6px;">
                 ${(matchedPreset?.models?.length > 0) ? html`
                   <select class="admin-input" style="flex:1;padding:6px 8px;" value=${p.model} onChange=${e => updateField(idx, 'model', e.target.value)}>
                     <option value="">-- 选择模型 --</option>
                     ${matchedPreset.models.map(m => html`<option key=${m} value=${m}>${m}</option>`)}
                   </select>
                 ` : html`
                   <input class="admin-input" type="text" style="flex:1;" value=${p.model} onInput=${e => updateField(idx, 'model', e.target.value)} placeholder="例如 deepseek-chat" />
                 `}
               </div>
             </div>
            </div>
            <div class="admin-field">
              <label class="admin-label">接口地址</label>
              <input class="admin-input" type="url" value=${p.baseUrl} onInput=${e => updateField(idx, 'baseUrl', e.target.value)} placeholder="https://api.unorouter.com/v1 或 https://api.agnes-ai.cn/v1" />
              <p class="admin-hint">填写到域名根路径或 /v1 即可，系统自动拼接 /chat/completions</p>
            </div>
            <div class="admin-field">
              <label class="admin-label">API Key</label>
              <input class="admin-input" type="password" value=${p.apiKey || ''} onInput=${e => updateField(idx, 'apiKey', e.target.value)} placeholder="sk-..." />
              ${p.apiKeyPreview && html`<p class="admin-hint">当前：${p.apiKeyPreview}</p>`}
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
              <button onClick=${() => saveProvider(idx)}
                style="padding:6px 14px;font-size:12px;background:var(--accent);color:#fff;border:none;cursor:pointer;">
                 保存
              </button>
            </div>
          </div>
        `;
      })}
    </div>
  `;
}

export { AIManager };
