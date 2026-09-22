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

const LANGS = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'de', label: 'DE', flag: '🇩🇪' }
];

function Nav({ siteName, logo, searchQuery, onSearch, availableLangs }) {
  const { lang, t: tr } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    const handler = e => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const logoSrc = isDark && logo?.darkSrc ? logo.darkSrc : logo?.src;
  const activeLang = LANGS.find(l => l.code === lang) || LANGS[0];
  const visibleLangs = LANGS.filter(l => !availableLangs || availableLangs.includes(l.code));

  function setLang(code) {
    localStorage.setItem('aeox_lang', code);
    window.location.reload();
  }

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
          <a href="index.html">${tr.nav?.store || 'Books'}</a>
          <a href="#faq-section" class="nav-link-sub">${tr.nav?.faq || 'FAQ'}</a>
          <div class="nav-search-inline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" class="nav-search-input" aria-label="Search products" placeholder=${tr.nav?.search || 'Search...'} value=${searchQuery} onInput=${e => onSearch(e.target.value)} />
            ${searchQuery && html`<button class="nav-search-clear" aria-label="Clear search" onClick=${() => onSearch('')}>x</button>`}
          </div>
          <div style="position:relative;">
            <button onClick=${() => setLangOpen(!langOpen)} aria-label="Change language" aria-expanded=${langOpen} style="display:flex;align-items:center;gap:4px;padding:4px 8px;font-size:12px;background:var(--surface);border:1px solid var(--border);color:var(--text);cursor:pointer;border-radius:20px;">
              <span>${activeLang.flag}</span><span>${activeLang.label}</span>
            </button>
            ${langOpen && html`
              <div style="position:absolute;right:0;top:100%;margin-top:4px;background:var(--bg);border:1px solid var(--border);z-index:99;min-width:120px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.08);">
                ${visibleLangs.map(l => html`
                  <button key=${l.code} onClick=${() => { setLang(l.code); setLangOpen(false); }}
                    style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;font-size:12px;background:${l.code === lang ? 'var(--accent-light)' : 'transparent'};color:${l.code === lang ? 'var(--accent)' : 'var(--text)'};border:none;cursor:pointer;text-align:left;">
                    <span>${l.flag}</span><span>${l.label}</span>
                  </button>
                `)}
              </div>
            `}
          </div>
        </div>
        <button class="nav-mobile-btn" onClick=${() => setMobileOpen(!mobileOpen)} aria-label="Menu" aria-expanded=${mobileOpen}>
          ${mobileOpen
            ? html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`
            : html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`
          }
        </button>
      </div>
      ${mobileOpen && html`
        <div class="nav-mobile">
          <a href="index.html" onClick=${() => setMobileOpen(false)}>${tr.nav?.store || 'Store'}</a>
          <a href="#faq-section" onClick=${() => setMobileOpen(false)}>${tr.nav?.faq || 'FAQ'}</a>
          <div style="padding:8px 0;">
            <input type="text" style="width:100%;padding:8px 12px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-size:13px;outline:none;border-radius:8px;" placeholder=${tr.nav?.search || 'Search ebooks...'} value=${searchQuery} onInput=${e => onSearch(e.target.value)} />
          </div>
          <div style="padding:8px 0;display:flex;gap:6px;">
            ${visibleLangs.map(l => html`
              <button key=${l.code} onClick=${() => { setLang(l.code); setMobileOpen(false); }}
                style="padding:10px 14px;font-size:12px;border:1px solid ${l.code === lang ? 'var(--accent)' : 'var(--border)'};background:${l.code === lang ? 'var(--accent-light)' : 'transparent'};color:${l.code === lang ? 'var(--accent)' : 'var(--text)'};cursor:pointer;min-height:44px;display:inline-flex;align-items:center;border-radius:20px;">
                ${l.flag} ${l.label}
              </button>
            `)}
          </div>
        </div>
      `}
    </nav>
  `;
}

function Hero({ siteName, siteDescription, heroTagline, productCount }) {
  const { t: tr } = useI18n();
  return html`
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="hero-label">${heroTagline || tr.hero?.tagline || 'Digital Products'}</div>
          <h1 class="hero-title">${siteName || 'AEOX'}</h1>
          <p class="hero-sub">${siteDescription || tr.hero?.sub || 'Curated digital products & resources for builders'}</p>
        </div>
        <div class="hero-right">
          <div class="hero-count">${productCount || 0}</div>
          <div class="hero-count-label">${tr.hero?.ebooks || 'products & counting'}</div>
        </div>
      </div>
    </section>
  `;
}

function ShelfCarousel({ products, onClick }) {
  const { lang, t: tr } = useI18n();
  if (!products || products.length === 0) return null;
  return html`
    <section class="shelf fade-up">
      <div class="shelf-inner">
        <div class="shelf-head">
          <div class="shelf-title">${tr.section?.editorsPicks || "Editor's Picks"}</div>
        </div>
        <div class="shelf-scroll">
          ${products.map(product => {
            const title = t(product.title, lang);
            return html`
              <div key=${product.id} class="shelf-book" onClick=${() => onClick(product)} role="button" tabindex="0"
                onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(product); } }}>
                <div class="shelf-cover">
                  ${product.cover
                    ? html`<img src=${product.cover} alt=${title} loading="lazy" />`
                    : html`<div class="placeholder">\u{1F4D6}</div>`
                  }
                </div>
                <div class="shelf-title-text">${title}</div>
                <div class="shelf-meta">${Number(product.price) === 0 ? (tr.product?.free || 'FREE') : '$' + Number(product.price).toFixed(2)}</div>
              </div>
            `;
          })}
        </div>
      </div>
    </section>
  `;
}

function ProductListItem({ product, onClick }) {
  const { lang, t: tr } = useI18n();
  const isFree = Number(product.price) === 0;
  const title = t(product.title, lang);
  const desc = t(product.desc, lang);
  return html`
    <div class="list-item" onClick=${() => onClick(product)} role="button" tabindex="0"
      onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(product); } }}>
      <div class="list-thumb">
        ${product.cover
          ? html`<img src=${product.cover} alt=${title} loading="lazy" />`
          : html`<div class="placeholder">\u{1F4D6}</div>`
        }
      </div>
      <div class="list-info">
        <div class="list-title">${title}</div>
        <div class="list-desc">${desc}</div>
      </div>
      <div class="list-right">
        ${isFree && html`<span class="list-badge-free">${tr.product?.free || 'FREE'}</span>`}
        <span class="list-format">${product.format || 'PDF'}</span>
        <button class="list-dl">${isFree ? (tr.product?.free || 'FREE') : '$' + Number(product.price).toFixed(2)}</button>
      </div>
    </div>
  `;
}

function CategoryChips({ categories, selectedId, onSelect }) {
  const { lang, t: tr } = useI18n();
  if (!categories || categories.length === 0) return null;
  return html`
    <div class="chips fade-up">
      <button class="chip ${selectedId === '' ? 'active' : ''}" onClick=${() => onSelect('')} aria-pressed=${selectedId === ''}>${tr.section?.all || 'All'}</button>
      ${categories.map(cat => html`
        <button key=${cat.id} class="chip ${selectedId === cat.id ? 'active' : ''}"
          onClick=${() => onSelect(cat.id)} aria-pressed=${selectedId === cat.id}>
          ${t(cat.name, lang)}
        </button>
      `)}
    </div>
  `;
}

function PriceFilter({ selected, onSelect }) {
  const { t: tr } = useI18n();
  const tabs = [
    { key: 'all', label: tr.section?.all || 'All' },
    { key: 'paid', label: tr.section?.paidEbooks || 'Paid' },
    { key: 'free', label: tr.section?.freeEbooks || 'Free' },
  ];
  return html`
    <div class="price-tabs">
      ${tabs.map(tab => html`
        <button key=${tab.key} class="price-tab ${selected === tab.key ? 'active' : ''}"
          onClick=${() => onSelect(tab.key)} aria-pressed=${selected === tab.key}>
          ${tab.label}
        </button>
      `)}
    </div>
  `;
}

function Pagination({ page, totalPages, onChange }) {
  const { t: tr } = useI18n();
  if (totalPages <= 1) return null;
  return html`
    <div class="pagination">
      <button class="page-btn" aria-label="Previous page" disabled=${page <= 1} onClick=${() => onChange(page - 1)}>${tr.pagination?.prev || 'Prev'}</button>
      ${Array.from({ length: totalPages }, (_, i) => i + 1).map(n => html`
        <button key=${n} class="page-btn ${n === page ? 'active' : ''}" aria-current=${n === page ? 'page' : undefined} onClick=${() => onChange(n)}>${n}</button>
      `)}
      <button class="page-btn" aria-label="Next page" disabled=${page >= totalPages} onClick=${() => onChange(page + 1)}>${tr.pagination?.next || 'Next'}</button>
    </div>
  `;
}

function FaqSection({ faq, refundPolicy }) {
  const { lang, t: tr } = useI18n();
  const [openIdx, setOpenIdx] = useState(-1);
  if (!faq?.enabled || !faq.items?.length) return null;
  const title = faq.title || tr.faq?.title || 'Frequently Asked Questions';
  return html`
    <section id="faq-section" class="faq fade-up">
      <div class="faq-head">
        <span class="faq-head-bar"></span>
        <h2>${title}</h2>
      </div>
      <div class="faq-list">
        ${faq.items.map((item, i) => {
          const q = t(item.q, lang);
          const a = t(item.a, lang);
          const isOpen = openIdx === i;
          return html`
            <div key=${i} class="faq-item ${isOpen ? 'open' : ''}">
              <div class="faq-q" role="button" aria-expanded=${isOpen} aria-controls=${`faq-a-${i}`} tabIndex="0"
                onClick=${() => setOpenIdx(isOpen ? -1 : i)}
                onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenIdx(isOpen ? -1 : i); } }}>
                <span>${q}</span>
                <span class="faq-q-icon">\u25BC</span>
              </div>
              <div class="faq-a" id=${`faq-a-${i}`} role="region">
                <div class="faq-a-inner">${a}</div>
              </div>
            </div>
          `;
        })}
      </div>
      ${refundPolicy?.enabled && refundPolicy?.text && html`
        <div style="margin-top:20px;padding:14px 16px;background:var(--surface);border:1px solid var(--border);font-size:12px;color:var(--text-muted);line-height:1.6;border-radius:8px;">
          <span style="font-weight:600;color:var(--text-muted);">Refund Policy:</span> ${refundPolicy.text}
        </div>
      `}
    </section>
  `;
}

function Overlay({ show, onClick }) {
  return html`<div class="overlay ${show ? 'show' : ''}" onClick=${onClick}></div>`;
}

function DetailSheet({ product, show, onClose, categories, allProducts, paymentMode, globalKofiLink, onProductClick }) {
  const { lang, t: tr } = useI18n();
  if (!product) return null;
  const isFree = Number(product.price) === 0;
  const locales = product.locales || (product.bookLang ? [product.bookLang] : ['en']);
  const title = t(product.title, lang);
  const desc = t(product.desc, lang);
  const whatYouLearn = t(product.whatYouLearn, lang);
  const whatYouGet = t(product.whatYouGet, lang);
  const whoIsFor = t(product.whoIsFor, lang);
  const cat = categories?.find(c => c.id === product.categoryId);
  const catName = cat ? t(cat.name, lang) : '';
  const [emailInput, setEmailInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const kofiLink = product.kofiLink || globalKofiLink || '';
  const useKofi = paymentMode === 'kofi' && kofiLink;
  const useStripe = !useKofi && product.stripeLink;

  function getUpsellProducts() {
    const upsell = product.upsell;
    if (!upsell || upsell.mode === 'none') return [];
    const pool = allProducts || [];
    if (upsell.mode === 'manual' && Array.isArray(upsell.products) && upsell.products.length > 0) {
      return pool.filter(p => p.status !== 'archived' && p.id !== product.id && (
        upsell.products.includes(p.id) || upsell.products.some(u => u.shortId && u.shortId === p.shortId)
      ));
    }
    const sameCategory = pool.filter(p =>
      p.id !== product.id && p.status !== 'archived' && Number(p.price) > 0 && p.categoryId === product.categoryId
    );
    if (sameCategory.length > 0) return sameCategory.slice(0, 2);
    const mySeries = (categories || []).find(c => c.id === product.categoryId)?.slug?.split('-')[0] || '';
    if (mySeries) {
      const siblingCatIds = (categories || []).filter(c => c.slug?.split('-')[0] === mySeries && c.id !== product.categoryId).map(c => c.id);
      const sameSeries = pool.filter(p =>
        p.id !== product.id && p.status !== 'archived' && Number(p.price) > 0 && siblingCatIds.includes(p.categoryId)
      );
      if (sameSeries.length > 0) return sameSeries.slice(0, 2);
    }
    const featured = pool.filter(p =>
      p.id !== product.id && p.status !== 'archived' && Number(p.price) > 0 && p.featured
    );
    if (featured.length > 0) return featured.slice(0, 2);
    return pool.filter(p => p.id !== product.id && p.status !== 'archived' && Number(p.price) > 0).slice(0, 2);
  }

  const upsellProducts = getUpsellProducts();

  function handleBuyWithEmail() {
    if (submitting) return;
    const email = emailInput.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const input = document.getElementById('detail-email');
      if (input) { input.setCustomValidity('Please enter a valid email address.'); input.reportValidity(); input.setCustomValidity(''); }
      return;
    }
    setSubmitting(true);
    api(`/api/checkout/${product.shortId}`, {
      method: 'POST',
      body: JSON.stringify({ email: email || undefined })
    })
      .then(data => {
        if (data.stripeLink) location.href = data.stripeLink;
        else if (data.kofiLink) location.href = data.kofiLink;
        else if (data.downloadUrl) location.href = data.downloadUrl;
      })
      .catch(e => alert('Failed: ' + e.message))
      .finally(() => setSubmitting(false));
  }

  function handleBuySkip() {
    if (submitting) return;
    setSubmitting(true);
    api(`/api/checkout/${product.shortId}`, {
      method: 'POST',
      body: JSON.stringify({})
    })
      .then(data => {
        if (data.stripeLink) location.href = data.stripeLink;
        else if (data.kofiLink) location.href = data.kofiLink;
        else if (data.downloadUrl) location.href = data.downloadUrl;
      })
      .catch(e => alert('Failed: ' + e.message))
      .finally(() => setSubmitting(false));
  }

  function handleBuyPaid() {
    api(`/api/checkout/${product.shortId}`, { method: 'POST' })
      .then(data => {
        if (data.kofiLink) location.href = data.kofiLink;
        else if (data.stripeLink) location.href = data.stripeLink;
        else if (data.free && data.downloadUrl) location.href = data.downloadUrl;
      })
      .catch(e => alert('Failed: ' + e.message));
  }

  return html`
    <${Overlay} show=${show} onClick=${onClose} aria-hidden=${!show} />
    <div class="sheet ${show ? 'show' : ''}" role="dialog" aria-modal="true" aria-label=${title} onClick=${e => e.stopPropagation()}>
      <div class="sheet-handle" />
      <button class="sheet-close" onClick=${onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <div class="sheet-content">
        <div class="detail-grid">
          <div class="detail-cover">
            <img src=${product.cover} alt=${title} />
          </div>
          <div>
            ${catName && html`<span class="detail-cat">${catName}</span>`}
            <h2 class="detail-title">${title}</h2>
            <div class="detail-author">${product.author || ''}</div>
            <div class="detail-meta">${isFree ? (tr.product?.free || 'FREE') : '$' + Number(product.price).toFixed(2)}</div>
            <div class="detail-formats">
              <span>${product.format || 'PDF'}</span>
            </div>
          </div>
        </div>

        ${desc && html`
          <div style="margin-top:20px;">
            <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text);">${tr.detail?.aboutThisBook || 'About This Book'}</h3>
            <div class="detail-desc">${desc}</div>
          </div>
        `}

        ${whatYouLearn && html`
          <div style="margin-top:16px;">
            <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text);">${tr.detail?.whatYouLearn || "What You'll Learn"}</h3>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.7;">${whatYouLearn}</div>
          </div>
        `}

        ${whatYouGet && html`
          <div style="margin-top:16px;">
            <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text);">${tr.detail?.whatYouGet || "What You'll Get"}</h3>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.7;">${whatYouGet}</div>
          </div>
        `}

        ${whoIsFor && html`
          <div style="margin-top:16px;">
            <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text);">${tr.detail?.whoIsThisFor || 'Who Is This For?'}</h3>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.7;">${whoIsFor}</div>
          </div>
        `}

        <div style="margin-top:16px;display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);align-items:center;">
          <span style="display:flex;align-items:center;gap:4px;">${tr.detail?.language || 'Language'}:
            ${locales.map(l => html`<span key=${l} style="padding:1px 6px;font-size:10px;background:var(--surface);border:1px solid var(--border);color:var(--text-light);margin-left:2px;border-radius:3px;">${l.toUpperCase()}</span>`)}
          </span>
          ${locales.length > 1 && html`<span style="font-size:10px;color:var(--green);font-weight:500;">${tr.detail?.includesAllLanguages || 'Includes all language editions'}</span>`}
          ${product.fileSize && html`<span>${tr.detail?.fileSize || 'File Size'}: ${product.fileSize}</span>`}
        </div>

        <div class="detail-price-row" style="margin-top:16px;">
          <span class="detail-price">${isFree ? (tr.product?.free || 'FREE') : '$' + Number(product.price).toFixed(2)}</span>
        </div>

        ${isFree && html`
          <div style="margin-top:12px;margin-bottom:4px;">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px;">${tr.detail?.downloadFreeGuide || 'Download the free guide'}</div>
          </div>
          <div style="margin-bottom:16px;">
            <input id="detail-email" type="email" required placeholder=${tr.detail?.emailPlaceholder || 'Your email'} value=${emailInput}
              onInput=${e => setEmailInput(e.target.value)}
              style="width:100%;padding:10px 12px;font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text);outline:none;margin-bottom:6px;" />
          </div>
        `}
        <div class="detail-buy">
          ${isFree ? html`
            <button class="btn btn-primary" onClick=${handleBuyWithEmail} disabled=${submitting}>
              ${submitting ? 'Loading...' : (tr.detail?.submitAndDownload || 'Submit & Download')}
            </button>
            <button class="btn btn-ghost" onClick=${handleBuySkip} disabled=${submitting}>
              ${submitting ? 'Loading...' : (tr.detail?.skipAndDownload || 'Skip & Download Free')}
            </button>
          ` : useKofi ? html`
            <button class="btn btn-primary" onClick=${handleBuyPaid}>
              ${tr.detail?.getOnKofi || 'Get on Ko-fi'} \u2192
            </button>
            <button class="btn btn-ghost" onClick=${onClose}>${tr.detail?.close || 'Close'}</button>
          ` : html`
            <button class="btn btn-primary" onClick=${handleBuyPaid}>
              ${tr.detail?.buyNow || 'Buy Now'}
            </button>
            <button class="btn btn-ghost" onClick=${onClose}>${tr.detail?.close || 'Close'}</button>
          `}
        </div>

        ${upsellProducts.length > 0 && html`
          <div style="margin-top:24px;padding:20px;background:var(--surface);border:2px solid var(--accent);border-radius:8px;">
            <div style="font-size:14px;font-weight:600;color:var(--accent);margin-bottom:8px;">
              ${tr.detail?.wantCompleteGuide || 'Want the complete guide?'}
            </div>
            ${upsellProducts.map(rp => {
              const rpTitle = t(rp.title, lang);
              const rpFree = Number(rp.price) === 0;
              return html`
                <div key=${rp.id} style="display:flex;gap:12px;align-items:center;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;" onClick=${() => { onClose(); setTimeout(() => { if (onProductClick) onProductClick(rp); }, 150); }}>
                  ${rp.cover && html`<img src=${rp.cover} alt=${rpTitle} style="width:40px;height:56px;object-fit:cover;border-radius:4px;" />`}
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:500;">${rpTitle}</div>
                    <div style="font-size:12px;color:var(--text-light);margin-top:2px;">${rpFree ? (tr.product?.free || 'FREE') : '$' + Number(rp.price).toFixed(2)}</div>
                  </div>
                  <button style="padding:6px 12px;font-size:11px;font-weight:500;background:var(--accent);color:#fff;border:none;border-radius:var(--radius);cursor:pointer;white-space:nowrap;"
                    onClick=${(e) => { e.stopPropagation(); onClose(); setTimeout(() => { if (onProductClick) onProductClick(rp); }, 150); }}>
                    ${tr.detail?.viewDetails || 'View'}
                  </button>
                </div>
              `;
            })}
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
              ${tr.detail?.availableOnKofi || 'Available on Ko-fi'}
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}

function ChatWidget({ products, onProductClick }) {
  const { lang, t: tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'ai', text: tr.chat?.title === 'AI 选书助手' ? '你好！我可以帮你找到合适的电子书。你在找什么？' : 'Hi! I can help you find the right ebook. What are you looking for?' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const quick = [tr.chat?.quick1 || 'Recommend a book', tr.chat?.quick2 || 'Any free ebooks?', tr.chat?.quick3 || 'Latest arrivals'];

  async function send(msg) {
    const text = msg || input.trim();
    if (!text || loading) return;
    setInput('');
    const next = [...messages, { role: 'user', text }];
    setMessages(next);
    setLoading(true);
    try {
      const data = await api('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, products: products.slice(0, 20) })
      });
      const aiMsg = { role: 'ai', text: data.reply || 'Sorry, I could not process that.' };
      if (data.recommend && data.recommend.length) aiMsg.recommend = data.recommend;
      setMessages([...next, aiMsg]);
    } catch (e) {
      setMessages([...next, { role: 'ai', text: tr.chat?.timeout || 'AI 响应超时或连接失败，请稍后重试。' }]);
    } finally {
      setLoading(false);
    }
  }

  function findProduct(id) {
    return products.find(p => p.id === id);
  }

  useEffect(() => {
    const el = document.getElementById('chat-body');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return html`
    <div style="position:fixed;bottom:20px;right:20px;z-index:49;">
      ${open && html`
        <div class="chat-panel open">
          <div class="chat-header">
            <div class="chat-header-info">
              <div class="chat-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </div>
              <div>
                <div class="chat-header-title">${tr.chat?.title || 'AI Advisor'}</div>
                <div class="chat-header-sub">${tr.chat?.subtitle || 'Online \u00B7 Book recommendations'}</div>
              </div>
            </div>
            <button class="chat-close" onClick=${() => setOpen(false)} aria-label="Close chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div id="chat-body" class="chat-body">
            ${messages.map((m, i) => html`
              <div key=${i} class="chat-msg ${m.role}">
                <div class="chat-bubble">
                  <span>${m.text}</span>
                  ${m.recommend && m.recommend.length && html`
                    <div class="chat-recommend">
                      ${m.recommend.map(pid => {
                        const p = findProduct(pid);
                        if (!p) return null;
                        return html`
                          <div key=${pid} class="chat-rec-item" onClick=${() => {
                            setOpen(false);
                            if (p.sampleEnabled) {
                              location.href = '/read/' + p.shortId;
                            } else {
                              onProductClick && onProductClick(p);
                            }
                          }}>
                            <div class="chat-rec-cover">
                              ${p.cover && html`<img src=${p.cover} />`}
                            </div>
                            <div>
                              <div class="chat-rec-title">${t(p.title, lang)}</div>
                              <div class="chat-rec-price">${Number(p.price) === 0 ? (tr.product?.free || 'FREE') : '$' + Number(p.price).toFixed(2)}</div>
                            </div>
                          </div>
                        `;
                      })}
                    </div>
                  `}
                </div>
              </div>
            `)}
            ${loading && html`
              <div class="chat-msg ai">
                <div class="chat-loading">
                  <span></span><span></span><span></span>
                </div>
              </div>
            `}
          </div>
          ${messages.length <= 1 && html`
            <div class="chat-quick">
              ${quick.map(q => html`
                <button key=${q} class="chat-quick-btn" onClick=${() => send(q)}>${q}</button>
              `)}
            </div>
          `}
          <div class="chat-input-bar">
            <input class="chat-input" type="text" placeholder=${tr.chat?.placeholder || 'Ask AI...'}
              value=${input} onInput=${e => setInput(e.target.value)}
              onKeyDown=${e => e.key === 'Enter' && send()} />
            <button class="chat-send" disabled=${loading || !input.trim()} onClick=${() => send()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      `}
      <button class="chat-fab" onClick=${() => setOpen(!open)} aria-label="AI Assistant">
        ${open
          ? html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`
          : html`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`
        }
      </button>
    </div>
  `;
}

function Footer({ copyright }) {
  const { t: tr } = useI18n();
  return html`
    <footer class="footer">
      <div class="footer-inner">
        <div>
          <span>${copyright || '\u00A9 2026 AEOX. All rights reserved.'} <span style="font-size:10px;color:var(--text-muted);opacity:.5;">v2.4.2</span></span>
          <p class="footer-corp">AEOX is a digital products hub operated by <a href="https://me.yaolumen.com" target="_blank" rel="noopener">YAOLUMEN TECHNOLOGIES LTD</a>.</p>
        </div>
        <div class="footer-links">
          <a href="privacy.html">${tr.footer?.privacy || 'Privacy'}</a>
          <a href="terms.html">${tr.footer?.terms || 'Terms'}</a>
          <a href="cookies.html">${tr.footer?.cookies || 'Cookies'}</a>
          <a href="dmca.html">${tr.footer?.copyright || 'Copyright'}</a>
        </div>
      </div>
    </footer>
  `;
}

export function App() {
  const [siteConfig, setSiteConfig] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCatId, setSelectedCatId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFilter, setPriceFilter] = useState('all');
  const [productPage, setProductPage] = useState(1);
  const [detailProduct, setDetailProduct] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [i18nData, setI18nData] = useState({ lang: 'en', t: {} });
  const [samples, setSamples] = useState([]);

  useEffect(() => {
    const savedLang = localStorage.getItem('aeox_lang') || 'en';
    if (window.__INITIAL_DATA__) {
      const d = window.__INITIAL_DATA__;
      setProducts(d.products || []);
      setSiteConfig(d.siteConfig || {});
      setCategories(d.categories || []);
      if (d.productIdQuery) {
        const p = (d.products || []).find(pr => pr.id === d.productIdQuery || pr.shortId === d.productIdQuery);
        if (p) { setDetailProduct(p); setShowDetail(true); document.body.style.overflow = 'hidden'; }
      }
      api(`/api/i18n?lang=${savedLang}`).catch(() => ({ lang: 'en', t: {} })).then(i18n => { if (i18n) setI18nData(i18n); });
      api('/api/samples').then(s => Array.isArray(s) ? setSamples(s.filter(x => x.enabled)) : setSamples([])).catch(() => {});
    } else {
      Promise.all([
        api('/api/products').catch(() => []),
        api('/api/config/site').catch(() => ({})),
        api('/api/config/categories').catch(() => []),
        api(`/api/i18n?lang=${savedLang}`).catch(() => ({ lang: 'en', t: {} }))
      ]).then(([prods, site, cats, i18n]) => {
        setProducts(prods);
        setSiteConfig(site);
        setCategories(cats);
        setI18nData(i18n);
      });
      api('/api/samples').then(s => Array.isArray(s) ? setSamples(s.filter(x => x.enabled)) : setSamples([])).catch(() => {});
    }
  }, []);

  const lang = i18nData.lang || 'en';
  const tr = i18nData.t || {};

  const q = searchQuery.toLowerCase().trim();
  let filtered = products.filter(p => {
    if (p.status === 'archived') return false;
    if (selectedCatId && p.categoryId !== selectedCatId) return false;
    if (q) {
      const title = (t(p.title, lang)).toLowerCase();
      const desc = (t(p.desc, lang)).toLowerCase();
      return title.includes(q) || desc.includes(q);
    }
    return true;
  });

  if (priceFilter === 'paid') filtered = filtered.filter(p => Number(p.price) > 0);
  else if (priceFilter === 'free') filtered = filtered.filter(p => Number(p.price) === 0);

  const isSearching = q.length > 0;

  function openDetail(product) {
    setDetailProduct(product);
    setShowDetail(true);
    document.body.style.overflow = 'hidden';
  }

  function closeDetail() {
    setShowDetail(false);
    document.body.style.overflow = '';
  }

  function handlePageChange(page) {
    setProductPage(page);
    const el = document.getElementById('products-section');
    if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
  }

  const siteName = siteConfig?.siteName || 'AEOX';
  const siteDesc = siteConfig?.siteDescription || tr.hero?.sub || 'Curated books for curious minds';
  const copyright = siteConfig?.footerCopyright || '\u00A9 2026 AEOX';
  const featuredProducts = products.filter(p => p.featured && p.status !== 'archived');
  const sampleProducts = samples.filter(s => s.enabled).map(s => {
    const p = s.productId ? products.find(pr => pr.id === s.productId && pr.status !== 'archived') : null;
    return {
      id: s.id,
      shortId: s.shortId,
      title: s.title || (p ? p.title : {}),
      cover: s.cover || (p ? p.cover : ''),
      price: p ? p.price : 0,
      sampleEnabled: true,
      productId: s.productId
    };
  });
  const hasFeatured = featuredProducts.length > 0;
  const hasSamples = sampleProducts.length > 0;
  const [shelfTab, setShelfTab] = useState(hasFeatured ? 'picks' : 'samples');
  const shelfData = shelfTab === 'picks' ? featuredProducts : sampleProducts;

  const perPage = 12;
  const start = (productPage - 1) * perPage;
  const paginated = filtered.slice(start, start + perPage);
  const totalPages = Math.ceil(filtered.length / perPage) || 1;

  return html`
      <${I18nContext.Provider} value=${{ lang, t: tr }}>
        <${Nav} siteName=${siteName} logo=${siteConfig?.logo} searchQuery=${searchQuery} onSearch=${v => { setSearchQuery(v); setProductPage(1); }} availableLangs=${siteConfig?.availableLangs} />
        ${!isSearching && html`
          <${Hero} siteName=${siteName} siteDescription=${siteDesc} heroTagline=${siteConfig?.heroTagline} productCount=${products.length} />
        `}
        ${!isSearching && (hasFeatured || hasSamples) && html`
          <section class="shelf fade-up">
            <div class="shelf-inner">
              <div class="shelf-head">
                ${hasFeatured && hasSamples ? html`
                  <div style="display:flex;gap:4px;">
                    <button onClick=${() => setShelfTab('picks')} style="padding:6px 14px;font-size:13px;font-weight:500;border-radius:20px;border:1px solid ${shelfTab === 'picks' ? 'var(--accent)' : 'var(--border)'};background:${shelfTab === 'picks' ? 'var(--accent)' : 'transparent'};color:${shelfTab === 'picks' ? '#fff' : 'var(--text-muted)'};cursor:pointer;">${tr.section?.editorsPicks || "Editor's Picks"}</button>
                    <button onClick=${() => setShelfTab('samples')} style="padding:6px 14px;font-size:13px;font-weight:500;border-radius:20px;border:1px solid ${shelfTab === 'samples' ? 'var(--accent)' : 'var(--border)'};background:${shelfTab === 'samples' ? 'var(--accent)' : 'transparent'};color:${shelfTab === 'samples' ? '#fff' : 'var(--text-muted)'};cursor:pointer;">${tr.section?.freePreview || 'Free Preview'}</button>
                  </div>
                ` : html`
                  <div class="shelf-title">${hasFeatured ? (tr.section?.editorsPicks || "Editor's Picks") : (tr.section?.freePreview || 'Free Preview')}</div>
                `}
              </div>
              <div class="shelf-scroll">
                ${shelfData.map(product => {
                  const title = t(product.title, lang);
                  const isSample = product.sampleEnabled || shelfTab === 'samples';
                  return isSample ? html`
                    <a key=${product.id} href="/read/${product.shortId}" class="shelf-book" style="text-decoration:none;color:inherit;">
                      <div class="shelf-cover">
                        ${product.cover
                          ? html`<img src=${product.cover} alt=${title} loading="lazy" />`
                          : html`<div class="placeholder">\u{1F4D6}</div>`
                        }
                      </div>
                      <div class="shelf-title-text">${title}</div>
                      <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
                        <span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--green-bg);color:var(--green);font-weight:500;">FREE PREVIEW</span>
                      </div>
                    </a>
                  ` : html`
                    <div key=${product.id} class="shelf-book" onClick=${() => openDetail(product)} role="button" tabindex="0"
                      onKeyDown=${e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(product); } }}>
                      <div class="shelf-cover">
                        ${product.cover
                          ? html`<img src=${product.cover} alt=${title} loading="lazy" />`
                          : html`<div class="placeholder">\u{1F4D6}</div>`
                        }
                      </div>
                      <div class="shelf-title-text">${title}</div>
                      <div class="shelf-meta">${Number(product.price) === 0 ? (tr.product?.free || 'FREE') : '$' + Number(product.price).toFixed(2)}</div>
                    </div>
                  `;
                })}
              </div>
            </div>
          </section>
        `}
        <main id="main-content" class="container">
        ${isSearching && html`
          <div class="search-banner">
            <span>Search: "${searchQuery}"</span>
            <span class="search-banner-count">${filtered.length} ${tr.search?.result || 'result'}${filtered.length !== 1 ? (tr.search?.results || 's') : ''}</span>
            <button class="search-banner-clear" onClick=${() => setSearchQuery('')}>${tr.search?.clear || 'Clear'}</button>
          </div>
        `}
        <${PriceFilter} selected=${priceFilter} onSelect=${key => { setPriceFilter(key); setProductPage(1); }} />
        <${CategoryChips} categories=${categories} selectedId=${selectedCatId} onSelect=${id => { setSelectedCatId(id); setProductPage(1); }} />
        <section id="products-section" class="fade-up">
          <div class="list">
            ${paginated.map(p => html`<${ProductListItem} key=${p.id} product=${p} onClick=${openDetail} />`)}
          </div>
          <${Pagination} page=${productPage} totalPages=${totalPages} onChange=${handlePageChange} />
        </section>
        ${isSearching && filtered.length === 0 && html`<div class="empty">${tr.search?.noResults || 'No results for'} "${searchQuery}"</div>`}
        ${!isSearching && html`
          <${FaqSection} faq=${siteConfig?.faq} refundPolicy=${siteConfig?.refundPolicy} />
        `}
      </main>
      <${Footer} copyright=${copyright} />
      <${DetailSheet} product=${detailProduct} show=${showDetail} onClose=${closeDetail} categories=${categories} allProducts=${products} paymentMode=${siteConfig?.paymentMode || 'kofi'} globalKofiLink=${siteConfig?.kofiLink || ''} onProductClick=${openDetail} />
      <${ChatWidget} products=${products} onProductClick=${openDetail} />
    <//>
  `;
}

render(html`<${App} />`, document.getElementById('app'));

function initShelfDrag() {
  document.querySelectorAll('.shelf-scroll').forEach(el => {
    if (el._dragInit) return;
    el._dragInit = true;
    let isDown = false, startX, scrollLeft;
    el.addEventListener('mousedown', e => { isDown = true; el.classList.add('dragging'); startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
    el.addEventListener('mouseleave', () => { isDown = false; el.classList.remove('dragging'); });
    el.addEventListener('mouseup', () => { isDown = false; el.classList.remove('dragging'); });
    el.addEventListener('mousemove', e => { if (!isDown) return; e.preventDefault(); const x = e.pageX - el.offsetLeft; el.scrollLeft = scrollLeft - (x - startX) * 1.5; });
    el.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollLeft += e.deltaY; } }, { passive: false });
  });
}
new MutationObserver(() => requestAnimationFrame(initShelfDrag)).observe(document.getElementById('app'), { childList: true, subtree: true });
initShelfDrag();
