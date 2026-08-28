import { normalizePath } from "obsidian";

export function safeVaultPath(input: string): string | null {
  const rawPath = input.trim().replaceAll("\\", "/");
  if (!rawPath || rawPath.startsWith("/") || rawPath.split("/").includes("..")) return null;
  const normalized = normalizePath(rawPath);
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) return null;
  return normalized;
}
