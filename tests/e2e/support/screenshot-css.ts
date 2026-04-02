import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const supportDir = fileURLToPath(new URL(".", import.meta.url));

/** CSS that suppresses animations for visual regression screenshots. */
export const screenshotCss = readFileSync(join(supportDir, "screenshot.css"), "utf-8");

/**
 * Prepares the page for a visual regression screenshot:
 * 1. Injects screenshot.css (disable animations, hide scrollbars, etc.)
 * 2. Removes browser extension overlays injected into <body> (e.g. Agentation panel)
 */
export async function applyScreenshotStyles(page: Page): Promise<void> {
  await page.addStyleTag({ content: screenshotCss });
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("body > *").forEach((el) => {
      const text = el.innerText ?? "";
      if (text.includes("agentation") || text.includes("Agentation")) {
        el.style.setProperty("display", "none", "important");
      }
    });
  });
}
