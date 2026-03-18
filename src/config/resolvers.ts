/**
 * Config value resolution utilities for environment variables,
 * secrets, and path expansion.
 *
 * These resolvers handle the transformation of config string values
 * that may contain references to environment variables ($VAR),
 * secrets ($SECRET:name), or home directories (~).
 */

import path from "node:path";

/**
 * Resolve a string value that may reference environment variables or secrets.
 *
 * Supported formats:
 * - `$SECRET:name` → looks up secret via secretResolver
 * - `$VAR` → looks up environment variable
 * - literal strings → returned as-is
 */
function resolveEnvBackedString(value: unknown, secretResolver?: (name: string) => string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  const secretMatch = value.match(/^\$SECRET:([A-Za-z0-9._-]+)$/);
  if (secretMatch) {
    return secretResolver?.(secretMatch[1]) ?? "";
  }
  if (!value.startsWith("$")) {
    return value;
  }
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value) === false) {
    return value;
  }

  const envName = value.slice(1);
  return process.env[envName] ?? "";
}

/**
 * Expand home directory references (~ or ~/) in a path string.
 * Returns empty string for non-string inputs.
 */
function expandHomePath(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  if (value === "~") {
    return process.env.HOME ?? value;
  }
  if (value.startsWith("~/")) {
    return path.join(process.env.HOME ?? "~", value.slice(2));
  }
  return value;
}

/**
 * Replace $TMPDIR placeholder with the actual temp directory.
 * Falls back to "/tmp" if TMPDIR is not set.
 */
function resolveTmpDir(value: string): string {
  return value.replace("$TMPDIR", process.env.TMPDIR ?? "/tmp");
}

/**
 * Resolve a config string through the full resolution chain:
 * env/secret expansion → home path expansion → tmpdir expansion.
 */
export function resolveConfigString(value: unknown, secretResolver?: (name: string) => string | undefined): string {
  return resolveTmpDir(expandHomePath(resolveEnvBackedString(value, secretResolver)));
}

/**
 * Expand all $VAR style environment variable references in a string.
 * Unlike resolveEnvBackedString, this replaces all occurrences within the string.
 */
function expandPathEnvVars(value: string): string {
  return value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => process.env[name] ?? "");
}

/**
 * Resolve a path config string through the full resolution chain:
 * env/secret expansion → home path expansion → tmpdir expansion → remaining env expansion.
 */
export function resolvePathConfigString(value: unknown, secretResolver?: (name: string) => string | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return expandPathEnvVars(resolveTmpDir(expandHomePath(resolveEnvBackedString(value, secretResolver))));
}
