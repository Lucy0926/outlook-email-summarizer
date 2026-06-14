// === 智能邮件助手 — 设置弹窗 (自包含) ===

// ========== 常量 ==========
const DEFAULTS = {
  API_ENDPOINT: 'https://api.deepseek.com/v1/chat/completions',
  AI_MODEL: 'deepseek-chat',
  INTERESTS: ['奖学金', '实习', '学术活动', '课程'],
};
const SUGGESTED_INTERESTS = [
  '奖学金', '实习', '学术活动', '课程', '考试',
  '体育', '社团', '志愿者', '讲座', '竞赛',
  '留学', '就业', '科研', '图书馆', '校车',
  '住宿', '餐饮', '心理健康', '职业规划',
];
const STORAGE_KEYS = {
  API_KEY: 'api_key',
  API_ENDPOINT: 'api_endpoint',
  INTERESTS: 'interests',
};

// ========== 状态 ==========
let interests = [...DEFAULTS.INTERESTS];

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  renderInterests();
  renderSuggestions();
  bindEvents();
});

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.API_KEY,
      STORAGE_KEYS.API_ENDPOINT,
      STORAGE_KEYS.INTERESTS,
    ]);
    if (result[STORAGE_KEYS.API_KEY]) {
      document.getElementById('api-key').value = result[STORAGE_KEYS.API_KEY];
    }
    if (result[STORAGE_KEYS.API_ENDPOINT]) {
      document.getElementById('api-endpoint').value = result[STORAGE_KEYS.API_ENDPOINT];
    } else {
      document.getElementById('api-endpoint').value = DEFAULTS.API_ENDPOINT;
    }
    if (result[STORAGE_KEYS.INTERESTS] && Array.isArray(result[STORAGE_KEYS.INTERESTS])) {
      interests = [...result[STORAGE_KEYS.INTERESTS]];
    }
  } catch (e) { /* ignore */ }
}

function bindEvents() {
  document.getElementById('btn-save').addEventListener('click', saveSettings);
  document.getElementById('btn-add-tag').addEventListener('click', addTag);
  document.getElementById('new-tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTag();
  });
}

// ========== 标签管理 ==========
function renderInterests() {
  const container = document.getElementById('interests-container');
  container.innerHTML = interests.map((tag, i) => `
    <span class="chip">
      ${esc(tag)}
      <span class="chip-remove" data-index="${i}">×</span>
    </span>
  `).join('');
  container.querySelectorAll('.chip-remove').forEach(el => {
    el.addEventListener('click', () => {
      interests.splice(parseInt(el.dataset.index), 1);
      renderInterests();
      renderSuggestions();
    });
  });
}

function addTag() {
  const input = document.getElementById('new-tag-input');
  const tag = input.value.trim();
  if (!tag) return;
  if (interests.includes(tag)) { showToast('标签已存在'); return; }
  if (interests.length >= 10) { showToast('最多 10 个'); return; }
  interests.push(tag);
  input.value = '';
  renderInterests();
  renderSuggestions();
}

function renderSuggestions() {
  const container = document.getElementById('suggested-tags');
  container.innerHTML = SUGGESTED_INTERESTS
    .filter(t => !interests.includes(t))
    .map(t => `<span class="tag-suggest">${esc(t)}</span>`)
    .join('');
  container.querySelectorAll('.tag-suggest').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.textContent.trim();
      if (!interests.includes(tag) && interests.length < 10) {
        interests.push(tag);
        renderInterests();
        renderSuggestions();
      }
    });
  });
}

// ========== 保存 ==========
async function saveSettings() {
  const apiKey = document.getElementById('api-key').value.trim();
  const endpoint = document.getElementById('api-endpoint').value.trim();
  if (!apiKey) { showToast('请输入 API Key'); return; }

  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.API_KEY]: apiKey,
      [STORAGE_KEYS.API_ENDPOINT]: endpoint || DEFAULTS.API_ENDPOINT,
      [STORAGE_KEYS.INTERESTS]: interests,
    });
    showToast('设置已保存 ✓');
  } catch (e) {
    showToast('保存失败: ' + e.message);
  }
}

// ========== 工具 ==========
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2000);
}

function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
