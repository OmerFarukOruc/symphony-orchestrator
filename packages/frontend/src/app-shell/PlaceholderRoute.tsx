import type { ReactElement } from "react";
import { useLocation, useParams } from "react-router-dom";

import styles from "../App.module.css";
import type { ShellRoute } from "./routes";

type PlaceholderRouteProps = Readonly<{
  route: ShellRoute;
}>;

// eslint-disable-next-line @typescript-eslint/naming-convention
export function PlaceholderRoute({ route }: PlaceholderRouteProps): ReactElement {
  const location = useLocation();
  const params = useParams();
  const paramEntries = Object.entries(params);

  return (
    <section className={styles.page} aria-labelledby={`route-title-${route.key}`}>
      <div className={styles.pageHero}>
        <p className={styles.eyebrow}>Placeholder view</p>
        <h1 id={`route-title-${route.key}`} className={styles.pageTitle}>
          {route.title}
        </h1>
        <p className={styles.pageDescription}>{route.description}</p>
      </div>

      <div className={styles.metaGrid}>
        <article className={styles.metaCard}>
          <p className={styles.metaLabel}>Registered path</p>
          <p className={styles.metaValue}>{route.href}</p>
        </article>

        <article className={styles.metaCard}>
          <p className={styles.metaLabel}>Current location</p>
          <p className={styles.metaValue}>{`${location.pathname}${location.hash}`}</p>
        </article>

        <article className={styles.metaCard}>
          <p className={styles.metaLabel}>Route params</p>
          {paramEntries.length > 0 ? (
            <dl className={styles.paramsList}>
              {paramEntries.map(([key, value]) => (
                <div key={key} className={styles.paramRow}>
                  <dt className={styles.paramKey}>{key}</dt>
                  <dd className={styles.paramValue}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.emptyState}>No dynamic route params for this placeholder.</p>
          )}
        </article>
      </div>
    </section>
  );
}
