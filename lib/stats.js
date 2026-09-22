// @ts-check
'use strict';

const { loadJson, saveJson } = require('./store');

/**
 * @param {'pv'|'checkout'|'download'|'sample_email'|'sample_view'} type
 * @param {string} productId
 * @returns {Promise<void>}
 */
async function recordStat(type, productId) {
  const DEFAULT = { events: [], byDay: {}, byProduct: {} };
  let stats = await loadJson('stats.json', DEFAULT);
  if (!stats || !stats.events) stats = { ...DEFAULT };
  const today = new Date().toISOString().slice(0, 10);
  const event = { type, productId, ts: Date.now(), day: today };
  stats.events.push(event);
  if (stats.events.length > 10000) stats.events = stats.events.slice(-10000);
  if (!stats.byDay[today]) stats.byDay[today] = { pv: 0, checkout: 0, download: 0 };
  stats.byDay[today][type]++;
  if (!stats.byProduct[productId]) stats.byProduct[productId] = { pv: 0, checkout: 0, download: 0 };
  stats.byProduct[productId][type]++;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  for (const d of Object.keys(stats.byDay)) {
    if (d < cutoff) delete stats.byDay[d];
  }
  const products = await loadJson('products.json', []);
  const activeIds = new Set(products.filter(p => p.status !== 'archived').map(p => p.id));
  for (const pid of Object.keys(stats.byProduct)) {
    if (!activeIds.has(pid)) delete stats.byProduct[pid];
  }
  await saveJson('stats.json', stats);
}

module.exports = {
  recordStat
};
