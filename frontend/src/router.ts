import { getOutlet } from "./ui/shell";
import { decoratePageRoot } from "./ui/page-motion";

interface Route {
  path: string;
  pattern: RegExp;
  render: (params: Record<string, string>) => HTMLElement;
}

interface InternalRoute extends Route {
  keys: string[];
}

interface RouterNavigateDetail {
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
      return segment.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("\\/");

  // nosemgrep: detect-non-literal-regexp
  return { pattern: RegExp(`^${source}$`), keys };
}

class Router {
  private routes: InternalRoute[] = [];
  private guard: ((path: string) => string | null) | null = null;

  register(path: string, render: (params: Record<string, string>) => HTMLElement): void {
    const compiled = compileRoute(path);
    this.routes.push({ path, render, ...compiled });
  }

  setGuard(fn: (path: string) => string | null): void {
    this.guard = fn;
  }

  navigate(path: string): void {
    const redirect = this.guard?.(path) ?? null;
    const target = redirect ?? path;
    if (window.location.pathname !== target) {
      window.history.pushState({}, "", target);
    }
    this.renderCurrent();
  }

  init(): void {
    window.addEventListener("popstate", () => this.renderCurrent());
    this.renderCurrent();
  }

  private match(pathname: string): { route: InternalRoute; params: Record<string, string> } | null {
    for (const route of this.routes) {
      const matched = pathname.match(route.pattern);
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
    const redirect = this.guard?.(window.location.pathname) ?? null;
    if (redirect && window.location.pathname !== redirect) {
      window.history.replaceState({}, "", redirect);
    }
    const pathname = redirect ?? window.location.pathname;
    const matched = this.match(pathname) ?? this.match("/");
    if (!outlet || !matched) {
      return;
    }
    const rendered = decoratePageRoot(matched.route.render(matched.params));
    outlet.replaceChildren(rendered);
    const title = getRouteTitle(rendered);
    window.dispatchEvent(
      new CustomEvent("router:navigate", {
        detail: { path: window.location.pathname, params: matched.params, title } satisfies RouterNavigateDetail,
      }),
    );
  }
}

function getRouteTitle(rendered: HTMLElement): string {
  const titleElement = rendered.querySelector<HTMLElement>(".page-title, .issue-title, h1");
  return titleElement?.textContent?.trim() || document.title || "Symphony";
}

export { type Route, Router };
export const router = new Router();
