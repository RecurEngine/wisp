# Wisp

[English](README.md) · [简体中文](README.zh-CN.md)

> A small intelligence that follows you everywhere.
>
> 一个随时随地陪伴你的微小智能。

Wisp 是一款跨平台、移动优先的 Obsidian AI 助手，将 Provider 对话、Vault 操作、语音输入和可选的联网搜索整合到 Obsidian 工作区中。

当前项目处于早期 MVP 阶段，优先支持 Obsidian Mobile，同时保持在 Obsidian Desktop 上的兼容性。Wisp 不提供模型或搜索额度，用户需要使用自己的 Provider Key。

## 为什么做 Wisp

Obsidian 是很多人沉淀和发展个人知识的地方，但用户会在手机、平板和电脑之间切换。Wisp 的初衷是做一款可以在 Obsidian 所支持的多端环境中使用的统一助手，让用户能够用自然语言管理自己的 Vault，同时保持浏览器安全的运行边界。

当前产品方向是 **免费 + BYOK（Bring Your Own Key，自带 Key）**：用户自行选择 AI、语音和搜索 Provider，Wisp 不提供托管模型额度，也不要求订阅。未来可能会探索付费方案，但当前范围内没有付费计划或商业化要求。

## 功能

- 支持 Claude Messages API 和 OpenAI 兼容格式的流式对话。
- 支持列出、读取、搜索、打开笔记，以及查看元数据、链接、最近笔记和当前笔记。
- 支持创建、追加、更新和精确匹配编辑笔记；所有写入操作都需要用户明确批准。
- 支持多个持久化会话，提供类似浏览器的 Tab、拖拽排序、重命名、删除和清除历史。
- 支持 Markdown 回复、链接、代码块和 Obsidian 数学公式渲染。
- 支持基于浏览器 `MediaRecorder` 的普通语音输入，转写后可确认再发送。
- 支持带语音活动检测和停顿自动发送的实时语音输入 MVP，但不会生成语音回复。
- 支持 OpenAI 兼容接口、Deepgram 和阿里云 DashScope 语音转文字 Provider。
- 可选 Tavily 和 Brave Search 联网搜索，搜索工具只读。
- 移动端支持半屏侧栏和全屏两种显示方式。
- 设置和聊天界面支持英文、简体中文。
- 支持复制调试信息，并自动隐藏 API Key 和 Bearer Token。

## 环境要求

- Obsidian 1.13.0 或更高版本。
- 一个用于对话的 Provider 账号和 API Key。
- 可选：语音转文字 Provider Key。
- 可选：Tavily 或 Brave Search Key。
- Node.js 18 或更高版本，用于开发和构建。

生产包只使用 Obsidian API 和浏览器 API，不需要 Node.js、Electron、本地服务器或桌面 CLI 才能运行。

## 安装

当前项目仍处于通过源码安装和验证阶段，后续再准备 Obsidian 社区插件发布。

```bash
git clone <repository-url>
cd wisp-mobile
npm install
npm run build
```

将生成的 `main.js`、`manifest.json` 和 `styles.css` 复制到：

```text
<你的 Vault>/.obsidian/plugins/wisp-mobile/
```

然后在 **设置 → 社区插件** 中启用 **Wisp**。`main.js` 和 `styles.css` 是由 `npm run build` 生成的发布产物，已被 Git 忽略。

开发时可以运行：

```bash
npm run dev
```

该命令会监听 `src/main.ts` 并生成带 inline source map 的开发包。安装到设备前请使用生产构建。

## 配置

打开 **设置 → Wisp**，先配置对话 Provider：

| 能力 | Provider | 保存位置 |
| --- | --- | --- |
| 对话 | Claude Messages API、OpenAI 兼容 API | Key 保存在 Obsidian SecretStorage；接口、模型和提示词保存在插件设置 |
| 语音转文字 | OpenAI 兼容接口、Deepgram、阿里云 DashScope | Key 保存在 Obsidian SecretStorage；接口和模型保存在插件设置 |
| 联网搜索 | Tavily、Brave Search | Key 保存在 Obsidian SecretStorage；接口和结果数量保存在插件设置 |

请在对应输入框中填写原始 Key，并点击 **保存修改**。不要粘贴 `ANTHROPIC_AUTH_TOKEN=...`、引号或完整的 shell 环境变量赋值。

在 Obsidian Mobile 中，**移动端显示方式**可以选择半屏侧栏或全屏。修改后保存设置，关闭 Wisp，再重新打开。

## Vault 安全

只读工具可以查看笔记、文件夹、元数据、链接、当前笔记和最近笔记。所有修改笔记的工具都会请求明确批准。本 MVP 暂未开放删除笔记和重命名笔记。

只有当 Agent 需要 Vault 工具结果来回答问题时，Wisp 才会将相关 Vault 内容发送给配置的对话 Provider。Vault 内容不会自动发送到联网搜索或语音转文字 Provider。搜索结果会被当作不可信的参考资料处理。

## 隐私与安全

- API Key 使用 Obsidian `SecretStorage` 保存，不写入 `data.json`。
- 只有在用户主动发起对话、转写或启用联网搜索时才会发起对应网络请求。
- 项目没有遥测服务或后台同步。
- 调试信息会隐藏常见的 API Key、Bearer Token 和 `api_key` 值，但分享前仍应人工检查。
- 具体 Provider 的服务条款、数据保留和数据处理政策仍然适用。

完整的敏感信息清单和漏洞报告方式见 [SECURITY.md](SECURITY.md)。

## 项目结构

```text
src/
├── main.ts                  # 插件生命周期和应用组合
├── core/                    # Provider 无关的运行时、工具、错误和契约
├── providers/               # Claude 和 OpenAI 兼容对话适配器
├── tools/                   # Obsidian Vault 操作和路径安全
├── sessions/                # 持久化会话状态
├── settings/                # SecretStorage、设置持久化和设置界面
├── views/                   # 聊天视图、输入框、会话 UI 和批准弹窗
├── voice/                   # 录音、VAD 和语音转文字适配器
├── websearch/               # 搜索适配器和只读 search_web 工具
└── i18n/                    # 英文和简体中文翻译

tests/                       # 与运行时代码对应的单元测试
docs/                        # 路线图和技术方向
```

依赖方向保持简单：`main.ts` 负责组合服务；视图依赖 Provider 无关的运行时契约；Provider 适配器负责协议细节；Vault 工具负责 Obsidian 文件操作。生产代码不能引入 Node.js、Electron、`process` 或 `Buffer`。

## 开发检查

提交 Pull Request 前运行：

```bash
npm run typecheck
npm run test
npm run build
```

修改运行时行为后，还需要在 Obsidian Mobile 和 Desktop 手动验证。至少测试一次对话、Vault 读取、批准写入、语音转写、联网搜索和失败恢复。

## 当前限制

- 搜索来源卡片和显式来源操作仍在规划中。
- 暂不包含网页提取、缓存、重试和更多地区搜索 Provider。
- 语音输入依赖浏览器麦克风权限以及 Provider 的音频限制。
- 实时语音功能目前只负责输入，不支持文字转语音或全双工语音会话。
- 社区插件发布元数据和自动化发布流程尚未配置。

详见 [docs/ROADMAP.md](docs/ROADMAP.md) 和 [docs/TECHNICAL_DIRECTION.md](docs/TECHNICAL_DIRECTION.md)。

## 参与贡献

欢迎提交 Issue 和聚焦明确的 Pull Request。提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，尤其是浏览器安全运行边界和 Provider 所有权规则。

## 许可证

Wisp 使用 [MIT License](LICENSE) 开源。
