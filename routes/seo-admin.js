// @ts-check
const express = require('express');
const router = express.Router();
const { loadJson, saveJson, withLock, DEFAULT_SITE_CONFIG } = require('../lib/store');
const { adminSession } = require('../lib/auth');

router.put('/config/seo', adminSession, async (req, res) => {
  const { seo } = req.body;
  if (!seo || typeof seo !== 'object') {
    return res.status(400).json({ error: 'seo 配置无效' });
  }

  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const defaultSeo = DEFAULT_SITE_CONFIG.seo;

  const merged = {
    blockedPaths: Array.isArray(seo.blockedPaths) ? seo.blockedPaths : (config.seo?.blockedPaths || defaultSeo.blockedPaths),
    blockAI: typeof seo.blockAI === 'boolean' ? seo.blockAI : (config.seo?.blockAI ?? defaultSeo.blockAI),
    blockedBots: Array.isArray(seo.blockedBots) ? seo.blockedBots : (config.seo?.blockedBots || defaultSeo.blockedBots),
    customRobotsAppend: typeof seo.customRobotsAppend === 'string' ? seo.customRobotsAppend : (config.seo?.customRobotsAppend || ''),
    customLlmsIntro: typeof seo.customLlmsIntro === 'string' ? seo.customLlmsIntro : (config.seo?.customLlmsIntro || ''),
    customLlmsSections: typeof seo.customLlmsSections === 'string' ? seo.customLlmsSections : (config.seo?.customLlmsSections || ''),
    aiAllowCrawling: typeof seo.aiAllowCrawling === 'boolean' ? seo.aiAllowCrawling : (config.seo?.aiAllowCrawling ?? true),
    aiAllowTraining: typeof seo.aiAllowTraining === 'boolean' ? seo.aiAllowTraining : (config.seo?.aiAllowTraining ?? false),
    aiCustomRules: typeof seo.aiCustomRules === 'string' ? seo.aiCustomRules : (config.seo?.aiCustomRules || ''),
    sitemapExcludes: Array.isArray(seo.sitemapExcludes) ? seo.sitemapExcludes : (config.seo?.sitemapExcludes || []),
    crossSiteSitemaps: Array.isArray(seo.crossSiteSitemaps) ? seo.crossSiteSitemaps : (config.seo?.crossSiteSitemaps || [])
  };

  config.seo = merged;

  await withLock('site-config.json', async () => await saveJson('site-config.json', config));
  res.json({ success: true, seo: merged });
});

module.exports = router;
