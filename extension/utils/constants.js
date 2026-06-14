// === 常量定义 ===

export const DEFAULTS = {
  API_ENDPOINT: 'https://api.deepseek.com/v1/chat/completions',
  AI_MODEL: 'deepseek-chat',
  INTERESTS: ['奖学金', '实习', '学术活动', '课程'],
  LANGUAGE: 'zh-CN',
};

export const SUGGESTED_INTERESTS = [
  '奖学金', '实习', '学术活动', '课程', '考试',
  '体育', '社团', '志愿者', '讲座', '竞赛',
  '留学', '就业', '科研', '图书馆', '校车',
  '住宿', '餐饮', '心理健康', '职业规划',
];

export const AI_TIMEOUT = 30000;
export const MIN_EMAIL_LENGTH = 50;

// Storage keys (chrome.storage)
export const STORAGE_KEYS = {
  API_KEY: 'api_key',
  API_ENDPOINT: 'api_endpoint',
  INTERESTS: 'interests',
};
