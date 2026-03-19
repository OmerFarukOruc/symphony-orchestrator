import { skeletonBlock } from "../ui/skeleton";

export function buildStubPage(title: string, subtitle: string): HTMLElement {
  const page = document.createElement("div");
  page.className = "page fade-in";

  const heading = document.createElement("h1");
  heading.className = "page-title";
  heading.textContent = title;

  const description = document.createElement("p");
  description.className = "page-subtitle";
  description.textContent = subtitle;

  const content = document.createElement("section");
  content.className = "page-skeletons";
  for (let index = 0; index < 3; index += 1) {
    const card = document.createElement("div");
    card.className = "page-card";
    card.append(skeletonBlock(index === 0 ? "96px" : "84px"));
    content.append(card);
  }

  page.append(heading, description, content);
  return page;
}
