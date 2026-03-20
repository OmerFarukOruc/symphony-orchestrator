import { skeletonCard } from "../ui/skeleton";

interface PageModule {
  render: (params?: Record<string, string>) => HTMLElement;
}

export function lazyPage(importFn: () => Promise<PageModule>): (params?: Record<string, string>) => HTMLElement {
  let cached: PageModule | null = null;
  let loading: Promise<PageModule> | null = null;

  function ensureLoaded(): Promise<PageModule> {
    if (cached) return Promise.resolve(cached);
    if (!loading) {
      loading = importFn().then((mod) => {
        cached = mod;
        loading = null;
        return mod;
      });
    }
    return loading;
  }

  return (params?: Record<string, string>) => {
    const container = document.createElement("div");
    container.className = "page lazy-page";

    if (cached) {
      return cached.render(params);
    }

    container.append(skeletonCard());
    void ensureLoaded().then((mod) => {
      const rendered = mod.render(params);
      if (container.parentNode) {
        container.parentNode.replaceChild(rendered, container);
      } else {
        container.replaceChildren(rendered);
      }
    });

    return container;
  };
}
