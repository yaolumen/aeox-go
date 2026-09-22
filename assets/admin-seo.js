// @ts-check
import { html, useState, useEffect, authFetch, api, t } from './admin-lib.js';

function SeoManager({ addToast }) {
  const [seo, setSeo] = useState(null);
  const [siteConfig, setSiteConfig] = useState(null);
  const [products, setProducts] = useState([]);
  const [samples, setSamples] = useState([]);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState('overview');

  useEffect(() => {
    api('/api/config/site').then(cfg => {
      setSiteConfig(cfg);
      setSeo(cfg.seo || {});
    }).catch(() => {});
    api('/api/products').then(p => setProducts(p || [])).catch(() => {});
    api('/api/samples').then(s => setSamples(Array.isArray(s) ? s : [])).catch(() => {});
  }, []);

  const activeProducts = products.filter(p => p.status !== 'archived');
  const activeSamples = samples.filter(s => s.enabled);
  const siteName = siteConfig?.siteName || 'AEOX';
  const baseUrl = 'https://go.aeox.uk';

  function updateSeo(field, value) {
    setSeo(prev => ({ ...prev, [field]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await authFetch('/api/config/seo', {
        method: 'PUT',
        body: JSON.stringify({ seo })
      });
      const data = await res.json();
      if (data.success) {
        addToast('SEO 配置已保存', 'success');
        if (data.seo) setSeo(data.seo);
      } else {
        addToast(data.error || '保存失败', 'error');
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const blockedPaths = seo?.blockedPaths || ['/admin.html', '/download.html', '/api/'];
  const blockedBots = seo?.blockedBots || [];
  const blockAI = seo?.blockAI !== false;
  const customRobotsAppend = seo?.customRobotsAppend || '';
  const customLlmsIntro = seo?.customLlmsIntro || '';
  const customLlmsSections = seo?.customLlmsSections || '';
  const aiAllowCrawling = seo?.aiAllowCrawling !== false;
  const aiAllowTraining = seo?.aiAllowTraining === true;
  const aiCustomRules = seo?.aiCustomRules || '';
  const sitemapExcludes = seo?.sitemapExcludes || [];
  const crossSiteSitemaps = seo?.crossSiteSitemaps || [];

  const sections = [
    { id: 'overview', label: '总览', icon: '📊' },
    { id: 'robots', label: 'robots.txt', icon: '🤖' },
    { id: 'llms', label: 'llms.txt', icon: '🧠' },
    { id: 'aitxt', label: 'ai.txt', icon: '⚡' },
    { id: 'sitemap', label: 'Sitemap', icon: '🗺️' },
  ];

  if (!seo) {
    return html`
      <div style="display:flex;align-items:center;justify-content:center;padding:60px;">
        <div class="spinner" style="width:24px;height:24px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;"></div>
      </div>
    `;
  }

  function renderOverview() {
    const robotsUrl = `${baseUrl}/robots.txt`;
    const sitemapUrl = `${baseUrl}/sitemap.xml`;
    const llmsUrl = `${baseUrl}/llms.txt`;
    const aiUrl = `${baseUrl}/ai.txt`;
    const indexablePages = 1 + activeProducts.length + activeSamples.length;

    return html`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
        <div class="admin-card" style="padding:16px;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">可索引页面</div>
          <div style="font-size:28px;font-weight:700;">${indexablePages}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">首页 1 + 商品 ${activeProducts.length} + 试读 ${activeSamples.length}</div>
        </div>
        <div class="admin-card" style="padding:16px;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">屏蔽路径</div>
          <div style="font-size:28px;font-weight:700;">${blockedPaths.length}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${blockedPaths.join(', ')}</div>
        </div>
        <div class="admin-card" style="padding:16px;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">AI 爬虫</div>
          <div style="font-size:28px;font-weight:700;color:${blockAI ? 'var(--red)' : 'var(--green)'};">${blockAI ? '屏蔽' : '允许'}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${blockedBots.length} 个 bot 被屏蔽</div>
        </div>
        <div class="admin-card" style="padding:16px;">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">跨站 Sitemap</div>
          <div style="font-size:28px;font-weight:700;">${crossSiteSitemaps.length}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${crossSiteSitemaps.length > 0 ? crossSiteSitemaps.join(', ') : '未配置'}</div>
        </div>
      </div>

      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:10px;">SEO 文件快速验证</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${[
            { name: 'robots.txt', url: robotsUrl, desc: '爬虫指令文件' },
            { name: 'sitemap.xml', url: sitemapUrl, desc: '站点地图' },
            { name: 'llms.txt', url: llmsUrl, desc: 'LLM 可读摘要' },
            { name: 'ai.txt', url: aiUrl, desc: 'AI 训练声明' },
          ].map(f => html`
            <div key=${f.name} style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;">
              <div>
                <span style="font-size:13px;font-weight:500;">${f.name}</span>
                <span style="font-size:11px;color:var(--text-muted);margin-left:8px;">${f.desc}</span>
              </div>
              <a href=${f.url} target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;">查看 →</a>
            </div>
          `)}
        </div>
      </div>

      <div class="admin-card" style="padding:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:10px;">SEO 检查清单</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${[
            { ok: true, text: 'sitemap.xml 动态生成' },
            { ok: true, text: 'robots.txt 动态生成' },
            { ok: true, text: 'llms.txt 动态生成' },
            { ok: false, text: 'ai.txt 需配置 AI 训练声明' },
            { ok: false, text: '页面级 <title> 动态更新（需 SSR）' },
            { ok: false, text: 'Open Graph / Twitter Card meta（需 SSR）' },
            { ok: false, text: 'JSON-LD 结构化数据（需 SSR）' },
            { ok: false, text: 'canonical URL（需 SSR）' },
            { ok: false, text: '语义化 slug URL（需路由改造）' },
          ].map((item, i) => html`
            <div key=${i} style="display:flex;align-items:center;gap:8px;padding:4px 0;">
              <span style="width:18px;height:18px;border-radius:50%;background:${item.ok ? 'var(--green-bg)' : 'var(--surface)'};color:${item.ok ? 'var(--green)' : 'var(--text-muted)'};display:flex;align-items:center;justify-content:center;font-size:11px;">${item.ok ? '✓' : '○'}</span>
              <span style="font-size:12px;color:${item.ok ? 'var(--text)' : 'var(--text-muted)'};">${item.text}</span>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  function renderRobots() {
    return html`
      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">屏蔽路径</div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">这些路径在 robots.txt 中声明为 Disallow，爬虫不会访问</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          ${(seo?.blockedPaths || []).map((p, i) => html`
            <span key=${i} style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:11px;border:1px solid var(--border);background:var(--surface);border-radius:20px;">
              ${p}
              <button onClick=${() => updateSeo('blockedPaths', seo.blockedPaths.filter((_, j) => j !== i))} style="padding:0;border:none;background:none;color:var(--red);cursor:pointer;font-size:12px;">x</button>
            </span>
          `)}
        </div>
        <div style="display:flex;gap:6px;">
          <input id="new-blocked-path" class="admin-input" type="text" placeholder="/path/to/block" style="width:200px;" />
          <button onClick=${() => {
            const input = document.getElementById('new-blocked-path');
            const val = input?.value?.trim();
            if (val && !seo.blockedPaths.includes(val)) {
              updateSeo('blockedPaths', [...seo.blockedPaths, val]);
              input.value = '';
            }
          }} style="padding:6px 12px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:6px;">+ 添加</button>
        </div>
      </div>

      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">AI 爬虫屏蔽</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" checked=${blockAI} onChange=${e => updateSeo('blockAI', e.target.checked)} style="accent-color:var(--accent);" />
            <span style="font-size:12px;">屏蔽 AI 训练爬虫</span>
          </label>
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">开启后，以下 bot 将被禁止抓取全部内容</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          ${(seo?.blockedBots || []).map((b, i) => html`
            <span key=${i} style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:11px;border:1px solid var(--border);background:var(--surface);border-radius:20px;">
              ${b}
              <button onClick=${() => updateSeo('blockedBots', seo.blockedBots.filter((_, j) => j !== i))} style="padding:0;border:none;background:none;color:var(--red);cursor:pointer;font-size:12px;">x</button>
            </span>
          `)}
        </div>
        <div style="display:flex;gap:6px;">
          <input id="new-bot" class="admin-input" type="text" placeholder="BotName" style="width:160px;" />
          <button onClick=${() => {
            const input = document.getElementById('new-bot');
            const val = input?.value?.trim();
            if (val && !seo.blockedBots.includes(val)) {
              updateSeo('blockedBots', [...seo.blockedBots, val]);
              input.value = '';
            }
          }} style="padding:6px 12px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:6px;">+ 添加 Bot</button>
        </div>
        <div style="margin-top:8px;">
          <button onClick=${() => {
            const defaults = ['GPTBot', 'ClaudeBot', 'CCBot', 'PerplexityBot', 'Google-Extended', 'Bytespider', 'Anthropic-AI'];
            const merged = [...new Set([...(seo.blockedBots || []), ...defaults])];
            updateSeo('blockedBots', merged);
          }} style="padding:4px 10px;font-size:10px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);cursor:pointer;border-radius:4px;">+ 添加常用 AI Bot</button>
        </div>
      </div>

      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">自定义追加内容</div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">追加到 robots.txt 末尾的自定义规则（如 Crawl-delay、额外 User-agent 段等）</p>
        <textarea class="admin-textarea" rows="6" value=${customRobotsAppend} onInput=${e => updateSeo('customRobotsAppend', e.target.value)} placeholder="Crawl-delay: 10&#10;&#10;User-agent: AhrefsBot&#10;Disallow: /" style="font-family:var(--font-mono);font-size:12px;line-height:1.5;width:100%;"></textarea>
      </div>

      <div class="admin-card" style="padding:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">预览：robots.txt</div>
        <pre style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:11px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;font-family:var(--font-mono);">${generateRobotsPreview(seo, baseUrl)}</pre>
      </div>
    `;
  }

  function renderLlms() {
    return html`
      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">自定义介绍</div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">替换 llms.txt 顶部的默认介绍（第一段 > 引用文字），留空使用 siteName + siteDescription</p>
        <textarea class="admin-textarea" rows="3" value=${customLlmsIntro} onInput=${e => updateSeo('customLlmsIntro', e.target.value)} placeholder="# 自定义标题&#10;&#10;> 自定义描述文字" style="font-family:var(--font-mono);font-size:12px;line-height:1.5;width:100%;"></textarea>
      </div>

      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">自定义段落</div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">追加到 llms.txt 商品列表和链接之后的内容（Markdown 格式），可用于添加购买流程说明、品牌故事等</p>
        <textarea class="admin-textarea" rows="8" value=${customLlmsSections} onInput=${e => updateSeo('customLlmsSections', e.target.value)} placeholder="## How to Buy&#10;&#10;1. Browse ebooks on our store&#10;2. Click 'Get on Ko-fi' to purchase&#10;3. Download instantly&#10;&#10;## About AEOX&#10;&#10;AEOX curates digital books for professionals..." style="font-family:var(--font-mono);font-size:12px;line-height:1.5;width:100%;"></textarea>
      </div>

      <div class="admin-card" style="padding:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">预览：llms.txt</div>
        <pre style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:11px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;font-family:var(--font-mono);max-height:400px;">${generateLlmsPreview(seo, siteConfig, activeProducts, activeSamples, baseUrl)}</pre>
      </div>
    `;
  }

  function renderAiTxt() {
    return html`
      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">AI 训练声明</div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">ai.txt 是 <a href="https://spawning.ai/ai-txt" target="_blank" style="color:var(--accent);">Spawning.ai 标准</a>，声明网站内容是否允许 AI 模型训练使用</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;">
            <input type="radio" name="ai-crawl" checked=${aiAllowCrawling && !aiAllowTraining} onChange=${() => { updateSeo('aiAllowCrawling', true); updateSeo('aiAllowTraining', false); }} style="accent-color:var(--accent);" />
            <div>
              <div style="font-size:12px;font-weight:500;">允许抓取摘要，禁止训练</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">AI 可读取内容做搜索/推荐，但不能用于模型训练</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;">
            <input type="radio" name="ai-crawl" checked=${aiAllowCrawling && aiAllowTraining} onChange=${() => { updateSeo('aiAllowCrawling', true); updateSeo('aiAllowTraining', true); }} style="accent-color:var(--accent);" />
            <div>
              <div style="font-size:12px;font-weight:500;">允许抓取 + 允许训练</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">AI 可自由使用内容，包括训练模型</div>
            </div>
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;cursor:pointer;">
            <input type="radio" name="ai-crawl" checked=${!aiAllowCrawling} onChange=${() => { updateSeo('aiAllowCrawling', false); updateSeo('aiAllowTraining', false); }} style="accent-color:var(--accent);" />
            <div>
              <div style="font-size:12px;font-weight:500;">完全禁止</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">AI 不得抓取任何内容</div>
            </div>
          </label>
        </div>
      </div>

      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">自定义 AI 规则</div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">追加到 ai.txt 的自定义规则，留空使用上面的预设</p>
        <textarea class="admin-textarea" rows="4" value=${aiCustomRules} onInput=${e => updateSeo('aiCustomRules', e.target.value)} placeholder="# Custom AI rules&#10;User-agent: *&#10;Disallow: /admin" style="font-family:var(--font-mono);font-size:12px;line-height:1.5;width:100%;"></textarea>
      </div>

      <div class="admin-card" style="padding:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">预览：ai.txt</div>
        <pre style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:11px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;font-family:var(--font-mono);">${generateAiTxtPreview(seo)}</pre>
      </div>
    `;
  }

  function renderSitemap() {
    return html`
      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Sitemap 排除规则</div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">匹配这些路径的 URL 不会出现在 sitemap.xml 中（支持短 ID 匹配）</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          ${(seo?.sitemapExcludes || []).map((p, i) => html`
            <span key=${i} style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:11px;border:1px solid var(--border);background:var(--surface);border-radius:20px;">
              ${p}
              <button onClick=${() => updateSeo('sitemapExcludes', seo.sitemapExcludes.filter((_, j) => j !== i))} style="padding:0;border:none;background:none;color:var(--red);cursor:pointer;font-size:12px;">x</button>
            </span>
          `)}
        </div>
        <div style="display:flex;gap:6px;">
          <input id="new-exclude" class="admin-input" type="text" placeholder="p_ha03 或 ha03" style="width:200px;" />
          <button onClick=${() => {
            const input = document.getElementById('new-exclude');
            const val = input?.value?.trim();
            if (val) {
              updateSeo('sitemapExcludes', [...(seo.sitemapExcludes || []), val]);
              input.value = '';
            }
          }} style="padding:6px 12px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:6px;">+ 排除</button>
        </div>
      </div>

      <div class="admin-card" style="padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">跨站 Sitemap Index</div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">其他子站点的 sitemap URL，用于声明子域名联盟关系</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          ${(seo?.crossSiteSitemaps || []).map((url, i) => html`
            <span key=${i} style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:11px;border:1px solid var(--border);background:var(--surface);border-radius:20px;max-width:360px;overflow:hidden;text-overflow:ellipsis;">
              ${url}
              <button onClick=${() => updateSeo('crossSiteSitemaps', seo.crossSiteSitemaps.filter((_, j) => j !== i))} style="padding:0;border:none;background:none;color:var(--red);cursor:pointer;font-size:12px;flex-shrink:0;">x</button>
            </span>
          `)}
        </div>
        <div style="display:flex;gap:6px;">
          <input id="new-cross-sitemap" class="admin-input" type="text" placeholder="https://shui.aeox.uk/sitemap.xml" style="width:300px;" />
          <button onClick=${() => {
            const input = document.getElementById('new-cross-sitemap');
            const val = input?.value?.trim();
            if (val) {
              updateSeo('crossSiteSitemaps', [...(seo.crossSiteSitemaps || []), val]);
              input.value = '';
            }
          }} style="padding:6px 12px;font-size:11px;border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;border-radius:6px;">+ 添加</button>
        </div>
        <div style="margin-top:8px;">
          <button onClick=${() => {
            const defaults = [
              'https://aeox.uk/sitemap.xml',
              'https://shui.aeox.uk/sitemap.xml',
              'https://anchor.aeox.uk/sitemap.xml'
            ];
            const merged = [...new Set([...(seo.crossSiteSitemaps || []), ...defaults])];
            updateSeo('crossSiteSitemaps', merged);
          }} style="padding:4px 10px;font-size:10px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);cursor:pointer;border-radius:4px;">+ 添加 AEOX 子站</button>
        </div>
      </div>

      <div class="admin-card" style="padding:16px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">当前 Sitemap 包含的 URL</div>
        <div style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;">
          <div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--green-bg);border-radius:4px;">
            <span style="font-size:11px;color:var(--green);font-weight:600;">1.0</span>
            <span style="font-size:11px;font-family:var(--font-mono);">${baseUrl}/</span>
          </div>
          ${activeProducts.map((p, i) => html`
            <div key=${p.id} style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:${i % 2 === 0 ? 'var(--surface)' : 'transparent'};border-radius:4px;">
              <span style="font-size:11px;color:var(--text-muted);">0.8</span>
              <span style="font-size:11px;font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${baseUrl}/?id=${p.id}</span>
              <span style="font-size:10px;color:var(--text-muted);margin-left:auto;flex-shrink:0;">${t(p.title)}</span>
            </div>
          `)}
          ${activeSamples.map((s, i) => html`
            <div key=${s.id} style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--green-bg);border-radius:4px;">
              <span style="font-size:11px;color:var(--green);">0.9</span>
              <span style="font-size:11px;font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${baseUrl}/read/${s.shortId}</span>
              <span style="font-size:10px;color:var(--text-muted);margin-left:auto;flex-shrink:0;">试读</span>
            </div>
          `)}
        </div>
      </div>
    `;
  }

  return html`
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
        <div>
          <h2 style="font-size:20px;font-weight:700;">SEO 管理</h2>
          <p style="font-size:13px;color:var(--text-muted);margin-top:4px;">管理搜索引擎和 AI 爬虫可见性</p>
        </div>
        <button onClick=${save} disabled=${saving} style="padding:8px 16px;font-size:13px;font-weight:500;background:var(--accent);color:#fff;border:none;cursor:pointer;border-radius:8px;display:flex;align-items:center;gap:6px;">
          ${saving && html`<div class="spinner" style="width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;"></div>`}
          保存配置
        </button>
      </div>

      <div style="display:flex;gap:2px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:0;">
        ${sections.map(s => html`
          <button key=${s.id} onClick=${() => setSection(s.id)}
            style="padding:8px 14px;font-size:12px;font-weight:500;border:none;background:none;cursor:pointer;color:${section === s.id ? 'var(--text)' : 'var(--text-muted)'};border-bottom:2px solid ${section === s.id ? 'var(--accent)' : 'transparent'};transition:all 150ms;display:flex;align-items:center;gap:4px;">
            <span style="font-size:13px;">${s.icon}</span> ${s.label}
          </button>
        `)}
      </div>

      ${section === 'overview' && renderOverview()}
      ${section === 'robots' && renderRobots()}
      ${section === 'llms' && renderLlms()}
      ${section === 'aitxt' && renderAiTxt()}
      ${section === 'sitemap' && renderSitemap()}
    </div>
  `;
}

function generateRobotsPreview(seo, baseUrl) {
  const blockedPaths = seo?.blockedPaths || ['/admin.html', '/download.html', '/api/'];
  const blockedBots = seo?.blockedBots || [];
  const blockAI = seo?.blockAI !== false;
  const customAppend = seo?.customRobotsAppend || '';
  let text = 'User-agent: *\nAllow: /\n';
  for (const p of blockedPaths) text += `Disallow: ${p}\n`;
  text += '\n';
  if (blockAI && blockedBots.length > 0) {
    for (const bot of blockedBots) {
      text += `User-agent: ${bot}\nDisallow: /\n\n`;
    }
  }
  text += `Sitemap: ${baseUrl}/sitemap.xml\n`;
  if (customAppend.trim()) text += '\n' + customAppend.trim() + '\n';
  return text;
}

function generateLlmsPreview(seo, siteConfig, products, samples, baseUrl) {
  const customIntro = seo?.customLlmsIntro || '';
  const customSections = seo?.customLlmsSections || '';
  const siteName = siteConfig?.siteName || 'AEOX';
  const siteDesc = siteConfig?.siteDescription || 'Curated digital products. Instant delivery.';
  let text = '';
  if (customIntro.trim()) {
    text += customIntro.trim() + '\n\n';
  } else {
    text += `# ${siteName}\n\n> ${siteDesc}\n\n`;
  }
  const items = products.filter(p => p.status !== 'archived').map(p => {
    const title = p.title?.en || p.title?.zh || 'Untitled';
    const desc = (p.desc?.en || p.desc?.zh || '').slice(0, 80);
    return `- [${title}](${baseUrl}/?id=${p.id}): ${desc}`;
  }).join('\n');
  text += `## Products\n\n${items}\n\n`;
  const sampleItems = samples.filter(s => s.enabled).map(s => {
    const title = s.title?.en || s.title?.zh || s.shortId;
    return `- [Sample: ${title}](${baseUrl}/read/${s.shortId})`;
  }).join('\n');
  text += `## Free Previews\n\n${sampleItems || 'No samples available yet.'}\n\n`;
  text += `## Links\n\n- [Store](${baseUrl}/)\n- [Sitemap](${baseUrl}/sitemap.xml)\n`;
  if (customSections.trim()) text += '\n' + customSections.trim() + '\n';
  return text;
}

function generateAiTxtPreview(seo) {
  const allowCrawling = seo?.aiAllowCrawling !== false;
  const allowTraining = seo?.aiAllowTraining === true;
  const customRules = seo?.aiCustomRules || '';
  if (customRules.trim()) return customRules.trim() + '\n';
  let text = '# ai.txt\n# Generated from AEOX SEO settings\n\n';
  if (!allowCrawling) {
    text += 'User-agent: *\nDisallow: /\n';
  } else if (allowTraining) {
    text += 'User-agent: *\nAllow: /\n\n# Content may be used for AI training\n';
  } else {
    text += 'User-agent: *\nAllow: /\n\n# Content may be crawled for search/indexing\n# but may NOT be used for AI model training\n';
    text += '\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /\n\nUser-agent: Bytespider\nDisallow: /\n\nUser-agent: Anthropic-AI\nDisallow: /\n';
  }
  return text;
}

export { SeoManager };
