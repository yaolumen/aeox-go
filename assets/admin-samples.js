// @ts-check
import { html, useState, useEffect, authFetch, api, t } from './admin-lib.js';

function SamplesManager({ addToast }) {
  const [samples, setSamples] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState({});
  const [editLang, setEditLang] = useState('en');
  const [editRelated, setEditRelated] = useState([]);
  const [editUpsellMode, setEditUpsellMode] = useState('auto');
  const [editBuyLink, setEditBuyLink] = useState('');
  const [editCover, setEditCover] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    authFetch('/api/samples').then(r => r.json()).then(setSamples).catch(() => {});
    authFetch('/api/products').then(r => r.json()).then(setProducts).catch(() => {});
    api('/api/config/categories').then(cats => setCategories(cats || [])).catch(() => {});
  }, []);

  const activeProducts = products.filter(p => p.status !== 'archived');
  const sampleShortIds = new Set(samples.map(s => s.shortId));
  const unbound = activeProducts.filter(p => !sampleShortIds.has(p.shortId));

  async function addSample(form) {
    const res = await authFetch('/api/samples', {
      method: 'POST',
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (data.success) {
      addToast('试读已创建', 'success');
      setSamples(prev => [...prev, data.sample]);
      setShowAddModal(false);
    } else {
      addToast(data.error || '创建失败', 'error');
    }
  }

  async function saveSample(shortId) {
    const res = await authFetch(`/api/samples/${shortId}`, {
      method: 'PUT',
      body: JSON.stringify({ content: editContent, relatedProducts: editRelated, upsellMode: editUpsellMode, buyLink: editBuyLink, cover: editCover, title: editTitle })
    });
    const data = await res.json();
    if (data.success) {
      addToast('已保存', 'success');
      setSamples(prev => prev.map(s => s.shortId === shortId ? { ...s, content: editContent, relatedProducts: editRelated, upsellMode: editUpsellMode, buyLink: editBuyLink, cover: editCover, title: editTitle } : s));
      setEditing(null);
    } else {
      addToast(data.error || '保存失败', 'error');
    }
  }

  async function toggleSample(shortId, enabled) {
    const res = await authFetch(`/api/samples/${shortId}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
    const data = await res.json();
    if (data.success) setSamples(prev => prev.map(s => s.shortId === shortId ? { ...s, enabled } : s));
  }

  async function removeSample(shortId) {
    if (!confirm('确定删除此试读？')) return;
    const res = await authFetch(`/api/samples/${shortId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      addToast('已删除', 'success');
      setSamples(prev => prev.filter(s => s.shortId !== shortId));
      if (editing === shortId) setEditing(null);
    }
  }

  function startEdit(shortId) {
    const sample = samples.find(s => s.shortId === shortId);
    if (sample) {
      setEditContent(sample.content || {});
      setEditRelated(sample.relatedProducts || []);
      setEditUpsellMode(sample.upsellMode || 'auto');
      setEditBuyLink(sample.buyLink || '');
      setEditCover(sample.cover || '');
      setEditTitle(typeof sample.title === 'object' ? (sample.title.en || sample.title.zh || '') : (sample.title || ''));
      const langs = Object.keys(sample.content || {});
      setEditLang(langs.includes('en') ? 'en' : langs[0] || 'en');
      setEditing(shortId);
    }
  }

  function addExternalRelated() {
    setEditRelated(prev => [...prev, { title: '', link: '', cover: '', price: '' }]);
  }

  function updateExternalRelated(idx, field, value) {
    setEditRelated(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function removeExternalRelated(idx) {
    setEditRelated(prev => prev.filter((_, i) => i !== idx));
  }

  function toggleInternalProduct(productId) {
    setEditRelated(prev => {
      const exists = prev.find(r => r.productId === productId);
      if (exists) return prev.filter(r => r.productId !== productId);
      return [...prev, { productId }];
    });
  }

  const t = (obj) => obj?.en || obj?.zh || '';

  function renderGroupedProductSelector() {
    if (activeProducts.length === 0) return null;
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
    return html`
      <div style="margin-bottom:8px;">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">站内书籍</div>
        <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;padding:8px;background:var(--surface);border:1px solid var(--border);">
          ${catOrder.map(catName => html`
            <div key=${catName}>
              <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;padding:6px 0 2px;border-top:1px solid var(--border);">${catName}</div>
              ${grouped[catName].map(p => {
                const checked = editRelated.some(r => r.productId === p.id);
                const priceLabel = Number(p.price) > 0 ? `$${Number(p.price).toFixed(2)}` : 'FREE';
                return html`
                  <label key=${p.id} style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;">
                    <input type="checkbox" checked=${checked} onChange=${() => toggleInternalProduct(p.id)} />
                    ${p.cover && html`<img src=${p.cover} style="width:20px;height:28px;object-fit:cover;border-radius:2px;" />`}
                    <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t(p.title)}</span>
                    <span style="font-size:10px;font-weight:600;color:${Number(p.price) > 0 ? 'var(--accent)' : 'var(--green,#16a34a)'};white-space:nowrap;">${priceLabel}</span>
                  </label>
                `;
              })}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  const modeLabel = { auto: '自动', manual: '手动', none: '关闭' };

  return html`
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
        <div>
          <h2 style="font-size:20px;font-weight:700;">试读专区</h2>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px;">添加试读内容，读者在线阅读后可购买完整版或留邮箱</p>
        </div>
        <button onClick=${() => setShowAddModal(true)} style="padding:8px 16px;font-size:13px;font-weight:500;background:var(--accent);color:#fff;border:none;cursor:pointer;border-radius:8px;">+ 添加试读</button>
      </div>

      ${showAddModal && html`
        <${AddSampleModal} unbound=${unbound} products=${activeProducts} onAdd=${addSample} onClose=${() => setShowAddModal(false)} addToast=${addToast} />
      `}

      ${samples.length === 0 && html`
        <div class="admin-card" style="text-align:center;padding:40px;">
          <p style="color:var(--text-muted);font-size:14px;">暂无试读，点击右上角"添加试读"开始</p>
        </div>
      `}

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${samples.map(sample => {
          const product = sample.productId ? activeProducts.find(p => p.id === sample.productId) : null;
          const sampleTitle = typeof sample.title === 'object' ? t(sample.title) : (sample.title || sample.shortId);
          const hasContent = Object.values(sample.content || {}).some(v => v && v.trim());
          const isEditing = editing === sample.shortId;
          const hasBuyLink = sample.buyLink || product?.kofiLink || product?.stripeLink;
          const sampleUpsellMode = sample.upsellMode || 'auto';
          const relatedCount = (sample.relatedProducts || []).length;
          return html`
            <div key=${sample.id} class="admin-card" style="padding:16px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  ${(sample.cover || product?.cover) && html`<img src=${sample.cover || product.cover} style="width:32px;height:44px;object-fit:cover;border-radius:4px;" />`}
                  <div>
                    <div style="font-size:14px;font-weight:600;">${sampleTitle}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                      ${product ? (Number(product.price) === 0 ? '站内免费书' : '站内付费书') : '独立试读'}
                      ${hasBuyLink ? ' · 有购买链接' : ''}
                      <span style="margin-left:4px;padding:1px 5px;border-radius:3px;background:var(--surface);border:1px solid var(--border);">推荐: ${modeLabel[sampleUpsellMode]}${sampleUpsellMode === 'manual' && relatedCount > 0 ? `(${relatedCount})` : ''}</span>
                    </div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${sample.enabled ? 'var(--green-bg)' : 'var(--surface)'};color:${sample.enabled ? 'var(--green)' : 'var(--text-muted)'};">${sample.enabled ? '已启用' : '已停用'}</span>
                  <button onClick=${() => toggleSample(sample.shortId, !sample.enabled)} style="padding:4px 10px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:20px;">${sample.enabled ? '停用' : '启用'}</button>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:${hasContent ? 'var(--green-bg)' : 'var(--surface)'};color:${hasContent ? 'var(--green)' : 'var(--text-muted)'};">${hasContent ? '有内容' : '无内容'}</span>
                ${Object.entries(sample.content || {}).filter(([k, v]) => v?.trim()).map(([l]) => html`
                  <span key=${l} style="font-size:10px;padding:1px 6px;border-radius:10px;background:var(--surface);border:1px solid var(--border);color:var(--text-muted);">${l.toUpperCase()}</span>
                `)}
                <span style="font-size:11px;color:var(--text-muted);">/read/${sample.shortId}</span>
              </div>
              ${isEditing ? html`
                <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">
                  <div style="font-size:12px;font-weight:600;margin-bottom:8px;">基本信息</div>
                  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
                    <input class="admin-input" type="text" value=${editTitle} onInput=${e => setEditTitle(e.target.value)} placeholder="标题（如修改则覆盖商品原标题）" style="width:100%;" />
                    <input class="admin-input" type="text" value=${editCover} onInput=${e => setEditCover(e.target.value)} placeholder="封面图 URL（可选，覆盖商品封面）" style="width:100%;" />
                    <input class="admin-input" type="text" value=${editBuyLink} onInput=${e => setEditBuyLink(e.target.value)} placeholder="购买链接（Ko-fi / Stripe 等，读者点击直接跳转购买）" style="width:100%;" />
                  </div>

                  <div style="font-size:12px;font-weight:600;margin-bottom:8px;">试读内容</div>
                  <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px;flex-wrap:wrap;">
                    ${Object.keys(editContent).map(l => html`
                      <button key=${l} onClick=${() => setEditLang(l)}
                        style="padding:4px 12px;font-size:12px;font-weight:500;border-radius:20px;border:1px solid ${editLang === l ? 'var(--accent)' : 'var(--border)'};background:${editLang === l ? 'var(--accent)' : 'transparent'};color:${editLang === l ? '#fff' : 'var(--text-muted)'};cursor:pointer;">
                        ${l.toUpperCase()}
                        ${editContent[l]?.trim() ? html`<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--green);margin-left:4px;vertical-align:middle;"></span>` : null}
                      </button>
                    `)}
                    <select onChange=${e => { if (e.target.value && !editContent[e.target.value]) { setEditContent(prev => ({ ...prev, [e.target.value]: '' })); setEditLang(e.target.value); } e.target.value = ''; }}
                      style="padding:4px 8px;font-size:11px;border:1px solid var(--border);background:var(--surface);border-radius:20px;cursor:pointer;color:var(--text);">
                      <option value="">+ 语言</option>
                      <option value="en">English</option>
                      <option value="zh">中文</option>
                      <option value="es">Español</option>
                      <option value="de">Deutsch</option>
                      <option value="ja">日本語</option>
                      <option value="ko">한국어</option>
                      <option value="fr">Français</option>
                    </select>
                  </div>
                  <textarea class="admin-textarea" rows="10" value=${editContent[editLang] || ''} onInput=${e => setEditContent(prev => ({ ...prev, [editLang]: e.target.value }))} placeholder="${editLang.toUpperCase()} 内容（Markdown）" style="font-family:var(--font-mono);font-size:12px;line-height:1.6;width:100%;"></textarea>

                  <div style="font-size:12px;font-weight:600;margin:16px 0 8px;">推荐设置</div>
                  <div style="margin-bottom:8px;">
                    <select class="admin-select" value=${editUpsellMode} onChange=${e => setEditUpsellMode(e.target.value)}>
                      <option value="auto">自动推荐（同分类优先，同系列次之）</option>
                      <option value="manual">手动指定推荐商品</option>
                      <option value="none">不推荐</option>
                    </select>
                  </div>
                  ${editUpsellMode === 'manual' && html`
                    <div>
                      <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">读者看完试读后看到这些推荐，可推荐站内书或外部链接（如 Ko-fi）</p>
                      ${renderGroupedProductSelector()}
                      <div>
                        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">外部链接（Ko-fi 等）</div>
                        ${editRelated.filter(r => !r.productId).map((r, i) => {
                          const idx = editRelated.indexOf(r);
                          return html`
                            <div key=${idx} style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
                              <input class="admin-input" type="text" value=${r.title || ''} onInput=${e => updateExternalRelated(idx, 'title', e.target.value)} placeholder="标题" style="flex:1;min-width:0;" />
                              <input class="admin-input" type="text" value=${r.link || ''} onInput=${e => updateExternalRelated(idx, 'link', e.target.value)} placeholder="链接 URL" style="flex:1;min-width:0;" />
                              <input class="admin-input" type="text" value=${r.price || ''} onInput=${e => updateExternalRelated(idx, 'price', e.target.value)} placeholder="$9.99" style="width:60px;" />
                              <button onClick=${() => removeExternalRelated(idx)} style="padding:4px 8px;font-size:11px;border:1px solid rgba(239,68,68,.3);background:transparent;color:var(--red);cursor:pointer;border-radius:6px;">x</button>
                            </div>
                          `;
                        })}
                        <button onClick=${addExternalRelated} style="padding:4px 10px;font-size:11px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);cursor:pointer;border-radius:6px;">+ 添加外部链接</button>
                      </div>
                    </div>
                  `}
                  ${editUpsellMode === 'auto' && html`
                    <p style="font-size:11px;color:var(--text-muted);">系统将自动推荐同分类付费商品，其次同系列（slug 前缀匹配），再次精选商品</p>
                  `}
                  ${editUpsellMode === 'none' && html`
                    <p style="font-size:11px;color:var(--text-muted);">试读页不显示推荐区域</p>
                  `}

                  <div style="display:flex;gap:8px;margin-top:12px;">
                    <button onClick=${() => saveSample(sample.shortId)} style="padding:6px 16px;font-size:12px;background:var(--accent);color:#fff;border:none;cursor:pointer;border-radius:8px;">保存</button>
                    <button onClick=${() => setEditing(null)} style="padding:6px 16px;font-size:12px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:8px;">取消</button>
                  </div>
                </div>
              ` : html`
                <div style="display:flex;gap:8px;margin-top:4px;">
                  <button onClick=${() => startEdit(sample.shortId)} style="padding:4px 10px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:20px;">编辑</button>
                  <a href="/read/${sample.shortId}" target="_blank" style="padding:4px 10px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);border-radius:20px;text-decoration:none;">预览</a>
                  <button onClick=${() => removeSample(sample.shortId)} style="padding:4px 10px;font-size:11px;border:1px solid rgba(239,68,68,.3);background:transparent;color:var(--red);cursor:pointer;border-radius:20px;">删除</button>
                </div>
              `}
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

function AddSampleModal({ unbound, products, onAdd, onClose, addToast }) {
  const [mode, setMode] = useState('product');
  const [shortId, setShortId] = useState('');
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState('');
  const [buyLink, setBuyLink] = useState('');
  const [lang, setLang] = useState('en');
  const [content, setContent] = useState('');

  function onProductSelect(sid) {
    setShortId(sid);
    const p = products.find(pr => pr.shortId === sid);
    if (p) {
      setTitle(t(p.title));
      setCover(p.cover || '');
      setBuyLink(p.kofiLink || p.stripeLink || '');
    }
  }

  function submit() {
    if (mode === 'product' && !shortId) { addToast('请选择书籍', 'error'); return; }
    if (mode === 'standalone' && !title.trim()) { addToast('请填写标题', 'error'); return; }
    if (!content.trim()) { addToast('请填写试读内容', 'error'); return; }
    const form = { content: { [lang]: content }, enabled: true, upsellMode: 'auto' };
    if (mode === 'product') {
      form.shortId = shortId;
    } else {
      form.title = title;
      if (cover) form.cover = cover;
      if (buyLink) form.buyLink = buyLink;
    }
    onAdd(form);
  }

  const t = (obj) => obj?.en || obj?.zh || '';
  const langs = [{code:'en',label:'English'},{code:'zh',label:'中文'},{code:'es',label:'Español'},{code:'de',label:'Deutsch'},{code:'ja',label:'日本語'},{code:'ko',label:'한국어'},{code:'fr',label:'Français'}];

  return html`
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.15);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;" onClick=${onClose}>
      <div style="background:var(--bg);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.12);width:100%;max-width:520px;max-height:90vh;overflow-y:auto;" onClick=${e => e.stopPropagation()}>
        <div style="padding:20px 24px;border-bottom:1px solid var(--border);">
          <h3 style="font-size:16px;font-weight:700;">添加试读</h3>
        </div>
        <div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px;">
          <div>
            <div style="display:flex;gap:4px;margin-bottom:12px;">
              <button onClick=${() => setMode('product')} style="padding:6px 12px;font-size:12px;border-radius:20px;border:1px solid ${mode === 'product' ? 'var(--accent)' : 'var(--border)'};background:${mode === 'product' ? 'var(--accent)' : 'transparent'};color:${mode === 'product' ? '#fff' : 'var(--text-muted)'};cursor:pointer;">关联站内书籍</button>
              <button onClick=${() => setMode('standalone')} style="padding:6px 12px;font-size:12px;border-radius:20px;border:1px solid ${mode === 'standalone' ? 'var(--accent)' : 'var(--border)'};background:${mode === 'standalone' ? 'var(--accent)' : 'transparent'};color:${mode === 'standalone' ? '#fff' : 'var(--text-muted)'};cursor:pointer;">独立创建</button>
            </div>
            ${mode === 'product' ? html`
              <select value=${shortId} onChange=${e => onProductSelect(e.target.value)}
                style="width:100%;padding:10px 12px;font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:8px;cursor:pointer;color:var(--text);">
                <option value="">— 选择站内书籍 —</option>
                ${unbound.map(p => html`<option key=${p.shortId} value=${p.shortId}>${t(p.title)}${Number(p.price) === 0 ? ' (免费)' : ' ($' + Number(p.price).toFixed(2) + ')'}</option>`)}
              </select>
            ` : html`
              <div style="display:flex;flex-direction:column;gap:8px;">
                <input class="admin-input" type="text" value=${title} onInput=${e => setTitle(e.target.value)} placeholder="书名" style="width:100%;" />
                <input class="admin-input" type="text" value=${cover} onInput=${e => setCover(e.target.value)} placeholder="封面图 URL（可选）" style="width:100%;" />
                <input class="admin-input" type="text" value=${buyLink} onInput=${e => setBuyLink(e.target.value)} placeholder="购买链接（Ko-fi / Stripe，可选）" style="width:100%;" />
              </div>
            `}
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">试读语言</label>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${langs.map(l => html`
                <button key=${l.code} onClick=${() => setLang(l.code)}
                  style="padding:6px 12px;font-size:12px;border-radius:20px;border:1px solid ${lang === l.code ? 'var(--accent)' : 'var(--border)'};background:${lang === l.code ? 'var(--accent)' : 'transparent'};color:${lang === l.code ? '#fff' : 'var(--text-muted)'};cursor:pointer;">
                  ${l.label}
                </button>
              `)}
            </div>
          </div>
          <div>
            <label style="display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px;">${lang.toUpperCase()} 试读内容（Markdown）</label>
            <textarea class="admin-textarea" rows="10" value=${content} onInput=${e => setContent(e.target.value)} placeholder="# Chapter 1&#10;&#10;在此输入试读内容..." style="font-family:var(--font-mono);font-size:12px;line-height:1.6;width:100%;"></textarea>
          </div>
        </div>
        <div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;">
          <button onClick=${onClose} style="padding:8px 16px;font-size:13px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:8px;">取消</button>
          <button onClick=${submit} style="padding:8px 16px;font-size:13px;background:var(--accent);color:#fff;border:none;cursor:pointer;border-radius:8px;">创建试读</button>
        </div>
      </div>
    </div>
  `;
}

export { SamplesManager };
