export interface TranscriptionProvider {
  transcribe(audio: Blob, options?: TranscriptionOptions): Promise<string>;
  testConnection(): Promise<void>;
}

export interface TranscriptionOptions {
  readonly signal?: AbortSignal;
  readonly fileName?: string;
}

export interface TranscriptionProviderConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}
