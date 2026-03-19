import type { Request, Response } from "express";

export function handleNotifications(_req: Request, res: Response): void {
  res.json({ notifications: [] });
}
