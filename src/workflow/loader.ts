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

  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(source);
  if (!match) {
    throw new WorkflowLoaderError({
      code: "workflow_parse_error",
      message: "workflow front matter is not closed with a terminating --- line",
    });
  }

  try {
    const parsed = YAML.parse(match[1]);
    if (!isRecord(parsed)) {
      throw new WorkflowLoaderError({
        code: "workflow_front_matter_not_a_map",
        message: "workflow front matter must parse to a YAML map",
      });
    }

    return {
      config: parsed,
      promptTemplate: match[2].trim(),
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
