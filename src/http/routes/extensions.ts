import type { Express } from "express";

import type { HttpRouteDeps } from "../route-types.js";
import { sanitizeConfigValue } from "../route-helpers.js";
import { registerConfigApi } from "./config.js";
import { registerSecretsApi } from "./secrets.js";
import { registerSetupApi } from "./setup.js";
import { registerTemplateApi } from "./prompt.js";
import { registerAuditApi } from "./audit.js";

function warnMissing(deps: HttpRouteDeps, feature: string): void {
  deps.logger.warn({ msg: `${feature} not provided — skipping registration` });
}

export function registerExtensionRoutes(app: Express, deps: HttpRouteDeps): void {
  if (deps.configStore && deps.configOverlayStore) {
    registerConfigApi(app, {
      getEffectiveConfig: () =>
        sanitizeConfigValue(deps.configStore?.getMergedConfigMap() ?? {}) as Record<string, unknown>,
      configOverlayStore: deps.configOverlayStore,
    });
  } else {
    warnMissing(deps, "configStore or configOverlayStore");
  }

  if (deps.secretsStore) {
    registerSecretsApi(app, { secretsStore: deps.secretsStore });
  } else {
    warnMissing(deps, "secretsStore");
  }

  if (deps.secretsStore && deps.configOverlayStore && deps.archiveDir && deps.tracker) {
    registerSetupApi(app, {
      secretsStore: deps.secretsStore,
      configOverlayStore: deps.configOverlayStore,
      orchestrator: deps.orchestrator,
      archiveDir: deps.archiveDir,
      tracker: deps.tracker,
    });
  } else {
    warnMissing(deps, "secretsStore, configOverlayStore, archiveDir, or tracker");
  }

  if (deps.templateStore) {
    registerTemplateApi(app, { templateStore: deps.templateStore });
  } else {
    warnMissing(deps, "templateStore");
  }

  if (deps.auditLogger) {
    registerAuditApi(app, { auditLogger: deps.auditLogger });
  } else {
    warnMissing(deps, "auditLogger");
  }
}
