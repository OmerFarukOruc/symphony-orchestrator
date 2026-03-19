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

export async function loadWorkflowDefinition(workflowPath: string): Promise<WorkflowDefinition> {
  let source: string;
  try {
    source = await readFile(workflowPath, "utf8");
  } catch (error) {
    throw new WorkflowLoaderError(
      {
        code: "missing_workflow_file",
        message: `workflow file not found: ${workflowPath}`,
      },
      { cause: error },
    );
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
