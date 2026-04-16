import { getOutlet } from "./ui/shell.js";
import { decoratePageRoot } from "./ui/page-motion";

interface Route {
  path: string;
  pattern: RegExp;
  render: (params: Record<string, string>) => HTMLElement;
  title?: string;
}

interface InternalRoute extends Route {
  keys: string[];
}

export interface RouterNavigateDetail {
  path: string;
  params: Record<string, string>;
  title: string;
}

function compileRoute(path: string): Pick<InternalRoute, "pattern" | "keys"> {
  const keys: string[] = [];

  const source = path
    .split("/")
    .map((segment) => {
      const paramMatch = /^:([^/]+)$/.exec(segment);
      if (paramMatch) {
        keys.push(paramMatch[1]);
        return "([^/]+)";
      }
      return segment.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    })
    .join("\\/");

  return { pattern: new RegExp(`^${source}$`), keys };
}

class Router {
  private readonly routes: InternalRoute[] = [];
  private readonly listeners = new Set<(detail: RouterNavigateDetail) => void>();
  private guard: ((path: string) => string | null) | null = null;
  private notFoundRender: ((params: Record<string, string>) => HTMLElement) | null = null;

  register(path: string, render: (params: Record<string, string>) => HTMLElement, title?: string): void {
    const compiled = compileRoute(path);
    this.routes.push({ path, render, title, ...compiled });
  }

  setGuard(fn: (path: string) => string | null): void {
    this.guard = fn;
  }

  setNotFound(render: (params: Record<string, string>) => HTMLElement): void {
    this.notFoundRender = render;
  }

  navigate(path: string): void {
    const redirect = this.guard?.(path) ?? null;
    const target = redirect ?? path;
    if (globalThis.location.pathname !== target) {
      globalThis.history.pushState({}, "", target);
    }
    this.renderCurrent();
  }

  init(): void {
    globalThis.addEventListener("popstate", () => this.renderCurrent());
    this.renderCurrent();
  }

  subscribe(handler: (detail: RouterNavigateDetail) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private match(pathname: string): { route: InternalRoute; params: Record<string, string> } | null {
    for (const route of this.routes) {
      const matched = route.pattern.exec(pathname);
      if (!matched) {
        continue;
      }
      const params = route.keys.reduce<Record<string, string>>((acc, key, index) => {
        acc[key] = decodeURIComponent(matched[index + 1] ?? "");
        return acc;
      }, {});
      return { route, params };
    }
    return null;
  }

  private renderCurrent(): void {
    const outlet = getOutlet();
    const redirect = this.guard?.(globalThis.location.pathname) ?? null;
    if (redirect && globalThis.location.pathname !== redirect) {
      globalThis.history.replaceState({}, "", redirect);
    }
    const pathname = redirect ?? globalThis.location.pathname;
    const matched = this.match(pathname);
    if (!outlet) {
      return;
    }
    if (!matched) {
      const fallback =
        this.notFoundRender ??
        (() => {
          const el = document.createElement("div");
          el.append(Object.assign(document.createElement("p"), { textContent: "Page not found." }));
          return el;
        });
      outlet.replaceChildren(decoratePageRoot(fallback({})));
      return;
    }
    const rendered = decoratePageRoot(matched.route.render(matched.params));
    outlet.replaceChildren(rendered);
    const title = matched.route.title ?? getRouteTitle(rendered);
    const detail = { path: globalThis.location.pathname, params: matched.params, title } satisfies RouterNavigateDetail;
    globalThis.dispatchEvent(new CustomEvent("router:navigate", { detail }));
    for (const listener of this.listeners) {
      listener(detail);
    }
  }
}

function getRouteTitle(rendered: HTMLElement): string {
  const titleElement = rendered.querySelector<HTMLElement>(".page-title, .issue-title, h1");
  return titleElement?.textContent?.trim() || document.title || "Risoluto";
}

export { type Route, Router };
export const router = new Router();
