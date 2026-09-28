import { expect, it, vi } from "vitest";
vi.mock("obsidian", async (original) => ({ ...await original<object>(), PluginSettingTab: class {} }));
import { WispSettingsStore, DEFAULT_WISP_SETTINGS } from "../src/settings/WispSettings";
import { SessionStore } from "../src/sessions/SessionStore";

it("preserves execution records when settings and a checkpoint are saved together", async () => {
  let data: unknown = {};
  const plugin = {
    app: { secretStorage: { setSecret() {}, getSecret() { return null; } } },
    loadData: async () => structuredClone(data),
    saveData: async (next: unknown) => { await Promise.resolve(); data = structuredClone(next); }
  };
  const sessions = new SessionStore(plugin as never);
  const settings = new WispSettingsStore(plugin as never);
  await sessions.load();
  await Promise.all([
    sessions.saveRun(sessions.active().id, { id: "run", input: "Read", status: "completed", messages: [{ role: "user", content: "Read" }], operations: [] }),
    settings.save({ ...DEFAULT_WISP_SETTINGS, model: "changed-model" })
  ]);
  const restored = new SessionStore(plugin as never);
  await restored.load();
  expect(restored.active().runs[0]?.id).toBe("run");
  expect((await settings.load()).model).toBe("changed-model");
});
