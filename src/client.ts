import { NeonloopsApiError, NeonloopsTimeoutError } from "./errors";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export interface ClientOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

/**
 * Low-level HTTP client for the Neonloops API.
 * Uses native `fetch` — works in Node.js 18+ and browsers.
 */
export class NeonloopsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: ClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * Send a request with retry logic.
   */
  async request<T>(
    method: string,
    path: string,
    opts?: { body?: unknown; params?: Record<string, string | number | undefined> },
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    // Build query string
    if (opts?.params) {
      const qs = Object.entries(opts.params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      if (qs) url += `?${qs}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 8000);
        await sleep(delay);
      }

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.apiKey}`,
        };
        const init: RequestInit = { method, headers };

        if (opts?.body !== undefined) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(opts.body);
        }

        const response = await fetchWithTimeout(url, init, this.timeoutMs);

        // 204 No Content
        if (response.status === 204) {
          return undefined as T;
        }

        if (response.ok) {
          return (await response.json()) as T;
        }

        // Parse error body
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => null);
        }

        const errorMessage =
          (errorBody && typeof errorBody === "object" && "error" in errorBody
            ? (errorBody as { error: string }).error
            : null) ?? `API request failed with status ${response.status}`;

        if (RETRY_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
          lastError = new NeonloopsApiError(errorMessage, response.status, errorBody);
          continue;
        }

        throw new NeonloopsApiError(errorMessage, response.status, errorBody);
      } catch (err) {
        if (err instanceof NeonloopsApiError) throw err;
        if (err instanceof NeonloopsTimeoutError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt >= this.maxRetries) throw lastError;
      }
    }

    throw lastError ?? new Error("Request failed");
  }

  /**
   * Send a POST request.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  /**
   * Send a GET request.
   */
  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  /**
   * Send a PUT request.
   */
  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  /**
   * Send a DELETE request.
   */
  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  /**
   * Send a streaming POST request and yield parsed SSE events.
   * No retry — partial stream state makes retries unsafe.
   */
  async *postStream<T>(path: string, body: unknown): AsyncGenerator<T, void, undefined> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    }, this.timeoutMs);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text().catch(() => null);
      }

      const errorMessage =
        (errorBody && typeof errorBody === "object" && "error" in errorBody
          ? (errorBody as { error: string }).error
          : null) ?? `API request failed with status ${response.status}`;

      throw new NeonloopsApiError(errorMessage, response.status, errorBody);
    }

    if (!response.body) {
      throw new Error("Response body is null — streaming not supported in this environment");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            yield JSON.parse(line.slice(6)) as T;
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.startsWith("data: ")) {
        yield JSON.parse(buffer.slice(6)) as T;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/**
 * Fetch with an AbortController-based timeout.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new NeonloopsTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
