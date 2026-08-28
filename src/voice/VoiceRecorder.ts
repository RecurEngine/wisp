const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus"
];

export class VoiceRecorder {
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private audioContext?: AudioContext;
  private audioSource?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private levelAnimationFrame?: number;

  get isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  async start(options: { readonly onLevel?: (level: number) => void } = {}): Promise<void> {
    if (this.isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access is not available in this app");
    if (typeof MediaRecorder === "undefined") throw new Error("Audio recording is not supported on this device");

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.chunks = [];
    try {
      const mimeType = selectRecordingMimeType();
      this.recorder = mimeType ? new MediaRecorder(this.stream, { mimeType }) : new MediaRecorder(this.stream);
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.start();
      if (options.onLevel) this.startLevelMonitoring(options.onLevel);
    } catch (error) {
      this.release();
      throw error;
    }
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return Promise.reject(new Error("No recording is in progress"));

    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
        this.release();
        resolve(blob);
      };
      recorder.onerror = () => {
        this.release();
        reject(new Error("Audio recording failed"));
      };
      recorder.stop();
    });
  }

  cancel(): void {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.stop();
    }
    this.release();
  }

  private release(): void {
    this.stopLevelMonitoring();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.recorder = undefined;
    this.chunks = [];
  }

  private startLevelMonitoring(onLevel: (level: number) => void): void {
    if (!this.stream || typeof AudioContext === "undefined") return;
    try {
      this.audioContext = new AudioContext();
      void this.audioContext.resume().catch(() => undefined);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.audioSource = this.audioContext.createMediaStreamSource(this.stream);
      this.audioSource.connect(this.analyser);
      const samples = new Uint8Array(this.analyser.fftSize);
      const update = () => {
        if (!this.analyser || !this.isRecording) return;
        this.analyser.getByteTimeDomainData(samples);
        let total = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          total += normalized * normalized;
        }
        onLevel(Math.min(1, Math.sqrt(total / samples.length) * 2));
        this.levelAnimationFrame = window.requestAnimationFrame(update);
      };
      update();
    } catch {
      this.stopLevelMonitoring();
    }
  }

  private stopLevelMonitoring(): void {
    if (this.levelAnimationFrame !== undefined) window.cancelAnimationFrame(this.levelAnimationFrame);
    this.levelAnimationFrame = undefined;
    this.audioSource?.disconnect();
    this.audioSource = undefined;
    this.analyser = undefined;
    if (this.audioContext) void this.audioContext.close().catch(() => undefined);
    this.audioContext = undefined;
  }
}

export function selectRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return RECORDING_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}
