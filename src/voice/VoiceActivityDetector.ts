export type VoiceActivityState = "waiting" | "speaking" | "silence" | "finished";

export interface VoiceActivityDetectorOptions {
  readonly threshold?: number;
  readonly silenceDurationMs?: number;
  readonly minimumSpeechDurationMs?: number;
  readonly maximumRecordingDurationMs?: number;
}

export class VoiceActivityDetector {
  private readonly threshold: number;
  private readonly silenceDurationMs: number;
  private readonly minimumSpeechDurationMs: number;
  private readonly maximumRecordingDurationMs: number;
  private startedAt?: number;
  private speechStartedAt?: number;
  private lastVoiceAt?: number;
  private finished = false;

  constructor(options: VoiceActivityDetectorOptions = {}) {
    this.threshold = options.threshold ?? 0.08;
    this.silenceDurationMs = options.silenceDurationMs ?? 900;
    this.minimumSpeechDurationMs = options.minimumSpeechDurationMs ?? 250;
    this.maximumRecordingDurationMs = options.maximumRecordingDurationMs ?? 60_000;
  }

  start(now: number): void {
    this.startedAt = now;
    this.speechStartedAt = undefined;
    this.lastVoiceAt = undefined;
    this.finished = false;
  }

  update(level: number, now: number): VoiceActivityState {
    if (this.finished || this.startedAt === undefined) return "finished";
    if (now - this.startedAt >= this.maximumRecordingDurationMs) return this.finish();

    if (level >= this.threshold) {
      this.speechStartedAt ??= now;
      this.lastVoiceAt = now;
      return "speaking";
    }

    if (this.speechStartedAt === undefined || this.lastVoiceAt === undefined) return "waiting";
    if (
      now - this.lastVoiceAt >= this.silenceDurationMs &&
      now - this.speechStartedAt >= this.minimumSpeechDurationMs
    ) {
      return this.finish();
    }
    return "silence";
  }

  private finish(): "finished" {
    this.finished = true;
    return "finished";
  }
}
