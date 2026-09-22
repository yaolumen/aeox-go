// @ts-check
const { loadJson, DEFAULT_SITE_CONFIG } = require('../lib/store');
const { BASE_URL } = require('../lib/utils');

async function sitemap(req, res) {
  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const seo = config.seo || DEFAULT_SITE_CONFIG.seo;
  const products = await loadJson('products.json', []);
  const samples = await loadJson('samples.json', []);
  const excludes = seo.sitemapExcludes || [];
  const now = new Date().toISOString().slice(0, 10);
  const urls = [`  <url>\n    <loc>${BASE_URL}/</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`];
  for (const p of products) {
    if (p.status === 'archived') continue;
    if (excludes.includes(p.id) || excludes.includes(p.shortId)) continue;
    urls.push(`  <url>\n    <loc>${BASE_URL}/?id=${p.id}</loc>\n    <lastmod>${p.createdAt || now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`);
  }
  for (const s of samples) {
    if (!s.enabled) continue;
    if (excludes.includes(s.shortId)) continue;
    urls.push(`  <url>\n    <loc>${BASE_URL}/read/${s.shortId}</loc>\n    <lastmod>${s.updatedAt || s.createdAt || now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`);
  }
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
}

async function robots(req, res) {
  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const seo = config.seo || DEFAULT_SITE_CONFIG.seo;
  const blockedPaths = seo.blockedPaths || ['/admin.html', '/download.html'];
  const blockAI = seo.blockAI !== false;
  const blockedBots = seo.blockedBots || [];
  const customAppend = seo.customRobotsAppend || '';
  let text = '';
  text += 'User-agent: *\n';
  text += 'Allow: /\n';
  for (const p of blockedPaths) {
    text += `Disallow: ${p}\n`;
  }
  text += '\n';
  if (blockAI && blockedBots.length > 0) {
    for (const bot of blockedBots) {
      text += `User-agent: ${bot}\n`;
      text += 'Disallow: /\n\n';
    }
  }
  text += `Sitemap: ${BASE_URL}/sitemap.xml\n`;
  const cross = seo.crossSiteSitemaps || [];
  for (const s of cross) {
    text += `Sitemap: ${s}\n`;
  }
  if (customAppend.trim()) {
    text += '\n' + customAppend.trim() + '\n';
  }
  res.type('text/plain');
  res.send(text);
}

async function llms(req, res) {
  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const seo = config.seo || {};
  const products = await loadJson('products.json', []);
  const samples = await loadJson('samples.json', []);
  const customIntro = seo.customLlmsIntro || '';
  const customSections = seo.customLlmsSections || '';
  let text = '';
  if (customIntro.trim()) {
    text += customIntro.trim() + '\n\n';
  } else {
    text += `# ${config.siteName || 'AEOX'}\n\n> ${config.siteDescription || 'Curated digital products. Instant delivery.'}\n\n`;
  }
  const items = products
    .filter((p) => p.status !== 'archived')
    .map((p) => `- [${p.title?.en || p.title?.zh || 'Untitled'}](${BASE_URL}/?id=${p.id}): ${(p.desc?.en || p.desc?.zh || '').slice(0, 80)}`)
    .join('\n');
  const sampleItems = samples
    .filter((s) => s.enabled)
    .map((s) => `- [Sample: ${s.title?.en || s.title?.zh || s.shortId}](${BASE_URL}/read/${s.shortId})`)
    .join('\n');
  text += `## Products\n\n${items}\n\n## Free Previews\n\n${sampleItems || 'No samples available yet.'}\n\n## Links\n\n- [Store](${BASE_URL}/)\n- [Sitemap](${BASE_URL}/sitemap.xml)\n`;
  const blockedNote = (seo.blockedPaths && seo.blockedPaths.length)
    ? `\n## Excluded Paths\n\nThe following paths are excluded from crawling: ${seo.blockedPaths.join(', ')}\n`
    : '';
  text += blockedNote;
  if (customSections.trim()) {
    text += '\n' + customSections.trim() + '\n';
  }
  res.type('text/plain');
  res.send(text);
}

async function aiTxt(req, res) {
  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const seo = config.seo || DEFAULT_SITE_CONFIG.seo;
  const allowCrawling = seo.aiAllowCrawling !== false;
  const allowTraining = seo.aiAllowTraining === true;
  const customRules = seo.aiCustomRules || '';
  let text = '';
  if (customRules.trim()) {
    text = customRules.trim() + '\n';
  } else {
    text = '# ai.txt\n# Generated from AEOX SEO settings\n\n';
    if (!allowCrawling) {
      text += 'User-agent: *\nDisallow: /\n';
    } else if (allowTraining) {
      text += 'User-agent: *\nAllow: /\n\n# Content may be used for AI training\n';
    } else {
      text += 'User-agent: *\nAllow: /\n\n# Content may be crawled for search/indexing\n# but may NOT be used for AI model training\n';
      text += '\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /\n\nUser-agent: Bytespider\nDisallow: /\n\nUser-agent: Anthropic-AI\nDisallow: /\n';
    }
  }
  res.type('text/plain');
  res.send(text);
}

module.exports = { sitemap, robots, llms, aiTxt };
