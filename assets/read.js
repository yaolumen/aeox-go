// @ts-check
import { render, h } from './lib/preact.module.js';
import { useState, useEffect } from './lib/hooks.module.js';
import htm from './lib/htm.module.js';
import { api } from './lib/api.js';

const html = htm.bind(h);

function renderMarkdown(md) {
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
  out = out.replace(/^\- (.+)$/gm, '<li>$1</li>');
  out = out.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  out = out.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  out = out.replace(/<\/ul>\s*<ul>/g, '');
  out = out.replace(/\n{2,}/g, '</p><p>');
  out = out.replace(/\n/g, '<br>');
  out = '<p>' + out + '</p>';
  out = out.replace(/<p>\s*<(h[1-3]|pre|ul)/g, '<$1');
  out = out.replace(/<\/(h[1-3]|pre|ul)>\s*<\/p>/g, '</$1>');
  out = out.replace(/<p>\s*<\/p>/g, '');
  return out;
}

function t(obj, lang) {
  if (!obj || typeof obj === 'string') return obj || '';
  return obj[lang] || obj.en || obj.zh || Object.values(obj).find(v => v) || '';
}

function Reader() {
  const [sample, setSample] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('en');

  useEffect(() => {
    const shortId = location.pathname.split('/read/')[1]?.split('?')[0] || '';
    if (!shortId) return;

    if (window.__INITIAL_DATA__) {
      const d = window.__INITIAL_DATA__;
      setSample(d.sample || null);
      setProducts(d.products || []);
      setCategories(d.categories || []);
      api('/api/sample/view', { method: 'POST', body: JSON.stringify({ shortId }) }).catch(() => {});
    } else {
      api(`/api/samples/${shortId}`).then(s => {
        if (s.error) return;
        setSample(s);
        api('/api/products').then(prods => setProducts(prods)).catch(() => {});
        api('/api/config/categories').then(cats => setCategories(cats || [])).catch(() => {});
        api('/api/sample/view', { method: 'POST', body: JSON.stringify({ shortId }) }).catch(() => {});
      }).catch(() => {});
    }

    const savedLang = localStorage.getItem('aeox_lang') || (navigator.language || 'en').slice(0, 2);
    setLang(savedLang);
  }, []);

  const content = sample?.content?.[lang] || sample?.content?.en || sample?.content?.zh || '';
  const availableLangs = sample?.content ? Object.keys(sample.content).filter(k => sample.content[k]?.trim()) : [];
  const sampleTitle = typeof sample?.title === 'object' ? t(sample.title, lang) : (sample?.title || '');
  const coverUrl = sample?.cover || '';

  const linkedProduct = sample?.productId ? products.find(p => p.id === sample.productId) : null;
  const buyLink = sample?.buyLink || linkedProduct?.kofiLink || linkedProduct?.stripeLink || '';
  const isFree = linkedProduct && Number(linkedProduct.price) === 0;

  const related = buildRelated(sample, products, categories, lang);

  async function submitEmail(e) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await api('/api/sample/notify', {
        method: 'POST',
        body: JSON.stringify({ shortId: sample.shortId, email: email.trim(), lang })
      });
      if (data.success) setSubmitted(true);
      else setError(data.error || '提交失败');
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!sample) {
    return html`
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);">
        <div class="spinner" style="width:24px;height:24px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;"></div>
      </div>
    `;
  }

  return html`
    <div style="min-height:100vh;background:var(--bg);">
      <nav style="background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:30;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;">
        <a href="/" style="display:flex;align-items:center;gap:6px;text-decoration:none;color:var(--text);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span style="font-size:14px;font-weight:500;">${lang === 'zh' ? '返回商城' : (lang === 'es' ? 'Volver a la tienda' : (lang === 'de' ? 'Zurück zum Shop' : 'Back to Store'))}</span>
        </a>
        <div style="display:flex;align-items:center;gap:8px;">
          ${availableLangs.length > 1 && availableLangs.map(l => html`
            <button key=${l} onClick=${() => setLang(l)}
              style="padding:4px 10px;font-size:11px;border-radius:20px;border:1px solid ${lang === l ? 'var(--accent)' : 'var(--border)'};background:${lang === l ? 'var(--accent)' : 'var(--surface)'};color:${lang === l ? '#fff' : 'var(--text-muted)'};cursor:pointer;">
              ${l.toUpperCase()}
            </button>
          `)}
        </div>
      </nav>

      <div style="max-width:720px;margin:0 auto;padding:32px 20px;">
        ${coverUrl && html`
          <div style="text-align:center;margin-bottom:24px;">
            <img src=${coverUrl} alt=${sampleTitle} style="max-height:160px;object-fit:contain;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.08);" />
          </div>
        `}
        <h1 style="font-size:24px;font-weight:700;font-family:var(--font-serif);margin-bottom:8px;text-align:center;">${sampleTitle}</h1>
        <div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:32px;">
          Free Preview
        </div>

        <div class="reader-content" style="border-top:1px solid var(--border);padding-top:32px;" dangerouslySetInnerHTML=${{ __html: renderMarkdown(content) }} />

        <div style="margin-top:40px;padding:24px;background:var(--surface);border:2px solid var(--accent);border-radius:12px;">
          ${buyLink ? html`
            <div style="font-size:15px;font-weight:600;color:var(--accent);margin-bottom:12px;">Want the full edition?</div>
            <a href=${buyLink} target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:var(--accent);color:#fff;font-size:13px;font-weight:500;text-decoration:none;border-radius:8px;">
              Get the Full Book
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
            ${linkedProduct && Number(linkedProduct.price) > 0 && html`
              <span style="font-size:12px;color:var(--text-muted);margin-left:8px;">$${Number(linkedProduct.price).toFixed(2)}</span>
            `}
          ` : html`
            <div style="font-size:15px;font-weight:600;color:var(--accent);margin-bottom:4px;">Enjoying this preview?</div>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Leave your email to get notified when the full edition is available.</p>
            ${submitted ? html`
              <div style="padding:12px;background:var(--green-bg);color:var(--green);border-radius:8px;font-size:13px;font-weight:500;">You're on the list! We'll notify you when it's available.</div>
            ` : html`
              <form onSubmit=${submitEmail} style="display:flex;gap:8px;">
                <input type="email" value=${email} onInput=${e => setEmail(e.target.value)} placeholder="your@email.com" required
                  style="flex:1;padding:10px 14px;font-size:13px;background:var(--bg);border:1px solid var(--border);border-radius:8px;outline:none;" />
                <button type="submit" disabled=${submitting}
                  style="padding:10px 20px;background:var(--accent);color:#fff;font-size:13px;font-weight:500;border:none;cursor:pointer;border-radius:8px;white-space:nowrap;">
                  ${submitting ? '...' : 'Notify me'}
                </button>
              </form>
              ${error && html`<p style="font-size:11px;color:var(--red);margin-top:6px;">${error}</p>`}
              <p style="font-size:10px;color:var(--text-muted);margin-top:8px;">We respect your privacy. Unsubscribe at any time.</p>
            `}
          `}
        </div>

        ${related.length > 0 && html`
          <div style="margin-top:24px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:8px;">You might also like</div>
            ${related.map((rp, i) => {
              const rpTitle = rp.title || '';
              const rpLink = rp.link || '/';
              return html`
                <a key=${i} href=${rpLink} ${rp.external ? 'target="_blank" rel="noopener"' : ''} style="display:flex;gap:12px;align-items:center;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:8px;text-decoration:none;color:var(--text);">
                  ${rp.cover && html`<img src=${rp.cover} alt=${rpTitle} style="width:36px;height:50px;object-fit:cover;border-radius:4px;" />`}
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:500;">${rpTitle}</div>
                    ${rp.price && html`<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${rp.price}</div>`}
                    ${rp.external && html`<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">External link</div>`}
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                </a>
              `;
            })}
          </div>
        `}
      </div>
    </div>
  `;
}

function buildRelated(sample, products, categories, lang) {
  if (!sample || !products.length) return [];
  const mode = sample.upsellMode || 'auto';
  if (mode === 'none') return [];
  if (mode === 'manual') {
    const rp = sample.relatedProducts || [];
    return rp.map(r => {
      if (r.productId) {
        const p = products.find(pr => pr.id === r.productId);
        if (p && p.status !== 'archived') return {
          title: t(p.title, lang), cover: p.cover || '',
          link: p.kofiLink || p.stripeLink || `/?id=${p.id}`,
          price: Number(p.price) > 0 ? `$${Number(p.price).toFixed(2)}` : 'FREE',
          external: !!(p.kofiLink || p.stripeLink)
        };
      }
      return { title: r.title || '', cover: r.cover || '', link: r.link || '#', price: r.price || '', external: true };
    }).filter(r => r.title);
  }
  const linkedProduct = sample.productId ? products.find(p => p.id === sample.productId) : null;
  const selfId = linkedProduct?.id;
  let myCatId = linkedProduct?.categoryId || '';
  if (!myCatId && sample.category) {
    const cat = (categories || []).find(c => c.slug === sample.category);
    if (cat) myCatId = cat.id;
  }
  if (myCatId) {
    const sameCategory = products.filter(p =>
      p.id !== selfId && p.status !== 'archived' && Number(p.price) > 0 &&
      p.categoryId === myCatId
    );
    if (sameCategory.length > 0) return sameCategory.slice(0, 2).map(p => ({
      title: t(p.title, lang), cover: p.cover || '', link: `/?id=${p.id}`,
      price: `$${Number(p.price).toFixed(2)}`, external: false
    }));
    const mySeries = (categories || []).find(c => c.id === myCatId)?.slug?.split('-')[0] || '';
    if (mySeries) {
      const siblingCatIds = (categories || []).filter(c => c.slug?.split('-')[0] === mySeries && c.id !== myCatId).map(c => c.id);
      const sameSeries = products.filter(p =>
        p.id !== selfId && p.status !== 'archived' && Number(p.price) > 0 && siblingCatIds.includes(p.categoryId)
      );
      if (sameSeries.length > 0) return sameSeries.slice(0, 2).map(p => ({
        title: t(p.title, lang), cover: p.cover || '', link: `/?id=${p.id}`,
        price: `$${Number(p.price).toFixed(2)}`, external: false
      }));
    }
  }
  const featured = products.filter(p =>
    p.id !== selfId && p.status !== 'archived' && Number(p.price) > 0 && p.featured
  );
  if (featured.length > 0) return featured.slice(0, 2).map(p => ({
    title: t(p.title, lang), cover: p.cover || '', link: `/?id=${p.id}`,
    price: `$${Number(p.price).toFixed(2)}`, external: false
  }));
  return [];
}

render(html`<${Reader} />`, document.getElementById('app'));
