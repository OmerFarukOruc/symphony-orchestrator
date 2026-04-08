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
  requires_github_auth?: boolean;
  requires_linear_api?: boolean;
  requires_docker?: boolean;
  requires_ui_test?: boolean;
  verification_surfaces?: string[];
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
  const rawSlug = process.argv[2];
  if (!rawSlug || rawSlug.trim().length === 0 || rawSlug.trim() === ".") {
    throw new TypeError("invalid slug: must be a non-empty string that is not '.'");
  }
  if (/[\\/]/.test(rawSlug) || rawSlug.includes("..")) {
    throw new TypeError(`invalid slug: must not contain path separators or dots: ${rawSlug}`);
  }
  const slug = rawSlug.trim();
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
    if ("verification_surfaces" in bundlePatch && !Array.isArray(bundlePatch.verification_surfaces)) {
      throw new TypeError("verification_surfaces must be an array");
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
    requires_github_auth: false,
    requires_linear_api: false,
    requires_docker: false,
    requires_ui_test: false,
    verification_surfaces: [],
    notes: ["Bundle metadata initialized by resolve_bundle.ts"],
    ...(bundlePatch ?? {}),
  };

  const runDir = path.join(root, ".anvil", slug);
  // Verify the resolved path stays within the .anvil directory.
  const resolvedRunDir = path.resolve(runDir);
  const anvilDir = path.resolve(root, ".anvil");
  if (!resolvedRunDir.startsWith(anvilDir + path.sep)) {
    throw new TypeError(`slug resolves outside the .anvil directory: ${resolvedRunDir}`);
  }
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
      bundle.grouping_rationale
        ? `- ${bundle.grouping_rationale}`
        : "- Capture the shared problem before brainstorming.",
      "",
      "## Runtime Requirements",
      `- Requires GitHub auth: ${bundle.requires_github_auth ? "yes" : "no"}`,
      `- Requires Linear API: ${bundle.requires_linear_api ? "yes" : "no"}`,
      `- Requires Docker: ${bundle.requires_docker ? "yes" : "no"}`,
      `- Requires ui-test: ${bundle.requires_ui_test ? "yes" : "no"}`,
      `- Verification surfaces: ${
        bundle.verification_surfaces && bundle.verification_surfaces.length > 0
          ? bundle.verification_surfaces.join(", ")
          : "unspecified"
      }`,
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
    "utf8",
  );
}

void main();
