import { getOutlet } from "./ui/shell";

interface Route {
  path: string;
  pattern: RegExp;
  render: (params: Record<string, string>) => HTMLElement;
}

interface InternalRoute extends Route {
  keys: string[];
}

function compileRoute(path: string): Pick<InternalRoute, "pattern" | "keys"> {
  const keys: string[] = [];
  const source = path.replace(/:([^/]+)/g, (_match, key: string) => {
    keys.push(key);
    return "([^/]+)";
  });
  return { pattern: new RegExp(`^${source}$`), keys };
}

class Router {
  private routes: InternalRoute[] = [];

  register(path: string, render: (params: Record<string, string>) => HTMLElement): void {
    const compiled = compileRoute(path);
    this.routes.push({ path, render, ...compiled });
  }

  navigate(path: string): void {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
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
    const matched = this.match(window.location.pathname) ?? this.match("/");
    if (!outlet || !matched) {
      return;
    }
    outlet.replaceChildren(matched.route.render(matched.params));
    window.dispatchEvent(
      new CustomEvent("router:navigate", {
        detail: { path: window.location.pathname, params: matched.params },
      }),
    );
  }
}

export { type Route, Router };
export const router = new Router();
