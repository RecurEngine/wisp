import { BraveSearchProvider } from "./BraveSearchProvider";
import { TavilySearchProvider } from "./TavilySearchProvider";
import type { WebSearchProvider, WebSearchProviderConfig } from "./WebSearchTypes";

export function createWebSearchProvider(config: WebSearchProviderConfig): WebSearchProvider | null {
  if (!config.apiKey.trim() || !config.baseUrl.trim()) return null;
  if (config.provider === "brave") return new BraveSearchProvider(config);
  return new TavilySearchProvider(config);
}
