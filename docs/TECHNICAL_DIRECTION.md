# Initial Technical Direction

## Decision

Build Wisp as a separate Obsidian plugin project under `RecurEngine/wisp`, with mobile as the first runtime target and desktop as a compatibility target.

## Why a separate project

The existing Wisp/Claudian codebase is desktop-oriented. Its current manifest is desktop-only and its runtime contains Node.js and Electron assumptions for local processes, filesystem access, and a local HTTP server. Flipping the manifest would not make those paths available on Obsidian Mobile.

A separate project gives us a clean browser-safe dependency boundary and lets us validate the core product loop on mobile before deciding which concepts are worth upstreaming or sharing.

## Runtime boundary

Allowed in production code:

- Obsidian vault, workspace, settings, and UI APIs.
- Browser APIs such as `fetch`, `AbortController`, `ReadableStream`, `MediaRecorder`, and `getUserMedia`.
- Provider REST or browser-safe SDK adapters.

Not allowed in production code:

- `node:*` imports, Electron APIs, `process`, `Buffer`, local child processes, or desktop-only SDKs.
- A provider integration that requires a local daemon before the basic mobile experience can work.

## Planned seams

1. `LiteAgentRuntime`: provider-neutral streaming events, tool loop, approval, and cancellation.
2. `AgentCapabilities`: explicit support for vault access, writes, network, and audio.
3. Provider adapters: browser-safe REST/streaming implementations for Claude Messages API and OpenAI-compatible APIs, kept outside the UI. Claude-compatible gateways receive both `x-api-key` and `Authorization: Bearer` using the same device-local secret.
4. Vault tools: Obsidian-native read/search/write operations; every write requires explicit approval and delete is not exposed.
5. Secure settings: Obsidian SecretStorage for API keys; normal settings for non-secret configuration.
6. Voice input: browser `MediaRecorder` produces a completed audio blob; provider-neutral transcription ports adapt OpenAI-compatible, Deepgram, and Alibaba DashScope REST APIs without adding SDK or Node.js dependencies.
7. Web search: a provider-neutral `WebSearchProvider` returns bounded, normalized search results; `search_web` is registered only when the user enables it and configures a provider.

## Mobile-first constraints

- Use responsive, narrow-width UI primitives and avoid desktop-only layout assumptions.
- Treat network and microphone permissions as recoverable runtime states.
- Prefer incremental streaming and cancellation over long blocking operations.
- Keep transcript and settings persistence independent from provider-native session formats.
- Treat web search results as untrusted reference data. Do not send vault content to the search provider unless the user explicitly asks for it.

## Desktop statement

If the implementation remains within this boundary, the plugin bundle can run on desktop as well. This is a compatibility property, not a guarantee that every behavior is identical: permissions, window size, filesystem access, and available provider integrations can still differ.

## Current implementation status

Completed:

- Standalone mobile-first plugin project with a browser-safe production boundary.
- Claude Messages API and OpenAI-compatible streaming providers.
- Provider-neutral streaming tool loop with cancellation, write approval, and copyable debug errors.
- Obsidian vault tools for listing, reading, searching, opening, current-note access, recent notes, metadata, links, create, append, update, and exact-match edit. Delete and rename remain intentionally unavailable until a safer confirmation flow is designed.
- Persisted multi-session conversations with browser-style tabs, automatic titles, creation, deletion, history clearing, and touch-friendly reordering.
- Voice input through `MediaRecorder`, with OpenAI-compatible, Deepgram, and Alibaba DashScope transcription providers. Transcripts are inserted into the composer for review.
- Web Search option B with Tavily and Brave adapters using Obsidian `requestUrl`, independent SecretStorage credentials, bounded results, and a read-only `search_web` tool.
- English and Simplified Chinese UI translations with an automatic device-language mode.
- BYOK settings reorganized into Chat, Voice, Web Search, and Privacy & Diagnostics cards.
- Configurable mobile display layout: side pane or fullscreen, with the mobile toolbar inset reserved only for fullscreen.

Not yet complete:

- Real-device web-search smoke tests with provider keys and network failure cases.
- Search-result source cards and explicit open/copy source actions in the chat UI.
- Web page extraction/fetching, Chinese search providers, caching, and rate-limit/retry policy.
- Microphone waveform animation and broader mobile accessibility/localization polish.
