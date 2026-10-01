import { afterEach, describe, expect, it, vi } from "vitest";
import { createCurrentTimeTool } from "../src/tools/CurrentTimeTool";

afterEach(() => { vi.useRealTimers(); });

describe("CurrentTimeTool", () => {
  it("returns the real device time in ISO, local, and timezone forms", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const result = await createCurrentTimeTool().execute({});
    if (!result.ok) throw new Error("expected success");
    expect(result.value.iso).toBe("2026-10-01T12:00:00.000Z");
    expect(result.value.local).toBe(new Date("2026-10-01T12:00:00Z").toString());
    expect(typeof result.value.timeZone).toBe("string");
  });
});
