export function createMetricCard(title: string, kicker?: string): HTMLElement {
  const card = document.createElement("section");
  card.className = "mc-stat-card";

  const header = document.createElement("div");
  header.className = "mc-stat-card-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "mc-stat-card-title";
  titleEl.textContent = title;
  header.append(titleEl);

  if (kicker) {
    const kickerEl = document.createElement("span");
    kickerEl.className = "mc-badge";
    kickerEl.textContent = kicker;
    header.append(kickerEl);
  }

  const body = document.createElement("div");
  body.className = "mc-stat-card-body";
  card.append(header, body);
  return Object.assign(card, { body });
}
