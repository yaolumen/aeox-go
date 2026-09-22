// @ts-check
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const { loadJson, saveJson, markDirty, DEFAULT_SITE_CONFIG, DATA_DIR } = require('./store');
const { loadSync, saveSync, getClientIp } = require('./utils');

const ADMIN_HASH_FILE = path.join(DATA_DIR, 'admin-password.json');
const JWT_SECRET_FILE = path.join(DATA_DIR, 'jwt-secret.json');
const ENTRY_KEY_FILE = path.join(DATA_DIR, 'admin-entry.json');

const JWT_SECRET = process.env.JWT_SECRET || loadSync(JWT_SECRET_FILE, null)?.secret || (() => {
  const s = crypto.randomBytes(48).toString('hex');
  saveSync(JWT_SECRET_FILE, { secret: s, createdAt: new Date().toISOString() });
  return s;
})();

const ADMIN_ENTRY_KEY = process.env.ADMIN_ENTRY_KEY || loadSync(ENTRY_KEY_FILE, null)?.key || (() => {
  const k = crypto.randomBytes(6).toString('hex');
  saveSync(ENTRY_KEY_FILE, { key: k, createdAt: new Date().toISOString() });
  return k;
})();

/** @type {string|null} */
let _adminPasswordHash = null;
/** @type {string|null} */
let _adminPasswordSourceCache = null;

/**
 * @returns {Promise<void>}
 */
async function initAdminPassword() {
  const envPwd = process.env.ADMIN_PASSWORD;
  const stored = loadSync(ADMIN_HASH_FILE, null);

  if (envPwd && (!stored || !stored.hash || stored.source === 'default')) {
    _adminPasswordHash = await bcrypt.hash(envPwd, 10);
    _adminPasswordSourceCache = 'env';
    saveSync(ADMIN_HASH_FILE, {
      hash: _adminPasswordHash,
      source: 'env',
      updatedAt: new Date().toISOString()
    });
    if (!stored) {
      console.log('\n========================================');
      console.log('  首次启动：使用 ADMIN_PASSWORD 环境变量初始化密码');
      console.log('  请登录后到「站点设置 → 管理员账号」修改为自己的密码');
      console.log('========================================\n');
    }
    return;
  }

  if (stored && stored.hash) {
    _adminPasswordHash = stored.hash;
    _adminPasswordSourceCache = stored.source;
    return;
  }

  const defaultPwd = 'admin123456';
  _adminPasswordHash = await bcrypt.hash(defaultPwd, 10);
  _adminPasswordSourceCache = 'default';
  saveSync(ADMIN_HASH_FILE, {
    hash: _adminPasswordHash,
    source: 'default',
    initialPassword: defaultPwd,
    createdAt: new Date().toISOString()
  });
  console.log('\n========================================');
  console.log('  首次启动：默认 admin 密码为 ' + defaultPwd);
  console.log('  登录后可在站点设置中修改密码');
  console.log('========================================\n');
}

/**
 * @param {string} plain
 * @returns {Promise<boolean>}
 */
async function verifyAdminPassword(plain) {
  if (!_adminPasswordHash) return false;
  return bcrypt.compare(plain, _adminPasswordHash);
}

/**
 * @param {string} plain
 * @returns {Promise<void>}
 */
async function setAdminPassword(plain) {
  _adminPasswordHash = await bcrypt.hash(plain, 10);
  _adminPasswordSourceCache = 'user_changed';
  saveSync(ADMIN_HASH_FILE, {
    hash: _adminPasswordHash,
    source: 'user_changed',
    updatedAt: new Date().toISOString()
  });
}

/**
 * @returns {boolean}
 */
function isAdminPasswordInitial() {
  return _adminPasswordSourceCache === 'default';
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function adminSession(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录', code: 'NO_TOKEN' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminSession = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: '会话已过期，请重新登录', code: 'TOKEN_EXPIRED' });
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function adminEntryMiddleware(req, res, next) {
  try {
    const config = await loadJson('site-config.json', DEFAULT_SITE_CONFIG);
    const expectedKey = (config.security && config.security.adminEntryKey) || ADMIN_ENTRY_KEY;
    if (req.query.k === expectedKey) return next();
    return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>404 Not Found</title></head><body style="font-family:system-ui;background:#f5f5f5;color:#666;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1 style="font-size:72px;margin:0;color:#ccc">404</h1><p>Not Found</p></div></body></html>`);
  } catch (e) {
    return next();
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: '缺少 API Key', code: 'NO_API_KEY' });

  const keys = await loadJson('api-keys.json', []);
  const found = keys.find((k) => k.key === key && k.enabled !== false);
  if (!found) return res.status(401).json({ error: 'API Key 无效或已撤销', code: 'INVALID_API_KEY' });

  const scope = req.method === 'GET' ? 'read' : 'write';
  if (found.scopes && !found.scopes.some((s) => s === '*' || s === scope || s.startsWith(scope + ':'))) {
    return res.status(403).json({ error: '权限不足', code: 'INSUFFICIENT_SCOPE' });
  }

  found.lastUsedAt = new Date().toISOString();
  markDirty('api-keys.json');

  req.apiKeyObj = found;
  next();
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function accessLogMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/v1/health') return;
    const { appendAccessLog, getClientIp } = require('./utils');
    appendAccessLog({
      ts: new Date().toISOString(),
      keyId: req.apiKeyObj ? req.apiKeyObj.id : null,
      keyName: req.apiKeyObj ? req.apiKeyObj.name : null,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: getClientIp(req)
    });
  });
  next();
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function apiKeyAdminAuth(req, res, next) {
  if (!req.apiKeyObj) return res.status(401).json({ error: '需要 API Key 认证', code: 'NO_API_KEY' });
  if (!req.apiKeyObj.scopes.some((s) => s === '*' || s === 'admin')) {
    return res.status(403).json({ error: '需要 admin 权限', code: 'INSUFFICIENT_SCOPE' });
  }
  next();
}

/**
 * @param {string} hash
 * @param {string} source
 * @returns {void}
 */
function _resetHashCache(hash, source) {
  _adminPasswordHash = hash;
  _adminPasswordSourceCache = source;
}

/**
 * @returns {Promise<boolean>}
 */
async function reloadPasswordFromDisk() {
  const stored = loadSync(ADMIN_HASH_FILE, null);
  if (stored && stored.hash) {
    _adminPasswordHash = stored.hash;
    _adminPasswordSourceCache = stored.source;
    return true;
  }
  return false;
}

module.exports = {
  adminSession,
  adminEntryMiddleware,
  apiKeyAuth,
  apiKeyAdminAuth,
  accessLogMiddleware,
  initAdminPassword,
  verifyAdminPassword,
  setAdminPassword,
  isAdminPasswordInitial,
  JWT_SECRET,
  ADMIN_ENTRY_KEY,
  ADMIN_HASH_FILE,
  _resetHashCache,
  reloadPasswordFromDisk
};
