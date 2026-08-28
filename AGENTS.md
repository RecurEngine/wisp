# Wisp Mobile Agent Instructions

## Scope

Wisp Mobile is an independent, mobile-first Obsidian plugin. Its production bundle must run in both Obsidian Mobile and Obsidian Desktop.

## Platform boundary

- Production code may use Obsidian APIs and browser Web APIs.
- Production code must not import `node:*`, Electron, `process`, `Buffer`, or desktop-only SDKs.
- Keep provider integrations behind browser-safe ports; use `fetch`, `AbortController`, `MediaRecorder`, and Obsidian's vault APIs.
- `esbuild.config.mjs` is build tooling and may use Node APIs; it is never bundled into the plugin.

## Commands

```bash
npm run typecheck
npm run test
npm run build
```

The plugin should be manually smoke-tested on an Obsidian Mobile device and in Obsidian Desktop after each runtime integration milestone.
