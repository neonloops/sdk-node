/**
 * Error thrown when the Neonloops API returns a non-OK response.
 */
export class NeonloopsApiError extends Error {
  /** HTTP status code */
  readonly status: number;
  /** Raw response body (if available) */
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "NeonloopsApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Error thrown when a request times out.
 */
export class NeonloopsTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "NeonloopsTimeoutError";
  }
}
