const http = require('http');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const ADMIN_PWD = process.env.ADMIN_PASSWORD || 'admin123456';

let passed = 0;
let failed = 0;
const results = [];

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(name, ok, detail) {
  const tag = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;
  const msg = `[${tag}] ${name}${detail ? ' — ' + detail : ''}`;
  results.push(msg);
  console.log(msg);
}

function summary() {
  console.log('\n' + '='.repeat(50));
  console.log(`总计: ${passed + failed} | 通过: ${passed} | 失败: ${failed}`);
  if (failed > 0) {
    console.log('\n失败项:');
    results.filter(r => r.includes('FAIL')).forEach(r => console.log('  ' + r));
  }
  return failed;
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function resetPassword() {
  const fssync = require('fs');
  const pathMod = require('path');
  const bcrypt = require('bcryptjs');
  const dataDir = pathMod.join(__dirname, '..', 'data');
  const hashFile = pathMod.join(dataDir, 'admin-password.json');
  const hash = await bcrypt.hash(ADMIN_PWD, 10);
  fssync.writeFileSync(hashFile, JSON.stringify({
    hash,
    source: 'default',
    initialPassword: ADMIN_PWD,
    createdAt: new Date().toISOString()
  }, null, 2));
  try {
    const auth = require('../lib/auth');
    auth._resetHashCache(hash, 'default');
  } catch (e) {}
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const tryLogin = await request('POST', '/api/login', { password: ADMIN_PWD });
      if (tryLogin.status === 200 && tryLogin.body.token) {
        await request('POST', '/api/auth/reload-password', {}, { Authorization: `Bearer ${tryLogin.body.token}` });
        break;
      }
      if (tryLogin.status === 429) { await delay(10000); continue; }
      break;
    }
  } catch (e) {}
  await delay(300);
}

async function login() {
  await resetPassword();
  for (let attempt = 0; attempt < 12; attempt++) {
    const res = await request('POST', '/api/login', { password: ADMIN_PWD });
    if (res.status === 200 && res.body.token) {
      return { token: res.body.token, authHeader: { Authorization: `Bearer ${res.body.token}` } };
    }
    if (res.status === 429) {
      await delay(10000);
      continue;
    }
    throw new Error(`登录失败: status=${res.status} body=${JSON.stringify(res.body)}`);
  }
  throw new Error('登录失败: 重试次数耗尽（速率限制）');
}

module.exports = { request, assert, summary, delay, login, resetPassword, BASE, ADMIN_PWD, passed: () => passed, failed: () => failed, results: () => results };
