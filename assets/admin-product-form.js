// @ts-check
import { html, h, useState, useEffect, api, authFetch, getToken, t, CollapsibleSection, ShortLinksTab } from './admin-lib.js';

function Spinner({ size }) { const s = size || 16; return html`<svg class="animate-spin" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>`; }

const LANG_OPTIONS = [
  { code: 'en', label: 'EN', native: 'English' },
  { code: 'zh', label: '中文', native: '中文' },
  { code: 'es', label: 'ES', native: 'Español' },
  { code: 'de', label: 'DE', native: 'Deutsch' },
  { code: 'fr', label: 'FR', native: 'Français' },
  { code: 'ja', label: 'JA', native: '日本語' },
  { code: 'ko', label: 'KO', native: '한국어' },
  { code: 'pt', label: 'PT', native: 'Português' },
  { code: 'ru', label: 'RU', native: 'Русский' },
  { code: 'it', label: 'IT', native: 'Italiano' },
  { code: 'ar', label: 'AR', native: 'العربية' },
  { code: 'hi', label: 'HI', native: 'हिन्दी' }
];

function langLabel(code) {
  const opt = LANG_OPTIONS.find(l => l.code === code);
  return opt ? opt.label : code.toUpperCase();
}

function langNative(code) {
  const opt = LANG_OPTIONS.find(l => l.code === code);
  return opt ? opt.native : code.toUpperCase();
}

function LangField({ locales, fieldKey, label, values, update, textarea, required, activeLang, setActiveLang }) {
  const validTab = locales.includes(activeLang) ? activeLang : (locales[0] || 'en');
  return html`
    <div>
      <div style="display:flex;gap:4px;margin-bottom:8px;">
        ${locales.map(code => html`
          <button key=${code} type="button" onClick=${() => setActiveLang(code)}
            style="padding:4px 12px;font-size:11px;font-weight:600;border:1px solid ${validTab === code ? 'var(--accent)' : 'var(--border)'};background:${validTab === code ? 'var(--accent-light)' : 'var(--surface)'};color:${validTab === code ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;border-radius:4px;box-shadow:${validTab === code ? '0 0 0 2px var(--accent)' : 'none'};">
            ${langLabel(code)}
          </button>
        `)}
      </div>
      ${locales.map(code => html`
        <div key=${code} style=${validTab === code ? '' : 'display:none;'} class="admin-field">
          <label class="admin-label">${label}（${langNative(code)}）</label>
          ${textarea
            ? html`<textarea class="admin-textarea" rows="3" value=${values[code] || ''} onInput=${e => update(fieldKey, code, e.target.value)}></textarea>`
            : html`<input class="admin-input" type="text" value=${values[code] || ''} onInput=${e => update(fieldKey, code, e.target.value)} ${required && code === locales[0] ? 'required' : ''} />`
          }
        </div>
      `)}
    </div>
  `;
}

function LocalesManager({ locales, onChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const available = LANG_OPTIONS.filter(l => !locales.includes(l.code));

  function addLocale(code) {
    if (!locales.includes(code)) onChange([...locales, code]);
    setShowAdd(false);
  }

  function removeLocale(code) {
    if (locales.length <= 1) return;
    onChange(locales.filter(l => l !== code));
  }

  return html`
    <div>
      <label class="admin-label">支持的语言</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        ${locales.map(code => html`
          <span key=${code} style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:12px;font-weight:500;border:1px solid var(--accent);background:var(--accent-light);color:var(--accent);border-radius:4px;">
            ${langLabel(code)}
            <span style="font-size:10px;opacity:0.7;">${langNative(code)}</span>
            ${locales.length > 1 && html`
              <button type="button" onClick=${() => removeLocale(code)} style="margin-left:2px;padding:0 3px;font-size:12px;line-height:1;background:none;border:none;color:var(--accent);cursor:pointer;opacity:0.6;">x</button>
            `}
          </span>
        `)}
        ${available.length > 0 && !showAdd && html`
          <button type="button" onClick=${() => setShowAdd(true)} style="padding:4px 10px;font-size:11px;border:1px dashed var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:4px;">+ 添加语言</button>
        `}
        ${showAdd && html`
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${available.map(l => html`
              <button key=${l.code} type="button" onClick=${() => addLocale(l.code)}
                style="padding:4px 10px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:4px;">
                ${l.label} ${l.native}
              </button>
            `)}
            <button type="button" onClick=${() => setShowAdd(false)} style="padding:4px 8px;font-size:11px;border:none;background:none;color:var(--text-muted);cursor:pointer;">取消</button>
          </div>
        `}
      </div>
    </div>
  `;
}

function ProductForm({ product, categories, tags, allProducts, onClose, onSave, addToast }) {
  const isNew = !product;

  const initLocales = product?.locales && product.locales.length > 0 ? product.locales : ['en'];
  const initDownloads = product?.downloads && typeof product.downloads === 'object' && !Array.isArray(product.downloads)
    ? product.downloads
    : product?.downloads && Array.isArray(product.downloads)
      ? { en: product.downloads }
      : product?.drive
        ? { en: [
            ...(product.drive.primary ? [{ url: product.drive.primary, label: '' }] : []),
            ...(product.drive.backup ? [{ url: product.drive.backup, label: '' }] : [])
          ]}
        : {};
  const initUpsell = product?.upsell || { mode: 'auto', products: [] };

  function buildI18nObj(product, field, locales) {
    const obj = {};
    for (const l of locales) {
      obj[l] = product?.[field]?.[l] || '';
    }
    return obj;
  }

  const [form, setForm] = useState(product ? {
    locales: initLocales,
    title: buildI18nObj(product, 'title', initLocales),
    desc: buildI18nObj(product, 'desc', initLocales),
    whatYouLearn: buildI18nObj(product, 'whatYouLearn', initLocales),
    whatYouGet: buildI18nObj(product, 'whatYouGet', initLocales),
    whoIsFor: buildI18nObj(product, 'whoIsFor', initLocales),
    price: product.price || 0,
    cover: product.cover || '',
    format: product.format || 'PDF / EPUB / MOBI',
    fileSize: product.fileSize || '',
    downloads: initDownloads,
    stripeLink: product.stripeLink || '',
    kofiLink: product.kofiLink || '',
    categoryId: product.categoryId || '',
    tags: product.tags || [],
    featured: product.featured || false,
    shortId: product.shortId || '',
    upsellMode: initUpsell.mode || 'auto',
    upsellProducts: initUpsell.products || []
  } : {
    locales: ['en'],
    title: { en: '' },
    desc: { en: '' },
    whatYouLearn: { en: '' },
    whatYouGet: { en: '' },
    whoIsFor: { en: '' },
    price: 0, cover: '', format: 'PDF / EPUB / MOBI', fileSize: '',
    downloads: {}, stripeLink: '', kofiLink: '', categoryId: '', tags: [], featured: false,
    shortId: Math.random().toString(36).slice(2, 8),
    upsellMode: 'auto', upsellProducts: []
  });
  const [saving, setSaving] = useState(false);
  const [activeLang, setActiveLang] = useState(form.locales[0] || 'en');
  const [dlLang, setDlLang] = useState(form.locales[0] || 'en');
  const isFree = Number(form.price) === 0;

  function handleSetLocales(newLocales) {
    setForm(prev => {
      const updated = { ...prev, locales: newLocales };
      for (const field of ['title', 'desc', 'whatYouLearn', 'whatYouGet', 'whoIsFor']) {
        const obj = { ...prev[field] };
        for (const l of newLocales) {
          if (obj[l] === undefined) obj[l] = '';
        }
        updated[field] = obj;
      }
      const dl = { ...prev.downloads };
      for (const l of newLocales) {
        if (!dl[l]) dl[l] = [];
      }
      updated.downloads = dl;
      return updated;
    });
    if (!newLocales.includes(activeLang)) setActiveLang(newLocales[0] || 'en');
    if (!newLocales.includes(dlLang)) setDlLang(newLocales[0] || 'en');
  }

  function handleSetActiveLang(lang) {
    setActiveLang(lang);
    setDlLang(lang);
  }

  function update(field, lang, val) {
    setForm(prev => {
      const obj = { ...prev[field] };
      obj[lang] = val;
      return { ...prev, [field]: obj };
    });
  }

  function updateSimple(field, val) {
    setForm(prev => ({ ...prev, [field]: val }));
  }

  function addDownload(lang) {
    setForm(prev => {
      const dl = { ...prev.downloads };
      dl[lang] = [...(dl[lang] || []), { url: '', label: '' }];
      return { ...prev, downloads: dl };
    });
  }

  function removeDownload(lang, index) {
    setForm(prev => {
      const dl = { ...prev.downloads };
      dl[lang] = (dl[lang] || []).filter((_, i) => i !== index);
      return { ...prev, downloads: dl };
    });
  }

  function updateDownload(lang, index, field, value) {
    setForm(prev => {
      const dl = { ...prev.downloads };
      const list = [...(dl[lang] || [])];
      list[index] = { ...list[index], [field]: value };
      dl[lang] = list;
      return { ...prev, downloads: dl };
    });
  }

  function toggleUpsellProduct(productId) {
    setForm(prev => ({
      ...prev,
      upsellProducts: prev.upsellProducts.includes(productId)
        ? prev.upsellProducts.filter(id => id !== productId)
        : [...prev.upsellProducts, productId]
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      locales: form.locales,
      title: form.title,
      price: Number(form.price) || 0,
      cover: form.cover,
      desc: form.desc,
      whatYouLearn: form.whatYouLearn,
      whatYouGet: form.whatYouGet,
      whoIsFor: form.whoIsFor,
      format: form.format,
      fileSize: form.fileSize,
      downloads: form.downloads,
      stripeLink: form.stripeLink,
      kofiLink: form.kofiLink,
      categoryId: form.categoryId,
      tags: form.tags,
      featured: form.featured,
      shortId: form.shortId,
      upsell: { mode: form.upsellMode, products: form.upsellProducts }
    };

    try {
      const res = isNew
        ? await authFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) })
        : await authFetch(`/api/products/${product.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) {
         addToast(isNew ? '商品已创建' : '商品已更新', 'success');
        onSave();
      } else {
        addToast(data.error || '操作失败', 'error');
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(id) {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(id) ? prev.tags.filter(t => t !== id) : [...prev.tags, id]
    }));
  }

  const activeProducts = (allProducts || []).filter(p => p.status !== 'archived' && p.id !== (product?.id));

  return html`
    <div style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.15);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;">
      <div style="background:var(--bg);border:1px solid var(--border);padding:24px;max-width:640px;width:100%;margin-top:20px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.12);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
           <h2 style="font-size:18px;font-weight:600;">${isNew ? '添加商品' : '编辑商品'}</h2>
          <button onClick=${onClose} style="color:var(--text-muted);background:none;border:none;cursor:pointer;padding:4px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit=${submit} style="display:flex;flex-direction:column;gap:0;">
          <div style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">基本信息</div>
            <${LocalesManager} locales=${form.locales} onChange=${handleSetLocales} />
            <div style="margin-top:12px;">
              <${LangField} locales=${form.locales} fieldKey="title" label="标题" values=${form.title} update=${update} required=${true} activeLang=${activeLang} setActiveLang=${handleSetActiveLang} />
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
              <div class="admin-field">
                <label class="admin-label">价格（$）</label>
                <input class="admin-input" type="number" step="0.01" min="0" value=${form.price} onInput=${e => updateSimple('price', e.target.value)} />
              </div>
              <div class="admin-field">
                <label class="admin-label">短ID</label>
                <input class="admin-input" type="text" value=${form.shortId} onInput=${e => updateSimple('shortId', e.target.value)} />
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;">
              <div class="admin-field">
                <label class="admin-label">格式</label>
                <input class="admin-input" type="text" value=${form.format} onInput=${e => updateSimple('format', e.target.value)} placeholder="PDF / EPUB / MOBI" />
              </div>
              <div class="admin-field">
                <label class="admin-label">文件大小</label>
                <input class="admin-input" type="text" value=${form.fileSize} onInput=${e => updateSimple('fileSize', e.target.value)} placeholder="5 MB" />
              </div>
            </div>
          </div>

          <div style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">描述（About This Book）</div>
            <${LangField} locales=${form.locales} fieldKey="desc" label="描述" values=${form.desc} update=${update} textarea=${true} activeLang=${activeLang} setActiveLang=${handleSetActiveLang} />
          </div>

          <div style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">What You'll Learn</div>
            <${LangField} locales=${form.locales} fieldKey="whatYouLearn" label="内容" values=${form.whatYouLearn} update=${update} textarea=${true} activeLang=${activeLang} setActiveLang=${handleSetActiveLang} />
          </div>

          <div style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">What You'll Get</div>
            <${LangField} locales=${form.locales} fieldKey="whatYouGet" label="收获" values=${form.whatYouGet} update=${update} textarea=${true} activeLang=${activeLang} setActiveLang=${handleSetActiveLang} />
          </div>

          <div style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Who Is This For?</div>
            <${LangField} locales=${form.locales} fieldKey="whoIsFor" label="适合人群" values=${form.whoIsFor} update=${update} textarea=${true} activeLang=${activeLang} setActiveLang=${handleSetActiveLang} />
          </div>

          <div style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">媒体</div>
            <div class="admin-field">
              <label class="admin-label">封面URL</label>
              <input class="admin-input" type="url" value=${form.cover} onInput=${e => updateSimple('cover', e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">下载链接（按语言）</div>
            </div>
            ${form.locales.length > 1 && html`
              <div style="display:flex;gap:4px;margin-bottom:12px;">
                ${form.locales.map(l => html`
                  <button key=${l} type="button" onClick=${() => handleSetActiveLang(l)}
                    style="padding:4px 12px;font-size:11px;font-weight:600;border:1px solid ${dlLang === l ? 'var(--accent)' : 'var(--border)'};background:${dlLang === l ? 'var(--accent-light)' : 'var(--surface)'};color:${dlLang === l ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;border-radius:4px;box-shadow:${dlLang === l ? '0 0 0 2px var(--accent)' : 'none'};">
                    ${langLabel(l)}
                  </button>
                `)}
              </div>
            `}
            ${(() => {
              const langDls = form.downloads[dlLang] || [];
              return html`
                <div>
                  ${langDls.length === 0 && html`
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">${langLabel(dlLang)} 暂无下载链接</p>
                  `}
                  ${langDls.map((dl, i) => html`
                    <div key=${i} style="display:grid;grid-template-columns:1fr 120px 28px;gap:8px;margin-bottom:8px;align-items:start;">
                      <div class="admin-field" style="margin:0;">
                        <input class="admin-input" type="url" value=${dl.url} onInput=${e => updateDownload(dlLang, i, 'url', e.target.value)} placeholder="https://..." />
                      </div>
                      <div class="admin-field" style="margin:0;">
                        <input class="admin-input" type="text" value=${dl.label} onInput=${e => updateDownload(dlLang, i, 'label', e.target.value)} placeholder="标签（可选）" />
                      </div>
                      <button type="button" onClick=${() => removeDownload(dlLang, i)}
                        style="padding:6px;color:var(--red,#ef4444);background:none;border:1px solid var(--border);cursor:pointer;font-size:14px;line-height:1;">x</button>
                    </div>
                  `)}
                  <button type="button" onClick=${() => addDownload(dlLang)}
                    style="padding:4px 10px;font-size:11px;background:var(--surface);border:1px solid var(--border);color:var(--text-muted);cursor:pointer;">
                    + 添加 ${langLabel(dlLang)} 链接
                  </button>
                </div>
              `;
            })()}
            ${!isFree && html`
              <div class="admin-field" style="margin-top:12px;">
                <label class="admin-label">Ko-fi 支付链接（优先）</label>
                <input class="admin-input" type="url" value=${form.kofiLink} onInput=${e => updateSimple('kofiLink', e.target.value)} placeholder="https://ko-fi.com/s/..." />
                <p class="admin-hint">当前优先使用 Ko-fi，用户点击后跳转 Ko-fi 页面购买</p>
              </div>
              <div class="admin-field" style="margin-top:8px;">
                <label class="admin-label">Stripe 支付链接（备用，暂未启用）</label>
                <input class="admin-input" type="url" value=${form.stripeLink} onInput=${e => updateSimple('stripeLink', e.target.value)} placeholder="https://buy.stripe.com/..." style="opacity:0.6;" />
                <p class="admin-hint">Stripe 通道暂时冻结，配置保留但不影响前台</p>
              </div>
            `}
            ${isFree && html`
              <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">免费商品无需支付链接</p>
            `}
          </div>

          <div style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:16px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">推荐设置（下载页 Upsell）</div>
            <div class="admin-field">
              <label class="admin-label">推荐模式</label>
              <select class="admin-select" value=${form.upsellMode} onChange=${e => updateSimple('upsellMode', e.target.value)}>
                <option value="auto">自动推荐（同分类优先）</option>
                <option value="manual">手动指定推荐商品</option>
                <option value="none">不推荐</option>
              </select>
            </div>
            ${form.upsellMode === 'manual' && html`
              <div style="margin-top:8px;">
                <label class="admin-label">选择推荐商品</label>
                <div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;padding:8px;background:var(--surface);border:1px solid var(--border);">
                  ${activeProducts.length === 0 && html`<span style="font-size:12px;color:var(--text-muted);">暂无可用商品</span>`}
                  ${(() => {
                    const catMap = {};
                    for (const c of categories) catMap[c.id] = c.name?.en || c.name?.zh || c.name || 'Uncategorized';
                    const grouped = {};
                    for (const p of activeProducts) {
                      const catName = catMap[p.categoryId] || 'Uncategorized';
                      if (!grouped[catName]) grouped[catName] = [];
                      grouped[catName].push(p);
                    }
                    const catOrder = categories.map(c => c.name?.en || c.name?.zh || c.name).filter(n => grouped[n]);
                    if (grouped['Uncategorized'] && !catOrder.includes('Uncategorized')) catOrder.push('Uncategorized');
                    return catOrder.map(catName => html`
                      <div key=${catName}>
                        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;padding:6px 0 2px;border-top:1px solid var(--border);">${catName}</div>
                        ${grouped[catName].map(p => {
                          const pTitle = p.title?.en || p.title?.zh || '';
                          const priceLabel = Number(p.price) > 0 ? `$${Number(p.price).toFixed(2)}` : 'FREE';
                          return html`
                            <label key=${p.id} style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;">
                              <input type="checkbox" checked=${form.upsellProducts.includes(p.id)} onChange=${() => toggleUpsellProduct(p.id)} />
                              <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pTitle}</span>
                              <span style="font-size:10px;font-weight:600;color:${Number(p.price) > 0 ? 'var(--accent)' : 'var(--green,#16a34a)'};white-space:nowrap;">${priceLabel}</span>
                            </label>
                          `;
                        })}
                      </div>
                    `);
                  })()}
                </div>
              </div>
            `}
          </div>

          <div style="padding-bottom:16px;margin-bottom:16px;">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">分类</div>
            <div class="admin-field">
              <label class="admin-label">分类</label>
              <select class="admin-select" value=${form.categoryId} onChange=${e => updateSimple('categoryId', e.target.value)}>
                <option value="">无</option>
               ${categories.map(c => html`<option key=${c.id} value=${c.id}>${c.name?.en || c.name?.zh || c.name}</option>`)}
             </select>
           </div>
            <div class="admin-field">
              <label class="admin-label">标签</label>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${tags.map(t => html`
                  <button key=${t.id} type="button" onClick=${() => toggleTag(t.id)}
                    style="padding:4px 10px;font-size:11px;border:1px solid ${form.tags.includes(t.id) ? t.color : 'var(--border)'};background:${form.tags.includes(t.id) ? t.color : 'var(--surface)'};color:${form.tags.includes(t.id) ? '#fff' : 'var(--text-muted)'};cursor:pointer;">
                    ${t.name}
                  </button>
                `)}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" checked=${form.featured} onChange=${e => updateSimple('featured', e.target.checked)} id="feat" />
              <label for="feat" style="font-size:13px;color:var(--text-muted);cursor:pointer;">推荐</label>
            </div>
          </div>
          <div style="display:flex;gap:10px;padding-top:8px;">
            <button type="submit" disabled=${saving}
              style="padding:10px 20px;background:var(--accent);color:#fff;font-size:13px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;">
              ${saving && html`<${Spinner} size=${14} />`}
               ${isNew ? '创建' : '保存'}
            </button>
            <button type="button" onClick=${onClose}
              style="padding:10px 20px;background:transparent;border:1px solid var(--border);color:var(--text-muted);font-size:13px;cursor:pointer;">
               取消
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export { ProductForm };
