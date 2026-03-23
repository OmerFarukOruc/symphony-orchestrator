export function buildTitleWithBadge(
  text: string,
  badgeClass: "is-required" | "is-optional",
  badgeText: string,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "setup-title-row";

  const title = document.createElement("div");
  title.className = "setup-title";
  title.textContent = text;

  const badge = document.createElement("span");
  badge.className = `setup-badge ${badgeClass}`;
  badge.textContent = badgeText;

  row.append(title, badge);
  return row;
}
