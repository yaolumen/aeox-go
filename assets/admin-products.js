// @ts-check
import { html, h, useState, useEffect, api, authFetch, getToken, t, CollapsibleSection, ShortLinksTab } from './admin-lib.js';
import { ImportExportDialog } from './admin-import-export.js';
import { ProductForm } from './admin-product-form.js';

function ProductManager({ addToast }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [filterCatId, setFilterCatId] = useState('');
  const [page, setPage] = useState(1);
  const [perPage] = useState(15);
  const [editProduct, setEditProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [showOrders, setShowOrders] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersFilter, setOrdersFilter] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [noteEditId, setNoteEditId] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [ieMode, setIeMode] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [prods, cats, tgs] = await Promise.all([
      authFetch('/api/products').then(r => r.json()).catch(() => []),
      api('/api/config/categories').catch(() => []),
      api('/api/config/tags').catch(() => [])
    ]);
    setProducts(prods);
    setCategories(cats);
    setTags(tgs);
  }

  const filtered = products.filter(p => {
    if (p.status === 'archived') return false;
    if (filter === 'free' && Number(p.price) !== 0) return false;
    if (filter === 'featured' && !p.featured) return false;
    if (filterCatId && p.categoryId !== filterCatId) return false;
    if (search) {
      const q = search.toLowerCase();
      const title = (p.title?.en || p.title?.zh || '').toLowerCase();
      if (!title.includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  function tagName(id) {
    const t = tags.find(x => x.id === id);
    return t?.name || id;
  }
  function tagColor(id) {
    const t = tags.find(x => x.id === id);
    return t?.color || '#737373';
  }
  function catName(id) {
    const c = categories.find(x => x.id === id);
    return c?.name?.en || c?.name?.zh || '';
  }

   async function remove(p) {
     if (!confirm('确定删除"' + (p.title?.en || p.title?.zh || '') + '"？')) return;
     const res = await authFetch(`/api/products/${p.id}`, { method: 'DELETE' });
     if (res.ok) { addToast('商品已删除', 'success'); loadData(); }
     else addToast('删除失败', 'error');
  }

  function openAdd() {
    setEditProduct(null);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditProduct(p);
    setShowForm(true);
  }

  async function addCategory() {
    if (!newCatName) return;
    const res = await authFetch('/api/config/categories', {
      method: 'POST',
      body: JSON.stringify({ name: { en: newCatName, zh: newCatName, es: newCatName, de: newCatName } })
    });
    const data = await res.json();
    if (data.success) { setNewCatName(''); addToast('分类已添加', 'success'); loadData(); }
    else addToast(data.error || '添加失败', 'error');
  }

  async function deleteCategory(id) {
    if (!confirm('确定删除此分类？')) return;
    const res = await authFetch(`/api/config/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { addToast('分类已删除', 'success'); loadData(); }
    else addToast(data.error || '删除失败', 'error');
  }

  async function addTag() {
    if (!newTagName) return;
    const res = await authFetch('/api/config/tags', {
      method: 'POST',
      body: JSON.stringify({ name: newTagName })
    });
    const data = await res.json();
    if (data.success) { setNewTagName(''); addToast('标签已添加', 'success'); loadData(); }
    else addToast(data.error || '添加失败', 'error');
  }

  async function deleteTag(id) {
    if (!confirm('确定删除此标签？')) return;
    const res = await authFetch(`/api/config/tags/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { addToast('标签已删除', 'success'); loadData(); }
    else addToast(data.error || '删除失败', 'error');
  }

  async function loadOrders(statusFilter) {
    setOrdersLoading(true);
    const url = statusFilter ? '/api/orders?refundStatus=' + statusFilter : '/api/orders';
    const data = await authFetch(url).then(r => r.json()).catch(() => []);
    setOrders(data);
    setOrdersLoading(false);
  }

  async function updateStatus(orderId, refundStatus) {
    const label = refundStatus === 'refunded' ? '标记已退款' : '撤销退款';
    if (!confirm('确定' + label + '？')) return;
    const res = await authFetch('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      body: JSON.stringify({ refundStatus })
    });
    const data = await res.json();
    if (data.success) {
      addToast('订单状态已更新为: ' + refundStatus, 'success');
      loadOrders(ordersFilter);
    } else {
      addToast(data.error || '更新失败', 'error');
    }
  }

  async function saveNote(orderId) {
    const res = await authFetch('/api/orders/' + orderId + '/status', {
      method: 'PUT',
      body: JSON.stringify({ refundNote: noteText })
    });
    const data = await res.json();
    if (data.success) {
      addToast('备注已保存', 'success');
      setNoteEditId(null);
      loadOrders(ordersFilter);
    } else {
      addToast(data.error || '保存失败', 'error');
    }
  }

  function statusLabel(s) {
    const m = { paid: '已支付', refunded: '已退款', none: '正常' };
    return m[s] || s;
  }

  function statusClass(s) {
    return s === 'refunded' ? 'refunded' : s === 'paid' ? 'paid' : 'none';
  }

  function copyText(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => addToast('已复制', 'success'));
  }

  return html`
    <div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="position:relative;">
          <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" value=${search} onInput=${e => { setSearch(e.target.value); setPage(1); }} placeholder="搜索商品..."
            style="padding:8px 12px 8px 32px;font-size:13px;background:var(--bg);border:1px solid var(--border);color:var(--text);outline:none;width:240px;" />
        </div>
        <div style="display:flex;gap:6px;">
          <button onClick=${() => setIeMode('export')} style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--surface);color:var(--text);font-size:13px;font-weight:500;border:1px solid var(--border);cursor:pointer;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            导出
          </button>
          <button onClick=${() => setIeMode('import')} style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--surface);color:var(--text);font-size:13px;font-weight:500;border:1px solid var(--border);cursor:pointer;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            导入
          </button>
          <button onClick=${openAdd} style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:var(--accent);color:var(--bg);font-size:13px;font-weight:500;border:none;cursor:pointer;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            添加商品
          </button>
        </div>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
        ${[
          { id: 'all', label: '全部' },
          { id: 'free', label: '免费' },
          { id: 'featured', label: '推荐' },
          { id: 'links', label: 'Stripe Links' },
          { id: 'orders', label: '订单' }
        ].map(f => html`
          <button key=${f.id} onClick=${() => {
            if (f.id === 'orders') {
              const next = !showOrders;
              setShowOrders(next);
              if (next) { setFilter('all'); loadOrders(ordersFilter); }
            } else {
              setShowOrders(false);
              setFilter(f.id); setPage(1);
            }
          }}
            style="padding:5px 12px;font-size:12px;font-weight:500;border:1px solid ${(f.id === 'orders' ? showOrders : filter === f.id) ? 'var(--accent)' : 'var(--border)'};background:${(f.id === 'orders' ? showOrders : filter === f.id) ? 'var(--accent-light)' : 'var(--surface)'};color:${(f.id === 'orders' ? showOrders : filter === f.id) ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;">
            ${f.label}
          </button>
        `)}
        <select value=${filterCatId} onChange=${e => { setFilterCatId(e.target.value); setPage(1); }}
          style="padding:5px 10px;font-size:12px;background:var(--bg);border:1px solid var(--border);color:var(--text);outline:none;border-radius:8px;">
           <option value="">全部分类</option>
          ${categories.map(c => html`<option key=${c.id} value=${c.id}>${c.name?.en || c.name?.zh || c.name}</option>`)}
        </select>
      </div>

      ${showOrders ? html`
        <div>
          <div style="display:flex;gap:6px;margin-bottom:16px;">
            ${[{k:'',l:'全部'},{k:'none',l:'正常'},{k:'refunded',l:'已退款'}].map(r => html`
              <button key=${r.k} onClick=${() => { setOrdersFilter(r.k); loadOrders(r.k); }}
                style="padding:6px 14px;font-size:12px;font-weight:500;border-radius:20px;border:1px solid ${ordersFilter === r.k ? 'var(--accent)' : 'var(--border)'};background:${ordersFilter === r.k ? 'var(--accent-light)' : 'var(--surface)'};color:${ordersFilter === r.k ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;transition:all 150ms;">
                ${r.l}
              </button>
            `)}
          </div>
          ${ordersLoading ? html`<div class="empty"><div class="spinner"></div></div>` : orders.length === 0
            ? html`<div class="empty">暂无订单</div>`
            : html`<div style="overflow-x:auto;">
                <table class="admin-table">
                  <thead><tr>
                    <th></th><th>订单ID</th><th>商品</th><th>金额</th><th>客户</th><th>退款状态</th><th>备注</th><th>创建时间</th><th>操作</th>
                  </tr></thead>
                  <tbody>
                    ${orders.map(o => html`
                      <tr key=${o.id} style="cursor:pointer;" onClick=${() => setExpandedId(expandedId === o.id ? null : o.id)}>
                        <td style="width:24px;color:var(--text-muted);font-size:10px;">
                          ${expandedId === o.id ? '▼' : '▶'}
                        </td>
                        <td style="font-family:var(--font-mono);font-size:11px;">${o.id}</td>
                        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.productTitle}</td>
                        <td>$${Number(o.amount).toFixed(2)}</td>
                        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          ${o.customerEmail ? html`
                            <span style="font-size:12px;color:var(--text-muted);" title=${o.customerEmail}>${o.customerEmail}</span>
                          ` : o.customerName ? html`
                            <span style="font-size:12px;color:var(--text-light);">${o.customerName}</span>
                          ` : html`<span style="font-size:11px;color:var(--text-muted);">-</span>`}
                        </td>
                        <td><span class="admin-order-status ${statusClass(o.refundStatus)}">${statusLabel(o.refundStatus)}</span></td>
                        <td style="max-width:120px;">
                          ${noteEditId === o.id
                            ? html`<div style="display:flex;gap:4px;" onClick=${e => e.stopPropagation()}>
                                <input class="admin-input" type="text" value=${noteText} onInput=${e => setNoteText(e.target.value)}
                                  style="padding:4px 8px;font-size:11px;width:100px;" placeholder="备注..." />
                                <button onClick=${() => saveNote(o.id)} style="font-size:10px;padding:2px 6px;border:1px solid var(--accent);color:var(--accent);cursor:pointer;">保存</button>
                                <button onClick=${() => setNoteEditId(null)} style="font-size:10px;padding:2px 6px;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;">取消</button>
                              </div>`
                            : html`<span style="font-size:11px;color:var(--text-muted);cursor:pointer;display:block;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                                onClick=${(e) => { e.stopPropagation(); setNoteEditId(o.id); setNoteText(o.refundNote || ''); }}
                                title=${o.refundNote || '点击添加备注'}>
                                ${o.refundNote || '-'}
                              </span>`
                          }
                        </td>
                        <td style="font-size:11px;color:var(--text-light);">${o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '-'}</td>
                        <td onClick=${e => e.stopPropagation()}>
                          <div style="display:flex;gap:4px;flex-wrap:wrap;">
                            ${o.refundStatus === 'none' && html`
                              <button onClick=${() => updateStatus(o.id, 'refunded')} class="admin-action-btn" style="color:var(--green);border-color:rgba(22,163,74,.3);">标记退款</button>
                            `}
                            ${o.refundStatus === 'refunded' && html`
                              <button onClick=${() => updateStatus(o.id, 'none')} class="admin-action-btn" style="color:var(--text-muted);border-color:var(--border);font-size:10px;">撤销</button>
                            `}
                          </div>
                        </td>
                      </tr>
                      ${expandedId === o.id && html`
                        <tr key=${o.id + '-detail'}>
                          <td colspan="9" style="padding:0;">
                            <div style="background:var(--surface);border-top:1px solid var(--border);padding:16px 24px;display:grid;grid-template-columns:1fr 1fr;gap:12px 32px;">
                              <div>
                                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Stripe Session ID</div>
                                <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
                                  ${o.stripeSessionId ? html`${o.stripeSessionId} <button onClick=${() => copyText(o.stripeSessionId)} style="font-size:9px;padding:1px 4px;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;background:none;">复制</button>` : html`<span style="color:var(--text-muted);">未记录</span>`}
                                </div>
                              </div>
                              <div>
                                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Payment Intent</div>
                                <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
                                  ${o.stripePaymentIntent ? html`${o.stripePaymentIntent} <button onClick=${() => copyText(o.stripePaymentIntent)} style="font-size:9px;padding:1px 4px;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;background:none;">复制</button>` : html`<span style="color:var(--text-muted);">未记录</span>`}
                                </div>
                              </div>
                              <div>
                                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">客户邮箱</div>
                                <div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
                                  ${o.customerEmail ? html`${o.customerEmail} <button onClick=${() => copyText(o.customerEmail)} style="font-size:9px;padding:1px 4px;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;background:none;">复制</button>` : html`<span style="color:var(--text-muted);">未记录</span>`}
                                </div>
                              </div>
                              <div>
                                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">客户姓名</div>
                                <div style="font-size:12px;color:var(--text-muted);">${o.customerName || html`<span style="color:var(--text-muted);">未记录</span>`}</div>
                              </div>
                              <div>
                                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">退款时间</div>
                                <div style="font-size:12px;color:${o.refundStatus === 'refunded' ? 'var(--amber-text)' : 'var(--text-muted)'};">${o.refundedAt ? new Date(o.refundedAt).toLocaleString() : '-'}</div>
                              </div>
                              <div>
                                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Stripe Refund ID</div>
                                <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">
                                  ${o.stripeRefundId ? html`${o.stripeRefundId} <button onClick=${() => copyText(o.stripeRefundId)} style="font-size:9px;padding:1px 4px;border:1px solid var(--border);color:var(--text-muted);cursor:pointer;background:none;">复制</button>` : html`<span style="color:var(--text-muted);">未填写</span>`}
                                </div>
                              </div>
                              <div style="grid-column:1/-1;">
                                <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Stripe Dashboard</div>
                                ${o.stripeSessionId ? html`
                                  <a href=${'https://dashboard.stripe.com/payments/' + (o.stripePaymentIntent || o.stripeSessionId)} target="_blank" rel="noopener"
                                    style="font-size:12px;color:var(--accent);display:inline-flex;align-items:center;gap:4px;">
                                    在 Stripe Dashboard 中查看 →
                                  </a>
                                ` : html`<span style="font-size:12px;color:var(--text-muted);">无 Stripe 记录</span>`}
                              </div>
                            </div>
                          </td>
                        </tr>
                      `}
                    `)}
                  </tbody>
                </table>
              </div>`
          }
          <div class="admin-card" style="margin-top:20px;">
            <h3 class="admin-card-title">退款操作说明</h3>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.8;">
              <div style="margin-bottom:10px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);font-size:12px;color:var(--amber-text);">
                本系统仅用于退款记录与核对，不连接 Stripe Refunds API，无法自动执行退款。
              </div>
              <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
                <span style="background:var(--surface);border:1px solid var(--border);padding:1px 6px;font-size:10px;font-weight:600;flex-shrink:0;">1</span>
                <span>收到退款请求后，点击订单行展开详情，点击 <b>Stripe Dashboard 链接</b>跳转至 Stripe</span>
              </div>
              <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
                <span style="background:var(--surface);border:1px solid var(--border);padding:1px 6px;font-size:10px;font-weight:600;flex-shrink:0;">2</span>
                <span>在 Stripe Dashboard 中手动执行退款，获取 <b>Refund ID</b>（格式：re_xxx）</span>
              </div>
              <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
                <span style="background:var(--surface);border:1px solid var(--border);padding:1px 6px;font-size:10px;font-weight:600;flex-shrink:0;">3</span>
                <span>回到本系统，点击 <b>标记退款</b> 更新状态，并将 Stripe Refund ID 填入展开详情中</span>
              </div>
              <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
                <span style="background:var(--surface);border:1px solid var(--border);padding:1px 6px;font-size:10px;font-weight:600;flex-shrink:0;">4</span>
                <span>可点击备注列添加退款原因等备注信息，便于 HMRC 审计核对</span>
              </div>
              <p style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted);">
                退款记录用于 UK HMRC 税务合规与 Stripe 审核，确保总销售 - 总退款 = 净收入可核对。
              </p>
            </div>
          </div>
        </div>
      ` : filter === 'links'
        ? html`
          <div class="admin-card" style="padding:0;overflow-x:auto;">
            ${products.filter(p => Number(p.price) > 0).length === 0
              ? html`<div class="empty">暂无付费商品</div>`
              : html`<table class="admin-table" style="font-size:12px;">
                  <thead><tr><th>商品</th><th>价格</th><th>Stripe Payment Link</th><th>模式</th><th></th></tr></thead>
                  <tbody>
                    ${products.filter(p => Number(p.price) > 0).map(p => {
                      const isTest = p.stripeLink?.includes('/test_');
                      return html`
                        <tr key=${p.id}>
                          <td>
                            <a href="#" onClick=${e => { e.preventDefault(); setEditProduct(p); setShowForm(true); }} style="color:var(--text);font-weight:500;font-size:12px;text-decoration:none;">${p.title?.en || p.title?.zh || ''}</a>
                          </td>
                          <td style="color:var(--accent);">$${Number(p.price).toFixed(2)}</td>
                          <td>
                            ${p.stripeLink
                              ? html`<div style="display:flex;align-items:center;gap:6px;">
                                  <code style="font-size:11px;color:var(--text-light);background:var(--surface);padding:2px 6px;border:1px solid var(--border);max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;">${p.stripeLink}</code>
                                  <button onClick=${() => { navigator.clipboard.writeText(p.stripeLink).then(() => addToast('链接已复制', 'success')).catch(() => addToast('复制失败', 'error')); }}
                                    style="padding:3px 8px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;flex-shrink:0;">复制</button>
                                  <a href=${p.stripeLink} target="_blank" rel="noopener" style="color:var(--text-muted);font-size:11px;flex-shrink:0;">打开</a>
                                </div>`
                              : html`<span style="color:var(--text-muted);font-size:11px;">未配置</span>`
                            }
                          </td>
                          <td>${p.stripeLink
                            ? html`<span style="padding:2px 8px;font-size:10px;font-weight:600;border:1px solid ${isTest ? 'var(--yellow)' : 'var(--green)'};color:${isTest ? 'var(--yellow)' : 'var(--green)'};">${isTest ? 'TEST' : 'LIVE'}</span>`
                            : '-'
                          }</td>
                          <td>${!p.stripeLink && html`
                              <button onClick=${() => { setEditProduct(p); setShowForm(true); }} style="padding:3px 8px;font-size:11px;border:1px solid var(--accent);background:var(--accent-light);color:var(--accent);cursor:pointer;">配置</button>
                            `}</td>
                        </tr>
                      `;
                    })}
                  </tbody>
                </table>
                <div style="padding:8px 12px;font-size:11px;color:var(--text-muted);border-top:1px solid var(--border);">
                  ${products.filter(p => Number(p.price) > 0 && p.stripeLink).length} 个已配置 · 
                  ${products.filter(p => Number(p.price) > 0 && !p.stripeLink).length} 个未配置
                </div>
              `
            }
          </div>
        `
        : html`
          ${filtered.length === 0
            ? html`<div class="empty">暂无商品</div>`
            : html`
              <div class="admin-card" style="padding:0;overflow-x:auto;">
                <table class="admin-table">
                  <thead><tr>
                    <th>标题</th>
                    <th>价格</th>
                    <th>Short ID</th>
                    <th>浏览量</th>
                    <th>销量</th>
                    <th style="text-align:right;">操作</th>
                  </tr></thead>
                  <tbody>
                    ${paginated.map(p => {
                      const title = p.title?.en || p.title?.zh || '';
                      const isFree = Number(p.price) === 0;
                      return html`
                        <tr key=${p.id}>
                          <td>
                            <div style="display:flex;align-items:center;gap:10px;">
                              ${p.cover && html`<div style="width:36px;height:48px;overflow:hidden;border:1px solid var(--border);flex-shrink:0;"><img src=${p.cover} alt=${title} style="width:100%;height:100%;object-fit:cover;" loading="lazy" /></div>`}
                              <div>
                                <span style="font-weight:500;">${title}</span>
                                ${p.featured && html`<span style="display:inline-block;margin-left:6px;padding:1px 6px;font-size:10px;background:var(--amber-bg);color:var(--amber-text);border:1px solid var(--amber-border);">\u2605</span>`}
                                ${p.tags && p.tags.length > 0 && html`<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">${p.tags.map(tid => html`<span key=${tid} style="padding:1px 6px;font-size:10px;color:#fff;background:${tagColor(tid)};">${tagName(tid)}</span>`)}</div>`}
                              </div>
                            </div>
                          </td>
                          <td style=${isFree ? 'color:var(--green);font-weight:500;' : ''}>${isFree ? 'FREE' : '$' + Number(p.price).toFixed(2)}</td>
                          <td><span style="font-family:var(--font-mono);font-size:11px;color:var(--text-light);">${p.shortId}</span></td>
                          <td style="color:var(--text-light);">${(p.stats?.pv || 0).toLocaleString()}</td>
                          <td style="color:var(--text-light);">${(p.stats?.sales || 0).toLocaleString()}</td>
                          <td style="text-align:right;">
                            <div style="display:flex;gap:4px;justify-content:flex-end;">
                               <button onClick=${() => openEdit(p)} class="admin-action-btn">编辑</button>
                               <button onClick=${() => remove(p)} class="admin-action-btn danger">删除</button>
                            </div>
                          </td>
                        </tr>
                      `;
                    })}
                  </tbody>
                </table>
              </div>
              ${totalPages > 1 && html`
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;font-size:12px;color:var(--text-light);">
                   <span>共 ${filtered.length} 条，第 ${page}/${totalPages} 页</span>
                   <div style="display:flex;gap:6px;">
                     <button disabled=${page <= 1} onClick=${() => setPage(page - 1)} class="admin-action-btn">上一页</button>
                     <button disabled=${page >= totalPages} onClick=${() => setPage(page + 1)} class="admin-action-btn">下一页</button>
                 </div>
                </div>
              `}
            `
          }
        `
      }

        ${showForm && html`<${ProductForm} product=${editProduct} categories=${categories} tags=${tags} allProducts=${products}
         onClose=${() => setShowForm(false)} onSave=${() => { setShowForm(false); loadData(); }} addToast=${addToast} />`}

       ${ieMode && html`<${ImportExportDialog} mode=${ieMode} onClose=${() => setIeMode(null)} onDone=${() => { setIeMode(null); loadData(); }} addToast=${addToast} />`}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px;">
        <${CollapsibleSection} title="分类管理" count=${categories.length}>
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <input class="admin-input" type="text" value=${newCatName} onInput=${e => setNewCatName(e.target.value)} placeholder="分类名称" style="max-width:240px;" />
            <button onClick=${addCategory} style="padding:8px 14px;background:var(--accent);color:var(--bg);font-size:12px;border:none;cursor:pointer;">添加</button>
          </div>
          ${categories.length === 0
            ? html`<p style="font-size:13px;color:var(--text-muted);">暂无分类</p>`
            : html`<div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${categories.map(c => html`
                  <span key=${c.id} style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--surface);border:1px solid var(--border);font-size:12px;">
                    ${c.name?.en || c.name?.zh || c.name}
                    <button onClick=${() => deleteCategory(c.id)} style="color:var(--red);background:none;border:none;cursor:pointer;font-size:12px;">x</button>
                  </span>
                `)}
              </div>`
          }
        <//>

        <${CollapsibleSection} title="标签管理" count=${tags.length}>
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <input class="admin-input" type="text" value=${newTagName} onInput=${e => setNewTagName(e.target.value)} placeholder="标签名称" style="max-width:240px;" />
            <button onClick=${addTag} style="padding:8px 14px;background:var(--accent);color:var(--bg);font-size:12px;border:none;cursor:pointer;">添加</button>
          </div>
          ${tags.length === 0
            ? html`<p style="font-size:13px;color:var(--text-muted);">暂无标签</p>`
            : html`<div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${tags.map(t => html`
                  <span key=${t.id} style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:${t.color || '#737373'};color:#fff;font-size:12px;">
                    ${t.name}
                    <button onClick=${() => deleteTag(t.id)} style="color:rgba(255,255,255,.7);background:none;border:none;cursor:pointer;font-size:12px;">x</button>
                  </span>
                `)}
              </div>`
          }
        <//>
      </div>

      <div style="margin-top:16px;">
        <${CollapsibleSection} title="短链接管理">
          <${ShortLinksTab} addToast=${addToast} embedded=${true} />
        <//>
      </div>
    </div>
  `;
}


export { ImportExportDialog, ProductManager };
