import { requestUrl } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { ClaudeProvider } from "../src/providers/ClaudeProvider";
import type { LiteAgentProviderEvent, LiteAgentProviderRequest } from "../src/core/LiteAgentTypes";

async function collect(events: AsyncIterable<LiteAgentProviderEvent>): Promise<LiteAgentProviderEvent[]> {
  const result: LiteAgentProviderEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe("ClaudeProvider", () => {
  it("maps Claude SSE text and tool-use blocks to provider-neutral events", async () => {
    const request = {
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "Read my plan" }
      ],
      tools: [
        {
          name: "read_note",
          description: "Read a note",
          parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
          mutates: false,
          execute: async () => ({ ok: true, value: null })
        }
      ],
      signal: undefined
    } satisfies LiteAgentProviderRequest;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          [
            sse("message_start", { type: "message_start" }),
            sse("content_block_start", {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "I will check." }
            }),
            sse("content_block_delta", {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: " Done." }
            }),
            sse("content_block_stop", { type: "content_block_stop", index: 0 }),
            sse("content_block_start", {
              type: "content_block_start",
              index: 1,
              content_block: { type: "tool_use", id: "toolu-1", name: "read_note", input: {} }
            }),
            sse("content_block_delta", {
              type: "content_block_delta",
              index: 1,
              delta: { type: "input_json_delta", partial_json: '{"path":"Plans/' }
            }),
            sse("content_block_delta", {
              type: "content_block_delta",
              index: 1,
              delta: { type: "input_json_delta", partial_json: 'wisp.md"}' }
            }),
            sse("content_block_stop", { type: "content_block_stop", index: 1 }),
            sse("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" } }),
            sse("message_stop", { type: "message_stop" })
          ].join("")
        )
      )
    );

    const events = await collect(
      new ClaudeProvider({
        baseUrl: "https://api.anthropic.com",
        apiKey: "secret",
        model: "claude-sonnet-4-20250514"
      }).stream(request)
    );

    expect(events).toEqual([
      { type: "text", text: "I will check." },
      { type: "text", text: " Done." },
      {
        type: "tool_call",
        id: "toolu-1",
        name: "read_note",
        arguments: { path: "Plans/wisp.md" },
        rawArguments: '{"path":"Plans/wisp.md"}'
      },
      { type: "done", finishReason: "tool_calls" }
    ]);

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("secret");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: "Be concise.",
      tools: [
        {
          name: "read_note",
          input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
        }
      ]
    });
  });
});

describe("ClaudeProvider connection tests", () => {
  it("tests Claude authentication with a minimal non-streaming request", async () => {
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, headers: {}, text: JSON.stringify({ content: [] }) } as never);

    await expect(new ClaudeProvider({
      baseUrl: "https://api.anthropic.com",
      apiKey: "secret",
      model: "claude-sonnet-4-20250514"
    }).testConnection()).resolves.toBeUndefined();

    const init = vi.mocked(requestUrl).mock.calls[0][0] as import("obsidian").RequestUrlParam;
    const url = init.url;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "Reply with OK." }],
      stream: false
    });
  });
});

function sse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
