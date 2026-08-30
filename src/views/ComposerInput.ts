export function insertTranscript(
  value: string,
  transcript: string,
  selectionStart = value.length,
  selectionEnd = selectionStart
): string {
  const start = clamp(selectionStart, 0, value.length);
  const end = clamp(Math.max(selectionEnd, start), start, value.length);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const separatorBefore = before && !/\s$/.test(before) ? " " : "";
  const separatorAfter = after && !/^\s/.test(after) ? " " : "";
  return `${before}${separatorBefore}${transcript.trim()}${separatorAfter}${after}`;
}

export interface ComposerLayout {
  readonly height: number;
  readonly overflowing: boolean;
}

export function calculateComposerLayout(
  value: string,
  contentHeight: number,
  minHeight = 40,
  maxHeight = 140
): ComposerLayout {
  const hasContent = value.trim().length > 0;
  if (!hasContent) return { height: minHeight, overflowing: false };
  return {
    height: Math.min(Math.max(contentHeight, minHeight), maxHeight),
    overflowing: contentHeight > maxHeight
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
