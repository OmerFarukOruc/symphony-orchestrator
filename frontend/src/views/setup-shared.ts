export function buildTitleWithBadge(
  text: string,
  badgeClass: "is-required" | "is-optional",
  badgeText: string,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "setup-title-row";

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = text;

  const badge = document.createElement("span");
  badge.className = `setup-badge ${badgeClass}`;
  badge.textContent = badgeText;

  row.append(title, badge);
  return row;
}

export interface SetupErrorCopy {
  title: string;
  summary: string;
  retry: string;
}

export function describeSetupError(message: string): SetupErrorCopy {
  const normalized = message.toLowerCase();

  if (/(timed out|timeout|expired)/.test(normalized)) {
    return {
      title: "That step timed out",
      summary: "This usually means the service took too long to respond or the sign-in window expired.",
      retry: "Open a fresh window or try again in a moment.",
    };
  }

  if (/(network|fetch|connection|offline|failed to fetch)/.test(normalized)) {
    return {
      title: "We couldn't reach the service",
      summary: "This usually means your connection was interrupted or the remote API is unavailable.",
      retry: "Check your connection, then try again.",
    };
  }

  if (/(authentication|sign[- ]?in|login|pkce|device code)/.test(normalized)) {
    return {
      title: "The sign-in didn't complete",
      summary: "This usually means the browser sign-in didn't finish or the authorization was interrupted.",
      retry: "Open a new sign-in window and try again.",
    };
  }

  if (/(unauthor|forbidden|permission|denied|scope)/.test(normalized)) {
    return {
      title: "That credential wasn't accepted",
      summary: "This usually means the key or token needs different permissions.",
      retry: "Double-check the value above, then try again with a fresh key if needed.",
    };
  }

  if (/(invalid|validation|format|missing|required|empty)/.test(normalized)) {
    return {
      title: "That value doesn't look right",
      summary: "This usually means a field is incomplete or uses the wrong format.",
      retry: "Check the value above, then try again.",
    };
  }

  if (/(not found|404)/.test(normalized)) {
    return {
      title: "This setup endpoint isn't available",
      summary:
        "This usually means the service on this port is running an older build or a different app that does not expose the setup API.",
      retry: "Restart the local Risoluto service, then try again.",
    };
  }

  if (/(rate limit|too many requests|busy)/.test(normalized)) {
    return {
      title: "The service is busy",
      summary: "This usually means the upstream API is rate-limiting or temporarily overloaded.",
      retry: "Wait a moment, then try again.",
    };
  }

  return {
    title: "We couldn't finish this step",
    summary: "This usually means the service hit a temporary problem or the details above need another look.",
    retry: "Try again in a moment.",
  };
}

export function getSetupErrorMessage(message: string): string {
  const guidance = describeSetupError(message);
  return `${guidance.summary} ${guidance.retry}`;
}

export function buildSetupError(message: string): HTMLElement {
  const guidance = describeSetupError(message);
  const err = document.createElement("div");
  err.className = "setup-error";
  err.setAttribute("role", "alert");
  err.setAttribute("aria-live", "assertive");
  err.setAttribute("aria-atomic", "true");
  err.tabIndex = -1;

  const title = document.createElement("strong");
  title.textContent = guidance.title;

  const summary = document.createElement("div");
  summary.textContent = guidance.summary;

  const retry = document.createElement("div");
  retry.textContent = guidance.retry;

  err.append(title, summary, retry);

  queueMicrotask(() => {
    if (err.isConnected) {
      err.focus();
    }
  });

  return err;
}
