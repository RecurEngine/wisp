import { requestUrl } from "obsidian";
import type { WebSearchOptions, WebSearchResponse, WebSearchResult } from "./WebSearchTypes";

export const DEFAULT_WEB_SEARCH_RESULT_LIMIT = 5;
export const MAX_WEB_SEARCH_RESULT_LIMIT = 10;
export const MAX_WEB_SEARCH_QUERY_LENGTH = 500;

export function validateSearchQuery(query: string): string {
  const normalized = query.trim();
  if (!normalized) throw new Error("Search query must be a non-empty string");
  if (normalized.length > MAX_WEB_SEARCH_QUERY_LENGTH) {
    throw new Error(`Search query must be ${MAX_WEB_SEARCH_QUERY_LENGTH} characters or fewer`);
  }
  return normalized;
}

export function getResultLimit(options?: WebSearchOptions): number {
  const value = options?.maxResults ?? DEFAULT_WEB_SEARCH_RESULT_LIMIT;
  if (!Number.isFinite(value)) return DEFAULT_WEB_SEARCH_RESULT_LIMIT;
  return Math.min(Math.max(Math.floor(value), 1), MAX_WEB_SEARCH_RESULT_LIMIT);
}

export async function requestJson(
  url: string,
  options: { readonly method?: string; readonly headers: Record<string, string>; readonly body?: unknown }
): Promise<{ readonly status: number; readonly json: unknown; readonly text: string }> {
  const response = await requestUrl({
    url,
    method: options.method ?? "GET",
    headers: options.headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    throw: false
  });
  return { status: response.status, json: response.json, text: response.text };
}

export function assertSuccessfulResponse(
  response: { readonly status: number; readonly json: unknown; readonly text: string },
  serviceName: string
): void {
  if (response.status >= 200 && response.status < 300) return;
  const detail = summarizeResponse(response.json, response.text);
  throw new Error(`${serviceName} request failed (${response.status}): ${detail}`);
}

export function createSearchResponse(
  provider: WebSearchResponse["provider"],
  query: string,
  results: readonly WebSearchResult[],
  totalResults: number
): WebSearchResponse {
  return {
    provider,
    query,
    results,
    searchedAt: new Date().toISOString(),
    truncated: totalResults > results.length
  };
}

export function getDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function summarizeResponse(json: unknown, text: string): string {
  if (isRecord(json)) {
    const error = typeof json.error === "string" ? json.error : typeof json.message === "string" ? json.message : undefined;
    if (error) return error.slice(0, 240);
  }
  return text.trim().slice(0, 240) || "Unknown search provider error";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
