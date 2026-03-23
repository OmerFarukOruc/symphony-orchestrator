import type { Page } from "@playwright/test";

/**
 * Freeze Date.now and performance.now to a fixed epoch for deterministic tests.
 * Must be called before page.goto() so the init script runs before app JS.
 */
export const FROZEN_EPOCH = new Date("2026-01-15T12:00:00.000Z").getTime();

export async function freezeClock(page: Page, epoch: number = FROZEN_EPOCH): Promise<void> {
  await page.addInitScript((frozenTime: number) => {
    const _originalDateNow = Date.now;
    Date.now = () => frozenTime;

    const _perfNow = performance.now.bind(performance);
    let perfOffset: number | null = null;
    performance.now = () => {
      if (perfOffset === null) {
        perfOffset = _perfNow();
      }
      return 0;
    };

    // Freeze requestAnimationFrame timestamp
    const _raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      return _raf(() => cb(frozenTime));
    };
  }, epoch);
}
