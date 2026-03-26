import { NeonloopsClient } from "./client";
import { WorkflowsResource, ProjectsResource } from "./resources";
import type {
  RunnerOptions,
  RunOptions,
  RunResult,
  RunInput,
  ApiRunResponse,
  ApprovalOptions,
  ApprovalResponse,
  StreamEvent,
  Session,
  SessionList,
  SessionMessage,
  ApiSession,
  ApiSessionMessage,
  PaginationMeta,
} from "./types";

const DEFAULT_BASE_URL = "https://neonloops.com";

/**
 * High-level runner for executing Neonloops workflows.
 *
 * @example
 * ```ts
 * import { Runner } from "@neonloops/sdk";
 *
 * const runner = new Runner({
 *   apiKey: process.env.NEONLOOPS_API_KEY!,
 *   baseUrl: "https://neonloops.com",
 * });
 *
 * const result = await runner.run("wf_abc123", {
 *   input: [{ role: "user", content: "Hello!" }],
 * });
 *
 * console.log(result.output);
 * ```
 */
export class Runner {
  private readonly client: NeonloopsClient;
  private readonly defaultProjectId?: string;

  /** Workflow CRUD, publish, versions, and runs */
  readonly workflows: WorkflowsResource;
  /** Project CRUD and secrets */
  readonly projects: ProjectsResource;

  constructor(opts: RunnerOptions) {
    if (!opts.apiKey) {
      throw new Error("apiKey is required");
    }

    this.defaultProjectId = opts.projectId;
    this.client = new NeonloopsClient({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: opts.timeoutMs ?? 120_000,
      maxRetries: opts.maxRetries ?? 2,
    });

    this.workflows = new WorkflowsResource(this.client);
    this.projects = new ProjectsResource(this.client);
  }

  /**
   * Run a workflow by its ID.
   *
   * @param workflowId - The workflow ID (e.g. "wf_abc123")
   * @param options - Input messages, optional variables and session ID
   * @returns The run result with output, status, and metadata
   */
  async run(workflowId: string, options: RunOptions): Promise<RunResult> {
    if (!workflowId) {
      throw new Error("workflowId is required");
    }
    if (!options.input || options.input.length === 0) {
      throw new Error("At least one input message is required");
    }

    const body: Record<string, unknown> = {
      workflow_id: workflowId,
      input: options.input,
    };

    if (options.sessionId) {
      body.session_id = options.sessionId;
    }
    if (options.variables) {
      body.variables = options.variables;
    }
    if (options.version !== undefined) {
      body.version = options.version;
    }

    const response = await this.client.post<ApiRunResponse>(
      "/api/v1/run",
      body,
    );

    return {
      id: response.id,
      workflowId: response.workflow_id,
      status: response.status,
      output: response.output,
      error: response.error,
      approvalPrompt: response.approval_prompt,
      pausedAtNodeId: response.paused_at_node_id,
      metadata: response.metadata,
    };
  }

  /**
   * Approve a paused workflow run (pending_approval status).
   *
   * @param runId - The run ID (e.g. "run_abc123")
   * @param options - Optional comment
   * @returns The resumed run result
   */
  async approve(runId: string, options?: ApprovalOptions): Promise<RunResult> {
    if (!runId) {
      throw new Error("runId is required");
    }

    const response = await this.client.post<ApprovalResponse>(
      `/api/v1/run/${runId}/approve`,
      options ?? {},
    );

    return {
      id: response.id,
      workflowId: response.workflow_id,
      status: response.status,
      output: response.output,
      error: response.error,
      approvalPrompt: response.approval_prompt,
      pausedAtNodeId: response.paused_at_node_id,
      metadata: response.metadata ?? { durationMs: 0, nodesExecuted: [] },
    };
  }

  /**
   * Reject a paused workflow run (pending_approval status).
   *
   * @param runId - The run ID (e.g. "run_abc123")
   * @param options - Optional comment
   * @returns The run result (completed via rejected path or failed)
   */
  async reject(runId: string, options?: ApprovalOptions): Promise<RunResult> {
    if (!runId) {
      throw new Error("runId is required");
    }

    const response = await this.client.post<ApprovalResponse>(
      `/api/v1/run/${runId}/reject`,
      options ?? {},
    );

    return {
      id: response.id,
      workflowId: response.workflow_id,
      status: response.status,
      output: response.output,
      error: response.error,
      approvalPrompt: response.approval_prompt,
      pausedAtNodeId: response.paused_at_node_id,
      metadata: response.metadata ?? { durationMs: 0, nodesExecuted: [] },
    };
  }

  /**
   * Stream workflow execution events via SSE.
   *
   * @param workflowId - The workflow ID (e.g. "wf_abc123")
   * @param options - Input messages, optional variables and session ID
   * @yields StreamEvent objects as they arrive from the server
   */
  async *runStream(
    workflowId: string,
    options: RunOptions,
  ): AsyncGenerator<StreamEvent, void, undefined> {
    if (!workflowId) {
      throw new Error("workflowId is required");
    }
    if (!options.input || options.input.length === 0) {
      throw new Error("At least one input message is required");
    }

    const body: Record<string, unknown> = {
      workflow_id: workflowId,
      input: options.input,
    };

    if (options.sessionId) {
      body.session_id = options.sessionId;
    }
    if (options.variables) {
      body.variables = options.variables;
    }
    if (options.version !== undefined) {
      body.version = options.version;
    }

    yield* this.client.postStream<StreamEvent>("/api/v1/run/stream", body);
  }

  /**
   * Create a new chat session for multi-turn conversations.
   *
   * @param workflowId - The workflow ID (e.g. "wf_abc123")
   * @param opts - Optional title
   * @returns The created session
   */
  async createSession(
    workflowId: string,
    opts?: { title?: string },
  ): Promise<Session> {
    const body: Record<string, unknown> = { workflow_id: workflowId };
    if (opts?.title) body.title = opts.title;

    const res = await this.client.post<ApiSession>("/api/v1/sessions", body);
    return {
      id: res.id,
      workflowId: res.workflow_id,
      title: res.title,
      createdAt: res.created_at,
      updatedAt: res.updated_at,
    };
  }

  /**
   * List chat sessions for a workflow.
   *
   * @param workflowId - The workflow ID
   * @param params - Optional pagination parameters (limit, offset)
   * @returns Paginated list of sessions with pagination metadata
   */
  async listSessions(
    workflowId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<SessionList> {
    const res = await this.client.get<{
      data: ApiSession[];
      pagination: PaginationMeta;
    }>("/api/v1/sessions", {
      workflow_id: workflowId,
      limit: params?.limit,
      offset: params?.offset,
    });
    return {
      data: res.data.map((s) => ({
        id: s.id,
        workflowId: s.workflow_id,
        title: s.title,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
      pagination: res.pagination,
    };
  }

  /**
   * Get messages for a chat session.
   *
   * @param sessionId - The session ID
   * @returns Array of messages in chronological order
   */
  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    const res = await this.client.get<{
      data: ApiSessionMessage[];
      pagination: { total: number; limit: number; offset: number; has_more: boolean };
    }>(`/api/v1/sessions/${sessionId}/messages`);
    return res.data.map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      role: m.role,
      content: m.content,
      type: m.type,
      createdAt: m.created_at,
    }));
  }
}

/**
 * Helper to create a RunInput item.
 */
export function createInput(
  role: "user" | "assistant",
  content: string,
): RunInput {
  return { role, content };
}
