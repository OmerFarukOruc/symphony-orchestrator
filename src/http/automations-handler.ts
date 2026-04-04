import type { Request, Response } from "express";

import type { AutomationRunRecord } from "../automation/types.js";
import type { AutomationScheduler } from "../automation/scheduler.js";
import type { AutomationStorePort } from "../persistence/sqlite/automation-store.js";

interface AutomationHandlerDeps {
  scheduler?: Pick<AutomationScheduler, "listAutomations" | "runNow">;
  automationStore?: AutomationStorePort;
}

function parseLimit(value: unknown): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") {
    return null;
  }
  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getSingleParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function serializeRun(record: AutomationRunRecord): Record<string, unknown> {
  return {
    id: record.id,
    automationName: record.automationName,
    mode: record.mode,
    trigger: record.trigger,
    repoUrl: record.repoUrl,
    status: record.status,
    output: record.output,
    details: record.details,
    issueId: record.issueId,
    issueIdentifier: record.issueIdentifier,
    issueUrl: record.issueUrl,
    error: record.error,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
  };
}

export async function handleListAutomations(
  deps: AutomationHandlerDeps,
  _request: Request,
  response: Response,
): Promise<void> {
  if (!deps.scheduler) {
    response.status(503).json({ error: { code: "not_configured", message: "automation scheduler not available" } });
    return;
  }

  response.json({
    automations: deps.scheduler.listAutomations(),
  });
}

export async function handleListAutomationRuns(
  deps: AutomationHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  if (!deps.automationStore) {
    response.status(503).json({ error: { code: "not_configured", message: "automation store not available" } });
    return;
  }

  const limit = parseLimit(request.query.limit);
  if (request.query.limit !== undefined && limit === null) {
    response.status(400).json({ error: { code: "validation_error", message: "limit must be a positive integer" } });
    return;
  }

  const automationName = getSingleParam(request.query.automation_name as string | string[] | undefined);
  const [runs, totalCount] = await Promise.all([
    deps.automationStore.listRuns({ limit: limit ?? undefined, automationName: automationName ?? undefined }),
    deps.automationStore.countRuns(),
  ]);

  response.json({
    runs: runs.map(serializeRun),
    totalCount,
  });
}

export async function handleRunAutomation(
  deps: AutomationHandlerDeps,
  request: Request,
  response: Response,
): Promise<void> {
  if (!deps.scheduler) {
    response.status(503).json({ error: { code: "not_configured", message: "automation scheduler not available" } });
    return;
  }
  const automationName = getSingleParam(request.params.automation_name);
  if (!automationName) {
    response.status(400).json({ error: { code: "validation_error", message: "automation_name is required" } });
    return;
  }

  const run = await deps.scheduler.runNow(automationName);
  if (!run) {
    response.status(404).json({ error: { code: "not_found", message: "automation not found" } });
    return;
  }

  response.status(202).json({
    ok: true,
    run: serializeRun(run),
  });
}
