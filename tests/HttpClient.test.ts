import { beforeEach, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { requestHttp } from "../src/network/HttpClient";

beforeEach(() => { vi.mocked(requestUrl).mockReset(); });
it("uses Obsidian requestUrl for ordinary HTTP requests, including error responses", async () => {
  vi.mocked(requestUrl).mockResolvedValue({ status: 401, headers: {}, text: "Unauthorized" } as never);
  const response = await requestHttp("https://example.test", { method: "POST", headers: { Authorization: "Bearer test" }, body: '{"a":1}' });
  expect(response.status).toBe(401);
  expect(await response.text()).toBe("Unauthorized");
  expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.test", throw: false, headers: expect.objectContaining({ authorization: "Bearer test" }) }));
});
it("stops waiting for a native request and ignores its late result on cancellation", async () => {
  const controller = new AbortController();
  let resolve!: (value: never) => void;
  vi.mocked(requestUrl).mockImplementation(() => new Promise((done) => { resolve = done; }) as never);
  const pending = requestHttp("https://example.test", { signal: controller.signal });
  controller.abort();
  await expect(Promise.race([pending, new Promise((done) => setTimeout(() => done("still waiting"), 50))])).rejects.toMatchObject({ name: "AbortError" });
  resolve({ status: 200, headers: {}, text: "late" } as never);
});
it("does not start a native request when already cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(requestHttp("https://example.test", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(requestUrl).not.toHaveBeenCalled();
});
it("normalizes native non-Error rejections to Error objects", async () => {
  vi.mocked(requestUrl).mockRejectedValue("Network unavailable");
  await expect(requestHttp("https://example.test")).rejects.toBeInstanceOf(Error);
});
it("normalizes custom cancellation reasons to AbortError objects", async () => {
  const controller = new AbortController();
  controller.abort("user stopped");
  await expect(requestHttp("https://example.test", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError", message: "user stopped" });
});
