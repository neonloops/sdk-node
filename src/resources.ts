import type { NeonloopsClient } from "./client";
import type {
  PaginationParams,
  Workflow,
  WorkflowDetail,
  WorkflowRun,
  WorkflowRunDetail,
  WorkflowVersion,
  WorkflowVersionDetail,
  RollbackResult,
  CreateWorkflowOptions,
  UpdateWorkflowOptions,
  PublishResult,
  PublishOptions,
  Project,
  CreateProjectOptions,
  UpdateProjectOptions,
  Secret,
  CreateSecretOptions,
  ApiWorkflow,
  ApiWorkflowDetail,
  ApiWorkflowRun,
  ApiWorkflowRunDetail,
  ApiProject,
  ApiSecret,
  ApiWorkflowVersion,
  ApiWorkflowVersionDetail,
  ApiPublishResult,
  ApiRollbackResult,
} from "./types";

// ---------------------------------------------------------------------------
// Conversion helpers (snake_case API → camelCase SDK)
// ---------------------------------------------------------------------------

function toWorkflow(r: ApiWorkflow): Workflow {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    version: r.version,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toWorkflowDetail(r: ApiWorkflowDetail): WorkflowDetail {
  return {
    ...toWorkflow(r),
    nodes: r.nodes,
    edges: r.edges,
    settings: r.settings,
  };
}

function toWorkflowRun(r: ApiWorkflowRun): WorkflowRun {
  return {
    id: r.id,
    workflowId: r.workflow_id,
    status: r.status,
    output: r.output,
    error: r.error,
    approvalPrompt: r.approval_prompt,
    pausedAtNodeId: r.paused_at_node_id,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
  };
}

function toWorkflowRunDetail(r: ApiWorkflowRunDetail): WorkflowRunDetail {
  return {
    ...toWorkflowRun(r),
    workflowVersion: r.workflow_version,
    input: r.input,
    metadata: r.metadata,
    nodeTrace: r.node_trace,
  };
}

function toProject(r: ApiProject): Project {
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toSecret(r: ApiSecret): Secret {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
  };
}

function toVersion(r: ApiWorkflowVersion): WorkflowVersion {
  return {
    id: r.id,
    workflowId: r.workflow_id,
    version: r.version,
    publishedAt: r.published_at,
  };
}

function toVersionDetail(r: ApiWorkflowVersionDetail): WorkflowVersionDetail {
  return {
    ...toVersion(r),
    nodes: r.nodes,
    edges: r.edges,
  };
}

function toRollbackResult(r: ApiRollbackResult): RollbackResult {
  return {
    version: r.version,
    status: r.status,
    rolledBackFrom: r.rolled_back_from,
  };
}

// ---------------------------------------------------------------------------
// WorkflowsResource
// ---------------------------------------------------------------------------

export class WorkflowsResource {
  readonly secrets: WorkflowSecretsResource;

  constructor(private readonly client: NeonloopsClient) {
    this.secrets = new WorkflowSecretsResource(client);
  }

  async list(params?: PaginationParams & { projectId?: string }): Promise<Workflow[]> {
    const raw = await this.client.get<ApiWorkflow[]>("/api/v1/workflows", {
      project_id: params?.projectId,
      limit: params?.limit,
      offset: params?.offset,
    });
    return raw.map(toWorkflow);
  }

  async get(workflowId: string): Promise<WorkflowDetail> {
    const raw = await this.client.get<ApiWorkflowDetail>(`/api/v1/workflows/${workflowId}`);
    return toWorkflowDetail(raw);
  }

  async create(options: CreateWorkflowOptions): Promise<WorkflowDetail> {
    const body: Record<string, unknown> = {};
    if (options.name !== undefined) body.name = options.name;
    if (options.description !== undefined) body.description = options.description;
    if (options.projectId !== undefined) body.projectId = options.projectId;
    if (options.nodes !== undefined) body.nodes = options.nodes;
    if (options.edges !== undefined) body.edges = options.edges;
    const raw = await this.client.post<ApiWorkflowDetail>("/api/v1/workflows", body);
    return toWorkflowDetail(raw);
  }

  async update(workflowId: string, options: UpdateWorkflowOptions): Promise<WorkflowDetail> {
    const raw = await this.client.put<ApiWorkflowDetail>(`/api/v1/workflows/${workflowId}`, options);
    return toWorkflowDetail(raw);
  }

  async delete(workflowId: string): Promise<void> {
    await this.client.delete(`/api/v1/workflows/${workflowId}`);
  }

  async publish(workflowId: string, options?: PublishOptions): Promise<PublishResult> {
    return this.client.post<ApiPublishResult>(`/api/v1/workflows/${workflowId}/publish`, options ?? {});
  }

  async listVersions(workflowId: string): Promise<WorkflowVersion[]> {
    const raw = await this.client.get<ApiWorkflowVersion[]>(`/api/v1/workflows/${workflowId}/versions`);
    return raw.map(toVersion);
  }

  async getVersion(workflowId: string, version: number): Promise<WorkflowVersionDetail> {
    const raw = await this.client.get<ApiWorkflowVersionDetail>(`/api/v1/workflows/${workflowId}/versions/${version}`);
    return toVersionDetail(raw);
  }

  async rollback(workflowId: string, version: number): Promise<RollbackResult> {
    const raw = await this.client.post<ApiRollbackResult>(`/api/v1/workflows/${workflowId}/rollback`, { version });
    return toRollbackResult(raw);
  }

  async listRuns(workflowId: string, params?: PaginationParams): Promise<WorkflowRun[]> {
    const raw = await this.client.get<ApiWorkflowRun[]>(`/api/v1/workflows/${workflowId}/runs`, {
      limit: params?.limit,
      offset: params?.offset,
    });
    return raw.map(toWorkflowRun);
  }

  async getRun(workflowId: string, runId: string): Promise<WorkflowRunDetail> {
    const raw = await this.client.get<ApiWorkflowRunDetail>(`/api/v1/workflows/${workflowId}/runs/${runId}`);
    return toWorkflowRunDetail(raw);
  }
}

// ---------------------------------------------------------------------------
// ProjectsResource
// ---------------------------------------------------------------------------

export class ProjectsResource {
  readonly secrets: ProjectSecretsResource;

  constructor(private readonly client: NeonloopsClient) {
    this.secrets = new ProjectSecretsResource(client);
  }

  async list(): Promise<Project[]> {
    const raw = await this.client.get<ApiProject[]>("/api/v1/projects");
    return raw.map(toProject);
  }

  async create(options?: CreateProjectOptions): Promise<Project> {
    const raw = await this.client.post<ApiProject>("/api/v1/projects", options ?? {});
    return toProject(raw);
  }

  async update(projectId: string, options: UpdateProjectOptions): Promise<Project> {
    const raw = await this.client.put<ApiProject>(`/api/v1/projects/${projectId}`, options);
    return toProject(raw);
  }

  async delete(projectId: string): Promise<void> {
    await this.client.delete(`/api/v1/projects/${projectId}`);
  }
}

// ---------------------------------------------------------------------------
// SecretsResources
// ---------------------------------------------------------------------------

export class ProjectSecretsResource {
  constructor(private readonly client: NeonloopsClient) {}

  async list(projectId: string): Promise<Secret[]> {
    const raw = await this.client.get<ApiSecret[]>(`/api/v1/projects/${projectId}/secrets`);
    return raw.map(toSecret);
  }

  async create(projectId: string, options: CreateSecretOptions): Promise<Secret> {
    const raw = await this.client.post<ApiSecret>(`/api/v1/projects/${projectId}/secrets`, options);
    return toSecret(raw);
  }

  async delete(projectId: string, secretId: string): Promise<void> {
    await this.client.delete(`/api/v1/projects/${projectId}/secrets/${secretId}`);
  }
}

export class WorkflowSecretsResource {
  constructor(private readonly client: NeonloopsClient) {}

  async list(workflowId: string): Promise<Secret[]> {
    const raw = await this.client.get<ApiSecret[]>(`/api/v1/workflows/${workflowId}/secrets`);
    return raw.map(toSecret);
  }

  async create(workflowId: string, options: CreateSecretOptions): Promise<Secret> {
    const raw = await this.client.post<ApiSecret>(`/api/v1/workflows/${workflowId}/secrets`, options);
    return toSecret(raw);
  }

  async delete(workflowId: string, secretId: string): Promise<void> {
    await this.client.delete(`/api/v1/workflows/${workflowId}/secrets/${secretId}`);
  }
}
