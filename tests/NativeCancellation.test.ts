import { expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { OpenAiCompatibleProvider } from "../src/providers/OpenAiCompatibleProvider";
import { LiteAgentRuntime } from "../src/core/LiteAgentRuntime";
import { LiteAgentToolRegistry } from "../src/core/LiteAgentToolRegistry";
import type { AgentRun } from "../src/core/AgentRun";

it("stops the runtime before a native response arrives and never executes its late tool calls", async () => {
  vi.mocked(requestUrl).mockReset();
  let respond!: (response: never) => void;
  vi.mocked(requestUrl).mockImplementation(() => new Promise((resolve) => { respond = resolve; }) as never);
  const execute = vi.fn().mockResolvedValue({ ok: true, value: "written" });
  const tools = new LiteAgentToolRegistry();
  tools.register({ name: "write", description: "Write", parameters: { type: "object", properties: {} }, mutates: true, execute });
  const provider = new OpenAiCompatibleProvider({ baseUrl: "https://example.test/v1", apiKey: "test", model: "test" });
  const controller = new AbortController();
  let saved: AgentRun | undefined;
  const finished = (async () => {
    for await (const _event of new LiteAgentRuntime(provider, tools).run("Write", {
      signal: controller.signal, approveTool: async () => true,
      onCheckpoint: async (run) => { saved = run; }
    })) { /* drain the real runtime */ }
  })();
  await vi.waitFor(() => expect(requestUrl).toHaveBeenCalledOnce());
  controller.abort();
  await finished;
  expect(saved?.status).toBe("stopped");
  respond({ status: 200, headers: {}, text: 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call","function":{"name":"write","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n' } as never);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(execute).not.toHaveBeenCalled();
});
