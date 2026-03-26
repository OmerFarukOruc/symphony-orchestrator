/* eslint-disable complexity, sonarjs/cognitive-complexity, sonarjs/no-nested-template-literals */
import { useMemo, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import type {
  RateLimits,
  RecentEvent,
  RuntimeInfo,
  RuntimeIssueView,
  RuntimeSnapshot,
  StallEventView,
  SystemHealth,
} from "../../../../frontend/src/types";
import { classifyEvent, eventTypeLabel } from "../../../../frontend/src/utils/events";
import {
  formatCompactNumber,
  formatCompactTimestamp,
  formatDuration,
  formatRateLimitHeadroom,
  formatRelativeTime,
} from "../../../../frontend/src/utils/format";
import { buildAttentionList, latestTerminalIssues } from "../../../../frontend/src/utils/issues";
import { queryKeys } from "../hooks/query-client.js";
import { useSSE } from "../hooks/useSSE.js";
import styles from "./Overview.module.css";

const EMPTY_STATE_DISMISSED_KEY = "symphony-empty-state-dismissed";

async function fetchOverviewState(): Promise<RuntimeSnapshot> {
  const response = await fetch("/api/v1/state");
  if (!response.ok) {
    throw new Error(`Overview state request failed with ${response.status}.`);
  }
  return (await response.json()) as RuntimeSnapshot;
}

async function fetchRuntimeInfo(): Promise<RuntimeInfo> {
  const response = await fetch("/api/v1/runtime");
  if (!response.ok) {
    throw new Error(`Runtime info request failed with ${response.status}.`);
  }
  return (await response.json()) as RuntimeInfo;
}

function isGettingStartedDismissed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(EMPTY_STATE_DISMISSED_KEY) === "true";
}

function dismissGettingStarted(): void {
  window.localStorage.setItem(EMPTY_STATE_DISMISSED_KEY, "true");
}

function formatIssueStatusLabel(status: string): string {
  return status.replaceAll(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getAttentionSignal(issue: RuntimeIssueView): string {
  if (issue.modelChangePending) {
    return "Model override pending";
  }
  if (issue.status === "blocked") {
    return issue.message ?? "Operator intervention required";
  }
  if (issue.status === "retrying") {
    return issue.message ?? "Awaiting next retry window";
  }
  if (issue.status === "running") {
    return issue.message ?? "Run active";
  }
  if (issue.status === "queued") {
    return "Waiting for agent pickup";
  }
  return issue.message ?? issue.state;
}

function formatStalledDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function eventChipClass(event: RecentEvent): string {
  const variant = classifyEvent(event);
  const variantMap: Record<string, string> = {
    agent: styles.eventChipAgent,
    system: styles.eventChipSystem,
    error: styles.eventChipError,
    "state-change": styles.eventChipStateChange,
    tool: styles.eventChipTool,
    usage: styles.eventChipUsage,
  };
  return variantMap[variant] ?? styles.eventChipSystem;
}

function SectionHeader({ title, kicker }: Readonly<{ title: string; kicker?: string }>): ReactElement {
  return (
    <div className={`${styles.sectionHeader} overview-section-header`}>
      <h2 className={`${styles.sectionTitle} overview-section-title`}>{title}</h2>
      {kicker ? <span className={styles.kicker}>{kicker}</span> : null}
    </div>
  );
}

function TeachingEmptyState({ title, detail }: Readonly<{ title: string; detail: string }>): ReactElement {
  return (
    <div className={`${styles.teachingEmpty} overview-teaching-empty`}>
      <h3 className={`${styles.teachingTitle} overview-teaching-empty-title`}>{title}</h3>
      <p className={`${styles.teachingDetail} overview-teaching-empty-detail`}>{detail}</p>
    </div>
  );
}

function IssueRow({
  issue,
  target,
  onSelect,
}: Readonly<{
  issue: RuntimeIssueView;
  target: "attention" | "terminal";
  onSelect: (issue: RuntimeIssueView) => void;
}>): ReactElement {
  if (target === "terminal") {
    return (
      <button
        type="button"
        className={`${styles.issueButton} ${styles.terminalItem} overview-terminal-item`}
        onClick={() => onSelect(issue)}
      >
        <div className={`${styles.rowMeta} overview-row-meta`}>
          <strong className={styles.attentionIdent}>{issue.identifier}</strong>
          <span className={`${styles.smallText} overview-small`}>{formatRelativeTime(issue.updatedAt)}</span>
        </div>
        <div className={styles.attentionTitle}>{issue.title}</div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.issueButton} ${styles.attentionItem} overview-attention-item`}
      data-status={issue.status}
      data-signal={issue.modelChangePending ? "pending" : undefined}
      onClick={() => onSelect(issue)}
    >
      <div className={`${styles.attentionTopline} overview-attention-topline`}>
        <span className={`${styles.attentionStatus} overview-attention-status`}>
          {formatIssueStatusLabel(issue.status)}
        </span>
        <time
          className={`${styles.smallText} ${styles.attentionUpdated} overview-attention-updated overview-small`}
          dateTime={issue.updatedAt}
          title={issue.updatedAt}
        >
          {formatRelativeTime(issue.updatedAt)}
        </time>
      </div>

      <div className={`${styles.attentionBodyline} overview-attention-bodyline`}>
        <strong className={`${styles.attentionIdent} overview-attention-ident`}>{issue.identifier}</strong>
        <div className={`${styles.attentionTitle} overview-attention-title`}>{issue.title}</div>
      </div>

      <div className={`${styles.attentionFooter} overview-attention-footer`}>
        <span className={`${styles.attentionState} overview-attention-state`}>{issue.state}</span>
        <span className={`${styles.attentionSignal} overview-attention-signal`}>{getAttentionSignal(issue)}</span>
      </div>
    </button>
  );
}

function EventRow({ event }: Readonly<{ event: RecentEvent }>): ReactElement {
  return (
    <article className={styles.eventRow}>
      <div className={styles.eventMeta}>
        <time className={styles.eventTime} dateTime={event.at} title={event.at}>
          {formatCompactTimestamp(event.at)}
        </time>
        <span className={`${styles.eventChip} ${eventChipClass(event)}`}>{eventTypeLabel(event.event)}</span>
      </div>
      <p className={styles.eventMessage}>{event.message}</p>
    </article>
  );
}

function SystemHealthBadge({ health }: Readonly<{ health: SystemHealth | undefined }>): ReactElement {
  const statusClass =
    health?.status === "critical"
      ? styles.healthCritical
      : health?.status === "degraded"
        ? styles.healthDegraded
        : styles.healthHealthy;

  return (
    <div
      className={`${styles.healthBadge} ${statusClass} system-health-badge ${health ? `is-${health.status}` : "is-healthy"}`}
    >
      <span className={`${styles.healthDot} system-health-dot`} aria-hidden="true" />
      <span className={`${styles.healthLabel} system-health-label`}>{health?.status ?? "healthy"}</span>
      <span className={`${styles.healthMessage} system-health-message`}>
        {health?.message ?? "Awaiting first health check…"}
      </span>
      <time
        className={`${styles.healthCheckedAt} system-health-checked-at`}
        dateTime={health?.checked_at ?? ""}
        title={health?.checked_at ?? ""}
      >
        {health ? formatRelativeTime(health.checked_at) : ""}
      </time>
    </div>
  );
}

function StallEventsList({ events }: Readonly<{ events: StallEventView[] | undefined }>): ReactElement {
  if (!events || events.length === 0) {
    return <p className={`${styles.stallEmpty} stall-events-empty`}>No stall events.</p>;
  }

  return (
    <div className={`${styles.stallList} stall-events-list`}>
      {events
        .slice(-10)
        .reverse()
        .map((event) => (
          <article key={`${event.issue_identifier}-${event.at}`} className={`${styles.stallRow} stall-event-row`}>
            <div className={`${styles.stallMeta} stall-event-meta`}>
              <strong className={`${styles.stallIssue} stall-event-issue`}>{event.issue_identifier}</strong>
              <span
                className={`${styles.stallDuration} stall-event-duration`}
              >{`silent ${formatStalledDuration(event.silent_ms)}`}</span>
            </div>
            <div className={`${styles.stallDetail} stall-event-detail`}>
              <span
                className={`${styles.stallAgent} stall-event-agent`}
              >{`timeout ${formatStalledDuration(event.timeout_ms)}`}</span>
              <time className={`${styles.stallKilledAt} stall-event-killed-at`} dateTime={event.at} title={event.at}>
                {formatRelativeTime(event.at)}
              </time>
            </div>
          </article>
        ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function Overview(): ReactElement {
  const navigate = useNavigate();
  const [gettingStartedDismissed, setGettingStartedDismissed] = useState<boolean>(() => isGettingStartedDismissed());
  useSSE();
  const {
    data: snapshot,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.state,
    queryFn: fetchOverviewState,
    staleTime: 4_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });
  const { data: runtimeInfo } = useQuery({
    queryKey: queryKeys.runtime,
    queryFn: fetchRuntimeInfo,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const attentionIssues = useMemo(() => (snapshot ? buildAttentionList(snapshot.workflow_columns) : []), [snapshot]);
  const terminalIssues = useMemo(() => (snapshot ? latestTerminalIssues(snapshot.completed) : []), [snapshot]);

  const isEmpty =
    snapshot !== undefined &&
    snapshot.counts.running === 0 &&
    snapshot.counts.retrying === 0 &&
    snapshot.queued.length === 0 &&
    snapshot.completed.length === 0 &&
    attentionIssues.length === 0;

  const rateLimit = snapshot?.rate_limits ?? (null as RateLimits | null);

  return (
    <section className={`${styles.page} overview-page`} aria-label="Overview dashboard">
      <section className={`${styles.heroBand} overview-hero-band`} aria-busy={isLoading}>
        <span className={`${styles.heroLabel} overview-hero-label`}>Now</span>
        <div className={`${styles.heroMetrics} overview-hero-metrics`}>
          {[
            [snapshot?.counts.running ?? "—", "Running"],
            [snapshot?.queued.length ?? "—", "Queue"],
            [formatRateLimitHeadroom(rateLimit), "Rate limit"],
            [attentionIssues.length, "Attention"],
          ].map(([value, label]) => (
            <div key={label} className={`${styles.liveMetric} overview-live-metric`}>
              <strong className={`${styles.liveValue} overview-live-value`}>{String(value)}</strong>
              <span className={`${styles.liveLabel} overview-live-label`}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {isEmpty && !gettingStartedDismissed ? (
        <div className={`${styles.gettingStarted} overview-getting-started`}>
          <button
            type="button"
            className={`${styles.gettingStartedDismiss} overview-getting-started-dismiss`}
            aria-label="Dismiss"
            onClick={() => {
              dismissGettingStarted();
              setGettingStartedDismissed(true);
            }}
          >
            ×
          </button>
          <h3 className={`${styles.gettingStartedTitle} overview-getting-started-title`}>No issues yet</h3>
          <p className={`${styles.gettingStartedDesc} overview-getting-started-desc`}>
            Symphony is polling your Linear project every 30 seconds. Create an issue and move it to In Progress to get
            started.
          </p>
          <div className={`${styles.gettingStartedSteps} overview-getting-started-steps`}>
            {["Create an issue in Linear", "Move it to In Progress", "Symphony picks it up within 30 seconds"].map(
              (step, index) => (
                <div key={step} className={`${styles.gettingStartedStep} overview-getting-started-step`}>
                  <span className={`${styles.gettingStartedStepNumber} overview-getting-started-step-n`}>
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}

      <section className={`${styles.mainGrid} overview-main-grid`}>
        <article className={`${styles.attentionZone} overview-attention-zone`} aria-busy={isLoading}>
          <div className={`${styles.attentionHeader} overview-attention-header`}>
            <div className={`${styles.attentionCopy} overview-attention-copy`}>
              <span className={`${styles.attentionKicker} overview-attention-kicker`}>Mission control</span>
              <div className={`${styles.attentionHeadingRow} overview-attention-heading-row`}>
                <h2 className={`${styles.sectionTitle} overview-section-title`}>Attention rail</h2>
                <span
                  className={`${styles.attentionCount} overview-attention-count`}
                >{`${attentionIssues.length} live`}</span>
              </div>
              <p className={`${styles.attentionDetail} overview-attention-detail`}>
                Blocked, retrying, and pending issues ordered for the next operator decision.
              </p>
            </div>
          </div>

          <div className={`${styles.attentionBody} overview-attention-body`}>
            <div className={`${styles.attentionBodyHeader} overview-attention-body-header`}>
              <span className={`${styles.attentionBodyLabel} overview-attention-body-label`}>Scan queue</span>
              <span className={`${styles.attentionBodyHint} overview-attention-body-hint`}>
                Blocked first, then retrying and pending changes.
              </span>
            </div>

            <div className={`${styles.attentionList} overview-attention-list`}>
              {isError ? (
                <TeachingEmptyState
                  title="Unable to load overview"
                  detail="The dashboard could not fetch /api/v1/state. Try refreshing once the control plane is reachable."
                />
              ) : null}
              {!isError && isLoading ? (
                <div className={`${styles.skeleton} overview-skeleton`} aria-hidden="true" />
              ) : null}
              {!isError && !isLoading && attentionIssues.length === 0 ? (
                <div className={`${styles.emptyState} overview-attention-empty`}>
                  <span className={`${styles.emptyKicker} overview-attention-empty-kicker`}>Rail clear</span>
                  <h3 className={`${styles.emptyTitle} overview-attention-empty-title`}>All clear</h3>
                  <p className={`${styles.emptyDetail} overview-attention-empty-detail`}>
                    No issues need intervention right now. New blocked, retrying, or pending work will surface here
                    automatically.
                  </p>
                  <button
                    type="button"
                    className={`${styles.emptyAction} overview-attention-empty-action`}
                    onClick={() => navigate("/queue")}
                  >
                    Open queue
                  </button>
                </div>
              ) : null}
              {!isError && !isLoading
                ? attentionIssues.map((issue) => (
                    <IssueRow
                      key={`attention-${issue.identifier}`}
                      issue={issue}
                      target="attention"
                      onSelect={(selectedIssue) => navigate(`/queue/${selectedIssue.identifier}`)}
                    />
                  ))
                : null}
            </div>
          </div>
        </article>

        <aside className={`${styles.secondary} overview-secondary`}>
          <section className={`${styles.tokenSection} overview-token-section`}>
            <SectionHeader title="Token burn" kicker="Session totals" />
            <div className={styles.tokenGrid}>
              {[
                [formatCompactNumber(snapshot?.codex_totals.input_tokens), "Input"],
                [formatCompactNumber(snapshot?.codex_totals.output_tokens), "Output"],
                [formatCompactNumber(snapshot?.codex_totals.total_tokens), "Total"],
                [formatDuration(snapshot?.codex_totals.seconds_running), "Runtime"],
              ].map(([value, label]) => (
                <div key={label} className={`${styles.liveMetric} overview-live-metric`}>
                  <strong className={`${styles.liveValue} overview-live-value`}>{value}</strong>
                  <span className={`${styles.liveLabel} overview-live-label`}>{label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={`${styles.quickActions} overview-quick-actions`}>
            <h2 className={`${styles.sectionTitle} overview-section-title`}>Quick actions</h2>
            {[
              ["View queue", "/queue"],
              ["Observability", "/observability"],
              ["Git & PRs", "/git"],
            ].map(([label, path]) => (
              <button
                key={path}
                type="button"
                className={`${styles.quickActionButton} overview-quick-action-btn`}
                onClick={() => navigate(path)}
              >
                {label}
              </button>
            ))}
          </section>
        </aside>
      </section>

      <section className={`${styles.lowerGrid} overview-lower-grid`}>
        <section className={`${styles.recentSection} overview-recent-section`}>
          <SectionHeader title="Recent events" />
          <div className={styles.scrollList}>
            {snapshot?.recent_events.length ? (
              snapshot.recent_events
                .slice(-5)
                .map((event) => <EventRow key={`${event.issue_identifier}-${event.at}-${event.event}`} event={event} />)
            ) : (
              <TeachingEmptyState
                title="Awaiting activity"
                detail="Workflow events will appear here as the orchestrator processes issues."
              />
            )}
          </div>
        </section>

        <section className={`${styles.healthSection} overview-health-section`}>
          <SectionHeader title="System health" kicker="Watchdog" />
          <SystemHealthBadge health={snapshot?.system_health} />
        </section>

        <section className={styles.runtimeSection}>
          <SectionHeader title="Runtime info" />
          <dl className={styles.runtimeGrid}>
            <div className={styles.runtimeRow}>
              <dt className={styles.runtimeLabel}>Version</dt>
              <dd className={styles.runtimeValue}>{runtimeInfo?.version ?? "—"}</dd>
            </div>
            <div className={styles.runtimeRow}>
              <dt className={styles.runtimeLabel}>Provider</dt>
              <dd className={styles.runtimeValue}>{runtimeInfo?.provider_summary ?? "—"}</dd>
            </div>
            <div className={styles.runtimeRow}>
              <dt className={styles.runtimeLabel}>Workflow</dt>
              <dd className={styles.runtimeValue}>{runtimeInfo?.workflow_path ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className={`${styles.terminalSection} overview-terminal-section`}>
          <SectionHeader title="Latest completed / failed" />
          <div className={styles.scrollList}>
            {terminalIssues.length ? (
              terminalIssues.map((issue) => (
                <IssueRow
                  key={`terminal-${issue.identifier}`}
                  issue={issue}
                  target="terminal"
                  onSelect={(selectedIssue) => navigate(`/queue/${selectedIssue.identifier}`)}
                />
              ))
            ) : (
              <TeachingEmptyState
                title="No completed work yet"
                detail="Finished and failed issues will collect here for review."
              />
            )}
          </div>
        </section>

        <section className={`${styles.stallSection} overview-stall-section`}>
          <SectionHeader title="Stall events" />
          <StallEventsList events={snapshot?.stall_events} />
        </section>
      </section>
    </section>
  );
}
