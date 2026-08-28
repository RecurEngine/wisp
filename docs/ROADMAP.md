# Wisp Mobile Roadmap

This roadmap follows the mobile-first constraint: every milestone must work in Obsidian Mobile and remain compatible with Obsidian Desktop without adding Node.js or Electron runtime dependencies.

## Completed

- [x] Create a standalone `wisp-mobile` Obsidian plugin.
- [x] Add Claude Messages API and OpenAI-compatible streaming providers.
- [x] Add the LiteAgent tool loop, cancellation, write approval, and debug diagnostics.
- [x] Add the core Obsidian vault operations for read, search, open, metadata, links, recent notes, create, append, update, and exact-match edit.
- [x] Add persisted multi-session conversations with browser-style session tabs, creation, deletion, history clearing, and touch-friendly reordering.
- [x] Add mobile voice input with MediaRecorder, OpenAI-compatible transcription, Deepgram, and Alibaba DashScope.
- [x] Add Web Search option B: Tavily and Brave provider adapters, normalized bounded results, and the read-only `search_web` tool.
- [x] Add Web Search settings with an independent secret and enable/disable control.
- [x] Add English and Simplified Chinese UI translations with automatic device-language selection.
- [x] Reorganize BYOK settings into Chat, Voice, Web Search, and Privacy & Diagnostics cards.
- [x] Verify the current source with type checking, 35 automated tests, and a production build.

## Next milestone: verify the complete mobile loop

1. Configure a Tavily or Brave key in the local vault and run real searches on Obsidian Mobile.
2. Verify current-information questions, empty results, invalid keys, offline mode, slow responses, and provider rate limits.
3. Confirm that only the explicit query leaves the vault; note contents are not automatically sent to the search provider.
4. Confirm that search snippets are treated as untrusted data and that the model does not follow instructions embedded in a result.
5. Repeat the same smoke tests on Obsidian Desktop.

## Product milestone: make search visible and trustworthy

- Render search results as compact source cards with title, domain, snippet, and link actions.
- Preserve source URLs in the assistant answer and provide a copyable citation action.
- Add request timeout, retry guidance, and clearer authentication/rate-limit messages.
- Add a small search status state so users can distinguish searching, no results, and provider failure.

## Provider milestone

- Keep the current provider-neutral interface stable.
- Add a Chinese search adapter, prioritizing Zhipu or Bocha after checking their current API access and terms.
- Add an optional extraction adapter for selected URLs; do not implement arbitrary page scraping in the first pass.
- Consider a server proxy mode later for users who need API-key isolation, quota control, or shared caching.

## Voice and mobile UX milestone

- Add microphone waveform animation driven by recorder audio levels when available.
- Improve microphone permission recovery and recording cancellation feedback.
- Test narrow screens, keyboard avoidance, long transcripts, tab overflow, and screen-reader labels.

## Session interaction details

- A new session is inserted after the active tab and becomes active.
- Closing a session with history requires confirmation and never affects Vault notes.
- The last remaining session cannot be deleted.
- A touch long-press or mouse drag reorders tabs; a normal tap still switches tabs.
- Desktop right-click exposes rename, clear-history, and delete actions; mobile keeps direct close and drag gestures plus a session-actions menu.
- Clearing history keeps the session tab and title, and never changes Vault notes.
- The persisted session array is the source of truth for tab order.

## Vault safety milestone

- Add integration coverage around `open_note` and write approval in a real Obsidian test vault.
- Decide whether rename and delete belong in the mobile product; if added, require an operation-specific confirmation and a recoverable/trash-based flow.
- Add bounded output and cancellation checks to any future bulk vault operation.

## Release gate

Before calling the mobile MVP stable, run:

```bash
npm run typecheck
npm run test
npm run build
```

Then manually test the installed plugin on both Obsidian Mobile and Desktop with at least one chat request, one vault tool call, one approved write, one voice transcription, one web search, and one failure/recovery path.
