import type { Request, Response } from "express";

import {
  checkAuthEndpointReachable,
  createPkceSession,
  exchangePkceCode,
  savePkceAuthTokens,
  shutdownCallbackServer,
  startCallbackServer,
  type PkceSession,
} from "../device-auth.js";
import type { SetupApiDeps } from "./shared.js";

let activePkceSession: PkceSession | null = null;

export function handlePostPkceAuthStart(_deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    try {
      // Pre-flight: verify OpenAI auth endpoint is reachable
      const reachError = await checkAuthEndpointReachable();
      if (reachError) {
        res.status(502).json({ error: { code: "auth_unreachable", message: reachError } });
        return;
      }

      // Shut down any previous session
      if (activePkceSession) {
        shutdownCallbackServer(activePkceSession);
      }

      activePkceSession = createPkceSession("");
      await startCallbackServer(activePkceSession);
      res.json({ authUrl: activePkceSession.authUrl });
    } catch (error) {
      const message = activePkceSession?.error ?? String(error);
      res.status(500).json({ error: { code: "pkce_start_error", message } });
    }
  };
}

async function exchangeAndSaveFromSession(session: PkceSession, deps: SetupApiDeps, res: Response): Promise<void> {
  try {
    const tokenData = await exchangePkceCode(session.authCode!, session.codeVerifier, session.redirectUri);
    await savePkceAuthTokens(tokenData, deps.archiveDir, deps.configOverlayStore);
    session.complete = true;
    shutdownCallbackServer(session);
    res.json({ status: "complete" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.error = message;
    shutdownCallbackServer(session);
    res.json({ status: "error", error: message });
  }
}

export function handleGetPkceAuthStatus(deps: SetupApiDeps) {
  return async (_req: Request, res: Response) => {
    if (!activePkceSession) {
      res.json({ status: "idle" });
      return;
    }
    if (activePkceSession.error) {
      shutdownCallbackServer(activePkceSession);
      res.json({ status: "error", error: activePkceSession.error });
      return;
    }
    if (activePkceSession.complete) {
      res.json({ status: "complete" });
      return;
    }
    // Check if auth code was received — exchange it for tokens
    if (activePkceSession.authCode) {
      await exchangeAndSaveFromSession(activePkceSession, deps, res);
      return;
    }
    // Check if session expired (3 min timeout)
    if (Date.now() - activePkceSession.createdAt > 3 * 60 * 1000) {
      activePkceSession.error = "Authentication timed out. Please try again.";
      shutdownCallbackServer(activePkceSession);
      res.json({ status: "expired", error: activePkceSession.error });
      return;
    }
    res.json({ status: "pending" });
  };
}

export function handlePostPkceAuthCancel(_deps: SetupApiDeps) {
  return (_req: Request, res: Response) => {
    if (activePkceSession) {
      shutdownCallbackServer(activePkceSession);
      activePkceSession = null;
    }
    res.json({ ok: true });
  };
}
