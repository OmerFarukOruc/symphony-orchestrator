import { test as base } from "@playwright/test";
import { installApiMock, type ApiMockOverrides } from "../mocks/api-mock";
import { ScenarioBuilder } from "../mocks/scenario-builder";

export interface ApiMockFixture {
  install(overrides?: ApiMockOverrides): Promise<void>;
  scenario(): ScenarioBuilder;
}

/**
 * Custom Playwright fixtures for Risoluto E2E tests.
 *
 * Provides:
 * - `apiMock`: Auto-installs API mock routes before each test.
 * - `scenario`: Fluent builder for constructing mock scenarios.
 */
export const test = base.extend<{ apiMock: ApiMockFixture }>({
  apiMock: async ({ page }, use) => {
    const fixture: ApiMockFixture = {
      async install(overrides?: ApiMockOverrides): Promise<void> {
        await installApiMock(page, overrides);
      },
      scenario(): ScenarioBuilder {
        return new ScenarioBuilder();
      },
    };
    await use(fixture);
  },
});

export { expect } from "@playwright/test";
