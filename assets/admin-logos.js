// @ts-check
import { html, useState, useEffect, authFetch, api } from './admin-lib.js';

function Spinner({ size }) { const s = size || 16; return html`<svg class="animate-spin" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>`; }

function LogoManager({ addToast }) {
  const [logos, setLogos] = useState([]);
  const [config, setConfig] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState('all');
  const [previewLogo, setPreviewLogo] = useState(null);

  useEffect(() => {
    authFetch('/api/logos').then(r => r.json()).then(setLogos).catch(() => {});
    api('/api/config/site').then(c => {
      if (typeof c.logo === 'string') c.logo = { selectedId: '', src: '', darkSrc: '', bannerSrc: '', bannerDarkSrc: '' };
      setConfig(c);
    }).catch(() => {});
  }, []);

  function selected() { return config?.logo?.selectedId || ''; }

  async function doUpload(file) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await authFetch('/api/logos/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        setLogos(prev => [...prev, data.logo]);
        addToast('Logo uploaded', 'success');
      } else {
        addToast(data.message || 'Upload failed', 'error');
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function selectLogo(logo) {
    if (!config) return;
    const id = logo?.id || '';
    const same = logos.filter(l => l.id.replace(/-(light|dark|indigo|cyan|violet|card)$/, '') === id.replace(/-(light|dark|indigo|cyan|violet|card)$/, ''));
    let src = '';
    let darkSrc = '';
    let bannerSrc = '';
    let bannerDarkSrc = '';
    const baseId = id.replace(/-(light|dark|indigo|cyan|violet|card)$/, '');
    const lightMatch = same.find(l => l.isLight && l.isSquare) || logos.find(l => l.id.startsWith(baseId) && l.isLight && l.isSquare);
    const darkMatch = same.find(l => l.isDark && l.isSquare) || logos.find(l => l.id.startsWith(baseId) && l.isDark && l.isSquare);
    const bannerLight = same.find(l => l.isBanner && l.isLight) || logos.find(l => l.id.startsWith(baseId) && l.isBanner && l.isLight);
    const bannerDark = same.find(l => l.isBanner && l.isDark) || logos.find(l => l.id.startsWith(baseId) && l.isBanner && l.isDark);
    if (lightMatch) src = lightMatch.svgUrl || lightMatch.url;
    else if (darkMatch) src = darkMatch.svgUrl || darkMatch.url;
    if (darkMatch) darkSrc = darkMatch.svgUrl || darkMatch.url;
    else if (lightMatch) darkSrc = lightMatch.svgUrl || lightMatch.url;
    if (bannerLight) bannerSrc = bannerLight.svgUrl || bannerLight.url;
    else if (bannerDark) bannerSrc = bannerDark.svgUrl || bannerDark.url;
    if (bannerDark) bannerDarkSrc = bannerDark.svgUrl || bannerDark.url;
    else if (bannerLight) bannerDarkSrc = bannerLight.svgUrl || bannerLight.url;
    if (!src) src = logo?.url || '';
    if (!darkSrc) darkSrc = src;
    const next = { ...config, logo: { selectedId: baseId, src, darkSrc, bannerSrc, bannerDarkSrc } };
    try {
      const res = await authFetch('/api/config/site', { method: 'PUT', body: JSON.stringify(next) });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        addToast('Logo selected', 'success');
      }
    } catch (e) {
      addToast(e.message, 'error');
    }
  }

  async function removeLogo(logo) {
    try {
      const res = await authFetch(`/api/logos/${logo.filename}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogos(prev => prev.filter(l => l.filename !== logo.filename));
        addToast('Deleted', 'success');
      }
    } catch (e) {
      addToast(e.message, 'error');
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) doUpload(file);
  }

  const filtered = filter === 'all' ? logos : filter === 'square' ? logos.filter(l => l.isSquare) : logos.filter(l => l.isBanner);
  const grouped = {};
  filtered.forEach(l => {
    const base = l.id.replace(/-(light|dark|indigo|cyan|violet|card)$/, '');
    if (!grouped[base]) grouped[base] = [];
    grouped[base].push(l);
  });

  if (!config) return html`<div class="empty"><div class="spinner"></div></div>`;

  return html`
    <div style="display:flex;flex-direction:column;gap:20px;">
      <div class="admin-card">
        <h3 class="admin-card-title">Current Logo</h3>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
          ${selected() ? html`
            <div style="display:flex;gap:16px;align-items:flex-end;">
              <div style="text-align:center;">
                <div style="width:80px;height:80px;background:#fff;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;border-radius:8px;">
                  <img src=${config.logo.src} style="max-width:72px;max-height:72px;object-fit:contain;" />
                </div>
                <span style="font-size:10px;color:var(--text-muted);">Light</span>
              </div>
              <div style="text-align:center;">
                <div style="width:80px;height:80px;background:#0f172a;display:flex;align-items:center;justify-content:center;border-radius:8px;">
                  <img src=${config.logo.darkSrc} style="max-width:72px;max-height:72px;object-fit:contain;" />
                </div>
                <span style="font-size:10px;color:var(--text-muted);">Dark</span>
              </div>
              ${config.logo.bannerSrc && html`
                <div style="text-align:center;">
                  <div style="width:160px;height:40px;background:#fff;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;border-radius:8px;">
                    <img src=${config.logo.bannerSrc} style="max-width:150px;max-height:36px;object-fit:contain;" />
                  </div>
                  <span style="font-size:10px;color:var(--text-muted);">Banner Light</span>
                </div>
              `}
              ${config.logo.bannerDarkSrc && html`
                <div style="text-align:center;">
                  <div style="width:160px;height:40px;background:#111827;display:flex;align-items:center;justify-content:center;border-radius:8px;">
                    <img src=${config.logo.bannerDarkSrc} style="max-width:150px;max-height:36px;object-fit:contain;" />
                  </div>
                  <span style="font-size:10px;color:var(--text-muted);">Banner Dark</span>
                </div>
              `}
            </div>
            <div>
              <span style="font-size:13px;font-weight:600;">${selected()}</span>
              <button onClick=${() => selectLogo({ id: '', url: '' })} style="margin-left:12px;font-size:11px;padding:4px 10px;background:var(--surface);border:1px solid var(--border);color:var(--text-muted);cursor:pointer;border-radius:20px;">Remove</button>
            </div>
          ` : html`
            <div style="padding:16px;background:var(--surface);border:1px dashed var(--border);text-align:center;color:var(--text-muted);font-size:13px;">
              No logo selected — using text fallback
            </div>
          `}
        </div>
      </div>

      <div class="admin-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;">
          <h3 class="admin-card-title" style="margin-bottom:0;">Logo Library</h3>
          <div style="display:flex;gap:6px;">
            <button onClick=${() => setFilter('all')} class="admin-chip ${filter === 'all' ? 'active' : ''}">All</button>
            <button onClick=${() => setFilter('square')} class="admin-chip ${filter === 'square' ? 'active' : ''}">Square</button>
            <button onClick=${() => setFilter('banner')} class="admin-chip ${filter === 'banner' ? 'active' : ''}">Banner</button>
          </div>
        </div>

        <div
          onDragOver=${e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave=${() => setDragOver(false)}
          onDrop=${onDrop}
          onClick=${() => document.getElementById('logo-upload-input').click()}
          style="border:2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'};padding:24px;text-align:center;cursor:pointer;margin-bottom:16px;background:${dragOver ? 'var(--surface)' : 'transparent'};transition:border-color .2s;"
        >
          <input id="logo-upload-input" type="file" accept="image/*" style="display:none" onChange=${e => doUpload(e.target.files[0])} />
          ${uploading
            ? html`<${Spinner} size=${16} /> <span style="font-size:13px;color:var(--text-muted);">Uploading...</span>`
            : html`<p style="font-size:13px;color:var(--text-muted);">Drag & drop or click to upload (PNG/SVG, max 2MB)</p>`
          }
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">
          ${Object.entries(grouped).map(([base, items]) => {
            const isSelected = base === selected();
            const lightSquare = items.find(l => l.isLight && l.isSquare);
            const darkSquare = items.find(l => l.isDark && l.isSquare);
            const anySquare = items.find(l => l.isSquare) || items[0];
            const hasBoth = lightSquare && darkSquare;
            const previewItem = lightSquare || darkSquare || anySquare;
            return html`
              <div
                key=${base}
                onClick=${() => selectLogo(anySquare)}
                style="cursor:pointer;border:2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'};border-radius:8px;overflow:hidden;background:var(--surface);transition:border-color .2s;"
              >
                <div style="position:relative;height:100px;display:flex;">
                  ${hasBoth ? html`
                    <div style="flex:1;display:flex;align-items:center;justify-content:center;background:#fff;border-right:1px solid var(--border);">
                      <img src=${lightSquare.url} style="max-width:80%;max-height:80%;object-fit:contain;" />
                    </div>
                    <div style="flex:1;display:flex;align-items:center;justify-content:center;background:#0f172a;">
                      <img src=${darkSquare.url} style="max-width:80%;max-height:80%;object-fit:contain;" />
                    </div>
                  ` : html`
                    <div style="flex:1;display:flex;align-items:center;justify-content:center;background:${previewItem.isDark ? '#0f172a' : '#fff'};">
                      <img src=${previewItem.url} style="max-width:80%;max-height:80%;object-fit:contain;" />
                    </div>
                  `}
                  ${isSelected && html`
                    <div style="position:absolute;top:4px;right:4px;width:18px;height:18px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                    </div>
                  `}
                </div>
                <div style="padding:6px 8px;display:flex;align-items:center;justify-content:space-between;">
                  <span style="font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title=${base}>${base}</span>
                  <div style="display:flex;align-items:center;gap:4px;">
                    ${hasBoth && html`<span style="font-size:9px;color:var(--green);background:var(--green-bg);padding:1px 4px;border-radius:10px;">Light+Dark</span>`}
                    ${anySquare?.svgUrl && html`<span style="font-size:9px;color:var(--accent);background:var(--accent-light);padding:1px 4px;border-radius:10px;">SVG</span>`}
                    <button onClick=${e => { e.stopPropagation(); setPreviewLogo({ base, items }); }} style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0 2px;" title="Preview">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            `;
          })}
        </div>
        ${Object.keys(grouped).length === 0 && html`
          <p style="text-align:center;color:var(--text-muted);font-size:13px;padding:24px 0;">No logos in library. Upload or add files to assets/logos/</p>
        `}
      </div>

      ${previewLogo && html`
        <div style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;padding:20px;" onClick=${() => setPreviewLogo(null)}>
          <div style="background:var(--bg);border:1px solid var(--border);max-width:520px;width:100%;padding:24px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.12);" onClick=${e => e.stopPropagation()}>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
              <h3 style="font-size:15px;font-weight:600;">${previewLogo.base}</h3>
              <button onClick=${() => setPreviewLogo(null)} style="background:none;border:none;cursor:pointer;color:var(--text-muted);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${previewLogo.items.map(l => html`
                <div key=${l.filename} style="text-align:center;cursor:pointer;" onClick=${() => { selectLogo(l); setPreviewLogo(null); }}>
                  <div style="height:${l.isBanner ? '60px' : '120px'};background:${l.isDark ? '#0f172a' : '#fff'};border:1px solid var(--border);display:flex;align-items:center;justify-content:center;border-radius:8px;transition:border-color .15s;">
                    <img src=${l.url} style="max-width:90%;max-height:90%;object-fit:contain;" />
                  </div>
                  <div style="margin-top:4px;display:flex;align-items:center;justify-content:center;gap:4px;">
                    <span style="font-size:10px;color:var(--text-muted);">${l.isBanner ? 'Banner' : 'Square'}</span>
                    <span style="font-size:9px;padding:1px 5px;border-radius:10px;background:${l.isLight ? 'var(--green-bg)' : 'var(--surface)'};color:${l.isLight ? 'var(--green)' : 'var(--text-muted)'};">${l.isLight ? 'Light' : 'Dark'}</span>
                  </div>
                </div>
              `)}
            </div>
            <button onClick=${() => { selectLogo(previewLogo.items[0]); setPreviewLogo(null); }} style="margin-top:16px;width:100%;padding:8px;background:var(--accent);color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:500;border-radius:8px;">
              Use this set
            </button>
          </div>
        </div>
      `}
    </div>
  `;
}

export { LogoManager };
