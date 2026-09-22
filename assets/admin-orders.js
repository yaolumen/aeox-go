// @ts-check
import { html, useState, useEffect, authFetch } from './admin-lib.js';

function OrdersTab({ addToast }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('');
  const [filterType, setFilterType] = useState('refundStatus');
  const [loading, setLoading] = useState(true);
  const [noteEditId, setNoteEditId] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { loadOrders(); }, []);

  async function loadOrders(filterValue, type) {
    setLoading(true);
    const ft = type || filterType;
    const fv = filterValue !== undefined ? filterValue : filter;
    let url = '/api/orders';
    if (fv) url += `?${ft}=${fv}`;
    const data = await authFetch(url).then(r => r.json()).catch(() => []);
    setOrders(data);
    setLoading(false);
  }

  async function updateStatus(orderId, refundStatus) {
    const label = refundStatus === 'refunded' ? '标记已退款' : '撤销退款';
    if (!confirm(`确定${label}？`)) return;
    const res = await authFetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ refundStatus })
    });
    const data = await res.json();
    if (data.success) {
      addToast(`订单状态已更新为: ${refundStatus}`, 'success');
      loadOrders(filter, filterType);
    } else {
      addToast(data.error || '更新失败', 'error');
    }
  }

  async function saveNote(orderId) {
    const res = await authFetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ refundNote: noteText })
    });
    const data = await res.json();
    if (data.success) {
      addToast('备注已保存', 'success');
      setNoteEditId(null);
      loadOrders(filter, filterType);
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
      <div class="admin-header">
        <h1 class="admin-title">订单管理</h1>
        <p class="admin-subtitle">查看付费订单，记录退款状态用于 HMRC 税务合规与 Stripe 审核。本系统不连接 Stripe Refunds API，退款需在 Stripe Dashboard 手动执行后在此标记。</p>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--text-muted);align-self:center;margin-right:4px;">退款状态:</span>
        ${[{k:'',l:'全部'},{k:'none',l:'正常'},{k:'refunded',l:'已退款'}].map(r => html`
          <button key=${r.k} onClick=${() => { setFilter(r.k); setFilterType('refundStatus'); loadOrders(r.k, 'refundStatus'); }}
            style="padding:6px 14px;font-size:12px;font-weight:500;border-radius:20px;border:1px solid ${filter === r.k && filterType === 'refundStatus' ? 'var(--accent)' : 'var(--border)'};background:${filter === r.k && filterType === 'refundStatus' ? 'var(--accent-light)' : 'var(--surface)'};color:${filter === r.k && filterType === 'refundStatus' ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;transition:all 150ms;">
            ${r.l}
          </button>
        `)}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;">
        <span style="font-size:11px;color:var(--text-muted);align-self:center;margin-right:4px;">Leads:</span>
        ${[{k:'',l:'全部'},{k:'opted_in',l:'已留邮箱'},{k:'skipped',l:'跳过下载'},{k:'paid',l:'付费订单'}].map(r => html`
          <button key=${r.k} onClick=${() => { setFilter(r.k); setFilterType('leadType'); loadOrders(r.k, 'leadType'); }}
            style="padding:6px 14px;font-size:12px;font-weight:500;border-radius:20px;border:1px solid ${filter === r.k && filterType === 'leadType' ? 'var(--accent)' : 'var(--border)'};background:${filter === r.k && filterType === 'leadType' ? 'var(--accent-light)' : 'var(--surface)'};color:${filter === r.k && filterType === 'leadType' ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;transition:all 150ms;">
            ${r.l}
          </button>
        `)}
      </div>

      ${loading ? html`<div class="empty"><div class="spinner"></div></div>` : orders.length === 0
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
                            <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">类型</div>
                            <div style="font-size:12px;color:var(--text-muted);">${o.leadType === 'opted_in' ? 'Lead (已留邮箱)' : o.leadType === 'skipped' ? 'Lead (跳过)' : '付费订单'}</div>
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
                              <a href="https://dashboard.stripe.com/payments/${o.stripePaymentIntent || o.stripeSessionId}" target="_blank" rel="noopener"
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
  `;
}

export { OrdersTab };
