# Contributing to Wisp

Issues and focused pull requests are welcome. For a substantial feature, open an issue first so the problem and scope can be discussed before implementation.

## Before opening an issue or pull request

- Search existing issues and pull requests first.
- Keep each change focused; avoid mixing unrelated refactors or dependency updates.
- Remove API keys, tokens, private vault content, personal filesystem paths, and raw provider responses from logs and screenshots.
- Explain the Obsidian version, device/platform, Wisp version, provider, and installation method when reporting a runtime problem.

## Runtime boundary

Production code under `src/` must run in Obsidian Mobile and Desktop. Use Obsidian APIs and browser APIs such as `fetch`, `AbortController`, `ReadableStream`, `MediaRecorder`, and `getUserMedia`.

Do not add:

- `node:*` imports, Electron APIs, `process`, or `Buffer` to production code.
- Local child processes, local servers, or desktop-only provider SDKs.
- Provider-specific logic to shared chat views or the provider-neutral runtime.

Build tooling may use Node.js because it is not bundled into the plugin.

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```

Behavior changes and bug fixes should include a focused test. Keep provider adapters and vault operations behind their existing boundaries. Any write operation must retain explicit user approval.

## Pull requests

A pull request should describe:

- Why the change is needed.
- What behavior or interface changed.
- Important tradeoffs and compatibility considerations.
- Tests and manual device checks performed.
- Known limitations or follow-up work.

User-facing changes should update the README or the relevant document under `docs/`. New providers should include an adapter test and settings documentation, and must remain browser-safe.

For maintainer contact, email [dev@rrecurengine.com](mailto:dev@rrecurengine.com). Security reports should follow [SECURITY.md](SECURITY.md) instead of a public issue.
