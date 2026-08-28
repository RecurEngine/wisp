import { describe, expect, it } from "vitest";
import { insertTranscript } from "../src/views/ComposerInput";

describe("insertTranscript", () => {
  it("fills an empty composer", () => {
    expect(insertTranscript("", "  find my notes  ")).toBe("find my notes");
  });

  it("inserts at the cursor without joining words", () => {
    expect(insertTranscript("Find notes", "recent", 5)).toBe("Find recent notes");
  });

  it("replaces the current selection", () => {
    expect(insertTranscript("Find old notes", "recent", 5, 8)).toBe("Find recent notes");
  });
});
