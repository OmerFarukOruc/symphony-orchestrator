import { api } from "../api";
import type { DeviceAuthStatus, OpenaiAuthMode } from "./setup-openai-step";

export interface SetupDeviceAuthState {
  authMode: OpenaiAuthMode;
  step: string;
  error: string | null;
  showManualAuthFallback: boolean;
  deviceAuthStatus: DeviceAuthStatus;
  deviceAuthUserCode: string;
  deviceAuthVerificationUri: string;
  deviceAuthDeviceCode: string;
  deviceAuthIntervalSeconds: number;
  deviceAuthExpiresAt: number | null;
  deviceAuthError: string | null;
}

interface SetupDeviceAuthDeps {
  rerender: () => void;
  moveToGithubStep: () => void;
}

/** Session timeout in milliseconds (3 minutes). */
const PKCE_TIMEOUT_MS = 3 * 60 * 1000;

export function createSetupDeviceAuthController(state: SetupDeviceAuthState, deps: SetupDeviceAuthDeps) {
  let pkceAuthPollTimer: number | null = null;
  let countdownTimer: number | null = null;
  let authPopup: Window | null = null;

  function clearPollTimer(): void {
    if (pkceAuthPollTimer !== null) {
      window.clearTimeout(pkceAuthPollTimer);
      pkceAuthPollTimer = null;
    }
  }

  function clearCountdownTimer(): void {
    if (countdownTimer !== null) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function clearDeviceAuthState(): void {
    clearPollTimer();
    clearCountdownTimer();
    state.deviceAuthStatus = "idle";
    state.deviceAuthUserCode = "";
    state.deviceAuthVerificationUri = "";
    state.deviceAuthDeviceCode = "";
    state.deviceAuthIntervalSeconds = 0;
    state.deviceAuthExpiresAt = null;
    state.deviceAuthError = null;
    authPopup = null;
  }

  function schedulePoll(): void {
    clearPollTimer();
    pkceAuthPollTimer = window.setTimeout(() => {
      void pollPkceStatus();
    }, 2000);
  }

  function startCountdownTimer(): void {
    clearCountdownTimer();
    countdownTimer = window.setInterval(() => {
      deps.rerender();
    }, 1000);
  }

  /** Returns the remaining seconds before the session expires, or 0 if expired/not active. */
  function getRemainingSeconds(): number {
    if (state.deviceAuthExpiresAt === null) return 0;
    return Math.max(0, Math.ceil((state.deviceAuthExpiresAt - Date.now()) / 1000));
  }

  async function startDeviceAuthFlow(): Promise<void> {
    clearPollTimer();
    clearCountdownTimer();
    state.error = null;
    state.deviceAuthStatus = "starting";
    state.deviceAuthError = null;
    state.showManualAuthFallback = false;
    deps.rerender();

    try {
      const result = await api.startPkceAuth();
      state.deviceAuthStatus = "pending";
      state.deviceAuthUserCode = "";
      state.deviceAuthVerificationUri = result.authUrl;
      state.deviceAuthDeviceCode = "pkce";
      state.deviceAuthExpiresAt = Date.now() + PKCE_TIMEOUT_MS;

      // Open the auth URL in a new browser tab
      authPopup = window.open(result.authUrl, "_blank");

      schedulePoll();
      startCountdownTimer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.deviceAuthStatus = "expired";
      state.deviceAuthError = message;
      // Only show manual fallback for non-network errors — if the auth endpoint
      // is unreachable, pasting auth.json won't help either.
      const isNetworkError = message.toLowerCase().includes("network") || message.toLowerCase().includes("fetch");
      state.showManualAuthFallback = !isNetworkError;
    }

    deps.rerender();
  }

  async function cancelDeviceAuth(): Promise<void> {
    clearPollTimer();
    clearCountdownTimer();

    // Close popup if still open
    if (authPopup && !authPopup.closed) {
      authPopup.close();
    }

    // Tell the backend to clean up
    try {
      await api.cancelPkceAuth();
    } catch {
      // Best-effort — even if the backend call fails, reset UI
    }

    clearDeviceAuthState();
    deps.rerender();
  }

  async function pollPkceStatus(): Promise<void> {
    if (state.authMode !== "codex_login" || state.deviceAuthStatus !== "pending") {
      clearPollTimer();
      clearCountdownTimer();
      return;
    }

    // Check timeout
    if (state.deviceAuthExpiresAt !== null && Date.now() >= state.deviceAuthExpiresAt) {
      state.deviceAuthStatus = "expired";
      state.deviceAuthError = "Authentication timed out. Please try again.";
      state.showManualAuthFallback = true;
      clearPollTimer();
      clearCountdownTimer();
      deps.rerender();
      return;
    }

    try {
      const result = await api.pollPkceAuthStatus();

      if (result.status === "pending" || result.status === "idle") {
        schedulePoll();
        return;
      }

      if (result.status === "complete") {
        state.deviceAuthStatus = "complete";
        state.deviceAuthError = null;
        clearPollTimer();
        clearCountdownTimer();

        // Close the popup if still open
        if (authPopup && !authPopup.closed) {
          authPopup.close();
        }
        authPopup = null;

        deps.rerender();
        window.setTimeout(() => {
          if (
            state.step === "openai-key" &&
            state.authMode === "codex_login" &&
            state.deviceAuthStatus === "complete"
          ) {
            deps.moveToGithubStep();
          }
        }, 700);
        return;
      }

      // error or expired
      state.deviceAuthStatus = "expired";
      state.deviceAuthError = result.error ?? "Authentication failed. Please try again.";
      state.showManualAuthFallback = true;
      clearPollTimer();
      clearCountdownTimer();
      deps.rerender();
    } catch (error) {
      state.deviceAuthStatus = "expired";
      state.deviceAuthError = error instanceof Error ? error.message : String(error);
      state.showManualAuthFallback = true;
      clearPollTimer();
      clearCountdownTimer();
      deps.rerender();
    }
  }

  function selectOpenaiAuthMode(mode: OpenaiAuthMode): void {
    state.authMode = mode;
    state.error = null;
    if (mode !== "codex_login") {
      clearDeviceAuthState();
    }
    deps.rerender();
  }

  return {
    clearDeviceAuthState,
    selectOpenaiAuthMode,
    startDeviceAuthFlow,
    cancelDeviceAuth,
    getRemainingSeconds,
  };
}
