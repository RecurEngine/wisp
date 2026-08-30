import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/sessions/SessionStore";
import type { LiteAgentMessage } from "../src/core/LiteAgentTypes";

function createPlugin(initial: unknown = {}): { loadData: () => Promise<unknown>; saveData: (value: unknown) => Promise<void> } {
  let data = initial;
  return {
    loadData: async () => data,
    saveData: async (value) => {
      data = value;
    }
  };
}

describe("SessionStore", () => {
  it("creates a default session and persists new sessions without replacing other data", async () => {
    const plugin = createPlugin({ provider: "claude" });
    const store = new SessionStore(plugin as never, () => 1000);

    await store.load();
    const created = await store.create();
    const data = await plugin.loadData() as { provider: string; sessions: unknown[]; activeSessionId: string };

    expect(store.list()).toHaveLength(2);
    expect(created.title).toBe("New chat");
    expect(data.provider).toBe("claude");
    expect(data.sessions).toHaveLength(2);
    expect(data.activeSessionId).toBe(created.id);
  });

  it("keeps histories isolated when switching sessions and restores them", async () => {
    const plugin = createPlugin();
    const first = new SessionStore(plugin as never, () => 1000);
    await first.load();
    const firstId = first.active().id;
    const firstHistory: LiteAgentMessage[] = [{ role: "user", content: "first topic" }];
    await first.updateHistory(firstId, firstHistory);
    const second = await first.create();
    await first.updateHistory(second.id, [{ role: "user", content: "second topic" }]);
    await first.switchTo(firstId);

    expect(first.active().history).toEqual(firstHistory);

    const restored = new SessionStore(plugin as never, () => 2000);
    await restored.load();
    expect(restored.active().id).toBe(firstId);
    expect(restored.active().history).toEqual(firstHistory);
    await restored.switchTo(second.id);
    expect(restored.active().history).toEqual([{ role: "user", content: "second topic" }]);
  });

  it("uses the first user message as the default session title", async () => {
    const plugin = createPlugin();
    const store = new SessionStore(plugin as never, () => 1000);
    await store.load();

    await store.updateHistory(store.active().id, [{ role: "user", content: "  Summarize my product research  " }]);

    expect(store.active().title).toBe("Summarize my product research");
  });

  it("persists safe image attachment metadata without binary data", async () => {
    const plugin = createPlugin();
    const store = new SessionStore(plugin as never, () => 1000);
    await store.load();

    await store.updateHistory(store.active().id, [{
      role: "user",
      content: "Insert this image",
      attachments: [{ type: "image", path: "Attachments/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg" }]
    }]);

    const restored = new SessionStore(plugin as never, () => 2000);
    await restored.load();
    expect(restored.active().history[0]).toEqual({
      role: "user",
      content: "Insert this image",
      attachments: [{ type: "image", path: "Attachments/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg" }]
    });
  });

  it("keeps tab order stable, inserts new sessions after the active tab, and reorders them", async () => {
    const plugin = createPlugin();
    const store = new SessionStore(plugin as never, () => 1000);
    await store.load();
    const firstId = store.active().id;
    const second = await store.create();
    await store.switchTo(firstId);
    const third = await store.create();

    expect(store.list().map((session) => session.id)).toEqual([firstId, third.id, second.id]);

    await store.reorder(third.id, 0);
    expect(store.list().map((session) => session.id)).toEqual([third.id, firstId, second.id]);

    const restored = new SessionStore(plugin as never, () => 2000);
    await restored.load();
    expect(restored.list().map((session) => session.id)).toEqual([third.id, firstId, second.id]);
  });

  it("deletes a session, selects the adjacent tab, and preserves one final session", async () => {
    const plugin = createPlugin();
    const store = new SessionStore(plugin as never, () => 1000);
    await store.load();
    const firstId = store.active().id;
    const second = await store.create();
    await store.switchTo(firstId);

    await expect(store.delete(firstId)).resolves.toBe(true);
    expect(store.active().id).toBe(second.id);
    expect(store.list()).toHaveLength(1);
    await expect(store.delete(second.id)).resolves.toBe(false);
    expect(store.list()).toHaveLength(1);
  });

  it("renames a session and persists the trimmed title", async () => {
    const plugin = createPlugin();
    const store = new SessionStore(plugin as never, () => 1000);
    await store.load();
    const id = store.active().id;

    await store.rename(id, "  Product research  ");

    expect(store.active().title).toBe("Product research");
    const data = await plugin.loadData() as { sessions: Array<{ id: string; title: string }> };
    expect(data.sessions.find((session) => session.id === id)?.title).toBe("Product research");
  });

  it("clears a session history without deleting the session", async () => {
    const plugin = createPlugin();
    const store = new SessionStore(plugin as never, () => 1000);
    await store.load();
    const id = store.active().id;

    await store.rename(id, "Product research");
    await store.updateHistory(id, [
      { role: "user", content: "Keep this tab" },
      { role: "assistant", content: "Here is the answer" }
    ]);

    await expect(store.clearHistory(id)).resolves.toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.active().id).toBe(id);
    expect(store.active().title).toBe("Product research");
    expect(store.active().history).toEqual([]);

    const restored = new SessionStore(plugin as never, () => 2000);
    await restored.load();
    expect(restored.active().id).toBe(id);
    expect(restored.active().title).toBe("Product research");
    expect(restored.active().history).toEqual([]);
  });
});
