// @ts-check
import { html, useState, useEffect, api, authFetch, getToken, t, CollapsibleSection } from './admin-lib.js';
import { OrdersTab } from './admin-orders.js';
import { LogoManager } from './admin-logos.js';
import { ApiDocs } from './admin-api-docs.js';

function Spinner({ size }) { const s = size || 16; return html`<svg class="animate-spin" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>`; }

function SystemSettings({ addToast }) {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [apiKeys, setApiKeys] = useState([]);
  const [logs, setLogs] = useState([]);
  const [aiLogs, setAiLogs] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    api('/api/config/site').then(setConfig).catch(() => {});
    authFetch('/api/config/keys').then(r => r.json()).catch(() => []).then(setApiKeys);
  }, []);

  function update(path, val) {
    const next = { ...config };
    const parts = path.split('.');
    let obj = next;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = val;
    setConfig(next);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await authFetch('/api/config/site', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        setDirty(false);
        addToast('设置已保存', 'success');
      } else {
        addToast('保存失败', 'error');
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function createKey() {
    if (!newKeyName) return;
    const res = await authFetch('/api/config/keys', {
      method: 'POST',
      body: JSON.stringify({ name: newKeyName, scopes: ['read', 'write'] })
    });
    const data = await res.json();
    if (data.success) {
      addToast('API 密钥已创建，请立即复制（仅显示一次）！', 'success');
      if (data.key) {
        try { await navigator.clipboard.writeText(data.key.key); addToast('密钥已复制到剪贴板', 'success'); } catch {}
      }
      setNewKeyName('');
      const keys = await authFetch('/api/config/keys').then(r => r.json()).catch(() => []);
      setApiKeys(keys);
    } else {
      addToast(data.error || '创建失败', 'error');
    }
  }

  async function revokeKey(id) {
    if (!confirm('确定撤销此 API 密钥？')) return;
    await authFetch('/api/config/keys/' + id, { method: 'DELETE' });
    addToast('密钥已撤销', 'success');
    const keys = await authFetch('/api/config/keys').then(r => r.json()).catch(() => []);
    setApiKeys(keys);
  }

  async function loadLogs() {
    const [l, al] = await Promise.all([
      authFetch('/api/config/logs?limit=50').then(r => r.json()).catch(() => []),
      authFetch('/api/config/ai-logs?limit=50').then(r => r.json()).catch(() => [])
    ]);
    setLogs(l);
    setAiLogs(al);
    setShowLogs(true);
  }

  if (!config) return html`<div class="empty"><div class="spinner"></div></div>`;

  return html`
    <div style="display:flex;flex-direction:column;gap:0;padding-bottom:72px;">

      <div style="margin-bottom:28px;">
        <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--accent);">外观</div>
        <div style="display:flex;flex-direction:column;gap:20px;">
          <div class="admin-card">
            <h3 class="admin-card-title">Logo</h3>
            <${LogoManager} addToast=${addToast} />
          </div>
          <div class="admin-card">
            <h3 class="admin-card-title">站点信息</h3>
            <div class="admin-field">
              <label class="admin-label">站点名称</label>
              <input class="admin-input" type="text" value=${config.siteName || ''} onInput=${e => update('siteName', e.target.value)} />
            </div>
            <div class="admin-field">
              <label class="admin-label">站点描述</label>
              <textarea class="admin-textarea" rows="2" value=${config.siteDescription || ''} onInput=${e => update('siteDescription', e.target.value)}></textarea>
            </div>
            <div class="admin-field">
              <label class="admin-label">Hero Tagline</label>
                <input class="admin-input" type="text" value=${config.heroTagline || ''} onInput=${e => update('heroTagline', e.target.value)} placeholder="Curated Digital Products & Resources" />
            </div>
            <div class="admin-field">
              <label class="admin-label">关键词</label>
              <input class="admin-input" type="text" value=${config.keywords || ''} onInput=${e => update('keywords', e.target.value)} placeholder="ebook, ai, productivity" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="admin-field">
                <label class="admin-label">Hero 主按钮文案</label>
                <input class="admin-input" type="text" value=${config.heroCtaPrimary || ''} onInput=${e => update('heroCtaPrimary', e.target.value)} placeholder="Browse Collection" />
              </div>
              <div class="admin-field">
                <label class="admin-label">Hero 副按钮文案</label>
                <input class="admin-input" type="text" value=${config.heroCtaSecondary || ''} onInput=${e => update('heroCtaSecondary', e.target.value)} placeholder="Free Products" />
              </div>
            </div>
            <div class="admin-field">
              <label class="admin-label">页脚版权</label>
              <input class="admin-input" type="text" value=${config.footerCopyright || ''} onInput=${e => update('footerCopyright', e.target.value)} />
            </div>
            <div class="admin-field">
              <label class="admin-label">支持邮箱</label>
              <input class="admin-input" type="email" value=${config.supportEmail || ''} onInput=${e => update('supportEmail', e.target.value)} placeholder="support@example.com" />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="admin-field">
                <label class="admin-label">Twitter</label>
                <input class="admin-input" type="url" value=${config.socialLinks?.twitter || ''} onInput=${e => update('socialLinks.twitter', e.target.value)} />
              </div>
              <div class="admin-field">
                <label class="admin-label">Instagram</label>
                <input class="admin-input" type="url" value=${config.socialLinks?.instagram || ''} onInput=${e => update('socialLinks.instagram', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:28px;">
        <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--accent);">语言</div>
        <div style="display:flex;flex-direction:column;gap:20px;">
          <div class="admin-card">
            <h3 class="admin-card-title">前台语言</h3>
            <div class="admin-field">
              <label class="admin-label">默认语言</label>
              <select class="admin-select" value=${config.defaultLang || 'en'} onChange=${e => update('defaultLang', e.target.value)}>
                <option value="en">English</option>
                <option value="zh">中文</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
            <div class="admin-field">
              <label class="admin-label">启用的语言</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${[{code:'en',label:'English'},{code:'zh',label:'中文'},{code:'es',label:'Español'},{code:'de',label:'Deutsch'}].map(l => {
                  const enabled = (config.availableLangs || ['en','zh','es','de']).includes(l.code);
                  return html`
                    <button key=${l.code} type="button" onClick=${() => {
                      const current = config.availableLangs || ['en','zh','es','de'];
                      const next = enabled ? current.filter(c => c !== l.code) : [...current, l.code];
                      if (next.length === 0) { addToast('至少保留一种语言', 'error'); return; }
                      if (!next.includes(config.defaultLang || 'en')) { update('defaultLang', next[0]); }
                      update('availableLangs', next);
                    }}
                      style="padding:6px 14px;font-size:12px;border:1px solid ${enabled ? 'var(--accent)' : 'var(--border)'};background:${enabled ? 'var(--accent-light)' : 'var(--surface)'};color:${enabled ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;border-radius:4px;">
                      ${enabled ? '\u2713 ' : ''}${l.label}
                    </button>
                  `;
                })}
              </div>
              <p class="admin-hint">后台管理仅支持 English / 中文，不受此设置影响</p>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:28px;">
        <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--accent);">内容</div>
        <div style="display:flex;flex-direction:column;gap:20px;">
          <div class="admin-card">
            <h3 class="admin-card-title">FAQ 常见问题</h3>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <label style="font-size:13px;font-weight:500;">在前台显示 FAQ 板块</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" checked=${config.faq?.enabled !== false} onChange=${e => {
                  const faq = { ...config.faq, enabled: e.target.checked };
                  if (!faq.items) faq.items = [];
                  update('faq', faq);
                }} />
                <span style="font-size:12px;">启用</span>
              </label>
            </div>
            <div class="admin-field">
              <label class="admin-label">FAQ 标题</label>
              <input class="admin-input" type="text" value=${config.faq?.title || ''} onInput=${e => {
                const faq = { ...(config.faq || { enabled: true, items: [] }), title: e.target.value };
                update('faq', faq);
              }} placeholder="Frequently Asked Questions" />
            </div>
            <div style="margin-top:16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <label style="font-size:13px;font-weight:500;">问答条目</label>
                <button onClick=${() => {
                  const items = [...(config.faq?.items || []), { q: { en: '', zh: '', es: '', de: '' }, a: { en: '', zh: '', es: '', de: '' } }];
                  update('faq', { ...(config.faq || { enabled: true, title: '' }), items });
                }} style="font-size:12px;padding:4px 10px;border:1px solid var(--accent);color:var(--accent);background:none;cursor:pointer;">+ 添加</button>
              </div>
              ${(config.faq?.items || []).length === 0
                ? html`<p style="font-size:13px;color:var(--text-muted);">暂无 FAQ 条目，点击上方"添加"按钮创建</p>`
                : (config.faq?.items || []).map((item, i) => html`
                  <div key=${i} style="background:var(--surface);border:1px solid var(--border);padding:12px;margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                      <span style="font-size:11px;color:var(--text-muted);font-weight:600;">#${i + 1}</span>
                      <div style="display:flex;gap:4px;">
                        ${i > 0 && html`<button onClick=${() => {
                          const items = [...(config.faq?.items || [])];
                          const tmp = items[i]; items[i] = items[i-1]; items[i-1] = tmp;
                          update('faq', { ...config.faq, items });
                        }} style="font-size:10px;padding:2px 6px;border:1px solid var(--border);color:var(--text-muted);background:none;cursor:pointer;">↑</button>`}
                        ${i < (config.faq?.items || []).length - 1 && html`<button onClick=${() => {
                          const items = [...(config.faq?.items || [])];
                          const tmp = items[i]; items[i] = items[i+1]; items[i+1] = tmp;
                          update('faq', { ...config.faq, items });
                        }} style="font-size:10px;padding:2px 6px;border:1px solid var(--border);color:var(--text-muted);background:none;cursor:pointer;">↓</button>`}
                        <button onClick=${() => {
                          const items = [...(config.faq?.items || [])];
                          items.splice(i, 1);
                          update('faq', { ...config.faq, items });
                        }} style="font-size:10px;padding:2px 6px;border:1px solid rgba(239,68,68,.3);color:var(--red);background:none;cursor:pointer;">删除</button>
                      </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                      <div>
                        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">问题 (EN)</label>
                        <input class="admin-input" type="text" value=${item.q?.en || ''} onInput=${e => {
                          const items = [...(config.faq?.items || [])];
                          items[i] = { ...items[i], q: { ...items[i].q, en: e.target.value } };
                          update('faq', { ...config.faq, items });
                        }} placeholder="Question in English" style="font-size:12px;padding:6px 8px;" />
                      </div>
                      <div>
                        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">问题 (ZH)</label>
                        <input class="admin-input" type="text" value=${item.q?.zh || ''} onInput=${e => {
                          const items = [...(config.faq?.items || [])];
                          items[i] = { ...items[i], q: { ...items[i].q, zh: e.target.value } };
                          update('faq', { ...config.faq, items });
                        }} placeholder="中文问题" style="font-size:12px;padding:6px 8px;" />
                      </div>
                      <div>
                        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">问题 (ES)</label>
                        <input class="admin-input" type="text" value=${item.q?.es || ''} onInput=${e => {
                          const items = [...(config.faq?.items || [])];
                          items[i] = { ...items[i], q: { ...items[i].q, es: e.target.value } };
                          update('faq', { ...config.faq, items });
                        }} placeholder="Pregunta en español" style="font-size:12px;padding:6px 8px;" />
                      </div>
                      <div>
                        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">问题 (DE)</label>
                        <input class="admin-input" type="text" value=${item.q?.de || ''} onInput=${e => {
                          const items = [...(config.faq?.items || [])];
                          items[i] = { ...items[i], q: { ...items[i].q, de: e.target.value } };
                          update('faq', { ...config.faq, items });
                        }} placeholder="Frage auf Deutsch" style="font-size:12px;padding:6px 8px;" />
                      </div>
                      <div>
                        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">回答 (EN)</label>
                        <input class="admin-input" type="text" value=${item.a?.en || ''} onInput=${e => {
                          const items = [...(config.faq?.items || [])];
                          items[i] = { ...items[i], a: { ...items[i].a, en: e.target.value } };
                          update('faq', { ...config.faq, items });
                        }} placeholder="Answer in English" style="font-size:12px;padding:6px 8px;" />
                      </div>
                      <div>
                        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">回答 (ZH)</label>
                        <input class="admin-input" type="text" value=${item.a?.zh || ''} onInput=${e => {
                          const items = [...(config.faq?.items || [])];
                          items[i] = { ...items[i], a: { ...items[i].a, zh: e.target.value } };
                          update('faq', { ...config.faq, items });
                        }} placeholder="中文回答" style="font-size:12px;padding:6px 8px;" />
                      </div>
                      <div>
                        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">回答 (ES)</label>
                        <input class="admin-input" type="text" value=${item.a?.es || ''} onInput=${e => {
                          const items = [...(config.faq?.items || [])];
                          items[i] = { ...items[i], a: { ...items[i].a, es: e.target.value } };
                          update('faq', { ...config.faq, items });
                        }} placeholder="Respuesta en español" style="font-size:12px;padding:6px 8px;" />
                      </div>
                      <div>
                        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">回答 (DE)</label>
                        <input class="admin-input" type="text" value=${item.a?.de || ''} onInput=${e => {
                          const items = [...(config.faq?.items || [])];
                          items[i] = { ...items[i], a: { ...items[i].a, de: e.target.value } };
                          update('faq', { ...config.faq, items });
                        }} placeholder="Antwort auf Deutsch" style="font-size:12px;padding:6px 8px;" />
                      </div>
                    </div>
                  </div>
                `)
              }
            </div>
          </div>

          <div class="admin-card">
            <h3 class="admin-card-title">退款政策</h3>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <label style="font-size:13px;font-weight:500;">在前台显示退款政策</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" checked=${config.refundPolicy?.enabled !== false} onChange=${e => update('refundPolicy.enabled', e.target.checked)} />
                <span style="font-size:12px;">启用</span>
              </label>
            </div>
            <div class="admin-field">
              <label class="admin-label">退款政策文案</label>
              <textarea class="admin-textarea" rows="3" value=${config.refundPolicy?.text || ''} onInput=${e => update('refundPolicy.text', e.target.value)} placeholder="If you need a refund, please contact our support team..."></textarea>
            </div>
            <div class="admin-field">
              <label class="admin-label">客服邮箱</label>
              <input class="admin-input" type="email" value=${config.refundPolicy?.contactEmail || ''} onInput=${e => update('refundPolicy.contactEmail', e.target.value)} placeholder="support@example.com" />
              <p class="admin-hint">前台显示时会自动加密防爬虫，用户点击才能看到真实邮箱</p>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:28px;">
        <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--accent);">高级</div>
        <div style="display:flex;flex-direction:column;gap:20px;">
          <div class="admin-card">
            <h3 class="admin-card-title">支付设置</h3>
            <div style="margin-bottom:12px;padding:8px 12px;background:var(--accent-light);border:1px solid var(--accent);font-size:12px;color:var(--accent);">
              当前支付模式：Ko-fi（前台优先使用 Ko-fi 链接，Stripe 通道冻结保留）
            </div>
            <div class="admin-field">
              <label class="admin-label">Ko-fi 全局链接</label>
              <input class="admin-input" type="url" value=${config.kofiLink || ''} onInput=${e => update('kofiLink', e.target.value)}
                placeholder="https://ko-fi.com/yaolumen" />
              <p class="admin-hint">商品未单独配置 Ko-fi 链接时使用此全局链接</p>
            </div>
            <div class="admin-field">
              <label class="admin-label">Ko-fi Shop 商品链接格式</label>
              <p class="admin-hint">在 Ko-fi Shop 创建数字产品后，获取购买链接填入商品的「Ko-fi 支付链接」字段。<br/>格式示例：https://ko-fi.com/s/xxxxx</p>
            </div>
          </div>

          <div class="admin-card">
            <h3 class="admin-card-title">Stripe（冻结）</h3>
            <div style="margin-bottom:12px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);font-size:12px;color:var(--text-muted);">
              Stripe 通道当前未启用。配置保留，切换支付模式后可恢复使用。
            </div>
            <div class="admin-field">
              <label class="admin-label">密钥</label>
              <input class="admin-input" type="text" value=${config.stripe?.secretKey || ''} onInput=${e => update('stripe.secretKey', e.target.value)}
                placeholder="rk_live_xxx 或 rk_test_xxx" style="font-family:var(--font-mono);opacity:0.6;" />
              <p class="admin-hint">受限密钥，需 checkout.session 读取权限。根据密钥前缀自动识别模式（rk_live_ = 正式 / rk_test_ = 测试）</p>
            </div>
          </div>

          <div class="admin-card">
            <h3 class="admin-card-title">会话设置</h3>
            <div class="admin-field">
              <label class="admin-label">登录超时时间（分钟）</label>
              <input class="admin-input" type="number" min="5" max="1440" value=${config.security?.sessionTimeout || 240}
                onInput=${e => update('security.sessionTimeout', Number(e.target.value))} />
              <p class="admin-hint">长时间无操作将自动退出登录，默认 240 分钟（4小时）</p>
            </div>
          </div>

          <div class="admin-card">
            <h3 class="admin-card-title">SEO</h3>
            <div class="admin-field">
              <label class="admin-label">屏蔽路径（每行一条）</label>
              <textarea class="admin-textarea" rows="2" value=${(config.seo?.blockedPaths || []).join('\n')}
                onInput=${e => update('seo.blockedPaths', e.target.value.split('\n').filter(Boolean))}></textarea>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div>
                <label style="font-size:13px;font-weight:500;">屏蔽 AI 爬虫</label>
              </div>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                <input type="checkbox" checked=${config.seo?.blockAI !== false} onChange=${e => update('seo.blockAI', e.target.checked)} />
                <span style="font-size:12px;">启用</span>
              </label>
            </div>
            <div class="admin-field">
              <label class="admin-label">屏蔽的爬虫（每行一条）</label>
              <textarea class="admin-textarea" rows="2" value=${(config.seo?.blockedBots || []).join('\n')}
                onInput=${e => update('seo.blockedBots', e.target.value.split('\n').filter(Boolean))}></textarea>
            </div>
          </div>

          <div class="admin-card">
            <h3 class="admin-card-title">API 密钥</h3>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
              <input class="admin-input" type="text" value=${newKeyName} onInput=${e => setNewKeyName(e.target.value)} placeholder="密钥名称" style="max-width:240px;" />
              <button onClick=${createKey} style="padding:8px 14px;background:var(--accent);color:var(--bg);font-size:12px;border:none;cursor:pointer;">创建密钥</button>
            </div>
            ${apiKeys.length === 0
              ? html`<p style="font-size:13px;color:var(--text-muted);">暂无 API 密钥</p>`
              : html`<table class="admin-table">
                  <thead><tr><th>名称</th><th>密钥</th><th>状态</th><th>最后使用</th><th></th></tr></thead>
                  <tbody>
                    ${apiKeys.map(k => html`
                      <tr key=${k.id}>
                        <td>${k.name}</td>
                        <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-light);">${k.keyPreview || '***'}</td>
                        <td>${k.enabled !== false
                          ? html`<span class="admin-status on">有效</span>`
                          : html`<span class="admin-status off">已撤销</span>`
                        }</td>
                        <td style="font-size:12px;color:var(--text-light);">${k.lastUsedAt || '从未使用'}</td>
                        <td>${k.enabled !== false && html`
                           <button onClick=${() => revokeKey(k.id)} class="admin-action-btn danger">撤销</button>
                        `}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>`
            }
          </div>

          <${ApiDocs} apiKeys=${apiKeys} />

          <div class="admin-card">
            <h3 class="admin-card-title">管理员账号</h3>
            <div class="admin-field">
              <label class="admin-label">修改密码</label>
              <div style="display:flex;flex-direction:column;gap:8px;max-width:320px;">
                <input class="admin-input" id="pwd-current" type="password" placeholder="当前密码" />
                <input class="admin-input" id="pwd-new" type="password" placeholder="新密码（至少8位）" />
                <button type="button" onClick=${async () => {
                  const current = document.getElementById('pwd-current').value;
                  const next = document.getElementById('pwd-new').value;
                   if (next.length < 8) { addToast('密码至少8个字符', 'error'); return; }
                  try {
                    const res = await authFetch('/api/auth/change-password', {
                      method: 'POST',
                      body: JSON.stringify({ currentPassword: current, newPassword: next })
                    });
                    const data = await res.json();
                     if (data.success) addToast('密码已修改', 'success');
                     else addToast(data.message || '修改失败', 'error');
                  } catch (e) { addToast(e.message, 'error'); }
                }} style="padding:8px 16px;background:var(--accent);color:var(--bg);font-size:13px;border:none;cursor:pointer;">
                   修改密码
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:28px;">
        <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--accent);">日志</div>
        <${CollapsibleSection} title="访问日志 & AI 调用日志" defaultOpen=${showLogs}>
          <button onClick=${loadLogs} style="margin-bottom:12px;padding:6px 14px;font-size:12px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;">
            加载近期日志
          </button>
          ${logs.length > 0 && html`
            <h4 style="font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:8px;">访问日志</h4>
            <div style="max-height:200px;overflow-y:auto;background:var(--surface);padding:12px;font-family:var(--font-mono);font-size:11px;line-height:1.6;margin-bottom:16px;">
              ${logs.map((l, i) => html`<div key=${i} style="border-bottom:1px solid var(--border);padding:4px 0;">${l.method} ${l.path} ${l.status} - ${l.ip} - ${l.ts}</div>`)}
            </div>
          `}
          ${aiLogs.length > 0 && html`
            <h4 style="font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:8px;">AI 调用日志</h4>
            <div style="max-height:200px;overflow-y:auto;background:var(--surface);padding:12px;font-family:var(--font-mono);font-size:11px;line-height:1.6;">
               ${aiLogs.map((l, i) => html`<div key=${i} style="border-bottom:1px solid var(--border);padding:4px 0;">${l.provider} ${l.ok ? '成功' : '失败'} - ${l.purpose || ''} - ${l.ts}</div>`)}
            </div>
          `}
        <//>
      </div>

      <div style="position:fixed;bottom:0;left:0;right:0;background:var(--bg);border-top:1px solid var(--border);padding:12px 20px;z-index:25;display:flex;justify-content:center;">
        <button onClick=${save} disabled=${saving || !dirty}
          style="padding:10px 32px;background:var(--accent);color:#fff;font-size:13px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;opacity:${(saving || !dirty) ? '.4' : '1'};">
          ${saving && html`<${Spinner} size=${14} />`}
           ${dirty ? '保存所有设置' : '已保存'}
        </button>
      </div>
    </div>
  `;
}


export { SystemSettings };
