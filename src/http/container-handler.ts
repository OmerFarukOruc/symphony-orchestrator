import type { Request, Response } from "express";

export function handleContainers(_req: Request, res: Response): void {
  res.json({
    containers: [],
    summary: {
      running: 0,
      stopped: 0,
      errored: 0,
      avg_cpu: "0%",
    },
  });
}
