import type { Request, Response } from "express";

export function handleWorkspaces(_req: Request, res: Response): void {
  res.json({
    workspaces: [],
    summary: {
      total: 0,
      active: 0,
      stale: 0,
      disk_usage: "0 B",
    },
  });
}
