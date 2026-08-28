import type { TranscriptionOptions, TranscriptionProvider, TranscriptionProviderConfig } from "./VoiceTypes";

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly config: TranscriptionProviderConfig) {}

  async transcribe(audio: Blob, options: TranscriptionOptions = {}): Promise<string> {
    const params = new URLSearchParams({ model: this.config.model, smart_format: "true" });
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/v1/listen?${params.toString()}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.config.apiKey}`,
        "Content-Type": audio.type || "application/octet-stream"
      },
      body: audio,
      signal: options.signal
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deepgram transcription failed (${response.status}): ${errorText.slice(0, 240)}`);
    }

    const payload: unknown = await response.json();
    const transcript = firstTranscript(payload);
    if (!transcript) throw new Error("Deepgram returned an empty transcript");
    return transcript;
  }
}

function firstTranscript(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.results) || !Array.isArray(value.results.channels)) return undefined;
  const channel = value.results.channels[0];
  if (!isRecord(channel) || !Array.isArray(channel.alternatives)) return undefined;
  const alternative = channel.alternatives[0];
  if (!isRecord(alternative) || typeof alternative.transcript !== "string") return undefined;
  const transcript = alternative.transcript.trim();
  return transcript.length > 0 ? transcript : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
