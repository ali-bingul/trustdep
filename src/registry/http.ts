// filepath: src/registry/http.ts
// Minimal HTTP helper using Node 18+ native fetch (no `got` dependency).

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
}

export interface HttpJsonOptions {
  method?: "GET" | "POST";
  timeoutMs?: number;
  retries?: number;
  retryStatusCodes?: number[];
  headers?: Record<string, string>;
  body?: unknown;
}

const DEFAULT_RETRY_STATUS = [408, 429, 500, 502, 503, 504];

export async function httpJson<T>(url: string, opts: HttpJsonOptions = {}): Promise<T> {
  const {
    method = "GET",
    timeoutMs = 30_000,
    retries = 0,
    retryStatusCodes = DEFAULT_RETRY_STATUS,
    headers = {},
    body,
  } = opts;

  const reqHeaders: Record<string, string> = { accept: "application/json", ...headers };
  let init: RequestInit = { method, headers: reqHeaders };
  if (body !== undefined) {
    reqHeaders["content-type"] = "application/json";
    init = { ...init, headers: reqHeaders, body: JSON.stringify(body) };
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        if (retryStatusCodes.includes(res.status) && attempt < retries) {
          // exponential-ish backoff: 100ms, 200ms, 400ms...
          await delay(100 * 2 ** attempt);
          continue;
        }
        throw new HttpError(res.status, `HTTP ${res.status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err instanceof HttpError) throw err;
      // network / abort error
      if (attempt < retries) {
        await delay(100 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
