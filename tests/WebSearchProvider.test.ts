import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { BraveSearchProvider } from "../src/websearch/BraveSearchProvider";
import { TavilySearchProvider } from "../src/websearch/TavilySearchProvider";
import { createWebSearchProvider } from "../src/websearch/WebSearchProviderRegistry";
import { createWebSearchTool } from "../src/websearch/WebSearchTool";

describe("WebSearchProvider", () => {
  beforeEach(() => {
    vi.mocked(requestUrl).mockReset();
  });

  it("normalizes Tavily results through Obsidian requestUrl", async () => {
    vi.mocked(requestUrl).mockResolvedValue({
      status: 200,
      json: {
        results: [
          { title: "Wisp docs", url: "https://www.example.com/wisp", content: "A short summary" },
          { title: "Second", url: "https://docs.example.org/second", content: "Another summary" }
        ]
      },
      text: ""
    });

    const result = await new TavilySearchProvider({
      baseUrl: "https://api.tavily.com",
      apiKey: "tvly-secret"
    }).search("  Wisp mobile  ", { maxResults: 1 });

    expect(result.provider).toBe("tavily");
    expect(result.query).toBe("Wisp mobile");
    expect(result.results).toEqual([
      {
        title: "Wisp docs",
        url: "https://www.example.com/wisp",
        snippet: "A short summary",
        domain: "example.com"
      }
    ]);
    expect(result.truncated).toBe(true);

    expect(requestUrl).toHaveBeenCalledWith({
      url: "https://api.tavily.com/search",
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tvly-secret",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: "Wisp mobile",
        max_results: 1,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false
      }),
      throw: false
    });
  });

  it("normalizes Brave web results and sends the subscription token", async () => {
    vi.mocked(requestUrl).mockResolvedValue({
      status: 200,
      json: {
        web: {
          results: [{ title: "Brave result", url: "https://news.example.com/story", description: "News summary", age: "2 hours ago" }]
        }
      },
      text: ""
    });

    const result = await new BraveSearchProvider({
      baseUrl: "https://api.search.brave.com",
      apiKey: "brave-secret"
    }).search("latest news");

    expect(result.results[0]).toEqual({
      title: "Brave result",
      url: "https://news.example.com/story",
      snippet: "News summary",
      domain: "news.example.com",
      publishedAt: "2 hours ago"
    });
    expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://api.search.brave.com/res/v1/web/search?q=latest+news&count=5",
      headers: { Accept: "application/json", "X-Subscription-Token": "brave-secret" },
      throw: false
    }));
  });

  it("fails closed for invalid queries and reports provider errors", async () => {
    await expect(new TavilySearchProvider({ baseUrl: "https://api.tavily.com", apiKey: "secret" }).search("   "))
      .rejects.toThrow("Search query must be a non-empty string");

    vi.mocked(requestUrl).mockResolvedValue({
      status: 401,
      json: { detail: "Invalid API key" },
      text: ""
    });
    await expect(new BraveSearchProvider({ baseUrl: "https://api.search.brave.com", apiKey: "secret" }).search("test"))
      .rejects.toThrow("Brave Search request failed (401): Unknown search provider error");
  });

  it("creates only configured providers and exposes a read-only search tool", async () => {
    expect(createWebSearchProvider({ provider: "tavily", baseUrl: "", apiKey: "secret" })).toBeNull();
    const provider = createWebSearchProvider({ provider: "brave", baseUrl: "https://api.search.brave.com", apiKey: "secret" });
    expect(provider?.id).toBe("brave");

    const tool = createWebSearchTool(provider!, 5);
    expect(tool.mutates).toBe(false);
    expect(tool.name).toBe("search_web");
    expect((await tool.execute({ query: "" })).ok).toBe(false);
  });
});
