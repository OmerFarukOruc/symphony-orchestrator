/**
 * Zod schema for the webhook configuration subsection.
 *
 * All fields are optional since webhook integration is opt-in.
 * When `webhookUrl` is absent, the feature is disabled entirely.
 */

import { z } from "zod";

export const webhookConfigSchema = z.object({
  webhookUrl: z
    .string()
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "webhookUrl must be a valid HTTPS URL")
    .optional(),
  webhookSecret: z.string().optional(),
  pollingStretchMs: z.number().positive().default(120000),
  pollingBaseMs: z.number().positive().default(15000),
  healthCheckIntervalMs: z.number().positive().default(300000),
});
