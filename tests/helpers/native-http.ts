import { requestUrl } from "obsidian";
import { vi } from "vitest";

export let nativeMock: ReturnType<typeof vi.fn>;

/** Adapt existing SSE response fixtures at the Obsidian transport boundary. */
export function mockNativeHttp(mock: ReturnType<typeof vi.fn>): void {
  nativeMock = mock;
  vi.mocked(requestUrl).mockImplementation(async (args) => {
    if (typeof args === "string") throw new Error("Expected request options");
    const response = await mock(args.url, { method: args.method, headers: args.headers, body: args.body }) as Response;
    const text = await response.text();
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), text,
      arrayBuffer: new TextEncoder().encode(text).buffer, json: undefined };
  });
}
