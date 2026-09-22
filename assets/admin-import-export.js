// @ts-check
import { html, h, useState, useEffect, api, authFetch, getToken, t, CollapsibleSection, ShortLinksTab } from './admin-lib.js';

function Spinner({ size }) { const s = size || 16; return html`<svg class="animate-spin" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>`; }

function ImportExportDialog({ mode, onClose, onDone, addToast }) {
  const [step, setStep] = useState(mode === 'import' ? 'upload' : 'exporting');
  const [importData, setImportData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importMode, setImportMode] = useState('merge');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useState(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.products || !Array.isArray(data.products)) {
        addToast('文件格式不正确：缺少 products 数组', 'error');
        return;
      }
      setImportData(data);
      setStep('preview');
      setLoading(true);
      const res = await authFetch('/api/products/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: data.products })
      });
      const pv = await res.json();
      setPreview(pv);
      setLoading(false);
    } catch (err) {
      addToast('文件解析失败: ' + err.message, 'error');
    }
  }

  async function doImport() {
    if (!importData) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: importData.products,
          categories: importData.categories,
          tags: importData.tags,
          mode: importMode
        })
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        setStep('done');
        addToast('导入完成: 新增 ' + data.added + '，更新 ' + data.updated + '，跳过 ' + data.skipped, 'success');
        if (onDone) onDone();
      } else {
        addToast(data.error || '导入失败', 'error');
      }
    } catch (err) {
      addToast('导入失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function doExport() {
    setStep('exporting');
    try {
      const res = await authFetch('/api/products/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aeox-products-export-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      addToast('导出成功，共 ' + (data._meta?.productCount || 0) + ' 个商品', 'success');
      setStep('done');
    } catch (err) {
      addToast('导出失败: ' + err.message, 'error');
      setStep('done');
    }
  }

  if (mode === 'export') {
    if (step === 'exporting') {
      doExport();
      return html`<div style="position:fixed;inset:0;background:rgba(0,0,0,.15);z-index:50;display:flex;align-items:center;justify-content:center;">
        <div style="background:var(--surface);padding:32px;border-radius:8px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.04);">
          <${Spinner} size=${24} />
          <p style="margin-top:12px;font-size:14px;color:var(--text-muted);">正在导出...</p>
        </div>
      </div>`;
    }
    return null;
  }

  return html`
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.15);z-index:50;display:flex;align-items:center;justify-content:center;" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;width:90%;max-width:720px;max-height:80vh;overflow:auto;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.12);" onClick=${e => e.stopPropagation()}>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="font-size:18px;font-weight:600;margin:0;">导入商品</h2>
          <button onClick=${onClose} style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;">✕</button>
        </div>

        ${step === 'upload' && html`
          <div style="border:2px dashed var(--border-hover);border-radius:8px;padding:40px;text-align:center;cursor:pointer;" onClick=${() => document.getElementById('import-file-input').click()}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin:0 auto 12px;display:block;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p style="font-size:14px;color:var(--text);margin:0;">点击选择或拖拽 JSON 文件</p>
            <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">支持从导出文件导入</p>
            <input id="import-file-input" type="file" accept=".json" style="display:none;" onChange=${handleFile} />
          </div>
        `}

        ${step === 'preview' && html`
          <div>
            ${loading ? html`<div style="text-align:center;padding:20px;"><${Spinner} size=${24} /></div>` : preview && html`
              <div style="display:flex;gap:16px;margin-bottom:16px;">
                <div style="flex:1;padding:12px;background:var(--accent-light);border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.04);box-shadow:0 1px 4px rgba(0,0,0,.04);text-align:center;">
                  <div style="font-size:24px;font-weight:700;color:var(--accent);">${preview.newCount}</div>
                  <div style="font-size:12px;color:var(--text-muted);">新增</div>
                </div>
                <div style="flex:1;padding:12px;background:var(--surface);border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.04);box-shadow:0 1px 4px rgba(0,0,0,.04);text-align:center;">
                  <div style="font-size:24px;font-weight:700;color:var(--text);">${preview.existingCount}</div>
                  <div style="font-size:12px;color:var(--text-muted);">已存在</div>
                </div>
                <div style="flex:1;padding:12px;background:var(--surface);border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.04);box-shadow:0 1px 4px rgba(0,0,0,.04);text-align:center;">
                  <div style="font-size:24px;font-weight:700;color:var(--text);">${preview.total}</div>
                  <div style="font-size:12px;color:var(--text-muted);">总计</div>
                </div>
              </div>

              <div style="margin-bottom:16px;">
                <label style="font-size:13px;font-weight:500;color:var(--text);display:block;margin-bottom:6px;">冲突处理方式</label>
                <div style="display:flex;gap:8px;">
                  ${[
                    { id: 'merge', label: '合并', desc: '保留现有数据，补充新字段' },
                    { id: 'overwrite', label: '覆盖', desc: '用导入数据替换现有商品' },
                    { id: 'skip', label: '跳过', desc: '保留现有商品不变' }
                  ].map(m => html`
                    <button key=${m.id} onClick=${() => setImportMode(m.id)}
                      style="flex:1;padding:10px;font-size:12px;border-radius:8px;border:1px solid ${importMode === m.id ? 'var(--accent)' : 'var(--border)'};background:${importMode === m.id ? 'var(--accent-light)' : 'var(--surface)'};color:${importMode === m.id ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;border-radius:8px;text-align:center;">
                      <div style="font-weight:600;margin-bottom:2px;">${m.label}</div>
                      <div style="font-size:10px;opacity:0.8;">${m.desc}</div>
                    </button>
                  `)}
                </div>
              </div>

              <div style="border:1px solid var(--border);border-radius:8px;max-height:200px;overflow:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                  <thead>
                    <tr style="background:var(--surface);">
                      <th style="padding:8px;text-align:left;">商品</th>
                      <th style="padding:8px;text-align:right;">价格</th>
                      <th style="padding:8px;text-align:center;">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${preview.preview.slice(0, 50).map(p => html`
                      <tr key=${p.id || p.shortId} style="border-top:1px solid var(--border);">
                        <td style="padding:6px 8px;">
                          <span style="color:var(--text);">${p.title || '(无标题)'}</span>
                          ${p.exists && html`<span style="font-size:10px;color:var(--text-muted);margin-left:6px;">现有: ${p.currentTitle}</span>`}
                        </td>
                        <td style="padding:6px 8px;text-align:right;color:var(--text-muted);">${p.price}</td>
                        <td style="padding:6px 8px;text-align:center;">
                          <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${p.action === 'add' ? 'var(--accent-light)' : 'var(--surface)'};color:${p.action === 'add' ? 'var(--accent)' : 'var(--text-muted)'};">${p.action === 'add' ? '新增' : '更新'}</span>
                        </td>
                      </tr>
                    `)}
                  </tbody>
                </table>
                ${preview.preview.length > 50 && html`<div style="padding:6px;text-align:center;font-size:11px;color:var(--text-muted);">仅显示前 50 条，共 ${preview.preview.length} 条</div>`}
              </div>

              <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
                <button onClick=${() => { setStep('upload'); setImportData(null); setPreview(null); }} style="padding:8px 16px;font-size:13px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;border-radius:8px;">返回</button>
                <button onClick=${doImport} disabled=${loading} style="padding:8px 16px;font-size:13px;border:none;background:var(--accent);color:#fff;cursor:pointer;border-radius:8px;opacity:${loading ? 0.6 : 1};">
                  ${loading ? html`<${Spinner} size=${14} />` : '确认导入'}
                </button>
              </div>
            `}
          </div>
        `}

        ${step === 'done' && result && html`
          <div style="text-align:center;padding:20px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" style="margin:0 auto 12px;display:block;"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <h3 style="font-size:16px;font-weight:600;margin:0 0 8px;">导入完成</h3>
            <div style="display:flex;gap:16px;justify-content:center;margin-bottom:16px;">
              <div><span style="font-size:20px;font-weight:700;color:var(--accent);">${result.added}</span><div style="font-size:11px;color:var(--text-muted);">新增</div></div>
              <div><span style="font-size:20px;font-weight:700;color:var(--text);">${result.updated}</span><div style="font-size:11px;color:var(--text-muted);">更新</div></div>
              <div><span style="font-size:20px;font-weight:700;color:var(--text-muted);">${result.skipped}</span><div style="font-size:11px;color:var(--text-muted);">跳过</div></div>
            </div>
            <button onClick=${onClose} style="padding:8px 24px;font-size:13px;border:none;background:var(--accent);color:var(--bg);cursor:pointer;border-radius:8px;">关闭</button>
          </div>
        `}
      </div>
    </div>
  `;
}

export { ImportExportDialog };
