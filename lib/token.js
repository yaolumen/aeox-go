const crypto = require('crypto');
const path = require('path');

const { loadSync, saveSync } = require('./utils');
const { DATA_DIR } = require('./store');

const DOWNLOAD_TOKEN_SECRET_FILE = path.join(DATA_DIR, 'download-token-secret.json');

const DOWNLOAD_TOKEN_SECRET = process.env.DOWNLOAD_TOKEN_SECRET || loadSync(DOWNLOAD_TOKEN_SECRET_FILE, null)?.secret || (() => {
  const s = crypto.randomBytes(32).toString('hex');
  saveSync(DOWNLOAD_TOKEN_SECRET_FILE, { secret: s, createdAt: new Date().toISOString() });
  console.log('[DOWNLOAD_TOKEN_SECRET] env 未配置，已自动生成并持久化到 data/download-token-secret.json');
  return s;
})();

const DOWNLOAD_TOKEN_TTL = Number(process.env.DOWNLOAD_TOKEN_TTL) || 86400;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function signDownloadToken(productId) {
  const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TOKEN_TTL;
  const payload = b64url(JSON.stringify({ pid: productId, exp }));
  const sig = b64url(crypto.createHmac('sha256', DOWNLOAD_TOKEN_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

function verifyDownloadToken(token) {
  if (!DOWNLOAD_TOKEN_SECRET) return { ok: false, error: 'server_not_configured' };
  if (!token || typeof token !== 'string') return { ok: false, error: 'no_token' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, error: 'invalid_format' };
  const [payload, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', DOWNLOAD_TOKEN_SECRET).update(payload).digest());
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    return { ok: false, error: 'invalid_signature' };
  }
  try {
    const data = JSON.parse(b64urlDecode(payload).toString());
    if (!data.pid || !data.exp) return { ok: false, error: 'invalid_payload' };
    if (Math.floor(Date.now() / 1000) > data.exp) return { ok: false, error: 'expired', productId: data.pid };
    return { ok: true, productId: data.pid };
  } catch (e) {
    return { ok: false, error: 'parse_error' };
  }
}

module.exports = {
  signDownloadToken,
  verifyDownloadToken,
  DOWNLOAD_TOKEN_SECRET,
  DOWNLOAD_TOKEN_TTL
};
