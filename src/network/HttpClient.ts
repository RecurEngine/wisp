import { requestUrl } from "obsidian";

/** Ordinary requests use Obsidian's native transport to avoid CORS restrictions. */
export async function requestHttp(url: string, options: RequestInit = {}): Promise<Response> {
  if (options.signal?.aborted) throw abortError(options.signal);
  const request = new Request(url, options);
  const body = typeof options.body === "string" ? options.body : request.body ? await request.arrayBuffer() : undefined;
  if (options.signal?.aborted) throw abortError(options.signal);
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
  if (!signal) return pending.catch((reason: unknown) => { throw toError(reason); });
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(abortError(signal)); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => { cleanup(); resolve(value); }, (error: unknown) => { cleanup(); reject(toError(error)); });
    if (signal.aborted) abort();
  });
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(typeof reason === "string" ? reason : "Network request failed");
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException(typeof reason === "string" ? reason : "Aborted", "AbortError");
}
