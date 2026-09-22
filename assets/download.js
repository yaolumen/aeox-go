// @ts-check
import { render, h, createContext } from './lib/preact.module.js';
import { useState, useEffect, useContext } from './lib/hooks.module.js';
import htm from './lib/htm.module.js';
import { api } from './lib/api.js';

const html = htm.bind(h);

const I18nContext = createContext({ lang: 'en', t: {} });
function useI18n() { return useContext(I18nContext); }
function t(obj, lang) {
  if (!obj || typeof obj === 'string') return obj || '';
  return obj[lang] || obj.en || obj.zh || Object.values(obj).find(v => v) || '';
}

function Nav({ siteName, logo }) {
  const { t: tr } = useI18n();
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    const handler = e => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const logoSrc = isDark && logo?.darkSrc ? logo.darkSrc : logo?.src;
  return html`
    <nav class="nav">
      <div class="nav-inner">
        <a href="index.html" class="nav-logo">
          ${logoSrc
            ? html`<img src=${logoSrc} alt=${siteName || 'AEOX'} class="nav-logo-img" />`
            : (siteName || 'AEOX')
          }
        </a>
        <div class="nav-links nav-desktop">
          <a href="index.html">${tr.nav?.store || 'Store'}</a>
        </div>
        <a href="index.html" class="nav-mobile-back" style="display:none;font-size:13px;color:var(--text-muted);padding:8px 0;">\u2190 ${tr.nav?.store || 'Store'}</a>
      </div>
    </nav>
    <style>@media(max-width:639px){.nav-mobile-back{display:inline-flex!important;align-items:center;gap:4px;}}</style>
  `;
}

const DL_CACHE_PREFIX = 'aeox_dl_';
const DL_CACHE_TTL = 86400000;

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
}

function saveDlCache(shortId, token) {
  try {
    localStorage.setItem(DL_CACHE_PREFIX + shortId, JSON.stringify({ token, savedAt: Date.now() }));
  } catch (e) {}
}

function loadDlCache(shortId) {
  try {
    const raw = localStorage.getItem(DL_CACHE_PREFIX + shortId);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.savedAt > DL_CACHE_TTL) {
      localStorage.removeItem(DL_CACHE_PREFIX + shortId);
      return null;
    }
    return data.token;
  } catch (e) {
    return null;
  }
}

function clearDlCache(shortId) {
  try { localStorage.removeItem(DL_CACHE_PREFIX + shortId); } catch (e) {}
}

function getLocaleDownloads(product, lang) {
  if (!product.downloads) return [];
  if (Array.isArray(product.downloads)) return product.downloads;
  if (product.downloads[lang] && product.downloads[lang].length > 0) return product.downloads[lang];
  const locales = product.locales || ['en'];
  for (const l of locales) {
    if (product.downloads[l] && product.downloads[l].length > 0) return product.downloads[l];
  }
  return Object.values(product.downloads).flat();
}

function Warning() {
  const { t: tr } = useI18n();
  return html`
    <div class="dl-warning">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
      <span>${tr.download?.validFor24h || 'Download link valid for 24 hours'}</span>
    </div>
  `;
}

function Verifying() {
  const { t: tr } = useI18n();
  return html`
    <div class="dl-main">
      <div class="dl-box" style="text-align:center;padding-top:80px;padding-bottom:80px;">
        <div class="spinner"></div>
        <p style="margin-top:16px;color:var(--text-muted);">${tr.download?.verifying || 'Verifying download access...'}</p>
      </div>
    </div>
  `;
}

function Authorized({ product, downloads, siteConfig, shortId, token, allProducts, categories }) {
  const { lang, t: tr } = useI18n();
  const isFree = Number(product.price) === 0;
  const title = t(product.title, lang);
  const rp = siteConfig?.refundPolicy;
  const [copied, setCopied] = useState(false);
  const isOldFormat = Array.isArray(product.downloads);
  const allLocaleDownloads = !isOldFormat && product.downloads && typeof product.downloads === 'object'
    ? Object.entries(product.downloads).filter(([, v]) => v && v.length > 0).map(([locale, dls]) => ({ locale, dls }))
    : [];
  const hasMultiLocale = allLocaleDownloads.length > 0;
  const dlUrl = token ? `${location.origin}/d/${shortId}?t=${token}` : '';
  const paymentMode = siteConfig?.paymentMode || 'kofi';

  function decodeEmail(enc) {
    return String(enc || '').replace(/[a-zA-Z]/g, function (c) {
      const code = c.charCodeAt(0);
      const base = code <= 90 ? 65 : 97;
      return String.fromCharCode(((code - base + 13) % 26) + base);
    });
  }

  function openUrl(url) {
    if (url) window.open(url, '_blank');
  }

  function getUpsellProducts() {
    const upsell = product.upsell;
    if (!upsell || upsell.mode === 'none') return [];
    if (upsell.mode === 'manual' && Array.isArray(upsell.products) && upsell.products.length > 0) {
      return (allProducts || []).filter(p => p.status !== 'archived' && p.id !== product.id && (
        upsell.products.includes(p.id) || upsell.products.some(u => u.shortId && u.shortId === p.shortId)
      ));
    }
    if (upsell.mode === 'auto' || !upsell.mode) {
      if (!allProducts || !allProducts.length) return [];
      const sameCategory = allProducts.filter(p =>
        p.id !== product.id && p.status !== 'archived' && Number(p.price) > 0 && p.categoryId === product.categoryId
      );
      if (sameCategory.length > 0) return sameCategory.slice(0, 2);
      const mySeries = (categories || []).find(c => c.id === product.categoryId)?.slug?.split('-')[0] || '';
      if (mySeries) {
        const siblingCatIds = (categories || []).filter(c => c.slug?.split('-')[0] === mySeries && c.id !== product.categoryId).map(c => c.id);
        const sameSeries = allProducts.filter(p =>
          p.id !== product.id && p.status !== 'archived' && Number(p.price) > 0 && siblingCatIds.includes(p.categoryId)
        );
        if (sameSeries.length > 0) return sameSeries.slice(0, 2);
      }
      const featured = allProducts.filter(p =>
        p.id !== product.id && p.status !== 'archived' && Number(p.price) > 0 && p.featured
      );
      if (featured.length > 0) return featured.slice(0, 2);
      const anyPaid = allProducts.filter(p =>
        p.id !== product.id && p.status !== 'archived' && Number(p.price) > 0
      );
      return anyPaid.slice(0, 2);
    }
    return [];
  }

  const upsellProducts = getUpsellProducts();

  async function handleUpsellBuy(shortId) {
    try {
      const data = await api(`/api/checkout/${shortId}`, { method: 'POST' });
      if (data.kofiLink) location.href = data.kofiLink;
      else if (data.stripeLink) location.href = data.stripeLink;
    } catch (e) {
      alert('Failed: ' + e.message);
    }
  }

  const upsellBtnText = paymentMode === 'kofi'
    ? (tr.detail?.getOnKofi || 'Get on Ko-fi')
    : (tr.detail?.buyNow || 'Buy Now');

  return html`
    <div class="dl-main">
      <div class="dl-box">
        ${!isFree && html`<${Warning} />`}

        <div style="text-align:center;margin-bottom:40px;">
          <div class="dl-success-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h1 class="dl-title">${tr.download?.downloadReady || 'Download Ready'}</h1>
          <p class="dl-sub">${tr.download?.purchaseVerified || 'Your purchase has been verified'}</p>
        </div>

        <div class="dl-product">
          <div class="dl-product-cover">
            ${product.cover && html`<img src=${product.cover} alt=${title} />`}
          </div>
          <div>
            <div style="font-weight:500;">${title}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${product.shortId}</div>
          </div>
        </div>

        <div>
          ${hasMultiLocale ? html`
            ${allLocaleDownloads.map(({ locale, dls }, gi) => html`
              <div key=${locale} style=${gi > 0 ? 'margin-top:16px;' : ''}>
                <div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;display:flex;align-items:center;gap:6px;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                  ${locale.toUpperCase()} ${tr.download?.edition || 'Edition'}
                </div>
                ${dls.map((dl, i) => html`
                  <button key=${i} class=${i === 0 && gi === 0 ? 'dl-btn-primary' : 'dl-btn-secondary'} onClick=${() => openUrl(dl.url)} style=${i > 0 ? 'margin-top:8px;' : ''}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill=${i === 0 && gi === 0 ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><path d="M12 4v12M6 10l6 6 6-6M4 20h16"/></svg>
                    ${dl.label ? dl.label : (i === 0 ? (tr.download?.primaryDownload || 'Primary Download') : 'Download ' + (i + 1))}
                  </button>
                `)}
              </div>
            `)}
          ` : html`
            ${downloads.map((dl, i) => html`
              <button key=${i} class=${i === 0 ? 'dl-btn-primary' : 'dl-btn-secondary'} onClick=${() => openUrl(dl.url)} style=${i > 0 ? 'margin-top:8px;' : ''}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill=${i === 0 ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><path d="M12 4v12M6 10l6 6 6-6M4 20h16"/></svg>
                ${dl.label ? dl.label : (i === 0 ? (tr.download?.primaryDownload || 'Primary Download') : 'Download ' + (i + 1))}
              </button>
            `)}
            ${downloads.length === 0 && html`
              <p style="text-align:center;color:var(--text-muted);font-size:13px;">${tr.download?.noDownloadLinks || 'No download links available'}</p>
            `}
          `}
        </div>

        <div class="dl-tip">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <div>
            <div class="dl-tip-title">${tr.download?.downloadTips || 'Download Tips'}</div>
            <div class="dl-tip-body">${tr.download?.downloadTipsBody || 'If the primary link is slow, try the backup mirror. Files are in PDF/EPUB/MOBI format.'}</div>
          </div>
        </div>

        ${!isFree && dlUrl && html`
          <div class="dl-save-link" style="margin-top:20px;padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:var(--radius);border:1px solid var(--border,#e5e7eb);">
            <div style="font-size:13px;font-weight:500;color:var(--text-muted);margin-bottom:8px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><rect x="9" y="1" width="6" height="4" rx="1"/></svg>
              ${tr.download?.saveLink || 'Save this link (valid 24h)'}
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <div style="flex:1;padding:8px 10px;font-size:11px;font-family:var(--font-mono,monospace);background:var(--bg);border:1px solid var(--border);color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:all;-webkit-user-select:all;">${dlUrl}</div>
              <button class="dl-btn-copy" style="padding:10px 14px;font-size:12px;font-weight:500;white-space:nowrap;background:var(--accent);color:#fff;border:none;cursor:pointer;min-height:44px;" aria-label="Copy link" onClick=${function() {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(dlUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => { fallbackCopy(dlUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); });
                } else { fallbackCopy(dlUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
              }}>${copied ? (tr.download?.copied || 'Copied!') : (tr.download?.copy || 'Copy')}</button>
            </div>
          </div>
        `}

        ${upsellProducts.length > 0 && html`
          <div style="margin-top:24px;padding:20px;background:var(--bg-secondary,#f8f9fa);border:2px solid var(--accent);border-radius:var(--radius);">
            <div style="font-size:14px;font-weight:600;color:var(--accent);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              ${tr.download?.youMightAlsoLike || 'You Might Also Like'}
            </div>
            ${upsellProducts.map(p => {
              const pTitle = t(p.title, lang);
              const isFreeRec = Number(p.price) === 0;
              const recBtnText = isFreeRec
                ? (tr.download?.getFree || 'Get It Free')
                : upsellBtnText;
              return html`
                <div key=${p.id} style="display:flex;gap:12px;align-items:center;padding:12px;background:var(--bg-primary,#fff);border:1px solid var(--border,#e5e7eb);border-radius:var(--radius);margin-bottom:8px;">
                  ${p.cover && html`<img src=${p.cover} alt=${pTitle} style="width:48px;height:64px;object-fit:cover;border-radius:var(--radius);" />`}
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pTitle}</div>
                    <div style="font-size:14px;font-weight:600;color:${isFreeRec ? 'var(--green,#16a34a)' : 'var(--accent)'};margin-top:2px;">${isFreeRec ? (tr.download?.free || 'FREE') : `$${Number(p.price).toFixed(2)}`}</div>
                  </div>
                  <button onClick=${() => handleUpsellBuy(p.shortId)}
                    style="padding:8px 14px;font-size:12px;font-weight:500;background:${isFreeRec ? 'var(--green,#16a34a)' : 'var(--accent)'};color:#fff;border:none;border-radius:var(--radius);cursor:pointer;white-space:nowrap;">
                    ${recBtnText}
                  </button>
                </div>
              `;
            })}
          </div>
        `}

        ${rp && rp.enabled && html`
          <div class="dl-refund">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/></svg>
            <div>
              <div class="dl-refund-title">${tr.download?.refundPolicy || 'Refund Policy'}</div>
              <div class="dl-refund-text">${rp.text || ''}</div>
              ${rp._emailEnc && html`
                <a class="dl-refund-link" onclick=${function() { location.href = 'mailto:' + decodeEmail(rp._emailEnc); }} rel="noopener noreferrer">${tr.download?.contactSupport || 'Contact Support'}</a>
              `}
            </div>
          </div>
        `}

        <div class="dl-back">
          <a href="index.html">${tr.download?.backToStore || 'Back to Store'}</a>
        </div>
      </div>
    </div>
  `;
}

function Unauthorized({ product, denyMessage, shortId, onRecovered }) {
  const { lang, t: tr } = useI18n();
  const title = product ? t(product.title, lang) : '';
  const price = product ? Number(product.price).toFixed(2) : '0.00';
  const [recovering, setRecovering] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverMsg, setRecoverMsg] = useState('');
  const [showRecover, setShowRecover] = useState(false);

  function buyAgain() {
    location.href = 'index.html';
  }

  async function handleRecover() {
    if (!recoverEmail.trim()) { setRecoverMsg('Please enter your email'); return; }
    setRecovering(true);
    setRecoverMsg('');
    try {
      const result = await api('/api/recover-download', {
        method: 'POST',
        body: JSON.stringify({ email: recoverEmail.trim() })
      });
      if (result.found && result.downloads?.length) {
        const dl = result.downloads[0];
        window.location.href = dl.downloadUrl;
      } else if (result.message) {
        setRecoverMsg(result.message);
      } else {
        setRecoverMsg('No purchase found for this email. Please use the email from your purchase.');
      }
    } catch (e) {
      setRecoverMsg('Recovery failed. Please try again later.');
    }
    setRecovering(false);
  }

  async function tryLocalCache() {
    const cachedToken = loadDlCache(shortId);
    if (cachedToken) {
      if (onRecovered) onRecovered(cachedToken);
      return;
    }
    setShowRecover(true);
  }

  return html`
    <div class="dl-main">
      <div class="dl-box">
        <div class="dl-unauthorized">
          <div class="dl-lock-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <h1 class="dl-deny-title">${tr.download?.purchaseRequired || 'Purchase required to download'}</h1>
          <p class="dl-deny-msg">${denyMessage || (tr.download?.paidProductMsg || 'This is a paid product. Please complete the purchase first.')}</p>

          ${product && html`
            <div class="dl-product" style="max-width:360px;margin:24px auto 0;">
              <div class="dl-product-cover">
                ${product.cover && html`<img src=${product.cover} alt=${title} />`}
              </div>
              <div>
                <div style="font-weight:500;">${title}</div>
                <div style="font-size:14px;font-weight:600;color:var(--accent);margin-top:4px;">$${price}</div>
              </div>
            </div>
          `}

          <div style="margin-top:24px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button class="btn btn-primary btn-lg" onClick=${buyAgain}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
              ${tr.detail?.getOnKofi || 'Get on Ko-fi'}
            </button>
            <button class="btn btn-secondary btn-lg" style="background:transparent;border:1px solid var(--border,#e5e7eb);color:var(--text-secondary);" onClick=${tryLocalCache}>
              ${tr.download?.alreadyPurchased || 'Already purchased? Find my download'}
            </button>
          </div>

          ${showRecover && html`
            <div style="margin-top:20px;padding:16px;background:var(--bg-secondary,#f8f9fa);border-radius:var(--radius);border:1px solid var(--border,#e5e7eb);max-width:400px;margin-left:auto;margin-right:auto;">
              <div style="font-size:13px;font-weight:500;margin-bottom:10px;">${tr.download?.recoverTitle || 'Recover your download link'}</div>
              <div style="display:flex;gap:8px;">
                <input type="email" placeholder=${tr.download?.purchaseEmail || 'Purchase email'} value=${recoverEmail} onInput=${function(e) { setRecoverEmail(e.target.value); }} style="flex:1;padding:8px 10px;font-size:13px;border:1px solid var(--border,#e5e7eb);border-radius:var(--radius);outline:none;" />
                <button onClick=${handleRecover} disabled=${recovering} style="padding:8px 14px;font-size:13px;font-weight:500;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);cursor:pointer;white-space:nowrap;">${recovering ? '...' : (tr.download?.find || 'Find')}</button>
              </div>
              ${recoverMsg && html`<div style="margin-top:8px;font-size:12px;color:var(--red,#ef4444);">${recoverMsg}</div>`}
            </div>
          `}

          <div class="dl-back" style="margin-top:24px;">
            <a href="index.html">${tr.download?.backToStore || 'Back to Store'}</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

function NotFound() {
  const { t: tr } = useI18n();
  return html`
    <div class="dl-main">
      <div class="dl-box empty">
        <p>${tr.download?.productNotFound || 'Product not found.'}</p>
        <a href="index.html" style="margin-top:16px;display:inline-block;">${tr.download?.backToStore || 'Back to Store'}</a>
      </div>
    </div>
  `;
}

export function DownloadApp() {
  const [siteConfig, setSiteConfig] = useState(null);
  const [product, setProduct] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [downloads, setDownloads] = useState([]);
  const [denyMessage, setDenyMessage] = useState('');
  const [shortId, setShortId] = useState('');
  const [token, setToken] = useState('');
  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [i18nData, setI18nData] = useState({ lang: 'en', t: {} });

  useEffect(() => {
    const savedLang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('aeox_lang') || 'en';
    const params = new URLSearchParams(location.search);
    const sid = params.get('id');
    let tok = params.get('token');

    if (!sid) {
      setVerifying(false);
      api(`/api/i18n?lang=${savedLang}`).catch(() => ({ lang: 'en', t: {} })).then(i18n => setI18nData(i18n));
      return;
    }

    setShortId(sid);

    if (!tok) {
      tok = loadDlCache(sid) || '';
    }

    setToken(tok);

    Promise.all([
      api('/api/config/site').catch(() => ({})),
      api('/api/config/categories').catch(() => []),
      api(`/api/i18n?lang=${savedLang}`).catch(() => ({ lang: 'en', t: {} }))
    ]).then(([site, cats, i18n]) => {
      setSiteConfig(site);
      setCategories(cats || []);
      setI18nData(i18n);

      if (!tok) {
        setVerifying(false);
        return;
      }

      api('/api/verify-download', {
        method: 'POST',
        body: JSON.stringify({ shortId: sid, token: tok, lang: savedLang })
      }).then((result) => {
        if (!result) {
          setVerifying(false);
          return;
        }
        setProduct(result.product || null);
        setAuthorized(result.authorized === true);
        if (result.authorized) {
          setDownloads(result.downloads || []);
          saveDlCache(sid, tok);
          api('/api/products').then(prods => {
            setAllProducts(prods || []);
            setVerifying(false);
          }).catch(() => { setVerifying(false); });
        } else {
          setDenyMessage(result.reason || '');
          clearDlCache(sid);
          setVerifying(false);
        }
      }).catch(() => {
        setVerifying(false);
      });
    });
  }, []);

  function handleRecovered(cachedToken) {
    setToken(cachedToken);
    setVerifying(true);
    api('/api/verify-download', {
      method: 'POST',
      body: JSON.stringify({ shortId, token: cachedToken, lang: new URLSearchParams(location.search).get('lang') || localStorage.getItem('aeox_lang') || 'en' })
    }).then((result) => {
      if (result?.authorized) {
        setAuthorized(true);
        setDownloads(result.downloads || []);
        saveDlCache(shortId, cachedToken);
        api('/api/products').then(prods => {
          setAllProducts(prods || []);
          setVerifying(false);
        }).catch(() => { setVerifying(false); });
      } else {
        clearDlCache(shortId);
        setDenyMessage(result?.reason || 'Cached token expired');
        setVerifying(false);
      }
    }).catch(() => {
      clearDlCache(shortId);
      setVerifying(false);
    });
  }

  const siteName = siteConfig?.siteName || 'AEOX';
  const lang = i18nData.lang || 'en';
  const tr = i18nData.t || {};

  return html`
    <${I18nContext.Provider} value=${{ lang, t: tr }}>
      <${Nav} siteName=${siteName} logo=${siteConfig?.logo} />
      ${verifying && html`<${Verifying} />`}
      ${!verifying && product && authorized && html`<${Authorized} product=${product} downloads=${downloads} siteConfig=${siteConfig} shortId=${shortId} token=${token} allProducts=${allProducts} categories=${categories} />`}
      ${!verifying && product && !authorized && html`<${Unauthorized} product=${product} denyMessage=${denyMessage} shortId=${shortId} onRecovered=${handleRecovered} />`}
      ${!verifying && !product && html`<${NotFound} />`}
    <//>
  `;
}

render(html`<${DownloadApp} />`, document.getElementById('app'));
