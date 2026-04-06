/**
 * Template resolver factory.
 *
 * Extracted from `src/cli/services.ts` to keep the service registry thin.
 * Encapsulates the priority chain for resolving a prompt template for a
 * given issue identifier:
 *
 *   1. Per-issue override (IssueConfigStore.getTemplateId)
 *   2. System-selected template (config.system.selectedTemplateId)
 *   3. The "default" template
 *   4. Empty string with a warning log
 */

import type { RisolutoLogger } from "../core/types.js";
import type { IssueConfigStore } from "../persistence/sqlite/issue-config-store.js";
import type { PromptTemplateStore } from "./store.js";
import { isRecord } from "../utils/type-guards.js";
import type { ConfigStore } from "../config/store.js";

export interface TemplateResolverDeps {
  templateStore: PromptTemplateStore | undefined;
  issueConfigStore: IssueConfigStore;
  configStore: ConfigStore;
  logger: RisolutoLogger;
}

/**
 * Returns an async function that resolves the prompt template body for a
 * given issue identifier, following the 4-level priority chain.
 */
export function createTemplateResolver(deps: TemplateResolverDeps): (identifier: string) => Promise<string> {
  const { templateStore, issueConfigStore, configStore, logger } = deps;

  const readSelectedTemplateId = (): string | null => {
    const mergedConfigMap = configStore.getMergedConfigMap();
    const systemConfig = mergedConfigMap.system;
    if (!isRecord(systemConfig)) {
      return null;
    }
    const selectedTemplateId = systemConfig.selectedTemplateId;
    return typeof selectedTemplateId === "string" && selectedTemplateId.trim() ? selectedTemplateId : null;
  };

  return async (identifier: string): Promise<string> => {
    if (templateStore) {
      const overrideTemplateId = issueConfigStore.getTemplateId(identifier);
      if (overrideTemplateId) {
        const tmpl = templateStore.get(overrideTemplateId);
        if (tmpl) return tmpl.body;
      }
      const selectedTemplateId = readSelectedTemplateId();
      if (selectedTemplateId) {
        const tmpl = templateStore.get(selectedTemplateId);
        if (tmpl) return tmpl.body;
      }
      const def = templateStore.get("default");
      if (def) return def.body;
    }
    logger.warn({ identifier }, "no prompt template found — using empty string");
    return "";
  };
}
