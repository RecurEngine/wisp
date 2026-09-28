import { requestUrl } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepgramTranscriptionProvider } from "../src/voice/DeepgramTranscriptionProvider";
import { OpenAiTranscriptionProvider } from "../src/voice/OpenAiTranscriptionProvider";
import { DashScopeTranscriptionProvider } from "../src/voice/DashScopeTranscriptionProvider";
import { createTranscriptionProvider } from "../src/voice/VoiceProviderRegistry";

beforeEach(() => {
  vi.mocked(requestUrl).mockReset();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected fetch for transcription")));
});
function mockResponse(value: unknown): void {
  vi.mocked(requestUrl).mockResolvedValue({ status: 200, headers: { "content-type": "application/json" }, text: JSON.stringify(value) } as never);
}

describe("OpenAiTranscriptionProvider", () => {
  it("uploads a recorded blob as multipart form data", async () => {
    mockResponse({ text: "Find my notes" });
    const audio = new Blob(["audio"], { type: "audio/webm" });

    await expect(
      new OpenAiTranscriptionProvider({
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "secret",
        model: "whisper-large-v3-turbo"
      }).transcribe(audio)
    ).resolves.toBe("Find my notes");

    const init = vi.mocked(requestUrl).mock.calls[0][0] as import("obsidian").RequestUrlParam;
    const url = init.url;
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
    expect(init.body).toBeInstanceOf(ArrayBuffer);
    const form = await new Response(init.body, { headers: init.headers }).formData();
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    const file = form.get("file") as File;
    expect(file.name).toBe("recording.webm");
    expect(await file.text()).toBe("audio");
  });
});

describe("DeepgramTranscriptionProvider", () => {
  it("extracts the first transcript from the Listen response", async () => {
    mockResponse({ results: { channels: [{ alternatives: [{ transcript: "Create a note" }] }] } });

    await expect(
      new DeepgramTranscriptionProvider({
        baseUrl: "https://api.deepgram.com",
        apiKey: "secret",
        model: "nova-3"
      }).transcribe(new Blob(["audio"], { type: "audio/webm" }))
    ).resolves.toBe("Create a note");

    const init = vi.mocked(requestUrl).mock.calls[0][0] as import("obsidian").RequestUrlParam;
    const url = init.url;
    expect(url).toBe("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true");
    expect(new Headers(init?.headers).get("authorization")).toBe("Token secret");
  });

  it("rejects an empty transcript", async () => {
    mockResponse({ results: { channels: [] } });

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
    mockResponse({ choices: [{ message: { content: "整理我的笔记" } }] });
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });

    await expect(
      new DashScopeTranscriptionProvider({
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: "secret",
        model: "qwen3-asr-flash"
      }).transcribe(audio)
    ).resolves.toBe("整理我的笔记");

    const init = vi.mocked(requestUrl).mock.calls[0][0] as import("obsidian").RequestUrlParam;
    const url = init.url;
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

describe("Voice provider connection tests", () => {
  it("accepts a successful empty OpenAI-compatible transcript response", async () => {
    mockResponse({ text: "" });
    await expect(new OpenAiTranscriptionProvider({
      baseUrl: "https://api.example.test/v1",
      apiKey: "secret",
      model: "test-transcribe"
    }).testConnection()).resolves.toBeUndefined();
  });

  it("accepts a successful empty Deepgram transcript response", async () => {
    mockResponse({ results: { channels: [] } });
    await expect(new DeepgramTranscriptionProvider({
      baseUrl: "https://api.deepgram.com",
      apiKey: "secret",
      model: "nova-3"
    }).testConnection()).resolves.toBeUndefined();
  });

  it("accepts a successful empty DashScope transcript response", async () => {
    mockResponse({ choices: [] });
    await expect(new DashScopeTranscriptionProvider({
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "secret",
      model: "qwen3-asr-flash"
    }).testConnection()).resolves.toBeUndefined();
  });
});
