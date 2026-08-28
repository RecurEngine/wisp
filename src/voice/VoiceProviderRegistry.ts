import { DashScopeTranscriptionProvider } from "./DashScopeTranscriptionProvider";
import { DeepgramTranscriptionProvider } from "./DeepgramTranscriptionProvider";
import { OpenAiTranscriptionProvider } from "./OpenAiTranscriptionProvider";
import type { TranscriptionProvider } from "./VoiceTypes";

export type WispVoiceProvider = "openai-compatible" | "deepgram" | "dashscope";

export interface VoiceProviderSettings {
  readonly provider: WispVoiceProvider;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
}

export function createTranscriptionProvider(settings: VoiceProviderSettings): TranscriptionProvider {
  if (settings.provider === "deepgram") return new DeepgramTranscriptionProvider(settings);
  if (settings.provider === "dashscope") return new DashScopeTranscriptionProvider(settings);
  return new OpenAiTranscriptionProvider(settings);
}
