import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Shared audit log for all privileged write operations on the admin API.
 *
 * Records durable NDJSON entries for every mutation request, providing
 * uniform traceability across config changes, secrets, model overrides,
 * refresh requests, and setup actions.
 *
 * Audit entries include:
 * - `at` — ISO-8601 timestamp
 * - `method` — HTTP method (POST, PUT, PATCH, DELETE)
 * - `path` — request path
 * - `requestId` — tracing request ID from the x-request-id header
 * - `remoteAddress` — source IP of the request
 */

export interface WriteAuditEntry {
  at: string;
  method: string;
  path: string;
  requestId: string | undefined;
  remoteAddress: string | undefined;
  statusCode: number;
}

const AUDIT_FILENAME = "write-audit.log";

export class WriteAuditLog {
  private readonly logPath: string;
  private initialized = false;

  constructor(archiveDir: string) {
    this.logPath = path.join(archiveDir, AUDIT_FILENAME);
  }

  async record(entry: WriteAuditEntry): Promise<void> {
    if (!this.initialized) {
      await mkdir(path.dirname(this.logPath), { recursive: true });
      this.initialized = true;
    }
    const line = JSON.stringify(entry);
    await appendFile(this.logPath, `${line}\n`, "utf8");
  }
}
