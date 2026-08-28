import { describe, expect, it } from "vitest";
import { LiteAgentRuntime } from "../src/core/LiteAgentRuntime";
import type { LiteAgentProvider, LiteAgentProviderRequest, LiteAgentProviderEvent } from "../src/core/LiteAgentTypes";
import { LiteAgentToolRegistry } from "../src/core/LiteAgentToolRegistry";

async function collect(
  events: AsyncIterable<LiteAgentProviderEvent>
): Promise<LiteAgentProviderEvent[]> {
  const result: LiteAgentProviderEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe("LiteAgentRuntime", () => {
  it("executes a tool call and continues with the tool result", async () => {
    const requests: LiteAgentProviderRequest[] = [];
    const provider: LiteAgentProvider = {
      stream(request) {
        requests.push(request);
        if (requests.length === 1) {
          return collectAsync([
            { type: "tool_call", id: "call-1", name: "vault_read", arguments: { path: "Plans/wisp.md" } },
            { type: "done", finishReason: "tool_calls" }
          ]);
        }
        return collectAsync([
          { type: "text", text: "I found the Wisp plan." },
          { type: "done", finishReason: "stop" }
        ]);
      }
    };

    const tools = new LiteAgentToolRegistry();
    tools.register({
      name: "vault_read",
      description: "Read a note",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      mutates: false,
      execute: async (args) => ({ ok: true, value: { path: args.path, content: "mobile first" } })
    });

    const runtime = new LiteAgentRuntime(provider, tools);
    const events = await collect(runtime.run("Find the Wisp plan."));

    expect(events).toEqual([
      { type: "tool_call", id: "call-1", name: "vault_read", arguments: { path: "Plans/wisp.md" }, mutates: false },
      { type: "tool_result", id: "call-1", name: "vault_read", result: { ok: true, value: { path: "Plans/wisp.md", content: "mobile first" } } },
      { type: "text", text: "I found the Wisp plan." },
      { type: "done" }
    ]);
    expect(requests[1].messages.at(-1)).toEqual({
      role: "tool",
      toolCallId: "call-1",
      name: "vault_read",
      content: JSON.stringify({ ok: true, value: { path: "Plans/wisp.md", content: "mobile first" } })
    });
  });

  it("denies a mutating tool unless the caller approves it", async () => {
    const provider: LiteAgentProvider = {
      stream: () => collectAsync([
        { type: "tool_call", id: "call-1", name: "vault_write", arguments: { path: "New.md" } },
        { type: "done", finishReason: "tool_calls" }
      ])
    };
    const tools = new LiteAgentToolRegistry();
    tools.register({
      name: "vault_write",
      description: "Write a note",
      parameters: { type: "object", properties: {}, required: [] },
      mutates: true,
      execute: async () => ({ ok: true, value: "written" })
    });

    const runtime = new LiteAgentRuntime(provider, tools);
    const events = await collect(runtime.run("Write a note."));

    expect(events).toEqual([
      { type: "tool_call", id: "call-1", name: "vault_write", arguments: { path: "New.md" }, mutates: true },
      { type: "tool_result", id: "call-1", name: "vault_write", result: { ok: false, error: "User approval required" } },
      { type: "done" }
    ]);
  });

  it("executes a mutating tool after approval", async () => {
    let executed = false;
    let requests = 0;
    const provider: LiteAgentProvider = {
      stream: () => {
        requests += 1;
        return requests === 1
          ? collectAsync([
              { type: "tool_call", id: "call-1", name: "vault_write", arguments: { path: "New.md" } },
              { type: "done", finishReason: "tool_calls" }
            ])
          : collectAsync([
              { type: "text", text: "Done." },
              { type: "done", finishReason: "stop" }
            ]);
      }
    };
    const tools = new LiteAgentToolRegistry();
    tools.register({
      name: "vault_write",
      description: "Write a note",
      parameters: { type: "object", properties: {}, required: [] },
      mutates: true,
      execute: async () => {
        executed = true;
        return { ok: true, value: "written" };
      }
    });

    const runtime = new LiteAgentRuntime(provider, tools);
    const events = await collect(runtime.run("Write a note.", { approveTool: async () => true }));

    expect(executed).toBe(true);
    expect(events.at(-3)).toEqual({
      type: "tool_result",
      id: "call-1",
      name: "vault_write",
      result: { ok: true, value: "written" }
    });
  });
});

async function* collectAsync(events: LiteAgentProviderEvent[]): AsyncIterable<LiteAgentProviderEvent> {
  yield* events;
}
