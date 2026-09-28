# Wisp Agent Instructions

## Scope

Wisp is an independent, mobile-first Obsidian plugin. Its production bundle must run in both Obsidian Mobile and Obsidian Desktop.

## Platform boundary

- Production code may use Obsidian APIs and browser Web APIs.
- Production code must not import `node:*`, Electron, `process`, `Buffer`, or desktop-only SDKs.
- Keep provider integrations behind browser-safe ports; use `fetch`, `AbortController`, `MediaRecorder`, and Obsidian's vault APIs.
- `esbuild.config.mjs` is build tooling and may use Node APIs; it is never bundled into the plugin.

## Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

The plugin should be manually smoke-tested on an Obsidian Mobile device and in Obsidian Desktop after each runtime integration milestone.

## Agent reliability tests

For changes to agent execution, recovery, approval, or vault writes, add a failing
behavioral regression test before the fix and work in small red-green cycles.
Exercise the real runtime/session store and mock only external boundaries.
See [docs/TESTING.md](docs/TESTING.md) for the recovery contract, test suites,
and required Android/Desktop smoke checks.
