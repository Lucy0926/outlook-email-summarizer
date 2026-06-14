# 📧 智能邮件助手

AI 驱动的邮件智能摘要浏览器扩展。打开 Outlook Web 中的学校/工作邮件，一键提取你关注的内容。

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Browser](https://img.shields.io/badge/browser-Chrome%20|%20Edge-blue)

## ✨ 功能

- **一键摘要** — 打开邮件，点击右侧半透明按钮，侧边栏滑出 AI 摘要
- **兴趣匹配** — 设置关注标签（奖学金、实习、课程等），自动高亮相关内容
- **原文跳转** — 每条新闻如果邮件中有对应链接，标题变成可点击链接直达原文
- **结果一致** — 同一封邮件每次分析结果一致，不会变来变去
- **全部新闻** — 底部可折叠列表，列出所有新闻条目
- **自带 API Key** — 使用你自己的 DeepSeek API Key，数据不过第三方

## 🎬 效果预览

```
打开邮件 → 右侧出现半透明竖排「智能摘要」按钮
    ↓ 点击
┌─────────────────────────────┐
│  ⭐ 重点关注                  │
│  ┌─ 奖学金申请 ↗ ─────────┐ │
│  │  下周三截止，需提交...   │ │
│  │  🏷️ 奖学金              │ │
│  └────────────────────────┘ │
│                               │
│  📰 全部新闻 (5条)      ▶    │
└─────────────────────────────┘
```

## 🚀 安装使用

### 方式一：开发者模式加载（推荐）

1. 下载本项目或 `git clone`
2. 打开 Chrome，地址栏输入 `chrome://extensions`
3. 右上角开启 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择本项目中的 `extension/` 文件夹
6. 完成 ✅

### 方式二：Chrome 应用商店（计划中）

> 待发布

### 配置 API Key

1. 安装后在浏览器工具栏找到 📧 图标，点击
2. 填入你的 [DeepSeek API Key](https://platform.deepseek.com/api_keys)
3. 设置你关注的兴趣标签
4. 保存

## 🛠️ 技术栈

| 层 | 技术 |
|---|---|
| 扩展框架 | Chrome Extension Manifest V3 |
| AI 服务 | DeepSeek API (`deepseek-chat`) |
| 样式 | 原生 CSS（白色简洁风） |
| 存储 | `chrome.storage.local` |
| 运行时 | 纯 JavaScript，零依赖 |

## 📁 项目结构

```
extension/
├── manifest.json          # 扩展清单 (MV3)
├── content/
│   ├── content.js         # 内容脚本：UI 注入 + AI 调用 + 缓存
│   └── content.css        # 侧边栏 + 浮动按钮样式
├── popup/
│   ├── popup.html         # 设置弹窗
│   ├── popup.js           # 设置逻辑
│   └── popup.css          # 设置弹窗样式
├── assets/
│   └── icon-*.png         # 扩展图标 (16/32/64/80/128)
├── services/
│   └── ai-service.js      # AI 服务接口参考
└── utils/
    └── constants.js       # 常量定义参考
```

## 🔧 本地开发

```bash
git clone <repo-url>
# 没有构建步骤，直接加载 extension/ 到 Chrome 即可
# 修改 content.js 或 content.css 后，在 chrome://extensions 点刷新
```

**调试：**
- 右键 Outlook 页面 → 检查 → Console，查看 `[智能邮件助手]` 开头的日志
- 侧边面板底部的 🔧 原始 JSON 可查看 AI 返回的完整数据

## 🤝 参与贡献

欢迎提交 Issue 和 PR！

### 开发约定

- JavaScript 使用自包含风格（无 ES Module import），因为 MV3 content script 限制
- CSS 使用 `!important` 仅在必要时（防止页面样式污染）
- `content.js` 是核心文件，修改前请先理解 `STATE` 和缓存逻辑
- AI Prompt 修改需注意：temperature=0 保证结果一致性

### 常见贡献方向

- [ ] 支持更多邮箱（Gmail、QQ 邮箱等）
- [ ] 支持 OpenAI / Claude 等其他 AI 后端
- [ ] 多语言支持
- [ ] 导出摘要为 Markdown / PDF
- [ ] 一键翻译邮件
- [ ] 发布到 Chrome Web Store

## 📄 许可

MIT License

---

> 由 UM Today 邮件阅读体验催生的项目 📬
