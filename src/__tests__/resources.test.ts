import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WorkflowsResource,
  ProjectsResource,
  WorkflowSecretsResource,
  ProjectSecretsResource,
} from "../resources";
import type { NeonloopsClient } from "../client";
import type {
  ApiWorkflow,
  ApiWorkflowDetail,
  ApiWorkflowRun,
  ApiWorkflowRunDetail,
  ApiWorkflowVersion,
  ApiPublishResult,
  ApiProject,
  ApiSecret,
} from "../types";

function createMockClient(): NeonloopsClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    postStream: vi.fn(),
  } as unknown as NeonloopsClient;
}

// ---- Fixtures ----

const apiWorkflow: ApiWorkflow = {
  id: "wf_1",
  project_id: "proj_1",
  name: "Test Workflow",
  description: "A test workflow",
  version: 3,
  status: "published",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-15T12:00:00Z",
};

const apiWorkflowDetail: ApiWorkflowDetail = {
  ...apiWorkflow,
  nodes: [{ id: "n1", type: "ai" }],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
  settings: { retries: 2 },
};

const apiWorkflowRun: ApiWorkflowRun = {
  id: "run_1",
  workflow_id: "wf_1",
  status: "completed",
  output: "Hello!",
  error: null,
  approval_prompt: null,
  paused_at_node_id: null,
  started_at: "2025-06-15T12:00:00Z",
  completed_at: "2025-06-15T12:00:02Z",
  created_at: "2025-06-15T12:00:00Z",
};

const apiWorkflowRunDetail: ApiWorkflowRunDetail = {
  ...apiWorkflowRun,
  workflow_version: 3,
  input: [{ role: "user", content: "Hi" }],
  metadata: { durationMs: 2000, nodesExecuted: ["n1"] },
  node_trace: [{ nodeId: "n1", durationMs: 1500 }],
};

const apiVersion: ApiWorkflowVersion = {
  id: "ver_1",
  workflow_id: "wf_1",
  version: 3,
  published_at: "2025-06-15T12:00:00Z",
};

const apiProject: ApiProject = {
  id: "proj_1",
  name: "My Project",
  enabled: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-15T12:00:00Z",
};

const apiSecret: ApiSecret = {
  id: "sec_1",
  name: "OPENAI_API_KEY",
  created_at: "2025-03-01T00:00:00Z",
};

// ====================================================================
// WorkflowsResource
// ====================================================================

describe("WorkflowsResource", () => {
  let client: NeonloopsClient;
  let workflows: WorkflowsResource;

  beforeEach(() => {
    client = createMockClient();
    workflows = new WorkflowsResource(client);
  });

  describe("list()", () => {
    it("calls GET /api/v1/workflows and maps snake_case to camelCase", async () => {
      vi.mocked(client.get).mockResolvedValue([apiWorkflow]);

      const result = await workflows.list();

      expect(client.get).toHaveBeenCalledWith("/api/v1/workflows", {
        project_id: undefined,
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([
        {
          id: "wf_1",
          projectId: "proj_1",
          name: "Test Workflow",
          description: "A test workflow",
          version: 3,
          status: "published",
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-06-15T12:00:00Z",
        },
      ]);
    });

    it("passes projectId/limit/offset as query params", async () => {
      vi.mocked(client.get).mockResolvedValue([]);

      await workflows.list({ projectId: "proj_2", limit: 5, offset: 10 });

      expect(client.get).toHaveBeenCalledWith("/api/v1/workflows", {
        project_id: "proj_2",
        limit: 5,
        offset: 10,
      });
    });
  });

  describe("get()", () => {
    it("calls GET /api/v1/workflows/:id and maps result", async () => {
      vi.mocked(client.get).mockResolvedValue(apiWorkflowDetail);

      const result = await workflows.get("wf_1");

      expect(client.get).toHaveBeenCalledWith("/api/v1/workflows/wf_1");
      expect(result).toEqual({
        id: "wf_1",
        projectId: "proj_1",
        name: "Test Workflow",
        description: "A test workflow",
        version: 3,
        status: "published",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-06-15T12:00:00Z",
        nodes: [{ id: "n1", type: "ai" }],
        edges: [{ id: "e1", source: "n1", target: "n2" }],
        settings: { retries: 2 },
      });
    });
  });

  describe("create()", () => {
    it("calls POST /api/v1/workflows with body and maps result", async () => {
      vi.mocked(client.post).mockResolvedValue(apiWorkflowDetail);

      const result = await workflows.create({ name: "New WF", description: "desc", projectId: "proj_1" });

      expect(client.post).toHaveBeenCalledWith("/api/v1/workflows", {
        name: "New WF",
        description: "desc",
        projectId: "proj_1",
      });
      expect(result.id).toBe("wf_1");
      expect(result.name).toBe("Test Workflow");
      expect(result.nodes).toEqual([{ id: "n1", type: "ai" }]);
    });
  });

  describe("update()", () => {
    it("calls PUT /api/v1/workflows/:id", async () => {
      vi.mocked(client.put).mockResolvedValue(apiWorkflowDetail);

      const opts = { name: "Updated Name" };
      const result = await workflows.update("wf_1", opts);

      expect(client.put).toHaveBeenCalledWith("/api/v1/workflows/wf_1", opts);
      expect(result.id).toBe("wf_1");
    });
  });

  describe("delete()", () => {
    it("calls DELETE /api/v1/workflows/:id", async () => {
      vi.mocked(client.delete).mockResolvedValue(undefined);

      await workflows.delete("wf_1");

      expect(client.delete).toHaveBeenCalledWith("/api/v1/workflows/wf_1");
    });
  });

  describe("publish()", () => {
    it("calls POST /api/v1/workflows/:id/publish", async () => {
      const publishResult: ApiPublishResult = { version: 4, status: "published" };
      vi.mocked(client.post).mockResolvedValue(publishResult);

      const result = await workflows.publish("wf_1");

      expect(client.post).toHaveBeenCalledWith("/api/v1/workflows/wf_1/publish", {});
      expect(result).toEqual({ version: 4, status: "published" });
    });

    it("passes publish options in body", async () => {
      const publishResult: ApiPublishResult = { version: 5, status: "published" };
      vi.mocked(client.post).mockResolvedValue(publishResult);

      await workflows.publish("wf_1", { nodes: "[]", edges: "[]" });

      expect(client.post).toHaveBeenCalledWith("/api/v1/workflows/wf_1/publish", {
        nodes: "[]",
        edges: "[]",
      });
    });
  });

  describe("listVersions()", () => {
    it("calls GET /api/v1/workflows/:id/versions and maps result", async () => {
      vi.mocked(client.get).mockResolvedValue([apiVersion]);

      const result = await workflows.listVersions("wf_1");

      expect(client.get).toHaveBeenCalledWith("/api/v1/workflows/wf_1/versions");
      expect(result).toEqual([
        {
          id: "ver_1",
          workflowId: "wf_1",
          version: 3,
          publishedAt: "2025-06-15T12:00:00Z",
        },
      ]);
    });
  });

  describe("listRuns()", () => {
    it("calls GET /api/v1/workflows/:id/runs and maps result", async () => {
      vi.mocked(client.get).mockResolvedValue([apiWorkflowRun]);

      const result = await workflows.listRuns("wf_1");

      expect(client.get).toHaveBeenCalledWith("/api/v1/workflows/wf_1/runs", {
        limit: undefined,
        offset: undefined,
      });
      expect(result).toEqual([
        {
          id: "run_1",
          workflowId: "wf_1",
          status: "completed",
          output: "Hello!",
          error: null,
          approvalPrompt: null,
          pausedAtNodeId: null,
          startedAt: "2025-06-15T12:00:00Z",
          completedAt: "2025-06-15T12:00:02Z",
          createdAt: "2025-06-15T12:00:00Z",
        },
      ]);
    });

    it("passes pagination params", async () => {
      vi.mocked(client.get).mockResolvedValue([]);

      await workflows.listRuns("wf_1", { limit: 20, offset: 5 });

      expect(client.get).toHaveBeenCalledWith("/api/v1/workflows/wf_1/runs", {
        limit: 20,
        offset: 5,
      });
    });
  });

  describe("getRun()", () => {
    it("calls GET /api/v1/workflows/:id/runs/:runId and maps result", async () => {
      vi.mocked(client.get).mockResolvedValue(apiWorkflowRunDetail);

      const result = await workflows.getRun("wf_1", "run_1");

      expect(client.get).toHaveBeenCalledWith("/api/v1/workflows/wf_1/runs/run_1");
      expect(result).toEqual({
        id: "run_1",
        workflowId: "wf_1",
        status: "completed",
        output: "Hello!",
        error: null,
        approvalPrompt: null,
        pausedAtNodeId: null,
        startedAt: "2025-06-15T12:00:00Z",
        completedAt: "2025-06-15T12:00:02Z",
        createdAt: "2025-06-15T12:00:00Z",
        workflowVersion: 3,
        input: [{ role: "user", content: "Hi" }],
        metadata: { durationMs: 2000, nodesExecuted: ["n1"] },
        nodeTrace: [{ nodeId: "n1", durationMs: 1500 }],
      });
    });
  });
});

// ====================================================================
// WorkflowSecretsResource
// ====================================================================

describe("WorkflowSecretsResource", () => {
  let client: NeonloopsClient;
  let secrets: WorkflowSecretsResource;

  beforeEach(() => {
    client = createMockClient();
    secrets = new WorkflowSecretsResource(client);
  });

  it("list() calls GET /api/v1/workflows/:id/secrets", async () => {
    vi.mocked(client.get).mockResolvedValue([apiSecret]);

    const result = await secrets.list("wf_1");

    expect(client.get).toHaveBeenCalledWith("/api/v1/workflows/wf_1/secrets");
    expect(result).toEqual([{ id: "sec_1", name: "OPENAI_API_KEY", createdAt: "2025-03-01T00:00:00Z" }]);
  });

  it("create() calls POST /api/v1/workflows/:id/secrets", async () => {
    vi.mocked(client.post).mockResolvedValue(apiSecret);

    const result = await secrets.create("wf_1", { name: "OPENAI_API_KEY", value: "sk-xxx" });

    expect(client.post).toHaveBeenCalledWith("/api/v1/workflows/wf_1/secrets", {
      name: "OPENAI_API_KEY",
      value: "sk-xxx",
    });
    expect(result).toEqual({ id: "sec_1", name: "OPENAI_API_KEY", createdAt: "2025-03-01T00:00:00Z" });
  });

  it("delete() calls DELETE /api/v1/workflows/:id/secrets/:secretId", async () => {
    vi.mocked(client.delete).mockResolvedValue(undefined);

    await secrets.delete("wf_1", "sec_1");

    expect(client.delete).toHaveBeenCalledWith("/api/v1/workflows/wf_1/secrets/sec_1");
  });
});

// ====================================================================
// ProjectsResource
// ====================================================================

describe("ProjectsResource", () => {
  let client: NeonloopsClient;
  let projects: ProjectsResource;

  beforeEach(() => {
    client = createMockClient();
    projects = new ProjectsResource(client);
  });

  it("list() calls GET /api/v1/projects and maps result", async () => {
    vi.mocked(client.get).mockResolvedValue([apiProject]);

    const result = await projects.list();

    expect(client.get).toHaveBeenCalledWith("/api/v1/projects");
    expect(result).toEqual([
      {
        id: "proj_1",
        name: "My Project",
        enabled: true,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-06-15T12:00:00Z",
      },
    ]);
  });

  it("create() calls POST /api/v1/projects", async () => {
    vi.mocked(client.post).mockResolvedValue(apiProject);

    const result = await projects.create({ name: "New Project" });

    expect(client.post).toHaveBeenCalledWith("/api/v1/projects", { name: "New Project" });
    expect(result).toEqual({
      id: "proj_1",
      name: "My Project",
      enabled: true,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-06-15T12:00:00Z",
    });
  });

  it("create() sends empty body when no options", async () => {
    vi.mocked(client.post).mockResolvedValue(apiProject);

    await projects.create();

    expect(client.post).toHaveBeenCalledWith("/api/v1/projects", {});
  });

  it("update() calls PUT /api/v1/projects/:id", async () => {
    vi.mocked(client.put).mockResolvedValue(apiProject);

    const result = await projects.update("proj_1", { name: "Updated", enabled: false });

    expect(client.put).toHaveBeenCalledWith("/api/v1/projects/proj_1", { name: "Updated", enabled: false });
    expect(result.id).toBe("proj_1");
  });

  it("delete() calls DELETE /api/v1/projects/:id", async () => {
    vi.mocked(client.delete).mockResolvedValue(undefined);

    await projects.delete("proj_1");

    expect(client.delete).toHaveBeenCalledWith("/api/v1/projects/proj_1");
  });
});

// ====================================================================
// ProjectSecretsResource
// ====================================================================

describe("ProjectSecretsResource", () => {
  let client: NeonloopsClient;
  let secrets: ProjectSecretsResource;

  beforeEach(() => {
    client = createMockClient();
    secrets = new ProjectSecretsResource(client);
  });

  it("list() calls GET /api/v1/projects/:id/secrets", async () => {
    vi.mocked(client.get).mockResolvedValue([apiSecret]);

    const result = await secrets.list("proj_1");

    expect(client.get).toHaveBeenCalledWith("/api/v1/projects/proj_1/secrets");
    expect(result).toEqual([{ id: "sec_1", name: "OPENAI_API_KEY", createdAt: "2025-03-01T00:00:00Z" }]);
  });

  it("create() calls POST /api/v1/projects/:id/secrets", async () => {
    vi.mocked(client.post).mockResolvedValue(apiSecret);

    const result = await secrets.create("proj_1", { name: "ANTHROPIC_KEY", value: "ak-xxx" });

    expect(client.post).toHaveBeenCalledWith("/api/v1/projects/proj_1/secrets", {
      name: "ANTHROPIC_KEY",
      value: "ak-xxx",
    });
    expect(result).toEqual({ id: "sec_1", name: "OPENAI_API_KEY", createdAt: "2025-03-01T00:00:00Z" });
  });

  it("delete() calls DELETE /api/v1/projects/:id/secrets/:secretId", async () => {
    vi.mocked(client.delete).mockResolvedValue(undefined);

    await secrets.delete("proj_1", "sec_1");

    expect(client.delete).toHaveBeenCalledWith("/api/v1/projects/proj_1/secrets/sec_1");
  });
});
