/**
 * Creates a live metric pill for the hero band.
 * Small, inline stat with value and label.
 */
export function createLiveMetric(label: string): { root: HTMLElement; value: HTMLElement } {
  const root = document.createElement("div");
  root.className = "overview-live-metric";
  const value = document.createElement("strong");
  value.className = "overview-live-value";
  const caption = document.createElement("span");
  caption.className = "overview-live-label";
  caption.textContent = label;
  root.append(value, caption);
  return { root, value };
}

/**
 * Creates the hero metrics band — a strong top strip showing "Now" metrics.
 * Running, queued work, and request headroom inline.
 */
export function createHeroMetricsBand(): {
  band: HTMLElement;
  state: HTMLElement;
  detail: HTMLElement;
  metrics: {
    running: HTMLElement;
    queued: HTMLElement;
    headroom: HTMLElement;
  };
} {
  const band = document.createElement("section");
  band.className = "overview-hero-band";

  const intro = document.createElement("div");
  intro.className = "overview-hero-intro";

  const label = document.createElement("span");
  label.className = "overview-hero-label";
  label.textContent = "Overview";

  const title = document.createElement("h1");
  title.className = "overview-hero-title";
  title.textContent = "Calm control of the queue";

  const detail = document.createElement("p");
  detail.className = "overview-hero-detail";

  const state = document.createElement("div");
  state.className = "overview-hero-state";

  intro.append(label, title, detail, state);

  const metricsContainer = document.createElement("div");
  metricsContainer.className = "overview-hero-metrics";

  const running = createLiveMetric("Running");
  const queued = createLiveMetric("Queued");
  const headroom = createLiveMetric("API headroom");

  metricsContainer.append(running.root, queued.root, headroom.root);
  band.append(intro, metricsContainer);

  return {
    band,
    state,
    detail,
    metrics: {
      running: running.value,
      queued: queued.value,
      headroom: headroom.value,
    },
  };
}
