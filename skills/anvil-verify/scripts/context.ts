import fs from "node:fs/promises";
import path from "node:path";

type Bundle = {
  slug?: string;
  title?: string;
  source_type?: string;
  source_items?: Array<string | Record<string, unknown>>;
  risk_level?: string;
  touches_ui?: boolean;
  touches_backend?: boolean;
  touches_docs?: boolean;
  touches_tests?: boolean;
};

type RunContext = {
  runDir: string;
  slug: string;
  bundle: Bundle | null;
  plan: string;
  ledger: string;
  status: Record<string, unknown>;
};

function normalizePathList(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function isLikelyRepoPath(value: string): boolean {
  // Accept paths with directory separators, markdown files, or common root-level repo files.
  const rootFilePattern = /^[A-Z][A-Za-z0-9]*(?:\.[A-Za-z]+)?$/;
  return value.includes("/") || value.endsWith(".md") || rootFilePattern.test(value);
}

export async function loadRunContext(runDirArg: string): Promise<RunContext> {
  const runDir = path.resolve(process.cwd(), runDirArg);
  const slug = path.basename(runDir);

  const [bundle, plan, ledger, status] = await Promise.all([
    readJson<Bundle>(path.join(runDir, "bundle.json")),
    readText(path.join(runDir, "plan.md")),
    readText(path.join(runDir, "ledger.md")),
    readJson<Record<string, unknown>>(path.join(runDir, "status.json")),
  ]);

  return {
    runDir,
    slug,
    bundle,
    plan,
    ledger,
    status: status ?? {},
  };
}

export async function writeArtifact(outputPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, content, "utf8");
}

export function extractOwnedFiles(plan: string): string[] {
  const ownedFiles: string[] = [];
  const pattern = /^Owned files:\s*(.+)$/gm;
  for (const match of plan.matchAll(pattern)) {
    const rawList = match[1];
    for (const item of rawList.split(",")) {
      const cleaned = item
        .trim()
        .replace(/^(create|update|delete)\s+/i, "")
        .replace(/[`]/g, "")
        .replace(/[.;]$/g, "")
        .trim();
      if (cleaned && isLikelyRepoPath(cleaned)) {
        ownedFiles.push(cleaned);
      }
    }
  }
  return normalizePathList(ownedFiles);
}

export function extractDocsPaths(plan: string): string[] {
  const ownedFiles = extractOwnedFiles(plan);
  return ownedFiles.filter((file) => file.startsWith("docs/") || file.endsWith(".md"));
}

export function extractTestPaths(plan: string): string[] {
  const ownedFiles = extractOwnedFiles(plan);
  return ownedFiles.filter((file) => file.startsWith("tests/") || file.includes(".test.") || file.includes(".spec."));
}

export function extractSourcePaths(plan: string): string[] {
  const ownedFiles = extractOwnedFiles(plan);
  return ownedFiles.filter((file) => !file.startsWith("tests/") && !file.endsWith(".md"));
}

export function renderIssueBullets(bundle: Bundle | null): string[] {
  if (!bundle?.source_items || bundle.source_items.length === 0) {
    return [];
  }
  return bundle.source_items.map((item) => {
    if (typeof item === "string") {
      return `- ${item}`;
    }
    const issue = typeof item.issue === "number" ? `#${item.issue}` : null;
    const title = typeof item.title === "string" ? item.title : null;
    const kind = typeof item.type === "string" ? item.type : "item";
    const label = [issue, title].filter(Boolean).join(" ");
    return `- ${kind}: ${label || JSON.stringify(item)}`;
  });
}

export function summarizeTouches(bundle: Bundle | null): string[] {
  const touches = [
    bundle?.touches_backend ? "backend" : null,
    bundle?.touches_ui ? "ui" : null,
    bundle?.touches_docs ? "docs" : null,
    bundle?.touches_tests ? "tests" : null,
  ].filter(Boolean);
  return touches.length > 0 ? (touches as string[]) : ["unspecified"];
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
