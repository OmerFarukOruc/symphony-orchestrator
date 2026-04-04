import type { TypedEventBus } from "../core/event-bus.js";
import type { RisolutoEventMap } from "../core/risoluto-events.js";
import type { AutomationConfig, RisolutoLogger } from "../core/types.js";
import type { NotificationManager } from "../notification/manager.js";
import type { OrchestratorPort } from "../orchestrator/port.js";
import type { AutomationStorePort } from "../persistence/sqlite/automation-store.js";
import type { TrackerPort } from "../tracker/port.js";
import type { AutomationRunRecord, AutomationRunTrigger } from "./types.js";

interface AutomationRunnerOptions {
  orchestrator: Pick<OrchestratorPort, "getSnapshot" | "requestTargetedRefresh">;
  tracker?: TrackerPort;
  notificationManager?: NotificationManager;
  eventBus?: TypedEventBus<RisolutoEventMap>;
  store: AutomationStorePort;
  logger: RisolutoLogger;
}

export class AutomationRunner {
  constructor(private readonly options: AutomationRunnerOptions) {}

  async run(config: AutomationConfig, trigger: AutomationRunTrigger): Promise<AutomationRunRecord> {
    const startedAt = new Date().toISOString();
    const run = await this.options.store.createRun({
      automationName: config.name,
      mode: config.mode,
      trigger,
      repoUrl: config.repoUrl,
      startedAt,
    });
    this.options.eventBus?.emit("automation.run.started", {
      runId: run.id,
      automationName: config.name,
      mode: config.mode,
      trigger,
    });

    try {
      if ((config.mode === "report" || config.mode === "findings") && !config.repoUrl) {
        return this.finish(run, {
          status: "skipped",
          output: null,
          details: {
            reason: "repo_url_required",
          },
          issueId: null,
          issueIdentifier: null,
          issueUrl: null,
          error: "repoUrl is required for report and findings automations",
          finishedAt: new Date().toISOString(),
        });
      }

      switch (config.mode) {
        case "implement":
          return this.runImplement(config, run);
        case "findings":
          return this.runFindings(config, run);
        case "report":
        default:
          return this.runReport(config, run);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.finish(run, {
        status: "failed",
        output: null,
        details: null,
        issueId: null,
        issueIdentifier: null,
        issueUrl: null,
        error: message,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  private async runReport(config: AutomationConfig, run: AutomationRunRecord): Promise<AutomationRunRecord> {
    const snapshot = this.options.orchestrator.getSnapshot();
    const output = buildReportOutput(config, snapshot);
    const details = {
      counts: snapshot.counts,
      running: snapshot.running.map((issue) => issue.identifier),
      retrying: snapshot.retrying.map((issue) => issue.identifier),
      queued: snapshot.queued?.map((issue) => issue.identifier) ?? [],
      completed: snapshot.completed?.map((issue) => issue.identifier) ?? [],
    };
    await this.notify(config, "automation_completed", "info", output);
    return this.finish(run, {
      status: "completed",
      output,
      details,
      issueId: null,
      issueIdentifier: null,
      issueUrl: null,
      error: null,
      finishedAt: new Date().toISOString(),
    });
  }

  private async runFindings(config: AutomationConfig, run: AutomationRunRecord): Promise<AutomationRunRecord> {
    const snapshot = this.options.orchestrator.getSnapshot();
    const findings = buildFindings(snapshot);
    const output = findings.length === 0 ? "No active findings." : findings.map((finding) => `- ${finding}`).join("\n");
    await this.notify(config, "automation_completed", findings.length === 0 ? "info" : "warning", output);
    return this.finish(run, {
      status: "completed",
      output,
      details: { findings },
      issueId: null,
      issueIdentifier: null,
      issueUrl: null,
      error: null,
      finishedAt: new Date().toISOString(),
    });
  }

  private async runImplement(config: AutomationConfig, run: AutomationRunRecord): Promise<AutomationRunRecord> {
    if (!this.options.tracker) {
      throw new Error("tracker is not available for implement automations");
    }
    const snapshot = this.options.orchestrator.getSnapshot();
    const created = await this.options.tracker.createIssue({
      title: `[Automation] ${config.name}`,
      description: buildImplementDescription(config, snapshot),
      stateName: null,
    });
    this.options.orchestrator.requestTargetedRefresh(created.issueId, created.identifier, `automation:${config.name}`);
    const output = `Created tracker issue ${created.identifier} for automation ${config.name}.`;
    await this.notify(config, "automation_completed", "info", output, {
      issueId: created.issueId,
      issueIdentifier: created.identifier,
      issueUrl: created.url,
    });
    return this.finish(run, {
      status: "completed",
      output,
      details: {
        prompt: config.prompt,
      },
      issueId: created.issueId,
      issueIdentifier: created.identifier,
      issueUrl: created.url,
      error: null,
      finishedAt: new Date().toISOString(),
    });
  }

  private async finish(
    run: AutomationRunRecord,
    input: Parameters<AutomationStorePort["finishRun"]>[1],
  ): Promise<AutomationRunRecord> {
    const finished = await this.options.store.finishRun(run.id, input);
    if (!finished) {
      throw new Error(`automation run ${run.id} could not be finalized`);
    }
    if (finished.status === "failed") {
      await this.notify(
        {
          name: finished.automationName,
          mode: finished.mode,
          repoUrl: finished.repoUrl,
        },
        "automation_failed",
        "critical",
        finished.error ?? `Automation ${finished.automationName} failed`,
      );
      this.options.eventBus?.emit("automation.run.failed", {
        runId: finished.id,
        automationName: finished.automationName,
        mode: finished.mode,
        error: finished.error ?? "unknown error",
      });
    } else if (finished.status === "completed" || finished.status === "skipped") {
      this.options.eventBus?.emit("automation.run.completed", {
        runId: finished.id,
        automationName: finished.automationName,
        mode: finished.mode,
        status: finished.status,
      });
    }
    return finished;
  }

  private async notify(
    config: Pick<AutomationConfig, "name" | "mode" | "repoUrl">,
    type: "automation_completed" | "automation_failed",
    severity: "info" | "warning" | "critical",
    message: string,
    createdIssue?: {
      issueId: string;
      issueIdentifier: string;
      issueUrl: string | null;
    },
  ): Promise<void> {
    await this.options.notificationManager?.notify({
      type,
      severity,
      timestamp: new Date().toISOString(),
      title: `${config.name} (${config.mode})`,
      message,
      source: "automation-runner",
      href: createdIssue?.issueUrl ?? null,
      issue: {
        id: createdIssue?.issueId ?? null,
        identifier: createdIssue?.issueIdentifier ?? `automation:${config.name}`,
        title: config.name,
        state: null,
        url: createdIssue?.issueUrl ?? null,
      },
      attempt: null,
      metadata: {
        automationName: config.name,
        mode: config.mode,
        repoUrl: config.repoUrl,
      },
    });
  }
}

function buildReportOutput(config: AutomationConfig, snapshot: ReturnType<OrchestratorPort["getSnapshot"]>): string {
  const lines = [
    `Automation ${config.name} ran in report mode.`,
    `Running: ${snapshot.counts.running}`,
    `Retrying: ${snapshot.counts.retrying}`,
    `Queued: ${snapshot.queued?.length ?? 0}`,
    `Completed: ${snapshot.completed?.length ?? 0}`,
  ];
  if (config.repoUrl) {
    lines.push(`Repo: ${config.repoUrl}`);
  }
  lines.push(`Prompt: ${config.prompt}`);
  return lines.join("\n");
}

function buildFindings(snapshot: ReturnType<OrchestratorPort["getSnapshot"]>): string[] {
  const findings: string[] = [];
  if (snapshot.retrying.length > 0) {
    findings.push(
      `Retry queue contains ${snapshot.retrying.length} issue(s): ${snapshot.retrying.map((issue) => issue.identifier).join(", ")}`,
    );
  }
  if ((snapshot.queued?.length ?? 0) > 0) {
    findings.push(`Dispatch queue contains ${snapshot.queued?.length ?? 0} issue(s).`);
  }
  const stalled = snapshot.recentEvents.filter((event) => event.event === "worker_stalled");
  if (stalled.length > 0) {
    findings.push(`Recent worker stalls observed: ${stalled.length}.`);
  }
  return findings;
}

function buildImplementDescription(
  config: AutomationConfig,
  snapshot: ReturnType<OrchestratorPort["getSnapshot"]>,
): string {
  const report = buildReportOutput(config, snapshot);
  const lines = [`Automation: ${config.name}`, "", config.prompt, "", report];
  return lines.join("\n");
}
