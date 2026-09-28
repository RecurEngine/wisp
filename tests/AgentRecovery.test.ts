import { expect, it } from "vitest";
import { LiteAgentRuntime } from "../src/core/LiteAgentRuntime";
import { LiteAgentToolRegistry } from "../src/core/LiteAgentToolRegistry";
import type { LiteAgentProvider } from "../src/core/LiteAgentTypes";
import { SessionStore } from "../src/sessions/SessionStore";

async function drain(events: AsyncIterable<unknown>) { for await (const _event of events) { /* consume */ } }

it("persists successful writes before a network failure and resumes without replaying them", async () => {
  let data: unknown = {};
  const plugin = { loadData: async () => structuredClone(data), saveData: async (next: unknown) => { data = structuredClone(next); } };
  const store = new SessionStore(plugin as never);
  await store.load();
  const id = store.active().id;
  let writes = 0;
  const tools = new LiteAgentToolRegistry();
  tools.register({ name: "append", description: "Append", parameters: { type: "object", properties: {} }, mutates: true,
    execute: async () => { writes++; return { ok: true, value: "appended" }; } });
  let calls = 0;
  const provider: LiteAgentProvider = { async *stream() {
    if (++calls === 1) yield { type: "tool_call", id: "write-1", name: "append", arguments: { path: "note.md" } };
    else throw new Error("Network disconnected");
  } };
  await drain(new LiteAgentRuntime(provider, tools).run("Append once", {
    approveTool: async () => true, onCheckpoint: (run) => store.saveRun(id, run)
  }));
  const restored = new SessionStore(plugin as never);
  await restored.load();
  const run = restored.active().runs.at(-1)!;
  expect(run.status).toBe("failed");
  expect(run.operations[0].status).toBe("succeeded");
  const resumedProvider: LiteAgentProvider = { async *stream(request) {
    expect(request.messages.some((message) => message.role === "tool" && message.content.includes("appended"))).toBe(true);
    yield { type: "text", text: "Already appended; task complete." };
  } };
  await drain(new LiteAgentRuntime(resumedProvider, tools).run("", {
    resume: run, approveTool: async () => true, onCheckpoint: (next) => restored.saveRun(id, next)
  }));
  expect(writes).toBe(1);
  expect(restored.active().runs).toHaveLength(1);
  expect(restored.active().runs[0].status).toBe("completed");
});

it("does not repeat a successful append even if the model requests it again during recovery", async () => {
  const tools = new LiteAgentToolRegistry();
  let writes = 0;
  tools.register({ name: "append", description: "Append", parameters: { type: "object", properties: {} }, mutates: true,
    execute: async () => { writes++; return { ok: true, value: "appended" }; } });
  let snapshot: import("../src/core/AgentRun").AgentRun | undefined;
  let calls = 0;
  const provider: LiteAgentProvider = { async *stream() {
    if (++calls === 1) yield { type: "tool_call", id: "first", name: "append", arguments: { path: "note.md", content: "text" } };
    else throw new Error("offline");
  } };
  await drain(new LiteAgentRuntime(provider, tools).run("Append", { approveTool: async () => true, onCheckpoint: async (run) => { snapshot = run; } }));
  let resumedCalls = 0;
  const retry: LiteAgentProvider = { async *stream() {
    if (++resumedCalls === 1) yield { type: "tool_call", id: "retry", name: "append", arguments: { content: "text", path: "note.md" } };
    else yield { type: "text", text: "Done" };
  } };
  await drain(new LiteAgentRuntime(retry, tools).run("", { resume: snapshot, approveTool: async () => true }));
  expect(writes).toBe(1);
});

it("requires inspection instead of recovery when a write throws after possibly committing", async () => {
  const tools = new LiteAgentToolRegistry();
  let writes = 0;
  tools.register({ name: "append", description: "Append", parameters: { type: "object", properties: {} }, mutates: true,
    execute: async () => { writes++; throw new Error("Storage disconnected after write"); } });
  let snapshot: import("../src/core/AgentRun").AgentRun | undefined;
  const provider: LiteAgentProvider = { async *stream() {
    yield { type: "tool_call", id: "write", name: "append", arguments: {} };
  } };
  await drain(new LiteAgentRuntime(provider, tools).run("Append", { maxSteps: 1, approveTool: async () => true, onCheckpoint: async (run) => { snapshot = run; } }));
  await expect(drain(new LiteAgentRuntime(provider, tools).run("", { resume: snapshot, maxSteps: 1, approveTool: async () => true }))).rejects.toThrow("unknown outcome");
  expect(writes).toBe(1);
});

it("retains an uncertain write when saving its result fails, both in memory and after reload", async () => {
  let data: unknown = {};
  let failResults = true;
  const plugin = { loadData: async () => structuredClone(data), saveData: async (next: unknown) => {
    const saved = next as { sessions: Array<{ runs?: Array<{ operations: Array<{ status: string }> }> }> };
    if (failResults && saved.sessions.some((session) => session.runs?.some((run) => run.operations.some((operation) => operation.status === "succeeded")))) throw new Error("Disk full");
    data = structuredClone(next);
  } };
  const store = new SessionStore(plugin as never);
  await store.load();
  const tools = new LiteAgentToolRegistry();
  let writes = 0;
  tools.register({ name: "append", description: "Append", parameters: { type: "object", properties: {} }, mutates: true,
    execute: async () => { writes++; return { ok: true, value: "written" }; } });
  const provider: LiteAgentProvider = { async *stream() { yield { type: "tool_call", id: "one", name: "append", arguments: {} }; } };
  await expect(drain(new LiteAgentRuntime(provider, tools).run("Append", {
    maxSteps: 1, approveTool: async () => true, onCheckpoint: (run) => store.saveRun(store.active().id, run)
  }))).rejects.toThrow("Disk full");
  expect(writes).toBe(1);
  expect(store.active().runs[0].operations[0].status).toBe("running");
  failResults = false;
  const restored = new SessionStore(plugin as never);
  await restored.load();
  await expect(drain(new LiteAgentRuntime(provider, tools).run("", { resume: restored.active().runs[0] }))).rejects.toThrow("unknown outcome");
});

it("does not execute a tool if recording its start fails", async () => {
  let writes = 0;
  const tools = new LiteAgentToolRegistry();
  tools.register({ name: "append", description: "Append", parameters: { type: "object", properties: {} }, mutates: true,
    execute: async () => { writes++; return { ok: true, value: "written" }; } });
  const provider: LiteAgentProvider = { async *stream() { yield { type: "tool_call", id: "one", name: "append", arguments: {} }; } };
  await expect(drain(new LiteAgentRuntime(provider, tools).run("Append", {
    approveTool: async () => true, onCheckpoint: async (run) => {
      if (run.operations.some((operation) => operation.status === "running")) throw new Error("Disk full");
    }
  }))).rejects.toThrow("Disk full");
  expect(writes).toBe(0);
});

it("records an in-flight write that finishes after stop and leaves later calls unexecuted", async () => {
  const controller = new AbortController();
  let writes = 0;
  let snapshot: import("../src/core/AgentRun").AgentRun | undefined;
  const tools = new LiteAgentToolRegistry();
  tools.register({ name: "append", description: "Append", parameters: { type: "object", properties: {} }, mutates: true,
    execute: async () => { writes++; controller.abort(); return { ok: true, value: "committed" }; } });
  const provider: LiteAgentProvider = { async *stream() {
    yield { type: "tool_call", id: "one", name: "append", arguments: { path: "one.md" } };
    yield { type: "tool_call", id: "two", name: "append", arguments: { path: "two.md" } };
  } };
  await drain(new LiteAgentRuntime(provider, tools).run("Append twice", {
    signal: controller.signal, approveTool: async () => true, onCheckpoint: async (run) => { snapshot = run; }
  }));
  expect(writes).toBe(1);
  expect(snapshot?.status).toBe("stopped");
  expect(snapshot?.operations.map((operation) => operation.status)).toEqual(["succeeded", "skipped"]);
  expect(snapshot?.messages.filter((message) => message.role === "tool")).toHaveLength(2);
});
