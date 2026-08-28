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

export interface BraveSearchProviderConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export class BraveSearchProvider implements WebSearchProvider {
  readonly id = "brave" as const;

  constructor(private readonly config: BraveSearchProviderConfig) {}

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResponse> {
    const normalizedQuery = validateSearchQuery(query);
    const maxResults = getResultLimit(options);
    if (options?.signal?.aborted) throw new DOMException("The search was aborted", "AbortError");

    const url = new URL(`${this.config.baseUrl.replace(/\/$/, "")}/res/v1/web/search`);
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("count", String(maxResults));
    const response = await requestJson(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.config.apiKey
      }
    });
    assertSuccessfulResponse(response, "Brave Search");
    if (options?.signal?.aborted) throw new DOMException("The search was aborted", "AbortError");

    const web = isRecord(response.json) && isRecord(response.json.web) ? response.json.web : {};
    const rawResults = Array.isArray(web.results) ? web.results : [];
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
    snippet: readString(value.description) ?? "",
    domain: getDomain(url),
    publishedAt: readString(value.age)
  }];
}
