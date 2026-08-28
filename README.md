# Wisp Mobile

Wisp Mobile is an independent, mobile-first Obsidian plugin for the Wisp agent experience.

The first milestone is intentionally small: load on Obsidian Mobile, open a workspace view, send a request to a Claude or OpenAI-compatible streaming endpoint, use vault tools, and keep the runtime boundary browser-safe. The same bundle is also intended to run on Obsidian Desktop.

## Development

```bash
npm install
npm run typecheck
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into an Obsidian vault plugin directory for a manual smoke test.

The current tool loop includes mobile-safe Obsidian operations for listing, reading, searching, opening, inspecting metadata and links, reading the active note, and inspecting recent notes. It also includes `create_note`, `append_note`, `update_note`, and exact-match `edit_note`. Every write tool requires explicit approval in an Obsidian modal; delete and rename are intentionally not exposed yet.

Settings use an explicit **Save changes** button. Enable **Debug mode** when diagnosing provider or tool failures; the chat shows a copyable diagnostic block with timestamps and stack details, while API keys and bearer tokens are redacted before copying.

Voice input records locally with the browser `MediaRecorder` API, then sends the completed clip directly to the selected speech-to-text provider. The transcript is placed in the composer for review before it is sent to the agent. The first supported providers are OpenAI-compatible transcription endpoints (including OpenAI and Groq), Deepgram, and Alibaba DashScope (`qwen3-asr-flash`). DashScope uses `https://dashscope.aliyuncs.com/compatible-mode/v1` by default.

Web search is available as an optional read-only `search_web` tool. The first adapters are Tavily and Brave Search, and requests use Obsidian's browser-safe `requestUrl` API. Search credentials are stored separately from chat and voice credentials; vault content is not added to search queries automatically. See [the roadmap](docs/ROADMAP.md) for current implementation status and next milestones.

Supported providers:

- Claude Messages API: `https://api.anthropic.com`, for example `claude-sonnet-4-20250514`.
- OpenAI-compatible API: `https://api.openai.com/v1` or another compatible endpoint.

## Compatibility rule

The plugin bundle must stay within Obsidian APIs and browser Web APIs. Do not add Node.js, Electron, or desktop-only provider SDK imports to `src/`.

Desktop is a second target, not a separate runtime branch. Differences such as microphone permissions, viewport layout, and provider network policy should be handled behind capability-aware browser-safe adapters.
