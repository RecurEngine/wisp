export type WebSearchProviderId = "tavily" | "brave";

export interface WebSearchOptions {
  readonly maxResults?: number;
  readonly signal?: AbortSignal;
}

export interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly domain?: string;
  readonly publishedAt?: string;
}

export interface WebSearchResponse {
  readonly provider: WebSearchProviderId;
  readonly query: string;
  readonly results: readonly WebSearchResult[];
  readonly searchedAt: string;
  readonly truncated: boolean;
}

export interface WebSearchProvider {
  readonly id: WebSearchProviderId;
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResponse>;
}

export interface WebSearchProviderConfig {
  readonly provider: WebSearchProviderId;
  readonly baseUrl: string;
  readonly apiKey: string;
}
