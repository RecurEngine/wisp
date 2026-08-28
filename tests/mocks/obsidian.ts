import { vi } from "vitest";

export class TFile {
  path = "";
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export const requestUrl = vi.fn();
