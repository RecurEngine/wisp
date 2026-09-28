import { requestUrl } from "obsidian";

/** Ordinary requests use Obsidian's native transport to avoid CORS restrictions. */
export async function requestHttp(url: string, options: RequestInit = {}): Promise<Response> {
  options.signal?.throwIfAborted();
  const request = new Request(url, options);
  const body = typeof options.body === "string" ? options.body : request.body ? await request.arrayBuffer() : undefined;
  options.signal?.throwIfAborted();
  const response = await abortable(requestUrl({
    url, method: request.method, headers: Object.fromEntries(request.headers.entries()),
    ...(body ? { body } : {}), throw: false
  }), options.signal);
  return new Response([204, 205, 304].includes(response.status) ? null : response.text, {
    status: response.status, headers: response.headers
  });
}

/** requestUrl has no transport cancellation; abandon the result without further actions. */
function abortable<T>(pending: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

/** requestUrl cannot stream SSE or abort its transport. Keep this exception scoped to chat. */
export function streamHttp(url: string, options: RequestInit): Promise<Response> {
  // eslint-disable-next-line no-restricted-globals -- Real-time SSE and AbortSignal are required for mobile chat; requestUrl provides neither.
  return fetch(url, options);
}
