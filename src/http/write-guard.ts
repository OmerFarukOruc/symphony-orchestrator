import type { Request, Response, NextFunction } from "express";

import type { WriteAuditLog } from "./write-audit.js";

/**
 * Write-route authorization policy for privileged mutation endpoints.
 *
 * This middleware explicitly declares and enforces the write authorization
 * contract for all mutating API routes. Currently the policy verifies that
 * requests originate from a loopback address (127.0.0.1 / ::1 / ::ffff:127.0.0.1),
 * matching the default bind behavior in `server.ts`.
 *
 * When `RISOLUTO_BIND` is set to a non-loopback address, operators MUST also
 * set `RISOLUTO_WRITE_TOKEN` to require a bearer token on every mutating request.
 *
 * Failure modes:
 * - 403 `write_forbidden` — request came from a non-loopback address without a valid token.
 * - 401 `write_unauthorized` — `RISOLUTO_WRITE_TOKEN` is configured but the request
 *   did not supply a matching `Authorization: Bearer <token>` header.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Node may surface local clients as any address in 127.0.0.0/8, including
 * IPv6-mapped variants when the listener is dual-stack.
 */
export function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  return remoteAddress === "::1" || remoteAddress.startsWith("127.") || remoteAddress.startsWith("::ffff:127.");
}

export interface WriteGuardOptions {
  /** Optional audit log to record all mutating requests. */
  auditLog?: WriteAuditLog;
}

/**
 * Creates an Express middleware that guards mutating (non-GET/HEAD/OPTIONS)
 * requests behind explicit authorization checks and optionally records
 * audit entries for every mutation.
 */
export function createWriteGuard(
  options?: WriteGuardOptions,
): (req: Request, res: Response, next: NextFunction) => void {
  const writeToken = process.env.RISOLUTO_WRITE_TOKEN?.trim() || undefined;
  const auditLog = options?.auditLog;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    /* Webhook routes handle their own authentication via HMAC signature
       verification — skip IP/token write protection entirely. */
    if (req.path.startsWith("/webhooks/")) {
      next();
      return;
    }

    const remote = req.socket.remoteAddress;
    const fromLoopback = isLoopbackAddress(remote);

    if (writeToken) {
      const authorization = req.get("authorization") ?? "";
      const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

      if (suppliedToken !== writeToken) {
        res.status(401).json({
          error: {
            code: "write_unauthorized",
            message: "Mutating requests require a valid Authorization: Bearer <token> header",
          },
        });
        return;
      }

      attachAuditHook(req, res, auditLog);
      next();
      return;
    }

    if (!fromLoopback) {
      res.status(403).json({
        error: {
          code: "write_forbidden",
          message:
            "Mutating requests are only allowed from loopback addresses. " +
            "Set RISOLUTO_WRITE_TOKEN to allow remote write access.",
        },
      });
      return;
    }

    attachAuditHook(req, res, auditLog);
    next();
  };
}

function attachAuditHook(req: Request, res: Response, auditLog?: WriteAuditLog): void {
  if (!auditLog) return;

  res.once("finish", () => {
    auditLog
      .record({
        at: new Date().toISOString(),
        method: req.method,
        path: req.path,
        requestId: req.get("x-request-id"),
        remoteAddress: req.socket.remoteAddress,
        statusCode: res.statusCode,
      })
      .catch(() => {
        /* audit log write failures are non-fatal */
      });
  });
}
