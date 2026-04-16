import type { Response } from "express";

export function issueNotFound(response: Response): void {
  response.status(404).json({ error: { code: "not_found", message: "Unknown issue identifier" } });
}

export function methodNotAllowed(response: Response, allowedMethods: string[] = ["GET"]): void {
  response.setHeader("Allow", allowedMethods.join(", "));
  response.status(405).json({
    error: {
      code: "method_not_allowed",
      message: "Method Not Allowed",
    },
  });
}
