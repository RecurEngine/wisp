import {
  assertSuccessfulResponse,
  createSearchResponse,
  getDomain,
  getResultLimit,
  isRecord,
  readString,
  requestJson,
  validateSearchQuery
} from "./WebSearchProviderSupport";
import type { WebSearchOptions, WebSearchProvider, WebSearchResponse, WebSearchResult } from "./WebSearchTypes";

export interface TavilySearchProviderConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export class TavilySearchProvider implements WebSearchProvider {
  readonly id = "tavily" as const;

  constructor(private readonly config: TavilySearchProviderConfig) {}

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResponse> {
    const normalizedQuery = validateSearchQuery(query);
    const maxResults = getResultLimit(options);
    if (options?.signal?.aborted) throw new DOMException("The search was aborted", "AbortError");

    const response = await requestJson(`${this.config.baseUrl.replace(/\/$/, "")}/search`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: {
        query: normalizedQuery,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false
      }
    });
    assertSuccessfulResponse(response, "Tavily");
    if (options?.signal?.aborted) throw new DOMException("The search was aborted", "AbortError");

    const rawResults = isRecord(response.json) && Array.isArray(response.json.results) ? response.json.results : [];
    const results = rawResults.flatMap(toSearchResult);
    return createSearchResponse(this.id, normalizedQuery, results.slice(0, maxResults), rawResults.length);
  }
}

function toSearchResult(value: unknown): WebSearchResult[] {
  if (!isRecord(value)) return [];
  const title = readString(value.title);
  const url = readString(value.url);
  if (!title || !url) return [];
  return [{
    title,
    url,
    snippet: readString(value.content) ?? "",
    domain: getDomain(url)
  }];
}
