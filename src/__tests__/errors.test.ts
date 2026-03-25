import { describe, it, expect } from "vitest";
import { NeonloopsApiError, NeonloopsTimeoutError } from "../errors";

describe("NeonloopsApiError", () => {
  it("sets message, status, and body", () => {
    const body = { error: "Not found", details: "Workflow wf_123 does not exist" };
    const err = new NeonloopsApiError("Not found", 404, body);

    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
    expect(err.body).toEqual(body);
  });

  it("has name set to NeonloopsApiError", () => {
    const err = new NeonloopsApiError("Bad request", 400);
    expect(err.name).toBe("NeonloopsApiError");
  });

  it("is an instance of Error", () => {
    const err = new NeonloopsApiError("Server error", 500, null);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NeonloopsApiError);
  });

  it("defaults body to undefined when not provided", () => {
    const err = new NeonloopsApiError("Unauthorized", 401);
    expect(err.body).toBeUndefined();
  });

  it("preserves complex error body shapes", () => {
    const body = { error: "Validation failed", fields: { name: "required" } };
    const err = new NeonloopsApiError("Validation failed", 422, body);
    expect(err.status).toBe(422);
    expect(err.body).toEqual({ error: "Validation failed", fields: { name: "required" } });
  });
});

describe("NeonloopsTimeoutError", () => {
  it("message includes timeout value", () => {
    const err = new NeonloopsTimeoutError(30000);
    expect(err.message).toBe("Request timed out after 30000ms");
  });

  it("has name set to NeonloopsTimeoutError", () => {
    const err = new NeonloopsTimeoutError(5000);
    expect(err.name).toBe("NeonloopsTimeoutError");
  });

  it("is an instance of Error", () => {
    const err = new NeonloopsTimeoutError(120000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NeonloopsTimeoutError);
  });

  it("works with different timeout values", () => {
    const err = new NeonloopsTimeoutError(1);
    expect(err.message).toBe("Request timed out after 1ms");
  });
});
