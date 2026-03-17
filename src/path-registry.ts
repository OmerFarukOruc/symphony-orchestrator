import path from "node:path";

function normalizePrefix(value: string): string {
  if (!value || value === "/") {
    return "/";
  }
  const normalized = path.posix.normalize(value);
  return normalized.endsWith("/") && normalized !== "/" ? normalized.slice(0, -1) : normalized;
}

function hasPathPrefix(candidate: string, prefix: string): boolean {
  if (prefix === "/") {
    return candidate.startsWith("/");
  }
  return candidate === prefix || candidate.startsWith(`${prefix}/`);
}

export class PathRegistry {
  private readonly mappings: Array<{ containerPrefix: string; hostPrefix: string }>;

  constructor(mappings: Map<string, string> | Record<string, string> = {}) {
    const entries = mappings instanceof Map ? [...mappings.entries()] : Object.entries(mappings);
    this.mappings = entries
      .map(([containerPrefix, hostPrefix]) => ({
        containerPrefix: normalizePrefix(containerPrefix),
        hostPrefix: normalizePrefix(hostPrefix),
      }))
      .filter((entry) => entry.containerPrefix.length > 0 && entry.hostPrefix.length > 0)
      .sort((left, right) => right.containerPrefix.length - left.containerPrefix.length);
  }

  translate(containerPath: string): string {
    const normalizedPath = normalizePrefix(containerPath);
    for (const mapping of this.mappings) {
      if (!hasPathPrefix(normalizedPath, mapping.containerPrefix)) {
        continue;
      }
      const suffix = normalizedPath.slice(mapping.containerPrefix.length);
      const translated = `${mapping.hostPrefix}${suffix}`;
      return translated || mapping.hostPrefix;
    }
    return normalizedPath;
  }

  hasMappings(): boolean {
    return this.mappings.length > 0;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): PathRegistry {
    const mappings = new Map<string, string>();
    const workspaceHost = env.SYMPHONY_HOST_WORKSPACE_ROOT;
    const workspaceContainer = env.SYMPHONY_CONTAINER_WORKSPACE_ROOT ?? "/data/workspaces";
    if (workspaceHost) {
      mappings.set(workspaceContainer, workspaceHost);
    }

    const archiveHost = env.SYMPHONY_HOST_ARCHIVE_DIR;
    const archiveContainer = env.SYMPHONY_CONTAINER_ARCHIVE_DIR ?? "/data/archives";
    if (archiveHost) {
      mappings.set(archiveContainer, archiveHost);
    }

    return new PathRegistry(mappings);
  }
}
