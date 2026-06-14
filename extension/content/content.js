// === 智能邮件助手 — 浏览器扩展内容脚本 (自包含) ===

// ========== 常量 ==========
const DEFAULTS = {
  API_ENDPOINT: 'https://api.deepseek.com/v1/chat/completions',
  AI_MODEL: 'deepseek-chat',
  INTERESTS: ['奖学金', '实习', '学术活动', '课程'],
};
const AI_TIMEOUT = 30000;

// ========== 状态 ==========
const STATE = {
  panelOpen: false,
  loading: false,
  lastResult: null,
  currentEmailContent: null,
  interests: [...DEFAULTS.INTERESTS],
  apiKey: '',
  apiEndpoint: DEFAULTS.API_ENDPOINT,
  _cache: new Map(),  // 邮件内容 hash → 结果缓存
};

// ========== System Prompt ==========
const SYSTEM_PROMPT = `⚠️ 重要指令: 你必须只使用简体中文输出，禁止使用任何繁体字（如：臺體爲時會學國對來開關門網長當過將從無見說話語寫讀嗎麼們個為應經處風東麥等，对应简体：台体为时会学国对来开关门网长当过将从无见说话语写读吗么们个为应经处风东麦）。如违反此规则，用户将无法使用你的输出。

你是一个手机通知摘要助手，把邮件内容变成推送卡片式的简短摘要。

你的任务 (严格按顺序执行):
1. 先从邮件中提取出所有新闻条目 —— 这一步与"兴趣标签"无关，无论标签是什么，提取出的新闻条目总数必须是固定的。
2. 然后逐一判断每条新闻是否匹配用户的"兴趣标签"。
3. 匹配的放入 "highlights"，不匹配的放入 "other"。
4. "highlights" + "other" 的总条数必须等于邮件中的全部新闻条数，这个总数不受兴趣标签影响。

风格要求 (重要):
- 像手机推送通知一样简短——看得快，不用思考。
- 只输出简体中文（禁止繁体字）。英文术语保留原文并用括号标注。
- 每条 title 不超过 12 个字，summary/oneLiner 不超过 30 个字。
- 只说核心信息，去掉"本次""欢迎大家""敬请期待"等废话。
- 日期、截止时间、金额等关键数字要保留。

格式要求:
- 严格返回 JSON，不要 markdown 代码块。
- "highlights" 放匹配用户兴趣的内容，"other" 放所有不匹配的内容（必须包含邮件中除 highlights 以外的全部新闻）。
- 没有匹配的内容时 highlights 为空数组，"other" 包含全部新闻。
- 每项必须是对象，包含如下字段。
- 如果邮件只有1-2条主要内容，highlights和other加起来不要超过6条。
- 同类或重复内容合并为一条，不要拆分。
- 如果邮件原文中某条新闻有对应的链接地址，请在 "url" 字段中提供完整URL。

JSON 示例:
{
  "highlights": [
    { "title": "奖学金申请", "summary": "下周三截止，需提交成绩单和推荐信", "matchedInterest": "奖学金", "url": "https://..." }
  ],
  "other": [
    { "title": "图书馆", "oneLiner": "周末闭馆两天", "url": "" }
  ]
}`;

// ========== 初始化 ==========
(function init() {
  loadPreferences();
  injectUI();
  startEmailObserver();
  listenForStorageChanges();
  console.log('[智能邮件助手] 已注入');
})();

async function loadPreferences() {
  try {
    const result = await chrome.storage.local.get(['api_key', 'api_endpoint', 'interests']);
    if (result.api_key) STATE.apiKey = result.api_key;
    if (result.api_endpoint) STATE.apiEndpoint = result.api_endpoint;
    if (result.interests) STATE.interests = result.interests;
  } catch (e) { /* ignore */ }
}

function listenForStorageChanges() {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.api_key) STATE.apiKey = changes.api_key.newValue || '';
    if (changes.api_endpoint) STATE.apiEndpoint = changes.api_endpoint.newValue || DEFAULTS.API_ENDPOINT;
    if (changes.interests) {
      STATE.interests = changes.interests.newValue || DEFAULTS.INTERESTS;
      // 兴趣标签变更 → 自动重新分析
      if (STATE.panelOpen && STATE.currentEmailContent && !STATE.loading) {
        console.log('[智能邮件助手] 兴趣标签已变更，自动刷新');
        analyze();
        return;
      }
    }
    checkAndInjectButton();
  });
}

// ========== UI 注入 ==========
function injectUI() {
  if (document.getElementById('ai-summarizer-panel')) return;

  // 面板
  const panel = document.createElement('div');
  panel.id = 'ai-summarizer-panel';
  panel.innerHTML = `
    <div class="ai-panel-header">
      <h2>📧 智能邮件助手</h2>
      <button class="ai-btn-close" id="ai-btn-close">✕</button>
    </div>
    <div class="ai-interests-bar" id="ai-interests-bar"></div>
    <div class="ai-panel-body" id="ai-panel-body">
      <div id="ai-state-initial" class="ai-empty"><p>📬 打开邮件后点击「智能摘要」按钮</p></div>
      <div id="ai-state-loading" class="ai-loading" style="display:none"><div class="ai-spinner"></div><p class="ai-loading-text">正在分析...</p></div>
      <div id="ai-state-result" style="display:none"><div id="ai-result-content"></div>
        <div class="ai-actions">
          <button class="ai-btn ai-btn-secondary" id="ai-btn-copy">📋 复制</button>
          <button class="ai-btn ai-btn-primary" id="ai-btn-refresh">🔄 刷新</button>
        </div>
      </div>
      <div id="ai-state-error" style="display:none" class="ai-error">
        <p id="ai-error-msg"></p>
        <details style="margin-top:8px;font-size:11px;text-align:left;">
          <summary style="cursor:pointer;color:#888;">🔧 原始响应</summary>
          <pre id="ai-error-detail" style="background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto;max-height:120px;font-size:10px;color:#666;"></pre>
        </details>
        <button class="ai-btn-retry" id="ai-btn-retry" style="margin-top:8px;">重试</button>
      </div>
    </div>`;
  document.body.appendChild(panel);

  // 遮罩
  const overlay = document.createElement('div');
  overlay.id = 'ai-overlay';
  overlay.className = 'ai-overlay';
  document.body.appendChild(overlay);

  // Toast
  const toast = document.createElement('div');
  toast.id = 'ai-toast';
  toast.className = 'ai-toast';
  document.body.appendChild(toast);

  // 事件
  document.getElementById('ai-btn-close').addEventListener('click', closePanel);
  document.getElementById('ai-overlay').addEventListener('click', closePanel);
  document.getElementById('ai-btn-refresh').addEventListener('click', analyze);
  document.getElementById('ai-btn-retry').addEventListener('click', analyze);
  document.getElementById('ai-btn-copy').addEventListener('click', copyResult);
}

// ========== 邮件观察 & 浮动按钮 ==========
function startEmailObserver() {
  createFloatingButton();
  const observer = new MutationObserver(() => updateButtonVisibility());
  observer.observe(document.body, { childList: true, subtree: true });
  // 定期检查
  setInterval(updateButtonVisibility, 2000);
}

function createFloatingButton() {
  if (document.getElementById('ai-summarizer-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'ai-summarizer-btn';
  btn.textContent = '智 能 摘 要';
  btn.title = 'AI 智能邮件摘要';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (STATE.panelOpen) {
      closePanel();
    } else {
      analyze();
    }
  });

  document.body.appendChild(btn);
}

function updateButtonVisibility() {
  const btn = document.getElementById('ai-summarizer-btn');
  if (!btn) return;
  const hasEmail = detectEmailOpen();
  if (hasEmail) {
    btn.style.display = 'flex';
  } else {
    btn.style.display = 'none';
    // 离开邮件时自动关闭面板
    if (STATE.panelOpen) closePanel();
  }
}

function detectEmailOpen() {
  if (document.querySelector('[role="document"]')) return true;
  if (document.querySelector('[contenteditable="true"]')) return true;
  const main = document.querySelector('[role="main"]');
  if (main && main.textContent && main.textContent.trim().length > 300) return true;
  return false;
}

// ========== 邮件内容提取 ==========
function findEmailContainer() {
  // 策略 1: role="document"
  const docEl = document.querySelector('[role="document"]');
  if (docEl) return docEl;

  // 策略 2: contenteditable
  const editableEl = document.querySelector('[contenteditable="true"]');
  if (editableEl) return editableEl;

  // 策略 3: 特定选择器
  const candidates = document.querySelectorAll(
    '[aria-label*="邮件正文"], [aria-label*="Message body"], ' +
    '[id*="emailbody" i], [id*="EmailBody"], ' +
    '[data-testid*="message-body"]'
  );
  for (const el of candidates) {
    if (el.textContent && el.textContent.trim().length > 100) return el;
  }

  // 策略 4: role="main"
  const mainEl = document.querySelector('[role="main"]');
  if (mainEl && mainEl.textContent && mainEl.textContent.trim().length > 200) return mainEl;

  return null;
}

function extractEmailContent() {
  const container = findEmailContainer();
  if (!container) return null;
  return cleanText(container.textContent);
}

function extractEmailLinks() {
  const container = findEmailContainer();
  if (!container) return [];
  const links = [];
  const anchors = container.querySelectorAll('a[href]');
  const seen = new Set();
  anchors.forEach(a => {
    const href = (a.href || '').trim();
    const text = (a.textContent || '').trim().substring(0, 80);
    // 跳过空的、mailto、锚点、已见过的链接
    if (!href || href.startsWith('mailto:') || href.startsWith('#') || seen.has(href)) return;
    // 跳过链接文字为空或太短的（可能是图片链接）
    if (!text || text.length < 2) return;
    seen.add(href);
    links.push({ text, href });
    if (links.length >= 30) return; // 最多30条
  });
  return links;
}

function matchLinksToItems(items, links) {
  if (!links || links.length === 0) return;
  items.forEach(item => {
    // 如果 AI 已经给了 URL，跳过
    if (item.url && item.url.trim()) return;

    // 用标题/摘要去匹配链接文字
    const searchText = (item.title + ' ' + (item.summary || item.oneLiner || '')).toLowerCase();
    let bestScore = 0;
    let bestUrl = '';

    links.forEach(link => {
      const linkText = link.text.toLowerCase();
      // 完全包含
      if (linkText.includes(searchText.substring(0, 8)) || searchText.includes(linkText.substring(0, 8))) {
        if (linkText.length > bestScore) {
          bestScore = linkText.length;
          bestUrl = link.href;
        }
      }
      // 逐词匹配
      const words = searchText.split(/\s+/).filter(w => w.length >= 2);
      const matchCount = words.filter(w => linkText.includes(w)).length;
      if (matchCount >= 2 && matchCount / words.length > 0.4 && linkText.length > bestScore) {
        bestScore = linkText.length;
        bestUrl = link.href;
      }
    });

    if (bestUrl) {
      item.url = bestUrl;
      console.log('[智能邮件助手] 自动匹配链接:', item.title, '→', bestUrl.substring(0, 60));
    }
  });
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/[​-‍﻿]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^\s+|\s+$/gm, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

// ========== AI 调用 ==========
async function callAI(emailContent, links) {
  const interestsStr = STATE.interests.length > 0 ? STATE.interests.join('、') : '通用';
  let userMessage = `兴趣标签: ${interestsStr}\n\n邮件内容:\n${emailContent}`;
  // 附上邮件中的链接列表，AI 可以匹配到对应新闻条目
  if (links && links.length > 0) {
    userMessage += `\n\n邮件中的链接列表 (请将对应链接填入相应新闻条目的 "url" 字段):\n`;
    links.forEach((l, i) => { userMessage += `${i + 1}. ${l.text}\n   ${l.href}\n`; });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const response = await fetch(STATE.apiEndpoint || DEFAULTS.API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${STATE.apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULTS.AI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`AI 服务错误: ${errorData.error?.message || `HTTP ${response.status}`}`);
    }

    const data = await response.json();
    STATE._lastRawResponse = JSON.stringify(data);
    return parseAIResponse(data);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超时，请重试');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseAIResponse(data) {
  try {
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI 返回内容为空');

    let json = content.trim();

    // 策略 1: 去掉 markdown 代码块
    const m = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m) json = m[1].trim();

    // 策略 2: 如果内容以 { 开头但不止 { 结尾，尝试提取
    if (!json.startsWith('{')) {
      const braceIdx = json.indexOf('{');
      if (braceIdx >= 0) {
        const lastBrace = json.lastIndexOf('}');
        if (lastBrace > braceIdx) {
          json = json.substring(braceIdx, lastBrace + 1);
        }
      }
    }

    console.log('[AI] 解析 JSON:', json.substring(0, 300) + '...');
    const parsed = JSON.parse(json);
    return normalizeAIResult(parsed, content);
  } catch (error) {
    if (error.message.startsWith('AI 返回')) throw error;
    console.error('[AI] JSON 解析失败，原始内容:', data);
    // 保存原始内容供调试
    const rawContent = data.choices?.[0]?.message?.content || '';
    throw new Error('AI 返回格式异常: ' + (error.message || '').substring(0, 50) +
      '\n原始内容已保存到调试面板');
  }
}

function normalizeAIResult(parsed, rawContent) {
  const normalizeItem = (item) => {
    if (typeof item === 'string') {
      return { title: '', summary: item, oneLiner: item, matchedInterest: '', url: '' };
    }
    if (!item || typeof item !== 'object') return { title: '', summary: '' };
    return {
      title: item.title || item.Title || item.标题 || item['标题'] || '',
      summary: item.summary || item.Summary || item.摘要 || item['摘要'] || item.content || '',
      oneLiner: item.oneLiner || item.OneLiner || item.one_liner || item.概括 || item['一行概括'] || item.description || '',
      matchedInterest: item.matchedInterest || item.MatchedInterest || item.兴趣 || item['匹配兴趣'] || item.interest || '',
      url: item.url || item.Url || item.URL || item.链接 || item['链接'] || '',
    };
  };

  const rawHighlights = parsed.highlights || parsed['highlights'] || [];
  const highlights = Array.isArray(rawHighlights) ? rawHighlights.map(normalizeItem) : [];
  const rawOther = parsed.other || parsed['other'] || [];
  const other = Array.isArray(rawOther) ? rawOther.map(normalizeItem) : [];

  const result = { highlights, other };
  result._raw = rawContent || '';
  return result;
}

// ========== 分析流程 ==========
async function analyze() {
  if (STATE.loading) return;

  const emailContent = extractEmailContent();
  if (!emailContent || emailContent.length < 50) {
    showToast('未检测到邮件内容，请确保已打开一封邮件');
    return;
  }

  if (!STATE.apiKey) {
    showToast('请先点击浏览器工具栏的扩展图标配置 API Key');
    return;
  }

  // 提取邮件中的链接
  const links = extractEmailLinks();
  console.log('[智能邮件助手] 提取到', links.length, '个链接:', links.map(l => l.text));

  STATE.currentEmailContent = emailContent;
  STATE.loading = true;
  openPanel();
  showPanelState('loading');

  // 检查缓存（相同邮件+链接+兴趣 = 相同结果）
  const cacheKey = hashContent(emailContent + '|links|' + JSON.stringify(links) + '|int|' + STATE.interests.join(','));
  if (STATE._cache.has(cacheKey)) {
    console.log('[智能邮件助手] 命中缓存');
    const cached = STATE._cache.get(cacheKey);
    STATE.lastResult = cached;
    renderResult(cached);
    showPanelState('result');
    STATE.loading = false;
    return;
  }

  try {
    const result = await callAI(emailContent, links);
    // 后处理: AI 没填的链接从邮件 DOM 自动匹配
    matchLinksToItems(result.highlights, links);
    matchLinksToItems(result.other, links);
    STATE._cache.set(cacheKey, result); // 存入缓存
    STATE.lastResult = result;
    renderResult(result);
    showPanelState('result');
  } catch (error) {
    console.error('[智能邮件助手] 失败:', error);
    // 显示详细错误信息
    const errDiv = document.getElementById('ai-error-msg');
    errDiv.innerHTML = `<strong>${esc(error.message || '分析失败')}</strong>`;
    // 尝试显示原始响应用于调试
    if (STATE._lastRawResponse) {
      const details = document.getElementById('ai-error-detail');
      if (details) details.textContent = STATE._lastRawResponse.substring(0, 500);
    }
    showPanelState('error');
  } finally {
    STATE.loading = false;
  }
}

// ========== 面板控制 ==========
function openPanel() {
  STATE.panelOpen = true;
  document.getElementById('ai-summarizer-panel').classList.add('open');
  document.getElementById('ai-overlay').classList.add('show');
  // 隐藏浮动按钮
  const btn = document.getElementById('ai-summarizer-btn');
  if (btn) btn.classList.add('panel-active');
  updateInterestsBar();
}

function closePanel() {
  STATE.panelOpen = false;
  document.getElementById('ai-summarizer-panel').classList.remove('open');
  document.getElementById('ai-overlay').classList.remove('show');
  // 恢复浮动按钮
  const btn = document.getElementById('ai-summarizer-btn');
  if (btn) btn.classList.remove('panel-active');
}

function showPanelState(state) {
  ['initial', 'loading', 'result', 'error'].forEach(s => {
    const el = document.getElementById(`ai-state-${s}`);
    if (el) el.style.display = s === state ? '' : 'none';
  });
}

function updateInterestsBar() {
  const bar = document.getElementById('ai-interests-bar');
  bar.innerHTML = STATE.interests.length
    ? STATE.interests.map(t => `<span class="ai-interest-chip">${esc(t)}</span>`).join('')
    : '<span style="font-size:11px;color:#888;">未设置标签 — 点击扩展图标配置</span>';
}

// ========== 结果渲染 ==========
function renderResult(result) {
  const container = document.getElementById('ai-result-content');
  const { highlights = [], other = [] } = result;
  let html = '';

  html += '<div class="ai-section-title hl">⭐ 我想看的</div>';
  if (highlights.length === 0) {
    html += '<div class="ai-empty">📭 没有匹配兴趣的内容</div>';
  } else {
    highlights.forEach(item => {
      const hasUrl = !!(item.url && item.url.trim());
      html += `<div class="ai-highlight-card">`;
      if (item.title) {
        html += `<div class="ai-card-title">`;
        if (hasUrl) {
          html += `<a href="${escUrl(item.url)}" target="_blank" rel="noopener" class="ai-card-link">${esc(item.title)} <span class="ai-link-icon">↗</span></a>`;
        } else {
          html += esc(item.title);
        }
        html += `</div>`;
      }
      html += `<div class="ai-card-summary">${esc(item.summary || item.oneLiner || '')}</div>`;
      if (item.matchedInterest) {
        html += `<span class="ai-card-tag">🏷️ ${esc(item.matchedInterest)}</span>`;
      }
      html += `</div>`;
    });
  }

  // (其他新闻 — 只展示不在"我想看的"中的内容)
  if (other.length > 0) {
    html += '<div class="ai-allnews-section">';
    html += '<div class="ai-allnews-header" id="ai-allnews-toggle">';
    html += `<span>📰 其他新闻 (${other.length}条)</span>`;
    html += '<span class="arrow">▶</span>';
    html += '</div>';
    html += '<div class="ai-allnews-body" id="ai-allnews-body">';
    other.forEach(item => {
      const hasUrl = !!(item.url && item.url.trim());
      const line = item.title
        ? `<strong>${esc(item.title)}</strong> · ${esc(item.oneLiner || item.summary || '')}`
        : esc(item.oneLiner || item.summary || '');
      if (hasUrl) {
        html += `<a href="${escUrl(item.url)}" target="_blank" rel="noopener" class="ai-allnews-item ai-allnews-link">${line} ↗</a>`;
      } else {
        html += `<div class="ai-allnews-item">${line}</div>`;
      }
    });
    html += '</div>';
    html += '</div>';
  }

  if (result._raw) {
    html += `<details class="ai-debug"><summary>🔧 原始 JSON</summary><pre>${esc(result._raw)}</pre></details>`;
  }

  container.innerHTML = html;

  // 绑定折叠事件
  const toggle = container.querySelector('#ai-allnews-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('expanded');
      const body = container.querySelector('#ai-allnews-body');
      if (body) body.classList.toggle('show');
    });
  }

}

function copyResult() {
  if (!STATE.lastResult) return;
  const { highlights, other } = STATE.lastResult;
  let text = '📧 智能邮件摘要\n' + '='.repeat(30) + '\n\n⭐ 我想看的\n';
  highlights.forEach((h, i) => {
    text += `${i + 1}. ${h.title || ''}\n   ${h.summary || ''}\n`;
    if (h.matchedInterest) text += `   🏷️ ${h.matchedInterest}\n`;
    if (h.url) text += `   🔗 ${h.url}\n`;
  });
  if (other.length > 0) {
    text += '\n📋 其他新闻\n';
    other.forEach(o => {
      text += `• ${o.title || o.oneLiner || o.summary || ''}`;
      if (o.url) text += ` — ${o.url}`;
      text += '\n';
    });
  }
  navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板 ✓')).catch(() => showToast('复制失败'));
}

// ========== 缓存工具 ==========
function hashContent(text) {
  // 简单哈希：用前500字+总长度作为key
  const sample = text.substring(0, 500) + '|len:' + text.length;
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const ch = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return String(hash) + '_' + text.length;
}

// ========== 工具 ==========
function showToast(msg) {
  const toast = document.getElementById('ai-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escUrl(str) {
  // 转义 URL 用于 href 属性 — 只转义双引号防止属性逃逸
  // 注意: 不转义 &，否则会破坏 URL 查询参数
  if (!str) return '';
  return str.replace(/"/g, '&quot;');
}
