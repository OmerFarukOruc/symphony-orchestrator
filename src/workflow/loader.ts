import { readFile } from "node:fs/promises";

import YAML from "yaml";

import type { ValidationError, WorkflowDefinition } from "../core/types.js";
import { isRecord } from "../utils/type-guards.js";

class WorkflowLoaderError extends Error {
  constructor(
    public readonly validationError: ValidationError,
    options?: { cause?: unknown },
  ) {
    super(validationError.message, options);
    this.name = "WorkflowLoaderError";
  }
}

/**
 * Default prompt template used when no WORKFLOW.md file exists.
 * This enables file-free startup via web dashboard configuration.
 */
export const DEFAULT_PROMPT_TEMPLATE = `You are working on Linear issue {{ issue.identifier }}: {{ issue.title }}

{% if issue.description %}
Issue description:
{{ issue.description }}
{% endif %}

When you have truly finished the issue and should stop, end your final message with \`SYMPHONY_STATUS: DONE\`. If you are blocked and cannot make further progress, end your final message with \`SYMPHONY_STATUS: BLOCKED\`.

Respect the repository state you find in the workspace, explain what you are doing in short operator-friendly updates, and stop once the issue is either complete or blocked.`;

/**
 * Default workflow definition used when WORKFLOW.md file is not present.
 * This allows Symphony to start with zero config files via dashboard setup.
 */
export const DEFAULT_WORKFLOW_DEFINITION: WorkflowDefinition = {
  config: {},
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
};

export async function loadWorkflowDefinition(workflowPath: string): Promise<WorkflowDefinition> {
  let source: string;
  try {
    source = await readFile(workflowPath, "utf8");
  } catch {
    // Return default workflow when file is missing - enables file-free startup
    return DEFAULT_WORKFLOW_DEFINITION;
  }

  if (!source.startsWith("---")) {
    return {
      config: {},
      promptTemplate: source.trim(),
    };
  }

  const firstNewline = source.indexOf("\n");
  if (firstNewline === -1) {
    throw new WorkflowLoaderError({
      code: "workflow_parse_error",
      message: "workflow front matter is not closed with a terminating --- line",
    });
  }

  const endMarker = source.indexOf("\n---", firstNewline);
  if (endMarker === -1) {
    throw new WorkflowLoaderError({
      code: "workflow_parse_error",
      message: "workflow front matter is not closed with a terminating --- line",
    });
  }

  const frontMatterContent = source.slice(firstNewline + 1, endMarker);
  const afterEnd = source.indexOf("\n", endMarker + 4);
  const body = afterEnd === -1 ? "" : source.slice(afterEnd + 1);

  try {
    const parsed = YAML.parse(frontMatterContent);
    if (!isRecord(parsed)) {
      throw new WorkflowLoaderError({
        code: "workflow_front_matter_not_a_map",
        message: "workflow front matter must parse to a YAML map",
      });
    }

    return {
      config: parsed,
      promptTemplate: body.trim(),
    };
  } catch (error) {
    if (error instanceof WorkflowLoaderError) {
      throw error;
    }

    throw new WorkflowLoaderError(
      {
        code: "workflow_parse_error",
        message: error instanceof Error ? error.message : "workflow parsing failed",
      },
      { cause: error },
    );
  }
}
