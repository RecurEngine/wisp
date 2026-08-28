import { describe, expect, it, vi } from "vitest";
import { DeepgramTranscriptionProvider } from "../src/voice/DeepgramTranscriptionProvider";
import { OpenAiTranscriptionProvider } from "../src/voice/OpenAiTranscriptionProvider";
import { DashScopeTranscriptionProvider } from "../src/voice/DashScopeTranscriptionProvider";
import { createTranscriptionProvider } from "../src/voice/VoiceProviderRegistry";

describe("OpenAiTranscriptionProvider", () => {
  it("uploads a recorded blob as multipart form data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "Find my notes" }), { status: 200 }))
    );
    const audio = new Blob(["audio"], { type: "audio/webm" });

    await expect(
      new OpenAiTranscriptionProvider({
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "secret",
        model: "whisper-large-v3-turbo"
      }).transcribe(audio)
    ).resolves.toBe("Find my notes");

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("model")).toBe("whisper-large-v3-turbo");
    expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
  });
});

describe("DeepgramTranscriptionProvider", () => {
  it("extracts the first transcript from the Listen response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            results: { channels: [{ alternatives: [{ transcript: "Create a note" }] }] }
          }),
          { status: 200 }
        )
      )
    );

    await expect(
      new DeepgramTranscriptionProvider({
        baseUrl: "https://api.deepgram.com",
        apiKey: "secret",
        model: "nova-3"
      }).transcribe(new Blob(["audio"], { type: "audio/webm" }))
    ).resolves.toBe("Create a note");

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true");
    expect(new Headers(init?.headers).get("authorization")).toBe("Token secret");
  });

  it("rejects an empty transcript", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: { channels: [] } }), { status: 200 }))
    );

    await expect(
      new DeepgramTranscriptionProvider({
        baseUrl: "https://api.deepgram.com",
        apiKey: "secret",
        model: "nova-3"
      }).transcribe(new Blob(["audio"], { type: "audio/webm" }))
    ).rejects.toThrow("empty transcript");
  });
});

describe("VoiceProviderRegistry", () => {
  it("routes Alibaba DashScope to its audio-message transcription adapter", () => {
    expect(
      createTranscriptionProvider({
        provider: "dashscope",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "secret",
        model: "qwen3-asr-flash"
      })
    ).toBeInstanceOf(DashScopeTranscriptionProvider);
  });
});

describe("DashScopeTranscriptionProvider", () => {
  it("sends audio as a base64 input_audio message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "整理我的笔记" } }] }), { status: 200 })
      )
    );
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });

    await expect(
      new DashScopeTranscriptionProvider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "secret",
        model: "qwen3-asr-flash"
      }).transcribe(audio)
    ).resolves.toBe("整理我的笔记");

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: "qwen3-asr-flash",
      stream: false,
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: "data:audio/wav;base64,AQID" } }] }]
    });
  });
});
