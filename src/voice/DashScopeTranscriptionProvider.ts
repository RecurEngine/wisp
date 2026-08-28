import type { TranscriptionOptions, TranscriptionProvider, TranscriptionProviderConfig } from "./VoiceTypes";

export class DashScopeTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly config: TranscriptionProviderConfig) {}

  async transcribe(audio: Blob, options: TranscriptionOptions = {}): Promise<string> {
    const audioData = await toDataUri(audio);
    const endpoint = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: "user",
            content: [{ type: "input_audio", input_audio: { data: audioData } }]
          }
        ],
        stream: false,
        asr_options: { enable_itn: false }
      }),
      signal: options.signal
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DashScope transcription failed (${response.status}): ${errorText.slice(0, 240)}`);
    }

    const payload: unknown = await response.json();
    const transcript = firstTranscript(payload);
    if (!transcript) throw new Error("DashScope returned an empty transcript");
    return transcript;
  }
}

async function toDataUri(audio: Blob): Promise<string> {
  const bytes = new Uint8Array(await audio.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${audio.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

function firstTranscript(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") return undefined;
  const transcript = choice.message.content.trim();
  return transcript.length > 0 ? transcript : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
