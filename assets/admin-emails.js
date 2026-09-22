// @ts-check
import { html, useState, useEffect, authFetch } from './admin-lib.js';

function EmailsManager({ addToast }) {
  const [emails, setEmails] = useState([]);
  const [meta, setMeta] = useState({ total: 0, filtered: 0, unique: 0, tags: [], categories: [], sources: [], shortIds: [] });
  const [filterSource, setFilterSource] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterShortId, setFilterShortId] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadEmails(); }, []);

  async function loadEmails() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterSource) params.set('source', filterSource);
    if (filterTag) params.set('tag', filterTag);
    if (filterShortId) params.set('shortId', filterShortId);
    const res = await authFetch(`/api/sample-emails?${params}`).then(r => r.json()).catch(() => ({ emails: [], meta: {} }));
    setEmails(res.emails || []);
    setMeta(res.meta || {});
    setLoading(false);
    setSelected(new Set());
  }

  useEffect(() => { loadEmails(); }, [filterSource, filterTag, filterShortId]);

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === emails.length) { setSelected(new Set()); return; }
    setSelected(new Set(emails.map(e => e.id)));
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`确定删除 ${selected.size} 条记录？`)) return;
    const res = await authFetch('/api/sample-emails/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: [...selected] })
    });
    const data = await res.json();
    if (data.success) {
      addToast(`已删除 ${data.deleted} 条`, 'success');
      loadEmails();
    }
  }

  function exportUrl(format) {
    const params = new URLSearchParams();
    if (filterSource) params.set('source', filterSource);
    if (filterTag) params.set('tag', filterTag);
    if (filterShortId) params.set('shortId', filterShortId);
    params.set('format', format);
    return `/api/sample-emails/export?${params}`;
  }

  const sourceLabels = { trial_read: '试读', free_download: '免费下载' };

  return html`
    <div>
      <div style="margin-bottom:24px;">
        <h2 style="font-size:20px;font-weight:700;">邮件管理</h2>
        <p style="font-size:13px;color:var(--text-muted);margin-top:4px;">收集的邮箱统一管理，按标签筛选导出</p>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <select value=${filterSource} onChange=${e => setFilterSource(e.target.value)}
          style="padding:6px 12px;font-size:12px;border:1px solid var(--border);background:var(--surface);border-radius:20px;cursor:pointer;color:var(--text);">
          <option value="">全部来源 (${meta.total})</option>
          ${meta.sources.map(s => html`<option key=${s} value=${s}>${sourceLabels[s] || s}</option>`)}
        </select>
        <select value=${filterTag} onChange=${e => setFilterTag(e.target.value)}
          style="padding:6px 12px;font-size:12px;border:1px solid var(--border);background:var(--surface);border-radius:20px;cursor:pointer;color:var(--text);">
          <option value="">全部标签</option>
          ${meta.tags.map(t => html`<option key=${t} value=${t}>${t}</option>`)}
        </select>
        <select value=${filterShortId} onChange=${e => setFilterShortId(e.target.value)}
          style="padding:6px 12px;font-size:12px;border:1px solid var(--border);background:var(--surface);border-radius:20px;cursor:pointer;color:var(--text);">
          <option value="">全部书籍</option>
          ${meta.shortIds.map(s => html`<option key=${s} value=${s}>${s}</option>`)}
        </select>
        <div style="margin-left:auto;display:flex;gap:6px;">
          <a href=${exportUrl('csv')} style="padding:6px 12px;font-size:12px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);border-radius:20px;text-decoration:none;">导出 CSV</a>
          <a href=${exportUrl('json')} style="padding:6px 12px;font-size:12px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);border-radius:20px;text-decoration:none;">导出 JSON</a>
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;text-align:center;">
          <div style="font-size:20px;font-weight:700;">${meta.total}</div>
          <div style="font-size:11px;color:var(--text-muted);">总记录</div>
        </div>
        <div style="padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;text-align:center;">
          <div style="font-size:20px;font-weight:700;">${meta.unique}</div>
          <div style="font-size:11px;color:var(--text-muted);">去重邮箱</div>
        </div>
        <div style="padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:8px;text-align:center;">
          <div style="font-size:20px;font-weight:700;">${meta.filtered}</div>
          <div style="font-size:11px;color:var(--text-muted);">当前筛选</div>
        </div>
      </div>

      ${selected.size > 0 && html`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:var(--accent-light);border-radius:8px;">
          <span style="font-size:12px;color:var(--accent);">已选 ${selected.size} 条</span>
          <button onClick=${deleteSelected} style="padding:4px 10px;font-size:11px;border:1px solid rgba(239,68,68,.3);background:transparent;color:var(--red);cursor:pointer;border-radius:20px;">删除选中</button>
        </div>
      `}

      ${loading ? html`<div class="empty"><div class="spinner"></div></div>` : emails.length === 0 ? html`
        <div class="admin-card" style="text-align:center;padding:40px;">
          <p style="color:var(--text-muted);font-size:14px;">暂无邮箱数据</p>
        </div>
      ` : html`
        <div class="admin-card" style="padding:0;overflow:hidden;">
          <table class="admin-table">
            <thead>
              <tr>
                <th style="width:32px;"><input type="checkbox" checked=${selected.size === emails.length && emails.length > 0} onChange=${toggleAll} /></th>
                <th>邮箱</th>
                <th>来源</th>
                <th>标签</th>
                <th>日期</th>
              </tr>
            </thead>
            <tbody>
              ${emails.map(e => html`
                <tr key=${e.id}>
                  <td><input type="checkbox" checked=${selected.has(e.id)} onChange=${() => toggleSelect(e.id)} /></td>
                  <td style="font-family:var(--font-mono);font-size:12px;">${e.email}</td>
                  <td><span style="font-size:10px;padding:2px 6px;border-radius:10px;background:${e.source === 'trial_read' ? 'var(--accent-light)' : 'var(--green-bg)'};color:${e.source === 'trial_read' ? 'var(--accent)' : 'var(--green)'};">${sourceLabels[e.source] || e.source}</span></td>
                  <td>${(e.tags || []).map(t => html`<span style="font-size:9px;padding:1px 5px;border-radius:10px;background:var(--surface);border:1px solid var(--border);margin-right:2px;">${t}</span>`)}</td>
                  <td style="font-size:11px;color:var(--text-muted);">${e.createdAt ? e.createdAt.slice(0, 10) : '-'}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

export { EmailsManager };
