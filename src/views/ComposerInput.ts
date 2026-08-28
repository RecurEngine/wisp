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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
