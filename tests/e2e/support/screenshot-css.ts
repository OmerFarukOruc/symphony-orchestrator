import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const supportDir = fileURLToPath(new URL(".", import.meta.url));

/** CSS that suppresses animations for visual regression screenshots. */
export const screenshotCss = readFileSync(join(supportDir, "screenshot.css"), "utf-8");
