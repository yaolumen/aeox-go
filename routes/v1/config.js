// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, saveJson, withLock, DEFAULT_SITE_CONFIG } = require('../../lib/store');
const { maskSecretKey } = require('../../lib/utils');
const { apiKeyAuth, apiKeyAdminAuth } = require('../../lib/auth');

function sanitizeConfig(merged) {
  if (merged.security.sessionTimeoutWhitelist !== undefined && !merged.security.sessionTimeout) {
    merged.security.sessionTimeout = merged.security.sessionTimeoutWhitelist;
  }
  delete merged.security.sessionTimeoutWhitelist;
  delete merged.security.sessionTimeoutNormal;
  delete merged.security.ipWhitelistEnabled;
  delete merged.security.ipWhitelist;
  if (merged.security) merged.security.adminEntryKey = '';
  if (merged.stripe && merged.stripe.secretKey) {
    const realKey = merged.stripe.secretKey;
    if (realKey.startsWith('rk_test_')) merged.stripe.mode = 'test';
    else if (realKey.startsWith('rk_live_')) merged.stripe.mode = 'live';
    merged.stripe.secretKey = maskSecretKey(realKey);
  }
  return merged;
}

function mergeConfig(old, data) {
  const incomingSec = { ...(data.security || {}) };
  if (!incomingSec.adminEntryKey && (old.security || {}).adminEntryKey) {
    incomingSec.adminEntryKey = old.security.adminEntryKey;
  } else if (!incomingSec.adminEntryKey) {
    delete incomingSec.adminEntryKey;
  }
  const incomingStripe = { ...(data.stripe || {}) };
  const oldStripe = old.stripe || {};
  if (incomingStripe.secretKey !== undefined) {
    const k = incomingStripe.secretKey;
    if (k.includes('****') || (k && !k.startsWith('rk_') && !k.startsWith('sk_'))) {
      incomingStripe.secretKey = oldStripe.secretKey || '';
    }
  } else {
    incomingStripe.secretKey = oldStripe.secretKey || '';
  }
  const merged = {
    ...DEFAULT_SITE_CONFIG,
    ...old,
    ...data,
    security: { ...(old.security || {}), ...incomingSec },
    seo: { ...(old.seo || {}), ...(data.seo || {}) },
    socialLinks: { ...(old.socialLinks || {}), ...(data.socialLinks || {}) },
    stripe: { ...DEFAULT_SITE_CONFIG.stripe, ...oldStripe, ...incomingStripe }
  };
  if (merged.stripe.secretKey && merged.stripe.secretKey.startsWith('rk_test_')) {
    merged.stripe.mode = 'test';
  } else if (merged.stripe.secretKey && merged.stripe.secretKey.startsWith('rk_live_')) {
    merged.stripe.mode = 'live';
  }
  return merged;
}

router.get('/site', apiKeyAuth, async (req, res) => {
  const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const merged = {
    ...DEFAULT_SITE_CONFIG,
    ...config,
    security: { ...DEFAULT_SITE_CONFIG.security, ...(config.security || {}) },
    seo: { ...DEFAULT_SITE_CONFIG.seo, ...(config.seo || {}) },
    socialLinks: { ...DEFAULT_SITE_CONFIG.socialLinks, ...(config.socialLinks || {}) },
    stripe: { ...DEFAULT_SITE_CONFIG.stripe, ...(config.stripe || {}) }
  };
  res.json({ ...sanitizeConfig(merged), _version: '2.4.2' });
});

router.put('/site', apiKeyAuth, apiKeyAdminAuth, async (req, res) => {
  const data = req.body || {};
  const old = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
  const merged = mergeConfig(old, data);
  const ok = await withLock('site-config.json', async () => await saveJson('site-config.json', merged));
  res.json({ success: ok, data: sanitizeConfig(merged) });
});

module.exports = router;
