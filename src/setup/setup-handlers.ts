/**
 * Backward-compatible re-export barrel.
 * All handler implementations now live in ./handlers/*.ts.
 */
export type { SetupApiDeps } from "./handlers/index.js";

export {
  handleGetStatus,
  handlePostMasterKey,
  handleGetLinearProjects,
  handlePostLinearProject,
  handlePostOpenaiKey,
  handlePostCodexAuth,
  handlePostPkceAuthStart,
  handleGetPkceAuthStatus,
  handlePostPkceAuthCancel,
  handlePostGithubToken,
  handlePostCreateTestIssue,
  handlePostCreateLabel,
  handlePostCreateProject,
  handlePostReset,
} from "./handlers/index.js";
