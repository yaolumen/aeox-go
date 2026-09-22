// @ts-check
const API_BASE = '';

export async function api(path, opts = {}) {
  const url = path.startsWith('http') ? path : API_BASE + path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export function getToken() {
  return localStorage.getItem('aeox_token') || '';
}

export async function authFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = path.startsWith('http') ? path : API_BASE + path;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem('aeox_token');
    if (!path.includes('/auth/')) location.reload();
  }
  return res;
}
