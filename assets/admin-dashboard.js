// @ts-check
import { html, useState, useEffect, authFetch } from './admin-lib.js';

function Dashboard() {
  const [dashData, setDashData] = useState(null);
  const [range, setRange] = useState('all');

  useEffect(() => {
    authFetch(`/api/dashboard?range=${range}`).then(r => r.json()).then(setDashData).catch(() => {});
  }, [range]);

  const ov = dashData?.overview || {};

  return html`
    <div>
      <div style="display:flex;gap:6px;margin-bottom:20px;">
         ${[{k:'all',l:'全部'},{k:'today',l:'今天'},{k:'week',l:'本周'},{k:'month',l:'本月'}].map(r => html`
           <button key=${r.k} onClick=${() => setRange(r.k)}
             style="padding:6px 14px;font-size:12px;font-weight:500;border-radius:20px;border:1px solid ${range === r.k ? 'var(--accent)' : 'var(--border)'};background:${range === r.k ? 'var(--accent-light)' : 'var(--surface)'};color:${range === r.k ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;transition:all 150ms;">
             ${r.l}
           </button>
         `)}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px;">
         <div class="admin-card">
           <p style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">页面浏览</p>
          <p style="font-size:24px;font-weight:700;margin-top:8px;">${(ov.totalPv || 0).toLocaleString()}</p>
        </div>
        <div class="admin-card">
           <p style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">订单</p>
          <p style="font-size:24px;font-weight:700;margin-top:8px;">${(ov.totalSales || ov.totalOrders || 0).toLocaleString()}</p>
        </div>
        <div class="admin-card">
           <p style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">总销售</p>
          <p style="font-size:24px;font-weight:700;margin-top:8px;">$${(ov.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div class="admin-card">
           <p style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">总退款</p>
          <p style="font-size:24px;font-weight:700;margin-top:8px;color:var(--red);">-$${(ov.totalRefunded || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p style="font-size:10px;color:var(--text-muted);margin-top:4px;">${ov.totalRefunds || 0} 笔</p>
        </div>
        <div class="admin-card">
           <p style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">净收入</p>
          <p style="font-size:24px;font-weight:700;margin-top:8px;">$${(ov.netRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
         <div class="admin-card">
            <p style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">转化率</p>
           <p style="font-size:24px;font-weight:700;margin-top:8px;">${ov.conversionRate || 0}%</p>
         </div>
         <div class="admin-card">
            <p style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">Email Leads</p>
           <p style="font-size:24px;font-weight:700;margin-top:8px;">${(ov.leadsOptedIn || 0).toLocaleString()}</p>
           <p style="font-size:10px;color:var(--text-muted);margin-top:4px;">${ov.leadsSkipped || 0} skipped</p>
         </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="admin-card">
           <h3 style="font-size:13px;font-weight:600;color:var(--text-light);margin-bottom:16px;">热门商品（按浏览量）</h3>
          ${(dashData?.top5 || []).length === 0
            ? html`<p style="font-size:13px;color:var(--text-muted);">暂无数据</p>`
            : html`<table class="admin-table">
                 <thead><tr><th>商品</th><th>浏览量</th><th>下载量</th></tr></thead>
                <tbody>
                  ${(dashData.top5 || []).map(p => html`
                    <tr key=${p.id}>
                      <td>${p.title}</td>
                      <td>${p.pv}</td>
                      <td>${p.download || 0}</td>
                    </tr>
                  `)}
                </tbody>
              </table>`
          }
        </div>
        <div class="admin-card">
           <h3 style="font-size:13px;font-weight:600;color:var(--text-light);margin-bottom:16px;">漏斗</h3>
          ${dashData?.funnel ? html`
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${[
                { key: 'visit', label: '访问' },
                { key: 'detail', label: '详情' },
                { key: 'checkout', label: '下单' },
                { key: 'download', label: '下载' }
              ].map((step, idx) => {
                const val = dashData.funnel[step.key] || 0;
                const max = dashData.funnel.visit || 1;
                const pct = Math.round(val / max * 100);
                const colors = ['var(--text)', 'var(--text-muted)', 'var(--text-light)', 'var(--green)'];
                return html`
                  <div key=${step.key} style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:12px;color:var(--text-light);width:70px;flex-shrink:0;">${step.label}</span>
                    <div style="flex:1;height:28px;background:var(--surface);overflow:hidden;">
                      <div style="height:100%;width:${pct}%;background:${colors[idx]};display:flex;align-items:center;padding:0 8px;">
                        <span style="font-size:11px;color:#fff;font-weight:500;">${val.toLocaleString()}</span>
                      </div>
                    </div>
                    <span style="font-size:11px;color:var(--text-muted);width:40px;text-align:right;">${pct}%</span>
                  </div>
                `;
              })}
            </div>
          ` : html`<p style="font-size:13px;color:var(--text-muted);">暂无数据</p>`}
        </div>
      </div>
    </div>
  `;
}

export { Dashboard };
