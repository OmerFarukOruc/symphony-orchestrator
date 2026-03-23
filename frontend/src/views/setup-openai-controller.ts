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

export function createSetupDeviceAuthController(state: SetupDeviceAuthState, deps: SetupDeviceAuthDeps) {
  let deviceAuthPollTimer: number | null = null;

  function clearDeviceAuthPollTimer(): void {
    if (deviceAuthPollTimer === null) {
      return;
    }
    window.clearTimeout(deviceAuthPollTimer);
    deviceAuthPollTimer = null;
  }

  function clearDeviceAuthState(): void {
    clearDeviceAuthPollTimer();
    state.deviceAuthStatus = "idle";
    state.deviceAuthUserCode = "";
    state.deviceAuthVerificationUri = "";
    state.deviceAuthDeviceCode = "";
    state.deviceAuthIntervalSeconds = 0;
    state.deviceAuthExpiresAt = null;
    state.deviceAuthError = null;
  }

  function scheduleDeviceAuthPoll(): void {
    if (state.deviceAuthStatus !== "pending" || !state.deviceAuthDeviceCode || state.authMode !== "codex_login") {
      clearDeviceAuthPollTimer();
      return;
    }
    clearDeviceAuthPollTimer();
    const delayMs = Math.max(state.deviceAuthIntervalSeconds, 1) * 1000;
    deviceAuthPollTimer = window.setTimeout(() => {
      void pollDeviceAuthFlow();
    }, delayMs);
  }

  async function startDeviceAuthFlow(): Promise<void> {
    clearDeviceAuthPollTimer();
    state.error = null;
    state.deviceAuthStatus = "starting";
    state.deviceAuthError = null;
    state.showManualAuthFallback = false;
    deps.rerender();

    try {
      const result = await api.startDeviceAuth();
      state.deviceAuthStatus = "pending";
      state.deviceAuthUserCode = result.userCode;
      state.deviceAuthVerificationUri = result.verificationUri;
      state.deviceAuthDeviceCode = result.deviceCode;
      state.deviceAuthIntervalSeconds = result.interval;
      state.deviceAuthExpiresAt = Date.now() + result.expiresIn * 1000;
      scheduleDeviceAuthPoll();
    } catch (error) {
      state.deviceAuthStatus = "expired";
      state.deviceAuthError = error instanceof Error ? error.message : String(error);
      state.showManualAuthFallback = true;
    }

    deps.rerender();
  }

  async function pollDeviceAuthFlow(): Promise<void> {
    if (state.authMode !== "codex_login" || state.deviceAuthStatus !== "pending" || !state.deviceAuthDeviceCode) {
      clearDeviceAuthPollTimer();
      return;
    }

    if (state.deviceAuthExpiresAt !== null && Date.now() >= state.deviceAuthExpiresAt) {
      state.deviceAuthStatus = "expired";
      state.deviceAuthError = "Device code expired. Start the flow again or use the manual auth.json fallback.";
      state.showManualAuthFallback = true;
      clearDeviceAuthPollTimer();
      deps.rerender();
      return;
    }

    try {
      const result = await api.pollDeviceAuth(state.deviceAuthDeviceCode);
      if (result.status === "pending") {
        state.deviceAuthError = null;
        scheduleDeviceAuthPoll();
        deps.rerender();
        return;
      }

      if (result.status === "complete") {
        state.deviceAuthStatus = "complete";
        state.deviceAuthError = null;
        clearDeviceAuthPollTimer();
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

      state.deviceAuthStatus = "expired";
      state.deviceAuthError = result.error ?? "Device code expired. Start again or use the manual auth.json fallback.";
      state.showManualAuthFallback = true;
      clearDeviceAuthPollTimer();
      deps.rerender();
    } catch (error) {
      state.deviceAuthStatus = "expired";
      state.deviceAuthError = error instanceof Error ? error.message : String(error);
      state.showManualAuthFallback = true;
      clearDeviceAuthPollTimer();
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
  };
}
