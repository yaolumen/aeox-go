// @ts-check
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const fssync = require('fs');

const { DATA_DIR } = require('./store');

/** @type {string[]} */
const TAG_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];

/** @type {string} */
const BASE_URL = process.env.BASE_URL || 'https://go.aeox.uk';

/**
 * @template T
 * @param {string} file
 * @param {T} fallback
 * @returns {T}
 */
function loadSync(file, fallback) {
  try { return JSON.parse(fssync.readFileSync(file, 'utf8')); } catch { return fallback; }
}

/**
 * @param {string} file
 * @param {any} data
 * @returns {void}
 */
function saveSync(file, data) {
  try { fssync.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) { console.error('写入失败', file, e); }
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || '';
}

/**
 * @returns {string}
 */
function generateApiKey() {
  return 'aeox_' + crypto.randomBytes(32).toString('hex');
}

/**
 * @param {string} prefix
 * @returns {string}
 */
function generateId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * @param {string} text
 * @returns {string}
 */
function generateSlug(text) {
  const slug = String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (slug) return slug;
  return 'post-' + Date.now().toString(36);
}

/**
 * @param {string} key
 * @param {number} max
 * @param {number} windowMs
 * @returns {boolean}
 */
const rateLimit = (() => {
  const map = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of map) {
      if (now > entry.resetAt) map.delete(key);
    }
  }, 600000).unref();
  return function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const entry = map.get(key);
    if (!entry || now > entry.resetAt) {
      map.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  };
})();

/**
 * @param {string} key
 * @returns {string}
 */
function maskSecretKey(key) {
  if (!key || key.length < 12) return key ? '****' : '';
  const prefix = key.slice(0, 8);
  const tail = key.slice(-4);
  return `${prefix}****${tail}`;
}

/**
 * @param {{ ts: string, keyId: string|null, keyName: string|null, method: string, path: string, status: number, duration: number, ip: string }} entry
 * @returns {Promise<void>}
 */
async function appendAccessLog(entry) {
  const logFile = path.join(DATA_DIR, 'api-access.log');
  try {
    try {
      const stat = await fs.stat(logFile);
      if (stat.size > 5 * 1024 * 1024) {
        const date = new Date().toISOString().slice(0, 10);
        await fs.rename(logFile, logFile + '.' + date);
      }
    } catch (e) {}
    await fs.appendFile(logFile, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('写入访问日志失败:', e.message);
  }
}

/**
 * @param {{ provider: string, purpose: string, ok: boolean, error?: string, duration?: number, stream?: boolean, timestamp: string }} entry
 * @returns {Promise<void>}
 */
async function appendAiCallLog(entry) {
  const logFile = path.join(DATA_DIR, 'ai-calls.log');
  try {
    try {
      const stat = await fs.stat(logFile);
      if (stat.size > 5 * 1024 * 1024) {
        const date = new Date().toISOString().slice(0, 10);
        await fs.rename(logFile, logFile + '.' + date);
      }
    } catch (e) {}
    await fs.appendFile(logFile, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('写入 AI 调用日志失败:', e.message);
  }
}

/**
 * @param {string} filename
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
async function readLogTail(filename, limit) {
  const logFile = path.join(DATA_DIR, filename);
  try {
    const stat = await fs.stat(logFile);
    const chunkSize = Math.min(stat.size, limit * 512);
    const fd = await fs.open(logFile, 'r');
    const buf = Buffer.alloc(chunkSize);
    await fd.read(buf, 0, chunkSize, stat.size - chunkSize);
    await fd.close();
    const raw = buf.toString('utf8');
    const lines = raw.split('\n').filter(Boolean);
    const tail = lines.slice(-limit);
    return tail.map((line) => {
      try { return JSON.parse(line); } catch (e) { return { raw: line }; }
    });
  } catch (e) {
    return [];
  }
}

/** @type {string} */
const DEBUG_LOG = path.join(DATA_DIR, 'server-debug.log');
/**
 * @param {string} msg
 * @returns {void}
 */
function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFile(DEBUG_LOG, line).catch(() => {});
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function debugLogMiddleware(req, res, next) {
  const start = Date.now();
  debugLog(`→ ${req.method} ${req.originalUrl} ip=${req.ip}`);
  res.on('finish', () => {
    const ms = Date.now() - start;
    debugLog(`← ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}

/**
 * @param {string} str
 * @returns {string}
 */
function rot13(str) {
  return String(str || '').replace(/[a-zA-Z]/g, function (c) {
    const code = c.charCodeAt(0);
    const base = code <= 90 ? 65 : 97;
    return String.fromCharCode(((code - base + 13) % 26) + base);
  });
}

/**
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

module.exports = {
  generateId, generateSlug, generateApiKey,
  getClientIp, rateLimit,
  maskSecretKey, readLogTail, rot13,
  appendAccessLog, appendAiCallLog,
  debugLog, debugLogMiddleware,
  TAG_COLORS, loadSync, saveSync,
  BASE_URL, isValidEmail
};
