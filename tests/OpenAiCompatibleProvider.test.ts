
describe("OpenAiCompatibleProvider connection tests", () => {
  it("tests OpenAI-compatible authentication with a minimal non-streaming request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 })));

    await expect(new OpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "test-model"
    }).testConnection()).resolves.toBeUndefined();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "test-model",
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 1,
      stream: false
    });
  });
});
import { describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleProvider } from "../src/providers/OpenAiCompatibleProvider";
import type { LiteAgentProviderEvent, LiteAgentProviderRequest } from "../src/core/LiteAgentTypes";

async function collect(events: AsyncIterable<LiteAgentProviderEvent>): Promise<LiteAgentProviderEvent[]> {
  const result: LiteAgentProviderEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

describe("OpenAiCompatibleProvider", () => {
  it("parses streamed text and assembles fragmented tool arguments", async () => {
    const request = {
      messages: [{ role: "user", content: "Read my plan" }],
      tools: [],
      signal: undefined
    } satisfies LiteAgentProviderRequest;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          [
            'data: {"choices":[{"delta":{"content":"I will "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"read it."}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"read_note","arguments":"{\\"path\\":\\"Plans/"}}]}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"wisp.md\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
            "data: [DONE]\n\n"
          ].join("")
        )
      )
    );

    const events = await collect(
      new OpenAiCompatibleProvider({
        baseUrl: "https://example.test/v1",
        apiKey: "secret",
        model: "test-model"
      }).stream(request)
    );

    expect(events).toEqual([
      { type: "text", text: "I will " },
      { type: "text", text: "read it." },
      {
        type: "tool_call",
        id: "call-1",
        name: "read_note",
        arguments: { path: "Plans/wisp.md" },
        rawArguments: '{"path":"Plans/wisp.md"}'
      },
      { type: "done", finishReason: "tool_calls" }
    ]);
  });

  it("sends image data alongside authoritative Vault attachment metadata", async () => {
    const request = {
      messages: [{
        role: "user",
        content: "Insert this image into my article",
        attachments: [{ type: "image", path: "Attachments/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg" }]
      }],
      tools: [],
      loadImage: async () => "AQI=",
      signal: undefined
    } satisfies LiteAgentProviderRequest;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n")));

    await collect(new OpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "vision-model"
    }).stream(request));

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)) as {
      messages: Array<{ content: Array<Record<string, unknown>> }>;
    };
    expect(body.messages[0].content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Vault path: Attachments/photo.jpg")
      },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AQI=" } }
    ]);
  });

  it("falls back to text-only attachment metadata for non-vision models", async () => {
    const request = {
      messages: [{
        role: "user",
        content: "Insert this image",
        attachments: [{ type: "image", path: "Attachments/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg" }]
      }],
      tools: [],
      loadImage: async () => "AQI=",
      signal: undefined
    } satisfies LiteAgentProviderRequest;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "model does not support image input" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response("data: [DONE]\n\n")));

    await collect(new OpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "text-model"
    }).stream(request));

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const fallbackBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)) as {
      messages: Array<{ content: unknown }>;
    };
    expect(fallbackBody.messages[0].content).toEqual(expect.stringContaining("Vault path: Attachments/photo.jpg"));
  });
});
