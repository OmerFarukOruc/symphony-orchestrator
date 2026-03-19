import type { Request, Response } from "express";

export function handleGitPrs(_req: Request, res: Response): void {
  res.json({
    pull_requests: [],
    summary: {
      active_branches: 0,
      open_prs: 0,
      merged_today: 0,
      failed_ops: 0,
    },
  });
}
