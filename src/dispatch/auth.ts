import type { RequestHandler } from "express";

/**
 * Bearer token authentication middleware for the data plane.
 * Validates that incoming requests have the correct Authorization header.
 */
export function bearerAuth(secret: string): RequestHandler {
  return (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}
