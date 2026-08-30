import { describe, expect, it } from "vitest";
import { calculateComposerLayout, insertTranscript } from "../src/views/ComposerInput";

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

describe("calculateComposerLayout", () => {
  it("keeps an empty composer at one row after a previously tall value", () => {
    expect(calculateComposerLayout("", 260)).toEqual({ height: 40, overflowing: false });
  });

  it("keeps a single-line value at one row", () => {
    expect(calculateComposerLayout("a", 40)).toEqual({ height: 40, overflowing: false });
  });
});
