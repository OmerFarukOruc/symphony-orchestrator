import type { Request, Response } from "express";

import type { AttemptStorePort } from "../core/attempt-store-port.js";

type PrHandlerDeps = {
  attemptStore?: Pick<AttemptStorePort, "getAllPrs">;
};

function isKnownPrStatus(value: string): value is "open" | "merged" | "closed" {
  return value === "open" || value === "merged" || value === "closed";
}

export async function handleListPrs(deps: PrHandlerDeps, request: Request, response: Response): Promise<void> {
  if (!deps.attemptStore) {
    response.status(503).json({ error: { code: "not_configured", message: "attempt store not available" } });
    return;
  }

  const statusFilter = typeof request.query.status === "string" ? request.query.status : null;
  if (statusFilter !== null && !isKnownPrStatus(statusFilter)) {
    response.status(400).json({
      error: {
        code: "validation_error",
        message: "status must be one of: open, merged, closed",
      },
    });
    return;
  }

  const prs = await deps.attemptStore.getAllPrs();
  const filtered = statusFilter === null ? prs : prs.filter((pr) => pr.status === statusFilter);
  response.json({
    prs: filtered.map((pr) => ({
      issueId: pr.issueId,
      url: pr.url,
      number: pr.pullNumber,
      repo: pr.repo.includes("/") ? pr.repo : `${pr.owner}/${pr.repo}`,
      branchName: pr.branchName,
      status: pr.status,
      mergedAt: pr.mergedAt ?? null,
      mergeCommitSha: pr.mergeCommitSha ?? null,
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
    })),
  });
}
