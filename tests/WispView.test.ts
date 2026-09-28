// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", async (original) => ({
  ...await original<object>(),
  ItemView: class {
    app = { workspace: {} };
    containerEl: HTMLElement;
    constructor(leaf: { containerEl: HTMLElement }) { this.containerEl = leaf.containerEl; }
    registerDomEvent(element: HTMLElement, name: string, callback: EventListener) { element.addEventListener(name, callback); }
  },
  Modal: class {},
  Notice: class {},
  Platform: { isMobile: true },
  setIcon: () => {},
  MarkdownRenderer: { render: async (_app: unknown, text: string, element: HTMLElement) => { element.textContent = text; } }
}));
import { WispView } from "../src/views/WispView";
import { LiteAgentRuntime } from "../src/core/LiteAgentRuntime";
import { LiteAgentToolRegistry } from "../src/core/LiteAgentToolRegistry";
import type { LiteAgentProvider } from "../src/core/LiteAgentTypes";
import { SessionStore } from "../src/sessions/SessionStore";
import { I18n } from "../src/i18n/I18n";
import { installObsidianDom } from "./helpers/obsidian-dom";

const views: WispView[] = [];
beforeEach(installObsidianDom);
afterEach(async () => { for (const view of views.splice(0)) await view.onClose(); document.body.replaceChildren(); });
async function openView(store: SessionStore, runtime: LiteAgentRuntime) {
  const root = document.createElement("div");
  root.append(document.createElement("div"), document.createElement("div"));
  document.body.append(root);
  const view = new WispView({ containerEl: root } as never, {
    createRuntime: () => runtime, getMaxSteps: () => 10, requestToolApproval: async () => true,
    isDebugMode: () => false, mobileLayout: "side", createTranscriptionProvider: () => null,
    sessionStore: store, i18n: new I18n("en")
  });
  views.push(view);
  await view.onOpen();
  return { view, root };
}
function send(root: HTMLElement, text: string) {
  const input = root.querySelector("textarea")!;
  input.value = text;
  input.dispatchEvent(new Event("input"));
  root.querySelector<HTMLButtonElement>(".wisp-chat-send")!.click();
}
function storage() {
  let data: unknown = {};
  return { loadData: async () => structuredClone(data), saveData: async (next: unknown) => { data = structuredClone(next); } };
}

describe("WispView recovery", () => {
  it("shows persisted operations after reopening and continues without repeating a write", async () => {
    const plugin = storage();
    const store = new SessionStore(plugin as never);
    await store.load();
    let writes = 0;
    const tools = new LiteAgentToolRegistry();
    tools.register({ name: "append", description: "Append", parameters: { type: "object", properties: {} }, mutates: true,
      execute: async () => { writes++; return { ok: true, value: "written" }; } });
    let calls = 0;
    const provider: LiteAgentProvider = { async *stream() {
      if (++calls === 1) yield { type: "tool_call", id: "write", name: "append", arguments: {} };
      else throw new Error("Network disconnected");
    } };
    const first = await openView(store, new LiteAgentRuntime(provider, tools));
    send(first.root, "Append once");
    await vi.waitFor(() => expect(first.root.querySelector(".wisp-run-records")?.textContent).toContain("Succeeded"));
    await first.view.onClose();
    first.root.remove();
    const restored = new SessionStore(plugin as never);
    await restored.load();
    const resumed: LiteAgentProvider = { async *stream(request) {
      expect(request.messages.some((message) => message.role === "tool")).toBe(true);
      yield { type: "text", text: "Finished remaining work." };
    } };
    const second = await openView(restored, new LiteAgentRuntime(resumed, tools));
    expect(second.root.querySelector(".wisp-run-records")?.textContent).toContain("Succeeded");
    second.root.querySelector<HTMLButtonElement>(".wisp-run-records button")!.click();
    await vi.waitFor(() => expect(restored.active().runs[0].status).toBe("completed"));
    expect(writes).toBe(1);
    expect(second.root.textContent).toContain("Finished remaining work.");
  });

  it("keeps send disabled until a stopped in-flight write and its record settle", async () => {
    const store = new SessionStore(storage() as never);
    await store.load();
    let started = false;
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const tools = new LiteAgentToolRegistry();
    tools.register({ name: "append", description: "Append", parameters: { type: "object", properties: {} }, mutates: true,
      execute: async () => { started = true; await pending; return { ok: true, value: "written" }; } });
    const provider: LiteAgentProvider = { async *stream() { yield { type: "tool_call", id: "write", name: "append", arguments: {} }; } };
    const { root, view } = await openView(store, new LiteAgentRuntime(provider, tools));
    send(root, "Append");
    await vi.waitFor(() => expect(started).toBe(true));
    root.querySelector<HTMLButtonElement>(".wisp-chat-stop")!.click();
    send(root, "Do not start this yet");
    expect(root.querySelector<HTMLButtonElement>(".wisp-chat-send")!.disabled).toBe(true);
    expect(root.textContent).toContain("Stopping");
    let closed = false;
    const closing = view.onClose().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    finish();
    await closing;
    await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>(".wisp-chat-send")!.disabled).toBe(false));
    expect(store.active().runs).toHaveLength(1);
    expect(store.active().runs[0].operations[0].status).toBe("succeeded");
    expect(store.active().runs[0].status).toBe("stopped");
  });
});
