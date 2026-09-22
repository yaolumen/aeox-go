// @ts-check
const express = require('express');
const router = express.Router();

const { loadJson, DEFAULT_SITE_CONFIG } = require('../../lib/store');
const { apiKeyAuth } = require('../../lib/auth');

router.get('/dashboard', apiKeyAuth, async (req, res) => {
  const range = req.query.range || 'all';
  const products = await loadJson('products.json', []);
  const stats = await loadJson('stats.json', { events: [], byDay: {}, byProduct: {} });

  const now = new Date();
  let startDate = new Date(0);
  if (range === 'today') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'week') startDate = new Date(now - 7 * 86400000);
  if (range === 'month') startDate = new Date(now - 30 * 86400000);

  const startTs = startDate.getTime();
  const events = (stats.events || []).filter(e => e.ts >= startTs);

  const totalPv = events.filter(e => e.type === 'pv').length;
  const totalCheckout = events.filter(e => e.type === 'checkout').length;
  const totalDownload = events.filter(e => e.type === 'download').length;
  const totalRevenue = products.reduce((sum, p) => sum + (Number(p.stats?.sales || 0) * Number(p.price || 0)), 0);

  const trend = [];
  const days = range === 'today' ? 1 : range === 'week' ? 7 : 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const dayData = stats.byDay?.[d] || { pv: 0, checkout: 0, download: 0 };
    trend.push({ date: d, pv: dayData.pv || 0, checkout: dayData.checkout || 0, download: dayData.download || 0, revenue: 0 });
  }

  const productStats = stats.byProduct || {};
  const top5 = Object.entries(productStats)
    .map(([pid, s]) => {
      const p = products.find(x => x.id === pid);
      return { id: pid, title: p?.title?.zh || p?.title?.en || pid, pv: s.pv || 0, checkout: s.checkout || 0, download: s.download || 0 };
    })
    .sort((a, b) => b.pv - a.pv)
    .slice(0, 5);

  const funnel = {
    visit: totalPv,
    detail: totalPv,
    checkout: totalCheckout,
    download: totalDownload
  };

  res.json({
    overview: {
      totalProducts: products.length,
      totalPv,
      totalOrders: totalDownload,
      totalRevenue,
      conversionRate: totalPv > 0 ? (totalDownload / totalPv * 100).toFixed(1) : 0
    },
    trend,
    top5,
    funnel
  });
});

module.exports = router;
