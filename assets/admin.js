// @ts-check
import { render } from './lib/preact.module.js';
import { html, h, useState, useEffect, authFetch, getToken, api, ShortLinksTab } from './admin-lib.js';
import { Dashboard } from './admin-dashboard.js';
import { ProductManager } from './admin-products.js';
import { SystemSettings } from './admin-settings.js';
import { SamplesManager } from './admin-samples.js';
import { EmailsManager } from './admin-emails.js';
import { AIManager } from './admin-ai.js';
import { SeoManager } from './admin-seo.js';

function Spinner({ size }) {
  const s = size || 16;
  return html`<svg class="animate-spin" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>`;
}

function Toast({ toasts }) {
  if (!toasts || toasts.length === 0) return null;
  return html`
    <div class="toast-container">
      ${toasts.map((t, i) => html`
        <div key=${i} class="toast ${t.type || 'info'}">${t.message}</div>
      `)}
    </div>
  `;
}

function LoginOverlay({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      if (data.success) {
        localStorage.setItem('aeox_token', data.token);
        onLogin(data);
      } else {
        setError(data.message || '登录失败');
      }
    } catch (e) {
      setError(e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }

  return html`
    <div style="position:fixed;inset:0;z-index:50;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:20px;">
      <div style="width:100%;max-width:380px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:var(--surface);border:1px solid var(--border);margin-bottom:16px;border-radius:12px;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <h1 style="font-size:20px;font-weight:600;">AEOX 后台管理</h1>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px;">输入密码登录</p>
        </div>
        <form onSubmit=${submit} style="display:flex;flex-direction:column;gap:16px;">
          <div>
            <input type="password" value=${password} onInput=${e => setPassword(e.target.value)} placeholder="管理员密码" autofocus
              style="width:100%;padding:12px;font-size:14px;background:var(--bg);border:1px solid var(--border);color:var(--text);outline:none;border-radius:8px;" />
            ${error && html`<p style="font-size:12px;color:var(--red);margin-top:8px;">${error}</p>`}
          </div>
          <button type="submit" disabled=${loading}
            style="width:100%;padding:12px;background:var(--accent);color:var(--bg);font-size:14px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:8px;opacity:${loading ? '.5' : '1'};">
            ${loading && html`<${Spinner} />`}
            <span>${loading ? '登录中...' : '登录'}</span>
          </button>
        </form>
        <div style="margin-top:24px;padding:12px;background:var(--surface);border:1px solid var(--border);text-align:center;border-radius:8px;">
          <p style="font-size:11px;color:var(--text-muted);">默认密码在首次启动时显示在服务器控制台</p>
          <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">也可通过 <span style="font-family:var(--font-mono);">ADMIN_PASSWORD</span> 环境变量设置</p>
        </div>
        <p style="text-align:center;margin-top:16px;"><a href="index.html" style="font-size:12px;color:var(--text-muted);">返回前台</a></p>
      </div>
    </div>
  `;
}

function ChangePasswordModal({ onSubmit, onSkip }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (form.next.length < 8) { setError('新密码至少8个字符'); return; }
    if (form.next !== form.confirm) { setError('两次密码不一致'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next })
      });
      const data = await res.json();
      if (data.success) onSubmit();
      else setError(data.message || '修改失败');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function update(field, val) {
    setForm(prev => ({ ...prev, [field]: val }));
  }

  return html`
    <div style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center;padding:20px;">
      <div style="background:var(--bg);border:1px solid var(--border);padding:24px;max-width:420px;width:100%;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.12);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--amber-bg);border:1px solid var(--amber-border);border-radius:10px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber-text)" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
             <h3 style="font-weight:600;">修改默认密码</h3>
             <p style="font-size:12px;color:var(--text-light);">检测到正在使用默认密码，请设置新密码</p>
          </div>
        </div>
        <form onSubmit=${submit} style="display:flex;flex-direction:column;gap:12px;">
          <div>
             <label style="display:block;font-size:11px;font-weight:500;color:var(--text-light);margin-bottom:4px;">当前密码</label>
            <input type="password" value=${form.current} onInput=${e => update('current', e.target.value)}
              style="width:100%;padding:8px 12px;font-size:13px;background:var(--bg);border:1px solid var(--border);color:var(--text);outline:none;border-radius:8px;" />
          </div>
          <div>
             <label style="display:block;font-size:11px;font-weight:500;color:var(--text-light);margin-bottom:4px;">新密码（至少8位）</label>
            <input type="password" value=${form.next} onInput=${e => update('next', e.target.value)}
              style="width:100%;padding:8px 12px;font-size:13px;background:var(--bg);border:1px solid var(--border);color:var(--text);outline:none;border-radius:8px;" />
          </div>
          <div>
             <label style="display:block;font-size:11px;font-weight:500;color:var(--text-light);margin-bottom:4px;">确认新密码</label>
            <input type="password" value=${form.confirm} onInput=${e => update('confirm', e.target.value)}
              style="width:100%;padding:8px 12px;font-size:13px;background:var(--bg);border:1px solid var(--border);color:var(--text);outline:none;border-radius:8px;" />
          </div>
          ${error && html`<p style="font-size:12px;color:var(--red);">${error}</p>`}
          <button type="submit" disabled=${loading}
            style="width:100%;padding:10px;background:var(--accent);color:var(--bg);font-size:13px;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:8px;">
            ${loading && html`<${Spinner} size=${14} />`}
             <span>${loading ? '修改中...' : '修改密码'}</span>
          </button>
          <button type="button" onClick=${onSkip}
            style="width:100%;padding:8px;background:transparent;border:1px solid var(--border);color:var(--text-muted);font-size:13px;cursor:pointer;border-radius:8px;">
             暂时跳过
          </button>
        </form>
      </div>
    </div>
  `;
}

function AdminHeader({ tab, setTab, onLogout }) {
  const tabs = [
    { id: 'dashboard', label: '仪表盘' },
    { id: 'products', label: '商品' },
    { id: 'samples', label: '试读' },
    { id: 'emails', label: '邮件' },
    { id: 'seo', label: 'SEO' },
    { id: 'settings', label: '设置' },
    { id: 'ai', label: 'AI' }
  ];

  return html`
    <header style="background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:30;">
      <div style="max-width:1100px;margin:0 auto;padding:0 20px;height:56px;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:18px;font-weight:700;letter-spacing:-.02em;">AEOX</span>
          <span style="color:var(--text-muted);">/</span>
           <span style="font-size:13px;color:var(--text-light);">后台</span>
          <span style="font-size:10px;padding:1px 6px;background:var(--surface);border:1px solid var(--border);border-radius:10px;color:var(--text-muted);margin-left:6px;">v2.4.2</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;font-size:13px;">
          <a href="index.html" style="color:var(--text-muted);display:flex;align-items:center;gap:4px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
             <span>查看前台</span>
          </a>
          <button onClick=${onLogout} style="color:var(--text-muted);display:flex;align-items:center;gap:4px;background:none;border:none;cursor:pointer;font-size:13px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
             <span>退出</span>
          </button>
        </div>
      </div>
      <div style="max-width:1100px;margin:0 auto;padding:0 20px;display:flex;gap:0;border-bottom:none;">
        ${tabs.map(t => html`
          <button key=${t.id} onClick=${() => setTab(t.id)}
            style="padding:10px 16px;font-size:13px;font-weight:500;border:none;background:none;cursor:pointer;color:${tab === t.id ? 'var(--text)' : 'var(--text-muted)'};border-bottom:2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'};transition:all 150ms;">
            ${t.label}
          </button>
        `)}
      </div>
    </header>
  `;
}


export function AdminApp() {
  const [authed, setAuthed] = useState(!!getToken());
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [tab, setTab] = useState(() => {
    const p = new URLSearchParams(location.search);
    return p.get('tab') || 'dashboard';
  });
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    function onPop() {
      const p = new URLSearchParams(location.search);
      setTab(p.get('tab') || 'dashboard');
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function addToast(message, type) {
    const t = [...toasts, { message, type }];
    setToasts(t);
    setTimeout(() => setToasts(prev => prev.slice(1)), 3000);
  }

  function handleLogin(data) {
    setAuthed(true);
    if (data.needsPasswordChange) setNeedsPasswordChange(true);
  }

  function switchTab(id) {
    setTab(id);
    const url = new URL(location.href);
    url.searchParams.set('tab', id);
    history.replaceState(null, '', url);
  }

  function logout() {
    localStorage.removeItem('aeox_token');
    setAuthed(false);
  }

  if (!authed) return html`<${LoginOverlay} onLogin=${handleLogin} />`;

  return html`
    <div style="min-height:100vh;background:var(--bg);">
      ${needsPasswordChange && html`<${ChangePasswordModal} onSubmit=${() => setNeedsPasswordChange(false)} onSkip=${() => setNeedsPasswordChange(false)} />`}
      <${AdminHeader} tab=${tab} setTab=${switchTab} onLogout=${logout} />
      <div style="max-width:1100px;margin:0 auto;padding:24px 20px;">
        ${tab === 'dashboard' && html`<${Dashboard} />`}
        ${tab === 'products' && html`<${ProductManager} addToast=${addToast} />`}
        ${tab === 'samples' && html`<${SamplesManager} addToast=${addToast} />`}
        ${tab === 'emails' && html`<${EmailsManager} addToast=${addToast} />`}
        ${tab === 'seo' && html`<${SeoManager} addToast=${addToast} />`}
        ${tab === 'settings' && html`<${SystemSettings} addToast=${addToast} />`}
        ${tab === 'ai' && html`<${AIManager} addToast=${addToast} />`}
      </div>
      <${Toast} toasts=${toasts} />
    </div>
  `;
}

render(html`<${AdminApp} />`, document.getElementById('app'));
