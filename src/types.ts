/** Input message for a workflow run */
export interface RunInput {
  role: "user" | "assistant";
  content: string;
}

/** Options for creating a Runner instance */
export interface RunnerOptions {
  /** API key (nl_sk_...) — required */
  apiKey: string;
  /** Base URL of the Neonloops instance (default: https://neonloops.com) */
  baseUrl?: string;
  /** Default project ID to scope API key access */
  projectId?: string;
  /** Request timeout in milliseconds (default: 120000) */
  timeoutMs?: number;
  /** Maximum number of retries for 429/5xx errors (default: 2) */
  maxRetries?: number;
}

/** Options for a single workflow run */
export interface RunOptions {
  /** Input messages — at least one required */
  input: RunInput[];
  /** Optional session ID for multi-turn conversations */
  sessionId?: string;
  /** Optional variables to pass to the workflow */
  variables?: Record<string, unknown>;
  /** Optional version number to pin execution to a specific published version */
  version?: number;
}

/** Token usage information */
export interface TokenUsage {
  input: number;
  output: number;
}

/** Metadata returned with a run result */
export interface RunMetadata {
  provider?: string;
  model?: string;
  tokens?: TokenUsage;
  durationMs: number;
  nodesExecuted: string[];
}

/** Result of a workflow run */
export interface RunResult {
  /** Unique run ID */
  id: string;
  /** Workflow ID that was executed */
  workflowId: string;
  /** Execution status */
  status: "completed" | "failed" | "pending_approval";
  /** Output text (null if failed) */
  output: string | null;
  /** Error message (only if failed) */
  error?: string;
  /** Approval prompt (only if pending_approval) */
  approvalPrompt?: string;
  /** Node ID where the workflow paused (only if pending_approval) */
  pausedAtNodeId?: string;
  /** Execution metadata */
  metadata: RunMetadata;
}

/** Raw API response shape */
export interface ApiRunResponse {
  id: string;
  workflow_id: string;
  status: "completed" | "failed" | "pending_approval";
  output: string | null;
  error?: string;
  approval_prompt?: string;
  paused_at_node_id?: string;
  metadata: RunMetadata;
}

/** Options for approving/rejecting a run */
export interface ApprovalOptions {
  /** Optional comment */
  comment?: string;
}

/** Response from approve/reject endpoints */
export interface ApprovalResponse {
  id: string;
  workflow_id: string;
  status: "completed" | "failed" | "pending_approval";
  output: string | null;
  error?: string;
  approval_prompt?: string;
  paused_at_node_id?: string;
  metadata?: RunMetadata;
}

/* ------------------------------------------------------------------ */
/*  Streaming event types (SSE from /api/v1/run/stream)               */
/* ------------------------------------------------------------------ */

export interface RunStartEvent {
  type: "run:start";
  runId: string;
  totalNodes: number;
}

export interface NodeStartEvent {
  type: "node:start";
  runId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
}

export interface NodeCompleteEvent {
  type: "node:complete";
  runId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  durationMs: number;
  outputPreview: string;
  tokenUsage?: TokenUsage;
}

export interface NodeErrorEvent {
  type: "node:error";
  runId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  error: string;
}

export interface NodeTextDeltaEvent {
  type: "node:text-delta";
  runId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  delta: string;
}

export interface EdgeTraversedEvent {
  type: "edge:traversed";
  runId: string;
  edgeId: string;
  source: string;
  target: string;
}

export interface NodeWaitingApprovalEvent {
  type: "node:waiting_approval";
  runId: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  approvalPrompt: string;
}

export interface RunPausedEvent {
  type: "run:paused";
  runId: string;
  pausedAtNodeId: string;
  durationMs: number;
}

export interface RunResumedEvent {
  type: "run:resumed";
  runId: string;
}

export interface FanOutEvent {
  type: "fan-out";
  runId: string;
  sourceNodeId: string;
  targetCount: number;
}

export interface FanInWaitingEvent {
  type: "fan-in:waiting";
  runId: string;
  nodeId: string;
  arrived: number;
  expected: number;
}

export interface FanInReadyEvent {
  type: "fan-in:ready";
  runId: string;
  nodeId: string;
}

export interface RunCompleteEvent {
  type: "run:complete";
  runId: string;
  status: "completed" | "failed";
  durationMs: number;
  error?: string;
}

export interface RunResultEvent {
  type: "run:result";
  id: string;
  workflow_id: string;
  status: "completed" | "failed" | "pending_approval";
  output: string | null;
  error?: string;
  approval_prompt?: string;
  paused_at_node_id?: string;
  metadata: RunMetadata;
}

export type StreamEvent =
  | RunStartEvent
  | NodeStartEvent
  | NodeCompleteEvent
  | NodeErrorEvent
  | NodeTextDeltaEvent
  | NodeWaitingApprovalEvent
  | EdgeTraversedEvent
  | FanOutEvent
  | FanInWaitingEvent
  | FanInReadyEvent
  | RunPausedEvent
  | RunResumedEvent
  | RunCompleteEvent
  | RunResultEvent;

/* ------------------------------------------------------------------ */
/*  Resource types (from v1 API)                                       */
/* ------------------------------------------------------------------ */

/** Pagination parameters for list endpoints */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/** Workflow summary (list endpoint — no nodes/edges) */
export interface Workflow {
  id: string;
  projectId: string;
  name: string;
  description: string;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Workflow detail (includes nodes/edges) */
export interface WorkflowDetail extends Workflow {
  nodes: unknown;
  edges: unknown;
  settings: unknown;
}

/** Options for creating a workflow */
export interface CreateWorkflowOptions {
  name?: string;
  description?: string;
  projectId?: string;
  nodes?: unknown;
  edges?: unknown;
}

/** Options for updating a workflow */
export interface UpdateWorkflowOptions {
  name?: string;
  description?: string;
  nodes?: string;
  edges?: string;
  settings?: string;
}

/** Result of publishing a workflow */
export interface PublishResult {
  version: number;
  status: string;
}

/** Options for publishing a workflow */
export interface PublishOptions {
  nodes?: string;
  edges?: string;
}

/** Workflow version snapshot */
export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  publishedAt: string;
}

/** Workflow version detail (includes nodes/edges) */
export interface WorkflowVersionDetail extends WorkflowVersion {
  nodes: unknown;
  edges: unknown;
}

/** Result of rolling back a workflow */
export interface RollbackResult {
  version: number;
  status: string;
  rolledBackFrom: number;
}

/** Workflow run summary (list endpoint) */
export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: string;
  output: string | null;
  error: string | null;
  approvalPrompt: string | null;
  pausedAtNodeId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

/** Workflow run detail (includes nodeTrace) */
export interface WorkflowRunDetail extends WorkflowRun {
  workflowVersion: number;
  input: unknown;
  metadata: unknown;
  nodeTrace: unknown;
}

/** Project */
export interface Project {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Options for creating a project */
export interface CreateProjectOptions {
  name?: string;
}

/** Options for updating a project */
export interface UpdateProjectOptions {
  name?: string;
  enabled?: boolean;
}

/** Secret (never includes decrypted value) */
export interface Secret {
  id: string;
  name: string;
  createdAt?: string;
}

/** Options for creating a secret */
export interface CreateSecretOptions {
  name: string;
  value: string;
}

/* ------------------------------------------------------------------ */
/*  API response types (snake_case from server)                        */
/* ------------------------------------------------------------------ */

export interface ApiWorkflow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ApiWorkflowDetail extends ApiWorkflow {
  nodes: unknown;
  edges: unknown;
  settings: unknown;
}

export interface ApiWorkflowRun {
  id: string;
  workflow_id: string;
  status: string;
  output: string | null;
  error: string | null;
  approval_prompt: string | null;
  paused_at_node_id: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ApiWorkflowRunDetail extends ApiWorkflowRun {
  workflow_version: number;
  input: unknown;
  metadata: unknown;
  node_trace: unknown;
}

export interface ApiProject {
  id: string;
  name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiSecret {
  id: string;
  name: string;
  created_at?: string;
}

export interface ApiWorkflowVersion {
  id: string;
  workflow_id: string;
  version: number;
  published_at: string;
}

export interface ApiWorkflowVersionDetail extends ApiWorkflowVersion {
  nodes: unknown;
  edges: unknown;
}

export interface ApiRollbackResult {
  version: number;
  status: string;
  rolled_back_from: number;
}

export interface ApiPublishResult {
  version: number;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Session types                                                      */
/* ------------------------------------------------------------------ */

/** Chat session */
export interface Session {
  id: string;
  workflowId: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

/** Chat session message */
export interface SessionMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  type: string;
  createdAt: string;
}

/** Raw API session response (snake_case) */
export interface ApiSession {
  id: string;
  workflow_id: string;
  title: string;
  created_at: string;
  updated_at?: string;
}

/** Raw API session message response (snake_case) */
export interface ApiSessionMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  type: string;
  created_at: string;
}

/** Pagination metadata returned by list endpoints */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/** Paginated list of sessions */
export interface SessionList {
  data: Session[];
  pagination: PaginationMeta;
}
