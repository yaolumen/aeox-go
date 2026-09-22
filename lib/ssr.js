// @ts-check
'use strict';

const fs = require('fs');
const path = require('path');
const { loadJson, DEFAULT_SITE_CONFIG } = require('./store');
const { BASE_URL } = require('./utils');

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function t(obj, lang) {
  if (!obj || typeof obj === 'string') return obj || '';
  return obj[lang] || obj.en || obj.zh || Object.values(obj).find(v => v) || '';
}

function ogTags({ title, description, url, image, type }) {
  const lines = [];
  lines.push(`<meta property="og:title" content="${esc(title)}" />`);
  lines.push(`<meta property="og:description" content="${esc(description)}" />`);
  lines.push(`<meta property="og:url" content="${esc(url)}" />`);
  lines.push(`<meta property="og:type" content="${type || 'website'}" />`);
  if (image) lines.push(`<meta property="og:image" content="${esc(image)}" />`);
  lines.push(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`);
  lines.push(`<meta name="twitter:title" content="${esc(title)}" />`);
  lines.push(`<meta name="twitter:description" content="${esc(description)}" />`);
  if (image) lines.push(`<meta name="twitter:image" content="${esc(image)}" />`);
  return lines.join('\n  ');
}

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function homepageLd(siteName, siteDesc, url, image) {
  const schema = { '@context': 'https://schema.org', '@type': 'WebSite', name: siteName, description: siteDesc, url };
  if (image) schema.image = image;
  return jsonLd(schema);
}

function productLd(product, url) {
  const title = t(product.title, 'en');
  const desc = t(product.desc, 'en');
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description: desc,
    url,
    image: product.cover || '',
    brand: { '@type': 'Brand', name: 'AEOX' },
    offers: {
      '@type': 'Offer',
      price: Number(product.price || 0).toFixed(2),
      priceCurrency: 'USD',
      availability: Number(product.price) === 0 ? 'https://schema.org/InStock' : 'https://schema.org/InStock'
    }
  };
  return jsonLd(schema);
}

function articleLd(title, desc, url, image, datePublished) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    name: title,
    description: desc,
    url,
    datePublished: datePublished || new Date().toISOString().slice(0, 10),
    author: { '@type': 'Organization', name: 'AEOX' }
  };
  if (image) schema.image = image;
  return jsonLd(schema);
}

function injectHead(html, { title, description, extra }) {
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  if (out.includes('meta name="description"')) {
    out = out.replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(description)}" />`);
  } else {
    out = out.replace('</head>', `  <meta name="description" content="${esc(description)}" />\n</head>`);
  }
  if (extra) out = out.replace('</head>', extra + '\n</head>');
  return out;
}

function injectData(html, data) {
  const script = `<script>window.__INITIAL_DATA__=${JSON.stringify(data)};</script>`;
  return html.replace(/<script type="module" src="/, script + '\n  <script type="module" src="');
}

function staticHomepageBody(siteName, siteDesc, heroTagline, products, samples, categories) {
  const activeProducts = products.filter(p => p.status !== 'archived');
  const activeSamples = samples.filter(s => s.enabled);
  let body = '';

  body += `<section class="hero"><div class="hero-top"><div>`;
  body += `<div class="hero-label">${esc(heroTagline || 'Digital Products')}</div>`;
  body += `<h1 class="hero-title">${esc(siteName)}</h1>`;
  body += `<p class="hero-sub">${esc(siteDesc)}</p>`;
  body += `</div><div class="hero-right"><div class="hero-count">${activeProducts.length}</div><div class="hero-count-label">products & counting</div></div></div></section>`;

  const featured = activeProducts.filter(p => p.featured);
  if (featured.length > 0 || activeSamples.length > 0) {
    const items = featured.length > 0 ? featured : activeSamples.map(s => {
      const p = s.productId ? activeProducts.find(pr => pr.id === s.productId) : null;
      return { id: s.id, shortId: s.shortId, title: s.title || (p ? p.title : {}), cover: s.cover || (p ? p.cover : ''), price: p ? p.price : 0, sampleEnabled: true };
    });
    body += `<section class="shelf fade-up"><div class="shelf-inner"><div class="shelf-head"><div class="shelf-title">Editor's Picks</div></div><div class="shelf-scroll">`;
    for (const item of items.slice(0, 8)) {
      const title = t(item.title, 'en');
      const isFree = Number(item.price) === 0;
      if (item.sampleEnabled) {
        body += `<a href="/read/${item.shortId}" class="shelf-book" style="text-decoration:none;color:inherit;"><div class="shelf-cover">${item.cover ? `<img src="${esc(item.cover)}" alt="${esc(title)}" loading="lazy" />` : '<div class="placeholder">\u{1F4D6}</div>'}</div><div class="shelf-title-text">${esc(title)}</div><div style="display:flex;align-items:center;gap:4px;margin-top:4px;"><span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--green-bg);color:var(--green);font-weight:500;">FREE PREVIEW</span></div></a>`;
      } else {
        body += `<div class="shelf-book"><div class="shelf-cover">${item.cover ? `<img src="${esc(item.cover)}" alt="${esc(title)}" loading="lazy" />` : '<div class="placeholder">\u{1F4D6}</div>'}</div><div class="shelf-title-text">${esc(title)}</div><div class="shelf-meta">${isFree ? 'FREE' : '$' + Number(item.price).toFixed(2)}</div></div>`;
      }
    }
    body += `</div></div></section>`;
  }

  body += `<main id="main-content" class="container"><section id="products-section" class="fade-up"><div class="list">`;
  for (const p of activeProducts) {
    const title = t(p.title, 'en');
    const desc = t(p.desc, 'en');
    const isFree = Number(p.price) === 0;
    body += `<div class="list-item"><div class="list-thumb">${p.cover ? `<img src="${esc(p.cover)}" alt="${esc(title)}" loading="lazy" />` : '<div class="placeholder">\u{1F4D6}</div>'}</div><div class="list-info"><div class="list-title">${esc(title)}</div><div class="list-desc">${esc(desc)}</div></div><div class="list-right">${isFree ? '<span class="list-badge-free">FREE</span>' : ''}<span class="list-format">${p.format || 'PDF'}</span><button class="list-dl">${isFree ? 'FREE' : '$' + Number(p.price).toFixed(2)}</button></div></div>`;
  }
  body += `</div></section></main>`;

  body += `<footer class="footer"><div class="footer-inner"><div><span>\u00A9 2026 AEOX. All rights reserved.</span><p class="footer-corp">AEOX is a digital products hub operated by <a href="https://me.yaolumen.com" target="_blank" rel="noopener">YAOLUMEN TECHNOLOGIES LTD</a>.</p></div><div class="footer-links"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="cookies.html">Cookies</a><a href="dmca.html">Copyright</a></div></div></footer>`;

  return body;
}

function staticReadBody(sample, product) {
  const title = t(sample.title, 'en');
  const content = sample.content?.en || sample.content?.zh || '';
  let body = '';

  body += `<nav style="background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:30;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;">`;
  body += `<a href="/" style="display:flex;align-items:center;gap:6px;text-decoration:none;color:var(--text);"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span style="font-size:14px;font-weight:500;">Back to Store</span></a>`;
  body += `</nav>`;

  body += `<div style="max-width:720px;margin:0 auto;padding:32px 20px;">`;
  if (sample.cover) {
    body += `<div style="text-align:center;margin-bottom:24px;"><img src="${esc(sample.cover)}" alt="${esc(title)}" style="max-height:160px;object-fit:contain;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.08);" /></div>`;
  }
  body += `<h1 style="font-size:24px;font-weight:700;font-family:var(--font-serif);margin-bottom:8px;text-align:center;">${esc(title)}</h1>`;
  body += `<div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:32px;">Free Preview</div>`;

  if (content) {
    body += `<div class="reader-content" style="border-top:1px solid var(--border);padding-top:32px;">${renderMd(content)}</div>`;
  }

  if (product) {
    const buyLink = sample.buyLink || product.kofiLink || product.stripeLink || '';
    body += `<div style="margin-top:40px;padding:24px;background:var(--surface);border:2px solid var(--accent);border-radius:12px;">`;
    if (buyLink) {
      body += `<div style="font-size:15px;font-weight:600;color:var(--accent);margin-bottom:12px;">Want the full edition?</div>`;
      body += `<a href="${esc(buyLink)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:var(--accent);color:#fff;font-size:13px;font-weight:500;text-decoration:none;border-radius:8px;">Get the Full Book</a>`;
      if (Number(product.price) > 0) body += `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;">$${Number(product.price).toFixed(2)}</span>`;
    } else {
      body += `<div style="font-size:15px;font-weight:600;color:var(--accent);margin-bottom:4px;">Enjoying this preview?</div>`;
      body += `<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Leave your email to get notified when the full edition is available.</p>`;
    }
    body += `</div>`;
  }
  body += `</div>`;

  return body;
}

function renderMd(md) {
  if (!md) return '';
  let out = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  out = out.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  out = out.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/^[-] (.+)$/gm, '<li>$1</li>');
  out = out.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  out = out.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  out = out.replace(/<\/ul>\s*<ul>/g, '');
  out = out.replace(/---/g, '<hr>');
  out = out.replace(/\n{2,}/g, '</p><p>');
  out = out.replace(/\n/g, '<br>');
  out = '<p>' + out + '</p>';
  out = out.replace(/<p>\s*<(h[1-3]|pre|ul|hr)/g, '<$1');
  out = out.replace(/<\/(h[1-3]|pre|ul)>\s*<\/p>/g, '</$1>');
  out = out.replace(/<p>\s*<\/p>/g, '');
  return out;
}

async function renderHomepage(productIdQuery) {
  const [siteConfig, products, categories, samples] = await Promise.all([
    loadJson('site-config.json', DEFAULT_SITE_CONFIG),
    loadJson('products.json', []),
    loadJson('categories.json', []),
    loadJson('samples.json', [])
  ]);

  const siteName = siteConfig.siteName || 'AEOX';
  const siteDesc = siteConfig.siteDescription || 'Curated digital products & resources, instant delivery.';
  const activeProducts = products.filter(p => p.status !== 'archived');
  const activeSamples = samples.filter(s => s.enabled);
  const logo = siteConfig.logo?.bannerSrc || siteConfig.logo?.src || '';

  let pageTitle = `${siteName} — Digital Products for Builders`;
  let pageDesc = siteDesc;
  let pageUrl = BASE_URL + '/';
  let pageImage = logo;
  let ld = homepageLd(siteName, siteDesc, pageUrl, logo);
  let extraHead = '';

  if (productIdQuery) {
    const product = activeProducts.find(p => p.id === productIdQuery || p.shortId === productIdQuery);
    if (product) {
      const pTitle = t(product.title, 'en');
      const pDesc = t(product.desc, 'en');
      pageTitle = `${pTitle} — ${siteName}`;
      pageDesc = pDesc || siteDesc;
      pageUrl = `${BASE_URL}/?id=${product.id}`;
      pageImage = product.cover || logo;
      ld = productLd(product, pageUrl);
    }
  }

  extraHead += ogTags({ title: pageTitle, description: pageDesc, url: pageUrl, image: pageImage, type: productIdQuery ? 'product' : 'website' });
  extraHead += '\n  ' + ld;
  extraHead += `\n  <link rel="canonical" href="${esc(pageUrl)}" />`;
  if (siteConfig.availableLangs) {
    for (const lang of siteConfig.availableLangs) {
      extraHead += `\n  <link rel="alternate" hreflang="${lang}" href="${esc(pageUrl)}" />`;
    }
  }

  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  html = injectHead(html, { title: pageTitle, description: pageDesc, extra: extraHead });
  html = html.replace('<div id="app"></div>', `<div id="app">${staticHomepageBody(siteName, siteDesc, siteConfig.heroTagline, activeProducts, activeSamples, categories)}</div>`);
  html = injectData(html, { siteConfig, products: activeProducts, categories, samples: activeSamples, productIdQuery });

  return html;
}

async function renderReadPage(shortId) {
  const [siteConfig, products, categories, samples] = await Promise.all([
    loadJson('site-config.json', DEFAULT_SITE_CONFIG),
    loadJson('products.json', []),
    loadJson('categories.json', []),
    loadJson('samples.json', [])
  ]);

  const sample = samples.find(s => s.shortId === shortId && s.enabled);
  if (!sample) return null;

  const siteName = siteConfig.siteName || 'AEOX';
  const sampleTitle = t(sample.title, 'en');
  const content = sample.content?.en || '';
  const pageUrl = `${BASE_URL}/read/${shortId}`;
  const pageImage = sample.cover || '';
  const pageDesc = content.slice(0, 160).replace(/[#*`\n]/g, ' ').trim() || `Free preview: ${sampleTitle}`;

  let pageTitle = `${sampleTitle} — Free Preview — ${siteName}`;

  const product = sample.productId ? products.find(p => p.id === sample.productId) : null;

  let extraHead = '';
  extraHead += ogTags({ title: sampleTitle, description: pageDesc, url: pageUrl, image: pageImage, type: 'article' });
  extraHead += '\n  ' + articleLd(sampleTitle, pageDesc, pageUrl, pageImage, sample.createdAt);
  extraHead += `\n  <link rel="canonical" href="${esc(pageUrl)}" />`;
  if (siteConfig.availableLangs) {
    for (const lang of siteConfig.availableLangs) {
      extraHead += `\n  <link rel="alternate" hreflang="${lang}" href="${esc(pageUrl)}" />`;
    }
  }

  let html = fs.readFileSync(path.join(__dirname, '..', 'read.html'), 'utf8');
  html = injectHead(html, { title: pageTitle, description: pageDesc, extra: extraHead });
  html = html.replace('<div id="app"></div>', `<div id="app">${staticReadBody(sample, product)}</div>`);
  html = injectData(html, { sample, products: products.filter(p => p.status !== 'archived'), categories, shortId });

  return html;
}

module.exports = { renderHomepage, renderReadPage, t, esc, ogTags, jsonLd, productLd, articleLd, renderMd };
