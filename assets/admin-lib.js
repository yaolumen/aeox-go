// @ts-check
import { h } from './lib/preact.module.js';
import { useState, useEffect } from './lib/hooks.module.js';
import htm from './lib/htm.module.js';
import { api, authFetch, getToken } from './lib/api.js';

const html = htm.bind(h);

function t(obj, lang) {
  if (!obj || typeof obj === 'string') return obj || '';
  return obj[lang] || obj.en || obj.zh || Object.values(obj).find(v => v) || '';
}

function CollapsibleSection({ title, defaultOpen, children, count }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return html`
    <div class="admin-card">
      <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;" onClick=${() => setOpen(!open)}>
        <h3 class="admin-card-title" style="margin-bottom:0;">${title}</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          ${count != null && html`<span style="font-size:11px;color:var(--text-muted);padding:1px 6px;background:var(--surface);border:1px solid var(--border);">${count}</span>`}
          <span style="font-size:11px;color:var(--text-muted);">${open ? '▲' : '▼'}</span>
        </div>
      </div>
      ${open && html`<div style="margin-top:16px;">${children}</div>`}
    </div>
  `;
}

function ShortLinksTab({ addToast, embedded }) {
  const [links, setLinks] = useState([]);
  const [newSlug, setNewSlug] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editingSlug, setEditingSlug] = useState(null);
  const [editUrl, setEditUrl] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => { loadLinks(); }, []);

  async function loadLinks() {
    const data = await authFetch('/api/short-links').then(r => r.json()).catch(() => []);
    setLinks(data);
  }

  async function addLink() {
    if (!newSlug.trim() || !newUrl.trim()) return addToast('slug 和 URL 不能为空', 'error');
    const res = await authFetch('/api/short-links', { method: 'POST', body: JSON.stringify({ slug: newSlug.trim(), url: newUrl.trim(), description: newDesc.trim() }) });
    const data = await res.json();
    if (data.success) { addToast('短链接已创建', 'success'); setNewSlug(''); setNewUrl(''); setNewDesc(''); loadLinks(); }
    else addToast(data.error || '创建失败', 'error');
  }

  async function updateLink(slug) {
    const res = await authFetch('/api/short-links/' + slug, { method: 'PUT', body: JSON.stringify({ url: editUrl, description: editDesc }) });
    const data = await res.json();
    if (data.success) { addToast('已更新', 'success'); setEditingSlug(null); loadLinks(); }
    else addToast(data.error || '更新失败', 'error');
  }

  async function deleteLink(slug) {
    if (!confirm('确定删除 /s/' + slug + '？')) return;
    const res = await authFetch('/api/short-links/' + slug, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) { addToast('已删除', 'success'); loadLinks(); }
    else addToast(data.error || '删除失败', 'error');
  }

  const baseUrl = location.origin + '/s/';
  const wrap = embedded ? (children) => children : (children) => html`<div>${children}</div>`;

  return wrap(html`
    <div>
      ${!embedded && html`
        <div class="admin-card">
          <h3 class="admin-card-title">新建短链接</h3>
      `}
      ${embedded && html`<h3 class="admin-card-title" style="font-size:13px;font-weight:600;color:var(--text-light);margin-bottom:12px;">新建短链接</h3>`}
      <div style="display:grid;grid-template-columns:120px 1fr 120px auto;gap:10px 12px;align-items:center;${embedded ? '' : 'margin-bottom:16px;'}">
        <label class="admin-label" style="margin:0;">Slug</label>
        <div style="display:flex;gap:8px;align-items:center;">
          <input class="admin-input" type="text" value=${newSlug} onInput=${e => setNewSlug(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))} placeholder="tip" style="font-family:var(--font-mono);width:120px;" />
          <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">→ /s/${newSlug || '...'}</span>
        </div>
        <label class="admin-label" style="margin:0;">备注</label>
        <div></div>
        <label class="admin-label" style="margin:0;">URL</label>
        <input class="admin-input" type="url" value=${newUrl} onInput=${e => setNewUrl(e.target.value)} placeholder="https://buy.stripe.com/..." style="width:100%;" />
        <input class="admin-input" type="text" value=${newDesc} onInput=${e => setNewDesc(e.target.value)} placeholder="赞赏码" />
        <button onClick=${addLink} style="padding:8px 16px;background:var(--accent);color:var(--bg);font-size:13px;font-weight:500;border:none;cursor:pointer;white-space:nowrap;">添加</button>
      </div>
      ${!embedded && html`</div>`}

      ${links.length === 0
        ? html`<div class="empty" style="margin-top:16px;">暂无短链接</div>`
        : html`
          <div class="admin-card" style="padding:0;overflow-x:auto;margin-top:16px;">
            <table class="admin-table" style="table-layout:fixed;">
              <colgroup>
                <col style="width:180px;" />
                <col style="width:auto;" />
                <col style="width:100px;" />
                <col style="width:60px;" />
                <col style="width:80px;" />
                <col style="width:100px;" />
              </colgroup>
              <thead><tr>
                <th>短链接</th>
                <th>目标 URL</th>
                <th>备注</th>
                <th>点击</th>
                <th>创建时间</th>
                <th></th>
              </tr></thead>
              <tbody>
                ${links.map(l => html`
                  <tr key=${l.slug}>
                    ${editingSlug === l.slug
                      ? html`
                        <td style="font-family:var(--font-mono);font-size:12px;color:var(--accent);vertical-align:middle;">/s/${l.slug}</td>
                        <td style="vertical-align:middle;"><input class="admin-input" type="url" value=${editUrl} onInput=${e => setEditUrl(e.target.value)} style="width:100%;" /></td>
                        <td style="vertical-align:middle;"><input class="admin-input" type="text" value=${editDesc} onInput=${e => setEditDesc(e.target.value)} style="width:100%;" /></td>
                        <td style="color:var(--text-light);text-align:center;vertical-align:middle;">${l.clicks || 0}</td>
                        <td style="font-size:11px;color:var(--text-muted);vertical-align:middle;">${l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '-'}</td>
                        <td style="vertical-align:middle;">
                          <div style="display:flex;gap:4px;">
                            <button onClick=${() => updateLink(l.slug)} class="admin-action-btn">保存</button>
                            <button onClick=${() => setEditingSlug(null)} class="admin-action-btn">取消</button>
                          </div>
                        </td>
                      `
                      : html`
                        <td style="vertical-align:middle;">
                          <div style="display:flex;align-items:center;gap:6px;">
                            <code style="font-family:var(--font-mono);font-size:12px;color:var(--accent);background:var(--surface);padding:2px 6px;border:1px solid var(--border);">/s/${l.slug}</code>
                            <button onClick=${() => { navigator.clipboard.writeText(baseUrl + l.slug).then(() => addToast('短链接已复制', 'success')); }}
                              style="padding:2px 6px;font-size:10px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;">复制</button>
                          </div>
                        </td>
                        <td style="vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          <a href=${l.url} target="_blank" rel="noopener" style="color:var(--text-light);font-size:11px;">${l.url}</a>
                        </td>
                        <td style="font-size:12px;color:var(--text-muted);vertical-align:middle;">${l.description || '-'}</td>
                        <td style="color:var(--text-light);text-align:center;vertical-align:middle;">${l.clicks || 0}</td>
                        <td style="font-size:11px;color:var(--text-muted);vertical-align:middle;">${l.createdAt ? new Date(l.createdAt).toLocaleDateString() : '-'}</td>
                        <td style="vertical-align:middle;">
                          <div style="display:flex;gap:4px;">
                            <button onClick=${() => { setEditingSlug(l.slug); setEditUrl(l.url); setEditDesc(l.description || ''); }} class="admin-action-btn">编辑</button>
                            <button onClick=${() => deleteLink(l.slug)} class="admin-action-btn danger">删除</button>
                          </div>
                        </td>
                      `
                    }
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        `
      }
    </div>
  `);
}

export { html, h, useState, useEffect, api, authFetch, getToken, t, CollapsibleSection, ShortLinksTab };
