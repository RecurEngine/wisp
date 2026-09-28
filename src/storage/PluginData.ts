import type { Plugin } from "obsidian";

const writes = new WeakMap<Plugin, Promise<void>>();

/** Serialize read/merge/write across settings and session checkpoints. */
export function patchPluginData(plugin: Plugin, patch: Record<string, unknown>): Promise<void> {
  const snapshot = structuredClone(patch);
  const next = (writes.get(plugin) ?? Promise.resolve()).then(async () => {
    const current: unknown = await plugin.loadData();
    const base = current !== null && typeof current === "object" && !Array.isArray(current) ? current : {};
    await plugin.saveData({ ...base, ...snapshot });
  });
  // A failed write is reported to its caller but must not poison future writes.
  writes.set(plugin, next.catch(() => {}));
  return next;
}
