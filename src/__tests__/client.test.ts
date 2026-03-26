import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NeonloopsClient } from "../client";
import { NeonloopsApiError, NeonloopsTimeoutError } from "../errors";

// Helper to create a mock Response
function mockResponse(status: number, body?: unknown, ok?: boolean): Response {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    body: null,
    headers: new Headers(),
  } as unknown as Response;
}

// Helper for SSE streaming tests
function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

function mockStreamResponse(status: number, stream: ReadableStream<Uint8Array>, ok?: boolean): Response {
  const isOk = ok ?? (status >= 200 && status < 300);
  return {
    ok: isOk,
    status,
    body: stream,
    json: vi.fn().mockRejectedValue(new Error("not json")),
    text: vi.fn().mockResolvedValue(""),
    headers: new Headers(),
  } as unknown as Response;
}

const BASE_URL = "https://api.test.com";
const API_KEY = "nl_sk_test_key";

function createClient(overrides?: Partial<{ maxRetries: number; timeoutMs: number }>) {
  return new NeonloopsClient({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    timeoutMs: overrides?.timeoutMs ?? 5000,
    maxRetries: overrides?.maxRetries ?? 2,
  });
}

describe("NeonloopsClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Speed up retries for tests
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("request()", () => {
    it("returns parsed JSON on 200", async () => {
      const data = { id: "wf_1", name: "Test Workflow" };
      fetchMock.mockResolvedValue(mockResponse(200, data));

      const client = createClient();
      const result = await client.request("GET", "/api/v1/workflows");

      expect(result).toEqual({ id: "wf_1", name: "Test Workflow" });
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("returns undefined on 204 No Content", async () => {
      fetchMock.mockResolvedValue(mockResponse(204));

      const client = createClient();
      const result = await client.request("DELETE", "/api/v1/workflows/wf_1");

      expect(result).toBeUndefined();
    });

    it("throws NeonloopsApiError immediately on 400 (no retry)", async () => {
      fetchMock.mockResolvedValue(mockResponse(400, { error: "Bad request" }));

      const client = createClient();
      await expect(client.request("POST", "/api/v1/run", { body: {} }))
        .rejects.toThrow(NeonloopsApiError);

      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("throws NeonloopsApiError immediately on 401 (no retry)", async () => {
      fetchMock.mockResolvedValue(mockResponse(401, { error: "Unauthorized" }));

      const client = createClient();
      const err = await client.request("GET", "/api/v1/workflows").catch((e) => e) as NeonloopsApiError;

      expect(err).toBeInstanceOf(NeonloopsApiError);
      expect(err.status).toBe(401);
      expect(err.message).toBe("Unauthorized");
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("throws NeonloopsApiError immediately on 404 (no retry)", async () => {
      fetchMock.mockResolvedValue(mockResponse(404, { error: "Not found" }));

      const client = createClient();
      const err = await client.request("GET", "/api/v1/workflows/wf_x").catch((e) => e) as NeonloopsApiError;

      expect(err).toBeInstanceOf(NeonloopsApiError);
      expect(err.status).toBe(404);
      expect(err.message).toBe("Not found");
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("retries on 429 then throws if still failing", async () => {
      fetchMock.mockResolvedValue(mockResponse(429, { error: "Rate limited" }));

      const client = createClient({ maxRetries: 2 });
      await expect(client.request("GET", "/api/v1/workflows"))
        .rejects.toThrow(NeonloopsApiError);

      // 1 initial + 2 retries = 3
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("retries on 500 then throws if still failing", async () => {
      fetchMock.mockResolvedValue(mockResponse(500, { error: "Internal error" }));

      const client = createClient({ maxRetries: 1 });
      const err = await client.request("GET", "/test").catch((e) => e) as NeonloopsApiError;

      expect(err).toBeInstanceOf(NeonloopsApiError);
      expect(err.status).toBe(500);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries on 502 then throws", async () => {
      fetchMock.mockResolvedValue(mockResponse(502, { error: "Bad gateway" }));

      const client = createClient({ maxRetries: 1 });
      await expect(client.request("GET", "/test")).rejects.toThrow(NeonloopsApiError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries on 503 then throws", async () => {
      fetchMock.mockResolvedValue(mockResponse(503, { error: "Service unavailable" }));

      const client = createClient({ maxRetries: 1 });
      await expect(client.request("GET", "/test")).rejects.toThrow(NeonloopsApiError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries on 504 then throws", async () => {
      fetchMock.mockResolvedValue(mockResponse(504, { error: "Gateway timeout" }));

      const client = createClient({ maxRetries: 1 });
      await expect(client.request("GET", "/test")).rejects.toThrow(NeonloopsApiError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("429 followed by 200 succeeds (retry works)", async () => {
      const data = { id: "wf_1" };
      fetchMock
        .mockResolvedValueOnce(mockResponse(429, { error: "Rate limited" }))
        .mockResolvedValueOnce(mockResponse(200, data));

      const client = createClient({ maxRetries: 2 });
      const result = await client.request("GET", "/api/v1/workflows");

      expect(result).toEqual({ id: "wf_1" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws NeonloopsTimeoutError on timeout", async () => {
      // Simulate AbortController abort
      fetchMock.mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (init.signal) {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted", "AbortError"));
            });
          }
        });
      });

      const client = createClient({ timeoutMs: 50, maxRetries: 0 });
      await expect(client.request("GET", "/slow")).rejects.toThrow(NeonloopsTimeoutError);
    });

    it("network error retries then throws", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      const client = createClient({ maxRetries: 1 });
      await expect(client.request("GET", "/test")).rejects.toThrow(TypeError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("appends query params to URL", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, []));

      const client = createClient();
      await client.request("GET", "/api/v1/workflows", {
        params: { project_id: "proj_1", limit: 10, offset: undefined },
      });

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe("https://api.test.com/api/v1/workflows?project_id=proj_1&limit=10");
    });

    it("sends body as JSON with Content-Type header", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, { id: "wf_1" }));

      const client = createClient();
      const body = { name: "Test", nodes: [] };
      await client.request("POST", "/api/v1/workflows", { body });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify(body));
      expect(init.headers["Content-Type"]).toBe("application/json");
    });

    it("always sends Authorization Bearer header", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, {}));

      const client = createClient();
      await client.request("GET", "/test");

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers["Authorization"]).toBe(`Bearer ${API_KEY}`);
    });

    it("does not send Content-Type when no body", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, {}));

      const client = createClient();
      await client.request("GET", "/test");

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers["Content-Type"]).toBeUndefined();
    });

    it("strips trailing slashes from baseUrl", async () => {
      fetchMock.mockResolvedValue(mockResponse(200, {}));

      const client = new NeonloopsClient({
        apiKey: API_KEY,
        baseUrl: "https://api.test.com///",
        timeoutMs: 5000,
        maxRetries: 0,
      });
      await client.request("GET", "/test");

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toBe("https://api.test.com/test");
    });

    it("uses fallback error message when body has no error field", async () => {
      fetchMock.mockResolvedValue(mockResponse(400, "plain text"));

      const client = createClient({ maxRetries: 0 });
      const err = await client.request("GET", "/test").catch((e) => e) as NeonloopsApiError;

      expect(err).toBeInstanceOf(NeonloopsApiError);
      expect(err.message).toBe("API request failed with status 400");
    });
  });

  describe("delete()", () => {
    it("sends a DELETE request and returns parsed JSON", async () => {
      const data = { success: true };
      fetchMock.mockResolvedValue(mockResponse(200, data));

      const client = createClient();
      const result = await client.delete("/api/v1/workflows/wf_1");

      expect(result).toEqual({ success: true });
      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe("DELETE");
    });

    it("returns undefined on 204 No Content", async () => {
      fetchMock.mockResolvedValue(mockResponse(204));

      const client = createClient();
      const result = await client.delete("/api/v1/workflows/wf_1");

      expect(result).toBeUndefined();
    });
  });

  describe("postStream()", () => {
    it("yields multiple SSE events in order", async () => {
      const events = [
        'data: {"type":"run:start","runId":"r1","totalNodes":3}\n\n',
        'data: {"type":"node:start","runId":"r1","nodeId":"n1","nodeType":"ai","nodeLabel":"GPT"}\n\n',
        'data: {"type":"run:complete","runId":"r1","status":"completed","durationMs":500}\n\n',
      ];
      const stream = createSSEStream(events);
      fetchMock.mockResolvedValue(mockStreamResponse(200, stream));

      const client = createClient();
      const collected: unknown[] = [];
      for await (const event of client.postStream("/api/v1/run/stream", {})) {
        collected.push(event);
      }

      expect(collected).toHaveLength(3);
      expect(collected[0]).toEqual({ type: "run:start", runId: "r1", totalNodes: 3 });
      expect(collected[1]).toEqual({ type: "node:start", runId: "r1", nodeId: "n1", nodeType: "ai", nodeLabel: "GPT" });
      expect(collected[2]).toEqual({ type: "run:complete", runId: "r1", status: "completed", durationMs: 500 });
    });

    it("throws NeonloopsApiError on non-OK response", async () => {
      const resp = {
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: "Invalid API key" }),
        text: vi.fn().mockResolvedValue(""),
        body: null,
        headers: new Headers(),
      } as unknown as Response;
      fetchMock.mockResolvedValue(resp);

      const client = createClient();
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _event of client.postStream("/api/v1/run/stream", {})) {
          // should not reach here
        }
      }).rejects.toThrow(NeonloopsApiError);

      const err = await (async () => {
        try {
          for await (const _ of client.postStream("/api/v1/run/stream", {})) { /* noop */ }
        } catch (e) { return e; }
      })() as NeonloopsApiError;
      expect(err.status).toBe(401);
      expect(err.message).toBe("Invalid API key");
    });

    it("handles empty buffer at end", async () => {
      const events = [
        'data: {"type":"run:start","runId":"r1","totalNodes":1}\n\n',
      ];
      const stream = createSSEStream(events);
      fetchMock.mockResolvedValue(mockStreamResponse(200, stream));

      const client = createClient();
      const collected: unknown[] = [];
      for await (const event of client.postStream("/api/v1/run/stream", {})) {
        collected.push(event);
      }

      expect(collected).toHaveLength(1);
      expect(collected[0]).toEqual({ type: "run:start", runId: "r1", totalNodes: 1 });
    });

    it("handles partial data in buffer across chunks", async () => {
      // Split an SSE event across two chunks
      const chunk1 = 'data: {"type":"run:sta';
      const chunk2 = 'rt","runId":"r1","totalNodes":2}\n\n';
      const stream = createSSEStream([chunk1, chunk2]);
      fetchMock.mockResolvedValue(mockStreamResponse(200, stream));

      const client = createClient();
      const collected: unknown[] = [];
      for await (const event of client.postStream("/api/v1/run/stream", {})) {
        collected.push(event);
      }

      expect(collected).toHaveLength(1);
      expect(collected[0]).toEqual({ type: "run:start", runId: "r1", totalNodes: 2 });
    });

    it("throws error when response body is null", async () => {
      const resp = {
        ok: true,
        status: 200,
        body: null,
        json: vi.fn(),
        text: vi.fn(),
        headers: new Headers(),
      } as unknown as Response;
      fetchMock.mockResolvedValue(resp);

      const client = createClient();
      await expect(async () => {
        for await (const _ of client.postStream("/api/v1/run/stream", {})) { /* noop */ }
      }).rejects.toThrow("Response body is null");
    });

    it("handles remaining data in buffer after stream ends", async () => {
      // No trailing newline, so data stays in buffer
      const events = ['data: {"type":"run:complete","runId":"r1","status":"completed","durationMs":100}'];
      const stream = createSSEStream(events);
      fetchMock.mockResolvedValue(mockStreamResponse(200, stream));

      const client = createClient();
      const collected: unknown[] = [];
      for await (const event of client.postStream("/api/v1/run/stream", {})) {
        collected.push(event);
      }

      expect(collected).toHaveLength(1);
      expect(collected[0]).toEqual({ type: "run:complete", runId: "r1", status: "completed", durationMs: 100 });
    });
  });
});
