import type { ReactElement } from "react";
import { NavLink, Outlet } from "react-router-dom";

import styles from "../App.module.css";
import { navGroups, routesForGroup, type NavGroup } from "./routes";

type SetupState = "checking" | "ready" | "setup-required";

type AppLayoutProps = Readonly<{
  setupState: SetupState;
}>;

function statusCopy(setupState: SetupState): { badgeClassName: string; label: string } {
  if (setupState === "ready") {
    return { badgeClassName: styles.statusReady, label: "Setup ready" };
  }
  if (setupState === "setup-required") {
    return { badgeClassName: styles.statusSetupRequired, label: "Setup required" };
  }
  return { badgeClassName: styles.statusChecking, label: "Checking setup" };
}

function renderNavigationGroup(group: NavGroup): ReactElement {
  return (
    <section key={group} className={styles.navGroup} aria-labelledby={`nav-group-${group.toLowerCase()}`}>
      <h2 id={`nav-group-${group.toLowerCase()}`} className={styles.navGroupTitle}>
        {group}
      </h2>
      <div className={styles.navList}>
        {routesForGroup(group).map((route) => (
          <NavLink
            key={route.key}
            to={route.href}
            data-path={route.href}
            className={({ isActive }) =>
              isActive
                ? `${styles.navLink} ${styles.navLinkActive} sidebar-item is-active`
                : `${styles.navLink} sidebar-item`
            }
            end={route.href === "/"}
          >
            <span className={styles.navLabel}>{route.nav?.label}</span>
            <span className={styles.navHotkey}>{route.nav?.hotkey}</span>
          </NavLink>
        ))}
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function AppLayout({ setupState }: AppLayoutProps): ReactElement {
  const status = statusCopy(setupState);

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} shell-sidebar`} aria-label="Primary navigation">
        <div className={styles.brandBlock}>
          <p className={styles.eyebrow}>Task 17 scaffold</p>
          <h1 className={styles.brandTitle}>Symphony React shell</h1>
          <p className={styles.brandDescription}>
            React Router now owns every operator URL. Remaining legacy views mount inside route components while the
            migration finishes.
          </p>
        </div>

        <nav className={styles.nav}>{navGroups.map((group) => renderNavigationGroup(group))}</nav>

        <section className={styles.sidebarNote} aria-labelledby="parity-note-title">
          <h2 id="parity-note-title" className={styles.sidebarNoteTitle}>
            Parity testing
          </h2>
          <p className={styles.sidebarNoteText}>
            API reads still flow through the Vite proxy to the control plane, but every registered dashboard path now
            resolves through the React app shell.
          </p>
        </section>
      </aside>

      <div className={styles.main}>
        <header className={`${styles.header} shell-header`}>
          <div className={styles.headerContent}>
            <p className={styles.eyebrow}>Router + app shell</p>
            <h2 className={styles.headerTitle}>18 registered paths, one nested layout</h2>
            <p className={styles.headerText}>
              The shell uses React Router nesting with an Outlet-based content region so each legacy URL can be migrated
              independently.
            </p>
          </div>
          <span className={`${styles.statusBadge} ${status.badgeClassName}`}>{status.label}</span>
        </header>

        <main id="main-content" className={`${styles.outlet} shell-outlet`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
