// @ts-check
const express = require('express');
const router = express.Router();

const { accessLogMiddleware } = require('../../lib/auth');

router.use(accessLogMiddleware);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.4.2' });
});

router.use('/products', require('./products'));
router.use('/categories', require('./categories'));
router.use('/tags', require('./tags'));
router.use('/config', require('./config'));
router.use('/keys', require('./keys'));
router.use('/providers', require('./providers'));
router.use('/stats', require('./stats'));
router.use('/imports', require('./imports'));
router.use('/samples', require('./samples'));

module.exports = router;
