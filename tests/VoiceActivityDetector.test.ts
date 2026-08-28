import { describe, expect, it } from "vitest";
import { VoiceActivityDetector } from "../src/voice/VoiceActivityDetector";

describe("VoiceActivityDetector", () => {
  it("waits for speech before starting the silence countdown", () => {
    const detector = new VoiceActivityDetector({ silenceDurationMs: 900 });
    detector.start(0);

    expect(detector.update(0, 850)).toBe("waiting");
    expect(detector.update(0.2, 900)).toBe("speaking");
    expect(detector.update(0, 1_700)).toBe("silence");
    expect(detector.update(0, 1_801)).toBe("finished");
  });

  it("does not finish a very short noise burst", () => {
    const detector = new VoiceActivityDetector({ silenceDurationMs: 500, minimumSpeechDurationMs: 1_000 });
    detector.start(0);

    expect(detector.update(0.2, 100)).toBe("speaking");
    expect(detector.update(0, 700)).toBe("silence");
    expect(detector.update(0, 1_000)).toBe("silence");
  });

  it("finishes at the maximum recording duration", () => {
    const detector = new VoiceActivityDetector({ maximumRecordingDurationMs: 1_000 });
    detector.start(0);

    expect(detector.update(0, 999)).toBe("waiting");
    expect(detector.update(0, 1_000)).toBe("finished");
    expect(detector.update(0.5, 1_100)).toBe("finished");
  });
});
