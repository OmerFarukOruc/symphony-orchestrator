export { evaluateWebhookConfig, createWebhookService } from "./service.js";
export {
  handleWebhookGitHub,
  handleWebhookLinear,
  verifyGitHubSignature,
  verifyLinearSignature,
} from "./http-adapter.js";
export type { WebhookPort, WebhookPortSnapshot } from "./port.js";
export type { WebhookHandlerDeps, GitHubWebhookHandlerDeps } from "./http-adapter.js";
