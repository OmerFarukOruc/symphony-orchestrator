import fs from "node:fs/promises";
import path from "node:path";

type Bundle = {
  slug: string;
  title: string;
  source_type: string;
  source_items: Array<string | Record<string, unknown>>;
  input_mode?: string;
  risk_level: string;
  touches_ui: boolean;
  touches_backend: boolean;
  touches_docs: boolean;
  touches_tests: boolean;
  grouping_rationale?: string;
  architectural_drift?: string[];
  notes?: string[];
};

async function maybeReadJson(value: string | undefined): Promise<Record<string, unknown> | null> {
  if (!value) {
    return null;
  }
  try {
    if (value.trim().startsWith("{")) {
      return JSON.parse(value) as Record<string, unknown>;
    }
    const content = await fs.readFile(path.resolve(process.cwd(), value), "utf8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatSourceItem(item: string | Record<string, unknown>): string {
  if (typeof item === "string") {
    return `- ${item}`;
  }
  const title = typeof item.title === "string" ? item.title : null;
  const issue = typeof item.issue === "number" ? `#${item.issue}` : null;
  const kind = typeof item.type === "string" ? item.type : "item";
  const summary = [issue, title].filter(Boolean).join(" ");
  return `- ${kind}: ${summary || JSON.stringify(item)}`;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const rawSlug = process.argv[2] ?? "example-anvil-run";
  if (/[\\/]/.test(rawSlug) || rawSlug.includes("..")) {
    throw new TypeError(`invalid slug: must not contain path separators or dots: ${rawSlug}`);
  }
  const slug = rawSlug;
  const title = process.argv[3] ?? "Example bundle";
  const bundlePatch = await maybeReadJson(process.argv[4]);

  // Validate array fields in the patch before spreading.
  if (bundlePatch) {
    if ("architectural_drift" in bundlePatch && !Array.isArray(bundlePatch.architectural_drift)) {
      throw new TypeError("architectural_drift must be an array");
    }
    if ("notes" in bundlePatch && !Array.isArray(bundlePatch.notes)) {
      throw new TypeError("notes must be an array");
    }
    if ("source_items" in bundlePatch && !Array.isArray(bundlePatch.source_items)) {
      throw new TypeError("source_items must be an array");
    }
  }

  const bundle: Bundle = {
    slug,
    title,
    source_type: "manual",
    source_items: [],
    input_mode: "bundle",
    risk_level: "unknown",
    touches_ui: false,
    touches_backend: true,
    touches_docs: true,
    touches_tests: true,
    notes: ["Bundle metadata initialized by resolve_bundle.ts"],
    ...(bundlePatch ?? {}),
  };

  const runDir = path.join(root, ".anvil", slug);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
  const touchSummary = [
    bundle.touches_backend ? "backend" : null,
    bundle.touches_ui ? "ui" : null,
    bundle.touches_docs ? "docs" : null,
    bundle.touches_tests ? "tests" : null,
  ].filter(Boolean);
  await fs.writeFile(
    path.join(runDir, "intake.md"),
    [
      "# Intake",
      "",
      `- Title: ${bundle.title}`,
      `- Slug: ${bundle.slug}`,
      `- Source type: ${bundle.source_type}`,
      `- Risk level: ${bundle.risk_level}`,
      `- Touches: ${touchSummary.join(", ") || "unspecified"}`,
      "",
      "## Source Items",
      bundle.source_items.length > 0 ? bundle.source_items.map(formatSourceItem).join("\n") : "- (none provided)",
      "",
      "## Grouping Rationale",
      bundle.grouping_rationale ? `- ${bundle.grouping_rationale}` : "- Capture the shared problem before brainstorming.",
      "",
      "## Architectural Drift",
      bundle.architectural_drift && bundle.architectural_drift.length > 0
        ? bundle.architectural_drift.map((entry) => `- ${entry}`).join("\n")
        : "- (none recorded yet)",
      "",
      "## Notes",
      bundle.notes && bundle.notes.length > 0 ? bundle.notes.map((entry) => `- ${entry}`).join("\n") : "- (none)",
      "",
    ].join("\n"),
    "utf8"
  );
}

void main();
