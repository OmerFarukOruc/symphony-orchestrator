import fs from "node:fs/promises";
import path from "node:path";

export const PHASES = [
  "preflight",
  "intake",
  "brainstorm",
  "plan",
  "review",
  "audit",
  "finalize",
  "execute",
  "verify",
  "docs-tests-closeout",
  "final-push",
] as const;

type PhaseName = (typeof PHASES)[number];
type PhaseStatus = "pending" | "in_progress" | "completed" | "blocked";
type WorkStatus = "not_started" | "pending" | "in_progress" | "complete" | "blocked";
type GateStatus = "pending" | "passed" | "failed" | "skipped";

export type ClaimCounts = {
  total: number;
  open: number;
  passed: number;
  failed: number;
  accepted_risk: number;
  not_applicable: number;
};

export type AnvilStatus = {
  schema_version: number;
  slug: string;
  phase: PhaseName;
  phase_status: PhaseStatus;
  active: boolean;
  review_round: number;
  audit_round: number;
  verify_cycle: number;
  max_review_rounds: number;
  max_audit_rounds: number;
  max_verify_cycles: number;
  pending_phases: PhaseName[];
  pending_gates: string[];
  gate_results: Record<string, GateStatus>;
  claim_counts: ClaimCounts;
  open_claims: number;
  failed_claims: number;
  docs_status: WorkStatus;
  tests_status: WorkStatus;
  push_status: WorkStatus;
  integration_branch: string | null;
  last_failure_reason: string | null;
  next_required_action: string;
  dry_run: boolean;
  updated_at: string;
};

const PHASE_SET = new Set<string>(PHASES);
const PHASE_ALIASES: Record<string, PhaseName> = {
  "anvil-brainstorm": "brainstorm",
  "anvil-plan": "plan",
  "anvil-review": "review",
  "anvil-audit": "audit",
  "anvil-execute": "execute",
  "anvil-verify": "verify",
};
const OPEN_CLAIM_STATUSES = new Set(["open", "pending", "reopened"]);
const FAILED_CLAIM_STATUSES = new Set(["failed"]);
const PASSED_CLAIM_STATUSES = new Set(["passed"]);
const ACCEPTED_RISK_STATUSES = new Set(["accepted-risk", "accepted_risk", "accepted risk"]);
const NOT_APPLICABLE_STATUSES = new Set(["n/a", "na", "not-applicable", "not_applicable"]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  if (typeof value === "boolean") {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (isRecord(value)) {
    return Object.keys(value).length;
  }
  return fallback;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizePhase(value: unknown, fallback: PhaseName): PhaseName {
  if (value === "complete") {
    return "final-push";
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (PHASE_SET.has(normalized)) {
      return normalized as PhaseName;
    }
    if (normalized in PHASE_ALIASES) {
      return PHASE_ALIASES[normalized];
    }
  }
  return fallback;
}

function normalizePhaseStatus(value: unknown, fallback: PhaseStatus): PhaseStatus {
  if (value === "complete") {
    return "completed";
  }
  if (value === "pending" || value === "in_progress" || value === "completed" || value === "blocked") {
    return value;
  }
  return fallback;
}

function normalizeWorkStatus(value: unknown, fallback: WorkStatus): WorkStatus {
  if (
    value === "not_started" ||
    value === "pending" ||
    value === "in_progress" ||
    value === "complete" ||
    value === "blocked"
  ) {
    return value;
  }
  return fallback;
}

function normalizeTextOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim() || null;
}

function parseClaimsMarkdown(content: string): ClaimCounts {
  const counts: ClaimCounts = {
    total: 0,
    open: 0,
    passed: 0,
    failed: 0,
    accepted_risk: 0,
    not_applicable: 0,
  };
  const pattern = /^\s*-\s*\[(?<status>[^\]]+)\]\s+/gm;
  for (const match of content.matchAll(pattern)) {
    const rawStatus = match.groups?.status ?? "";
    const status = rawStatus
      .trim()
      .toLowerCase()
      .replaceAll(/[\s_]+/g, "-");
    counts.total += 1;
    if (OPEN_CLAIM_STATUSES.has(status)) {
      counts.open += 1;
    } else if (FAILED_CLAIM_STATUSES.has(status)) {
      counts.failed += 1;
    } else if (PASSED_CLAIM_STATUSES.has(status)) {
      counts.passed += 1;
    } else if (ACCEPTED_RISK_STATUSES.has(status)) {
      counts.accepted_risk += 1;
    } else if (NOT_APPLICABLE_STATUSES.has(status)) {
      counts.not_applicable += 1;
    } else {
      counts.open += 1;
    }
  }
  return counts;
}

async function readClaimCountsFromRun(slug: string): Promise<ClaimCounts | null> {
  const claimsPath = path.join(process.cwd(), ".anvil", slug, "claims.md");
  try {
    const content = await fs.readFile(claimsPath, "utf8");
    const counts = parseClaimsMarkdown(content);
    return counts.total > 0 ? counts : null;
  } catch {
    return null;
  }
}

function normalizeClaimCounts(rawStatus: JsonRecord, claimCountsFromFile: ClaimCounts | null): ClaimCounts {
  if (claimCountsFromFile) {
    return claimCountsFromFile;
  }

  const rawCounts = isRecord(rawStatus.claim_counts) ? rawStatus.claim_counts : null;
  const counts: ClaimCounts = {
    total: rawCounts ? toNonNegativeInt(rawCounts.total) : 0,
    open: rawCounts
      ? toNonNegativeInt(rawCounts.open, toNonNegativeInt(rawStatus.open_claims))
      : toNonNegativeInt(rawStatus.open_claims),
    passed: rawCounts ? toNonNegativeInt(rawCounts.passed) : 0,
    failed: rawCounts
      ? toNonNegativeInt(rawCounts.failed, toNonNegativeInt(rawStatus.failed_claims))
      : toNonNegativeInt(rawStatus.failed_claims),
    accepted_risk: rawCounts ? toNonNegativeInt(rawCounts.accepted_risk) : 0,
    not_applicable: rawCounts ? toNonNegativeInt(rawCounts.not_applicable) : 0,
  };
  const minimumTotal = counts.open + counts.passed + counts.failed + counts.accepted_risk + counts.not_applicable;
  counts.total = Math.max(counts.total, minimumTotal);
  return counts;
}

function normalizeGateResults(value: unknown): Record<string, GateStatus> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, GateStatus> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!key.trim()) {
      continue;
    }
    const gateStatus =
      rawValue === "pending" || rawValue === "passed" || rawValue === "failed" || rawValue === "skipped"
        ? rawValue
        : "pending";
    result[key] = gateStatus;
  }
  return result;
}

function mergeRecords(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const next: JsonRecord = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(value) && isRecord(next[key])) {
      next[key] = mergeRecords(next[key] as JsonRecord, value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

export async function normalizeStatus(input: JsonRecord, fallbackSlug = "example-anvil-run"): Promise<AnvilStatus> {
  const slug = typeof input.slug === "string" && input.slug.trim() ? input.slug.trim() : fallbackSlug;
  const claimCounts = normalizeClaimCounts(input, await readClaimCountsFromRun(slug));
  const pendingPhasesInput = toStringList(input.pending_phases);
  const pendingGateInput = toStringList(input.pending_gates);
  const pendingPhases = [...new Set([...pendingPhasesInput, ...pendingGateInput.filter((item) => PHASE_SET.has(item))])]
    .map((item) => normalizePhase(item, "intake"))
    .filter((item, index, items) => items.indexOf(item) === index);
  const pendingGates = [...new Set(pendingGateInput.filter((item) => !PHASE_SET.has(item)))];

  return {
    schema_version: 2,
    slug,
    phase: normalizePhase(input.phase, "intake"),
    phase_status: normalizePhaseStatus(input.phase_status, "pending"),
    active: input.active === undefined ? true : Boolean(input.active),
    review_round: toNonNegativeInt(input.review_round),
    audit_round: toNonNegativeInt(input.audit_round),
    verify_cycle: toNonNegativeInt(input.verify_cycle),
    max_review_rounds: Math.max(toNonNegativeInt(input.max_review_rounds, 3), 3),
    max_audit_rounds: Math.max(toNonNegativeInt(input.max_audit_rounds, 2), 2),
    max_verify_cycles: Math.max(toNonNegativeInt(input.max_verify_cycles, 3), 3),
    pending_phases: pendingPhases,
    pending_gates: pendingGates,
    gate_results: normalizeGateResults(input.gate_results),
    claim_counts: claimCounts,
    open_claims: claimCounts.open,
    failed_claims: claimCounts.failed,
    docs_status: normalizeWorkStatus(input.docs_status, "pending"),
    tests_status: normalizeWorkStatus(input.tests_status, "pending"),
    push_status: normalizeWorkStatus(input.push_status, "not_started"),
    integration_branch: normalizeTextOrNull(input.integration_branch),
    last_failure_reason: normalizeTextOrNull(input.last_failure_reason),
    next_required_action:
      typeof input.next_required_action === "string" && input.next_required_action.trim()
        ? input.next_required_action.trim()
        : "unspecified",
    dry_run: Boolean(input.dry_run),
    updated_at:
      typeof input.updated_at === "string" && input.updated_at.trim() ? input.updated_at : new Date().toISOString(),
  };
}

export async function readStatus(statusPath: string): Promise<AnvilStatus> {
  const raw = JSON.parse(await fs.readFile(statusPath, "utf8")) as JsonRecord;
  const fallbackSlug = path.basename(path.dirname(statusPath));
  const normalized = await normalizeStatus(raw, fallbackSlug);
  normalized.slug = fallbackSlug;
  return normalized;
}

export async function writeStatus(statusPath: string, status: JsonRecord): Promise<AnvilStatus> {
  const fallbackSlug = path.basename(path.dirname(statusPath));
  const normalized = await normalizeStatus(status, fallbackSlug);
  normalized.slug = fallbackSlug;
  normalized.updated_at = new Date().toISOString();
  await fs.mkdir(path.dirname(statusPath), { recursive: true });
  await fs.writeFile(statusPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function patchStatus(statusPath: string, patch: JsonRecord): Promise<AnvilStatus> {
  const current = await readStatus(statusPath);
  const next = mergeRecords(current as unknown as JsonRecord, patch);
  return writeStatus(statusPath, next);
}
