import type { Page } from "@playwright/test";

/**
 * Fail-fast handler for unmocked API routes.
 * Install AFTER all mock routes so this acts as a catch-all.
 * Any API call that isn't already mocked will abort the request
 * and throw a clear error in the test.
 */
export async function installUnhandledApiGuard(page: Page): Promise<void> {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    const method = route.request().method();
    console.error(`[E2E] Unmocked API call: ${method} ${url}`);
    void route.abort("failed");
  });

  await page.route("**/metrics", (route) => {
    const url = route.request().url();
    console.error(`[E2E] Unmocked metrics call: ${url}`);
    void route.abort("failed");
  });
}
