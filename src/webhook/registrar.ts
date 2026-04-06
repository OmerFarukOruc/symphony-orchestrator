/**
 * Webhook registrar — manages the lifecycle of a tracker webhook subscription.
 *
 * Handles three resolution strategies in priority order:
 *   1. Manual config secret  → use directly, verify URL exists (best-effort)
 *   2. Stored secret         → reuse previous registration, re-enable if disabled
 *   3. Auto-create           → register a new webhook via the tracker API
 *
 * All errors are caught and logged — registration failures never prevent
 * the orchestrator from running in polling-only mode.
 */

import { LinearClientError } from "../linear/errors.js";
import type { SecretsStore } from "../secrets/store.js";
import type { RisolutoLogger, WebhookConfig } from "../core/types.js";

const SECRETS_KEY = "LINEAR_WEBHOOK_SECRET";

const RESOURCE_TYPES = ["Issue", "Comment"];
const WEBHOOK_LABEL = "Risoluto";

/** Tracker-agnostic interface for webhook registration operations. */
export interface WebhookRegistrationPort {
  listWebhooks(): Promise<Array<{ id: string; url: string; enabled: boolean }>>;
  createWebhook(options: { url: string; resourceTypes: string[]; label: string }): Promise<{
    id: string;
    secret?: string | null;
  }>;
  updateWebhook(id: string, options: { enabled: boolean }): Promise<void>;
  deleteWebhook(id: string): Promise<void>;
}

export interface WebhookRegistrarDeps {
  linearClient: WebhookRegistrationPort;
  secretsStore: Pick<SecretsStore, "get" | "set" | "delete">;
  getWebhookConfig: () => WebhookConfig | null | undefined;
  onSecretResolved: (secret: string) => void;
  logger: RisolutoLogger;
}

export class WebhookRegistrar {
  private readonly linearClient: WebhookRegistrarDeps["linearClient"];
  private readonly secretsStore: WebhookRegistrarDeps["secretsStore"];
  private readonly getWebhookConfig: WebhookRegistrarDeps["getWebhookConfig"];
  private readonly onSecretResolved: WebhookRegistrarDeps["onSecretResolved"];
  private readonly logger: RisolutoLogger;
  private stopped = false;

  constructor(deps: WebhookRegistrarDeps) {
    this.linearClient = deps.linearClient;
    this.secretsStore = deps.secretsStore;
    this.getWebhookConfig = deps.getWebhookConfig;
    this.onSecretResolved = deps.onSecretResolved;
    this.logger = deps.logger.child({ component: "webhook-registrar" });
  }

  /**
   * Run on startup after the HTTP server is live.
   *
   * Resolves the signing secret and ensures a webhook exists in Linear.
   * Never throws — any failure falls back to polling-only mode.
   */
  async register(): Promise<void> {
    const config = this.getWebhookConfig();
    if (!config) {
      this.logger.debug({}, "no webhook configuration — skipping registration");
      return;
    }

    try {
      await this.resolveSecret(config);
    } catch (error) {
      this.logRegistrationError(error);
    }
  }

  /** Cleanup. Safe to call multiple times. */
  stop(): void {
    this.stopped = true;
  }

  // ---------------------------------------------------------------------------
  // Secret resolution pipeline
  // ---------------------------------------------------------------------------

  private async resolveSecret(config: WebhookConfig): Promise<void> {
    // Priority 1: explicit config secret (manual mode)
    if (config.webhookSecret) {
      await this.useConfigSecret(config);
      return;
    }

    // Priority 2: stored secret from a previous registration
    const storedSecret = this.secretsStore.get(SECRETS_KEY);
    if (storedSecret) {
      const resolved = await this.useStoredSecret(config, storedSecret);
      if (resolved) return;
      // Stored secret is stale — fall through to auto-create
    }

    // Priority 3: auto-create a new webhook
    await this.autoCreate(config);
  }

  // ---------------------------------------------------------------------------
  // Strategy 1: manual config secret
  // ---------------------------------------------------------------------------

  private async useConfigSecret(config: WebhookConfig): Promise<void> {
    this.logger.info({}, "using configured webhook secret (manual mode)");
    this.onSecretResolved(config.webhookSecret);

    // Best-effort verification that the URL exists in Linear
    try {
      const webhooks = await this.linearClient.listWebhooks();
      const match = webhooks.find((webhook) => webhook.url === config.webhookUrl);
      if (!match) {
        this.logger.warn(
          { webhookUrl: config.webhookUrl },
          "webhook URL not found in Linear — ensure it is registered in the Linear workspace settings",
        );
      }
    } catch (error) {
      this.logger.warn(
        { error: errorMessage(error) },
        "could not verify webhook URL in Linear — continuing with configured secret",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy 2: stored secret from previous registration
  // ---------------------------------------------------------------------------

  /**
   * Attempts to reuse a stored secret. Returns `true` if the secret was
   * resolved, `false` if the webhook was not found (stale secret).
   */
  private async useStoredSecret(config: WebhookConfig, storedSecret: string): Promise<boolean> {
    this.logger.info({}, "using stored webhook secret from previous registration");

    let webhooks: Awaited<ReturnType<typeof this.linearClient.listWebhooks>>;
    try {
      webhooks = await this.linearClient.listWebhooks();
    } catch (error) {
      this.logger.warn(
        { error: errorMessage(error) },
        "could not list webhooks to verify stored secret — continuing with stored secret",
      );
      // Optimistically use the stored secret even if we can't verify
      this.onSecretResolved(storedSecret);
      return true;
    }

    const match = webhooks.find((webhook) => webhook.url === config.webhookUrl);

    if (!match) {
      this.logger.info(
        { webhookUrl: config.webhookUrl },
        "stored webhook not found in Linear — stored secret is stale, will auto-create",
      );
      return false;
    }

    if (match.enabled) {
      this.logger.info({ webhookId: match.id }, "stored webhook is active in Linear");
      this.onSecretResolved(storedSecret);
      return true;
    }

    // Webhook exists but is disabled — attempt to re-enable
    try {
      await this.linearClient.updateWebhook(match.id, { enabled: true });
      this.logger.info({ webhookId: match.id }, "re-enabled disabled webhook in Linear");
      this.onSecretResolved(storedSecret);
      return true;
    } catch (error) {
      this.logger.warn(
        { webhookId: match.id, error: errorMessage(error) },
        "failed to re-enable webhook — will auto-create a new one",
      );
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy 3: auto-create
  // ---------------------------------------------------------------------------

  private async autoCreate(config: WebhookConfig): Promise<void> {
    this.logger.info({ webhookUrl: config.webhookUrl }, "auto-creating webhook in Linear");

    const result = await this.linearClient.createWebhook({
      url: config.webhookUrl,
      resourceTypes: RESOURCE_TYPES,
      label: WEBHOOK_LABEL,
    });

    if (!result.secret) {
      this.logger.error(
        { webhookId: result.id },
        "Linear API did not return a signing secret — manual setup is required. " +
          "Create a webhook manually in Linear workspace settings and configure webhook_secret in Settings.",
      );
      return;
    }

    await this.secretsStore.set(SECRETS_KEY, result.secret);
    this.onSecretResolved(result.secret);
    this.logger.info(
      { webhookId: result.id },
      "webhook created and signing secret stored — auto-registration complete",
    );
  }

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  private logRegistrationError(error: unknown): void {
    if (error instanceof LinearClientError && isPermissionError(error)) {
      this.logger.warn(
        { errorCode: error.code, error: error.message },
        "webhook registration failed — insufficient permissions. " +
          "The Linear API key requires Admin scope for auto-registration. " +
          "Either grant Admin scope or set up webhooks manually in Linear workspace settings.",
      );
      return;
    }

    this.logger.warn(
      { error: errorMessage(error) },
      "webhook registration failed — continuing with polling-only mode. " +
        "To set up webhooks manually, see the operator guide.",
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPermissionError(error: LinearClientError): boolean {
  // linear_http_error fires for ANY non-200 status (500, 429, etc.),
  // so only treat it as a permission error when the status code indicates
  // authentication or authorization failure.
  if (error.code === "linear_http_error") {
    return /\b(401|403)\b/.test(error.message);
  }
  // linear_graphql_error fires for any GraphQL error payload, which may
  // include schema/validation errors unrelated to permissions.
  if (error.code === "linear_graphql_error") {
    return /unauthorized|forbidden|permission|not authorized/i.test(error.message);
  }
  return false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
