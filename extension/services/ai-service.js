// === AI 服务层 ===
import { DEFAULTS, AI_TIMEOUT } from '../utils/constants.js';

const SYSTEM_PROMPT = `你是一个专业的邮件智能摘要助手，帮助用户快速理解学校新闻邮件。

你的任务:
1. 根据用户的"兴趣标签"，从邮件中找出相关内容，提供 2-3 句话的详细摘要。
2. 对于不匹配用户兴趣的其他内容，每条用一句话概括要点。
3. 如果某条内容部分匹配兴趣但不够明确，也可以放入"highlights"。

要求:
- 使用中文回复（如果邮件是英文，保持关键术语的原文）。
- 摘要简洁有力，每条摘要不超过 80 字。
- 严格返回以下 JSON 格式，不要任何额外文字，不要用 markdown 代码块包裹。
- 每个元素必须是对象，包含指定字段，不要用纯字符串。
- "highlights" 可以为空数组（如果没有匹配的内容）。
- "other" 中的每一条都要有实质内容，不要重复。

JSON 格式示例:
{
  "highlights": [
    { "title": "标题", "summary": "详细摘要", "matchedInterest": "匹配的兴趣标签" }
  ],
  "other": [
    { "title": "标题", "oneLiner": "一句话概括" }
  ]
}`;

export async function summarizeEmail(emailContent, interests, apiKey, endpoint) {
  const ep = endpoint || DEFAULTS.API_ENDPOINT;
  const interestsStr = interests.length > 0 ? interests.join('、') : '通用';

  const userMessage = `兴趣标签: ${interestsStr}\n\n邮件内容:\n${emailContent}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT);

  try {
    const response = await fetch(ep, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULTS.AI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
      throw new Error(`AI 服务错误: ${errorMsg}`);
    }

    const data = await response.json();
    return parseResponse(data);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('请求超时，请重试');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseResponse(data) {
  try {
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI 返回内容为空');

    let jsonStr = content.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) jsonStr = match[1].trim();

    const parsed = JSON.parse(jsonStr);
    const normalized = normalize(parsed);
    normalized._raw = jsonStr;
    return normalized;
  } catch (error) {
    if (error.message.startsWith('AI 返回')) throw error;
    console.error('[AI] JSON 解析失败:', data);
    throw new Error('AI 返回格式异常，请重试');
  }
}

function normalize(parsed) {
  const normalizeItem = (item) => {
    if (typeof item === 'string') {
      return { title: '', summary: item, oneLiner: item, matchedInterest: '' };
    }
    if (!item || typeof item !== 'object') return { title: '', summary: '' };
    return {
      title: item.title || item.Title || item.标题 || item['标题'] || '',
      summary: item.summary || item.Summary || item.摘要 || item['摘要'] || item.content || '',
      oneLiner: item.oneLiner || item.OneLiner || item.one_liner || item.概括 || item['一行概括'] || item.description || '',
      matchedInterest: item.matchedInterest || item.MatchedInterest || item.兴趣 || item['匹配兴趣'] || item.interest || '',
    };
  };

  const rawHighlights = parsed.highlights || parsed['highlights'] || [];
  const highlights = Array.isArray(rawHighlights) ? rawHighlights.map(normalizeItem) : [];
  const rawOther = parsed.other || parsed['other'] || [];
  const other = Array.isArray(rawOther) ? rawOther.map(normalizeItem) : [];

  return { highlights, other };
}
