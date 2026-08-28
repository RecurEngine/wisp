import type { TranscriptionOptions, TranscriptionProvider, TranscriptionProviderConfig } from "./VoiceTypes";
import { createSilentWav } from "./TestAudio";

export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly config: TranscriptionProviderConfig) {}

  async testConnection(): Promise<void> {
    try {
      await this.transcribe(createSilentWav());
    } catch (error) {
      if (error instanceof Error && error.message === "Speech transcription returned an empty transcript") return;
      throw error;
    }
  }

  async transcribe(audio: Blob, options: TranscriptionOptions = {}): Promise<string> {
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/audio/transcriptions`;
    const form = new FormData();
    form.append("file", audio, options.fileName ?? audioFileName(audio.type));
    form.append("model", this.config.model);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
      signal: options.signal
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Speech transcription failed (${response.status}): ${errorText.slice(0, 240)}`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.text !== "string" || payload.text.trim().length === 0) {
      throw new Error("Speech transcription returned an empty transcript");
    }
    return payload.text.trim();
  }
}

function audioFileName(mimeType: string): string {
  if (mimeType.includes("mp4")) return "recording.m4a";
  if (mimeType.includes("ogg")) return "recording.ogg";
  if (mimeType.includes("wav")) return "recording.wav";
  return "recording.webm";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
