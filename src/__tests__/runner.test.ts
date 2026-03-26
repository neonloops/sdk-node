import { describe, it, expect, vi, beforeEach } from "vitest";
import { Runner, createInput } from "../runner";
import { NeonloopsClient } from "../client";
import type { ApiRunResponse, ApprovalResponse, StreamEvent, ApiSession, ApiSessionMessage } from "../types";
import { WorkflowsResource, ProjectsResource } from "../resources";

// Mock the client module
vi.mock("../client", () => {
  const MockNeonloopsClient = vi.fn();
  MockNeonloopsClient.prototype.post = vi.fn();
  MockNeonloopsClient.prototype.get = vi.fn();
  MockNeonloopsClient.prototype.put = vi.fn();
  MockNeonloopsClient.prototype.delete = vi.fn();
  MockNeonloopsClient.prototype.postStream = vi.fn();
  return { NeonloopsClient: MockNeonloopsClient };
});

function createRunner(overrides?: { baseUrl?: string; timeoutMs?: number; maxRetries?: number }) {
  return new Runner({
    apiKey: "nl_sk_test",
    ...overrides,
  });
}

describe("Runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("throws when apiKey is missing", () => {
      expect(() => new Runner({ apiKey: "" })).toThrow("apiKey is required");
    });

    it("creates client with default baseUrl", () => {
      createRunner();
      expect(NeonloopsClient).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: "https://neonloops.com" }),
      );
    });

    it("accepts custom baseUrl", () => {
      createRunner({ baseUrl: "https://custom.example.com" });
      expect(NeonloopsClient).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: "https://custom.example.com" }),
      );
    });

    it("accepts custom timeout", () => {
      createRunner({ timeoutMs: 30000 });
      expect(NeonloopsClient).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 30000 }),
      );
    });

    it("accepts custom maxRetries", () => {
      createRunner({ maxRetries: 5 });
      expect(NeonloopsClient).toHaveBeenCalledWith(
        expect.objectContaining({ maxRetries: 5 }),
      );
    });

    it("initializes workflows resource", () => {
      const runner = createRunner();
      expect(runner.workflows).toBeInstanceOf(WorkflowsResource);
    });

    it("initializes projects resource", () => {
      const runner = createRunner();
      expect(runner.projects).toBeInstanceOf(ProjectsResource);
    });
  });

  describe("run()", () => {
    it("returns mapped RunResult on success", async () => {
      const apiResponse: ApiRunResponse = {
        id: "run_1",
        workflow_id: "wf_abc",
        status: "completed",
        output: "Hello world!",
        metadata: { durationMs: 1200, nodesExecuted: ["n1", "n2"], provider: "anthropic", model: "claude-3" },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      const result = await runner.run("wf_abc", {
        input: [{ role: "user", content: "Hi" }],
      });

      expect(result).toEqual({
        id: "run_1",
        workflowId: "wf_abc",
        status: "completed",
        output: "Hello world!",
        error: undefined,
        approvalPrompt: undefined,
        pausedAtNodeId: undefined,
        metadata: { durationMs: 1200, nodesExecuted: ["n1", "n2"], provider: "anthropic", model: "claude-3" },
      });
    });

    it("returns pending_approval result with approvalPrompt and pausedAtNodeId", async () => {
      const apiResponse: ApiRunResponse = {
        id: "run_2",
        workflow_id: "wf_xyz",
        status: "pending_approval",
        output: null,
        approval_prompt: "Should we proceed with the deployment?",
        paused_at_node_id: "node_approval_1",
        metadata: { durationMs: 500, nodesExecuted: ["n1"] },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      const result = await runner.run("wf_xyz", {
        input: [{ role: "user", content: "Deploy" }],
      });

      expect(result).toEqual({
        id: "run_2",
        workflowId: "wf_xyz",
        status: "pending_approval",
        output: null,
        error: undefined,
        approvalPrompt: "Should we proceed with the deployment?",
        pausedAtNodeId: "node_approval_1",
        metadata: { durationMs: 500, nodesExecuted: ["n1"] },
      });
    });

    it("throws when workflowId is missing", async () => {
      const runner = createRunner();
      await expect(runner.run("", { input: [{ role: "user", content: "Hi" }] }))
        .rejects.toThrow("workflowId is required");
    });

    it("throws when input is empty", async () => {
      const runner = createRunner();
      await expect(runner.run("wf_1", { input: [] }))
        .rejects.toThrow("At least one input message is required");
    });

    it("sends sessionId and variables in body", async () => {
      const apiResponse: ApiRunResponse = {
        id: "run_3",
        workflow_id: "wf_1",
        status: "completed",
        output: "Done",
        metadata: { durationMs: 100, nodesExecuted: [] },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      await runner.run("wf_1", {
        input: [{ role: "user", content: "Hi" }],
        sessionId: "sess_123",
        variables: { lang: "en", debug: true },
      });

      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith("/api/v1/run", {
        workflow_id: "wf_1",
        input: [{ role: "user", content: "Hi" }],
        session_id: "sess_123",
        variables: { lang: "en", debug: true },
      });
    });

    it("sends version in body when provided", async () => {
      const apiResponse: ApiRunResponse = {
        id: "run_5",
        workflow_id: "wf_1",
        status: "completed",
        output: "Versioned",
        metadata: { durationMs: 100, nodesExecuted: [] },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      await runner.run("wf_1", {
        input: [{ role: "user", content: "Hi" }],
        version: 3,
      });

      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith("/api/v1/run", {
        workflow_id: "wf_1",
        input: [{ role: "user", content: "Hi" }],
        version: 3,
      });
    });

    it("does not send sessionId or variables when not provided", async () => {
      const apiResponse: ApiRunResponse = {
        id: "run_4",
        workflow_id: "wf_1",
        status: "completed",
        output: "Ok",
        metadata: { durationMs: 50, nodesExecuted: [] },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      await runner.run("wf_1", {
        input: [{ role: "user", content: "Hello" }],
      });

      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith("/api/v1/run", {
        workflow_id: "wf_1",
        input: [{ role: "user", content: "Hello" }],
      });
    });
  });

  describe("runStream()", () => {
    it("yields events from client.postStream", async () => {
      const events: StreamEvent[] = [
        { type: "run:start", runId: "r1", totalNodes: 2 },
        { type: "run:complete", runId: "r1", status: "completed", durationMs: 300 },
      ];

      async function* mockStream() {
        for (const e of events) yield e;
      }

      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.postStream).mockReturnValue(mockStream());

      const collected: StreamEvent[] = [];
      for await (const event of runner.runStream("wf_1", { input: [{ role: "user", content: "Hi" }] })) {
        collected.push(event);
      }

      expect(collected).toEqual(events);
      expect(NeonloopsClient.prototype.postStream).toHaveBeenCalledWith("/api/v1/run/stream", {
        workflow_id: "wf_1",
        input: [{ role: "user", content: "Hi" }],
      });
    });

    it("sends version in body when provided", async () => {
      const events: StreamEvent[] = [
        { type: "run:complete", runId: "r1", status: "completed", durationMs: 100 },
      ];

      async function* mockStream() {
        for (const e of events) yield e;
      }

      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.postStream).mockReturnValue(mockStream());

      const collected: StreamEvent[] = [];
      for await (const event of runner.runStream("wf_1", {
        input: [{ role: "user", content: "Hi" }],
        version: 5,
      })) {
        collected.push(event);
      }

      expect(collected).toEqual(events);
      expect(NeonloopsClient.prototype.postStream).toHaveBeenCalledWith("/api/v1/run/stream", {
        workflow_id: "wf_1",
        input: [{ role: "user", content: "Hi" }],
        version: 5,
      });
    });

    it("throws when workflowId is missing", async () => {
      const runner = createRunner();
      await expect(async () => {
        for await (const _ of runner.runStream("", { input: [{ role: "user", content: "Hi" }] })) { /* noop */ }
      }).rejects.toThrow("workflowId is required");
    });

    it("throws when input is empty", async () => {
      const runner = createRunner();
      await expect(async () => {
        for await (const _ of runner.runStream("wf_1", { input: [] })) { /* noop */ }
      }).rejects.toThrow("At least one input message is required");
    });

    it("sends sessionId and variables in body when provided", async () => {
      async function* mockStream() {
        yield { type: "run:complete" as const, runId: "r1", status: "completed" as const, durationMs: 50 };
      }

      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.postStream).mockReturnValue(mockStream());

      const collected: StreamEvent[] = [];
      for await (const event of runner.runStream("wf_1", {
        input: [{ role: "user", content: "Hi" }],
        sessionId: "sess_1",
        variables: { lang: "en" },
      })) {
        collected.push(event);
      }

      expect(NeonloopsClient.prototype.postStream).toHaveBeenCalledWith("/api/v1/run/stream", {
        workflow_id: "wf_1",
        input: [{ role: "user", content: "Hi" }],
        session_id: "sess_1",
        variables: { lang: "en" },
      });
    });
  });

  describe("approve()", () => {
    it("returns RunResult on success", async () => {
      const apiResponse: ApprovalResponse = {
        id: "run_1",
        workflow_id: "wf_1",
        status: "completed",
        output: "Deployment complete",
        metadata: { durationMs: 2000, nodesExecuted: ["n1", "n2", "n3"] },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      const result = await runner.approve("run_1");

      expect(result).toEqual({
        id: "run_1",
        workflowId: "wf_1",
        status: "completed",
        output: "Deployment complete",
        error: undefined,
        approvalPrompt: undefined,
        pausedAtNodeId: undefined,
        metadata: { durationMs: 2000, nodesExecuted: ["n1", "n2", "n3"] },
      });
      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith("/api/v1/run/run_1/approve", {});
    });

    it("throws when runId is missing", async () => {
      const runner = createRunner();
      await expect(runner.approve("")).rejects.toThrow("runId is required");
    });

    it("sends comment in body when provided", async () => {
      const apiResponse: ApprovalResponse = {
        id: "run_2",
        workflow_id: "wf_2",
        status: "completed",
        output: "Done",
        metadata: { durationMs: 100, nodesExecuted: [] },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      await runner.approve("run_2", { comment: "LGTM" });

      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith(
        "/api/v1/run/run_2/approve",
        { comment: "LGTM" },
      );
    });

    it("defaults metadata when response metadata is undefined", async () => {
      const apiResponse: ApprovalResponse = {
        id: "run_3",
        workflow_id: "wf_3",
        status: "completed",
        output: "Ok",
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      const result = await runner.approve("run_3");

      expect(result.metadata).toEqual({ durationMs: 0, nodesExecuted: [] });
    });
  });

  describe("reject()", () => {
    it("returns RunResult on success", async () => {
      const apiResponse: ApprovalResponse = {
        id: "run_1",
        workflow_id: "wf_1",
        status: "failed",
        output: null,
        error: "Rejected by user",
        metadata: { durationMs: 500, nodesExecuted: ["n1"] },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      const result = await runner.reject("run_1");

      expect(result).toEqual({
        id: "run_1",
        workflowId: "wf_1",
        status: "failed",
        output: null,
        error: "Rejected by user",
        approvalPrompt: undefined,
        pausedAtNodeId: undefined,
        metadata: { durationMs: 500, nodesExecuted: ["n1"] },
      });
      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith("/api/v1/run/run_1/reject", {});
    });

    it("throws when runId is missing", async () => {
      const runner = createRunner();
      await expect(runner.reject("")).rejects.toThrow("runId is required");
    });

    it("sends comment in body when provided", async () => {
      const apiResponse: ApprovalResponse = {
        id: "run_2",
        workflow_id: "wf_2",
        status: "failed",
        output: null,
        error: "Rejected",
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      await runner.reject("run_2", { comment: "Not ready" });

      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith(
        "/api/v1/run/run_2/reject",
        { comment: "Not ready" },
      );
    });

    it("defaults metadata when response metadata is undefined", async () => {
      const apiResponse: ApprovalResponse = {
        id: "run_4",
        workflow_id: "wf_4",
        status: "failed",
        output: null,
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      const result = await runner.reject("run_4");

      expect(result.metadata).toEqual({ durationMs: 0, nodesExecuted: [] });
    });
  });

  describe("createSession()", () => {
    it("creates a session and maps response to Session type", async () => {
      const apiResponse: ApiSession = {
        id: "sess_abc",
        workflow_id: "wf_1",
        title: "My Chat",
        created_at: "2026-03-16T00:00:00.000Z",
        updated_at: "2026-03-16T00:00:00.000Z",
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      const session = await runner.createSession("wf_1", { title: "My Chat" });

      expect(session).toEqual({
        id: "sess_abc",
        workflowId: "wf_1",
        title: "My Chat",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
      });
      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith(
        "/api/v1/sessions",
        { workflow_id: "wf_1", title: "My Chat" },
      );
    });

    it("creates a session without title", async () => {
      const apiResponse: ApiSession = {
        id: "sess_def",
        workflow_id: "wf_2",
        title: "New chat",
        created_at: "2026-03-16T00:00:00.000Z",
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.post).mockResolvedValue(apiResponse);

      const session = await runner.createSession("wf_2");

      expect(session.id).toBe("sess_def");
      expect(session.title).toBe("New chat");
      expect(NeonloopsClient.prototype.post).toHaveBeenCalledWith(
        "/api/v1/sessions",
        { workflow_id: "wf_2" },
      );
    });
  });

  describe("listSessions()", () => {
    it("returns mapped sessions array", async () => {
      const apiResponse = {
        data: [
          {
            id: "sess_1",
            workflow_id: "wf_1",
            title: "Chat 1",
            created_at: "2026-03-16T00:00:00.000Z",
            updated_at: "2026-03-16T01:00:00.000Z",
          },
          {
            id: "sess_2",
            workflow_id: "wf_1",
            title: "Chat 2",
            created_at: "2026-03-15T00:00:00.000Z",
          },
        ] as ApiSession[],
        pagination: { total: 2, limit: 50, offset: 0, has_more: false },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.get).mockResolvedValue(apiResponse);

      const sessions = await runner.listSessions("wf_1");

      expect(sessions.data).toHaveLength(2);
      expect(sessions.data[0]).toEqual({
        id: "sess_1",
        workflowId: "wf_1",
        title: "Chat 1",
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T01:00:00.000Z",
      });
      expect(sessions.data[1]).toEqual({
        id: "sess_2",
        workflowId: "wf_1",
        title: "Chat 2",
        createdAt: "2026-03-15T00:00:00.000Z",
        updatedAt: undefined,
      });
      expect(NeonloopsClient.prototype.get).toHaveBeenCalledWith(
        "/api/v1/sessions",
        { workflow_id: "wf_1" },
      );
    });

    it("returns empty array when no sessions exist", async () => {
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.get).mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 50, offset: 0, has_more: false },
      });

      const sessions = await runner.listSessions("wf_empty");

      expect(sessions.data).toEqual([]);
    });
  });

  describe("getSessionMessages()", () => {
    it("returns mapped messages array", async () => {
      const apiResponse = {
        data: [
          {
            id: "msg_1",
            session_id: "sess_1",
            role: "user",
            content: "Hello!",
            type: "text",
            created_at: "2026-03-16T00:00:00.000Z",
          },
          {
            id: "msg_2",
            session_id: "sess_1",
            role: "assistant",
            content: "Hi there!",
            type: "text",
            created_at: "2026-03-16T00:00:01.000Z",
          },
        ] as ApiSessionMessage[],
        pagination: { total: 2, limit: 100, offset: 0, has_more: false },
      };
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.get).mockResolvedValue(apiResponse);

      const messages = await runner.getSessionMessages("sess_1");

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        id: "msg_1",
        sessionId: "sess_1",
        role: "user",
        content: "Hello!",
        type: "text",
        createdAt: "2026-03-16T00:00:00.000Z",
      });
      expect(messages[1]).toEqual({
        id: "msg_2",
        sessionId: "sess_1",
        role: "assistant",
        content: "Hi there!",
        type: "text",
        createdAt: "2026-03-16T00:00:01.000Z",
      });
      expect(NeonloopsClient.prototype.get).toHaveBeenCalledWith(
        "/api/v1/sessions/sess_1/messages",
      );
    });

    it("returns empty array when no messages exist", async () => {
      const runner = createRunner();
      vi.mocked(NeonloopsClient.prototype.get).mockResolvedValue({
        data: [],
        pagination: { total: 0, limit: 100, offset: 0, has_more: false },
      });

      const messages = await runner.getSessionMessages("sess_empty");

      expect(messages).toEqual([]);
    });
  });
});

describe("createInput()", () => {
  it("creates a user input message", () => {
    const input = createInput("user", "Hello!");
    expect(input).toEqual({ role: "user", content: "Hello!" });
  });

  it("creates an assistant input message", () => {
    const input = createInput("assistant", "Hi there!");
    expect(input).toEqual({ role: "assistant", content: "Hi there!" });
  });
});
