const { loadJson, saveJson, withLock } = require('./store');
const { generateId } = require('./utils');

async function createOrder({ productId, productTitle, shortId, stripeSessionId, stripePaymentIntent, amount, currency, customerEmail, customerName, downloadToken, leadType }) {
  return withLock('orders.json', async () => {
    const orders = await loadJson('orders.json', []);
    const order = {
      id: generateId('ord'),
      productId: productId || '',
      productTitle: productTitle || '',
      shortId: shortId || '',
      stripeSessionId: stripeSessionId || '',
      stripePaymentIntent: stripePaymentIntent || '',
      amount: amount || 0,
      currency: currency || 'usd',
      customerEmail: customerEmail || '',
      customerName: customerName || '',
      status: 'paid',
      refundStatus: 'none',
      stripeRefundId: '',
      refundNote: '',
      downloadToken: downloadToken || '',
      leadType: leadType || 'paid',
      createdAt: new Date().toISOString()
    };
    orders.unshift(order);
    await saveJson('orders.json', orders);
    return order;
  });
}

async function getOrders(filter) {
  const orders = await loadJson('orders.json', []);
  if (!filter) return orders;
  if (filter.status) {
    return orders.filter(o => o.status === filter.status);
  }
  if (filter.refundStatus) {
    return orders.filter(o => o.refundStatus === filter.refundStatus);
  }
  return orders;
}

async function getOrderStats() {
  const orders = await loadJson('orders.json', []);
  const paidOrders = orders.filter(o => o.leadType === 'paid' || (!o.leadType && o.amount > 0));
  const totalSales = paidOrders.length;
  const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const refundedOrders = paidOrders.filter(o => o.refundStatus === 'refunded');
  const totalRefunded = refundedOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const netRevenue = totalRevenue - totalRefunded;
  const leadsOptedIn = orders.filter(o => o.leadType === 'opted_in').length;
  const leadsSkipped = orders.filter(o => o.leadType === 'skipped').length;
  return { totalSales, totalRevenue, totalRefunds: refundedOrders.length, totalRefunded, netRevenue, leadsOptedIn, leadsSkipped };
}

async function updateOrderStatus(orderId, updates) {
  return withLock('orders.json', async () => {
    const orders = await loadJson('orders.json', []);
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx === -1) return null;
    for (const field of ['status', 'refundStatus', 'refundNote', 'refundedAt', 'stripeRefundId']) {
      if (updates[field] !== undefined) orders[idx][field] = updates[field];
    }
    if (updates.refundStatus === 'refunded' && !updates.refundedAt) {
      orders[idx].refundedAt = new Date().toISOString();
    }
    if (updates.refundStatus === 'refunded' && orders[idx].status !== 'refunded') {
      orders[idx].status = 'refunded';
    }
    if (updates.refundStatus === 'none' && orders[idx].status === 'refunded') {
      orders[idx].status = 'paid';
      orders[idx].refundedAt = '';
      orders[idx].stripeRefundId = '';
    }
    await saveJson('orders.json', orders);
    return orders[idx];
  });
}

async function migrateOrdersConsistency() {
  return withLock('orders.json', async () => {
    const orders = await loadJson('orders.json', []);
    let changed = false;
    for (const o of orders) {
      if (o.status === 'refunded' && o.refundStatus !== 'refunded') {
        o.refundStatus = 'refunded';
        if (!o.refundedAt) o.refundedAt = new Date().toISOString();
        changed = true;
      }
      if (o.refundStatus === 'refunded' && o.status !== 'refunded') {
        o.status = 'refunded';
        changed = true;
      }
      if (o.refundStatus === 'pending_review' || o.refundStatus === 'rejected') {
        o.refundStatus = 'none';
        if (o.status === 'refunded') o.status = 'paid';
        changed = true;
      }
      if (o.stripeRefunded !== undefined) {
        delete o.stripeRefunded;
        changed = true;
      }
      if (o.stripeRefundId === undefined) {
        o.stripeRefundId = '';
        changed = true;
      }
    }
    if (changed) {
      await saveJson('orders.json', orders);
    }
    return changed;
  });
}

module.exports = { createOrder, getOrders, getOrderStats, updateOrderStatus, migrateOrdersConsistency };
