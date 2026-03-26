import type { ChangeEvent, ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";

import { queryKeys } from "../hooks/query-client";
import { useSSE } from "../hooks/useSSE";
import styles from "./Settings.module.css";
import { fetchSettingsData, getErrorMessage, saveSettingsOverlay } from "./settings-api";
import { settingsSections } from "./settings-definitions";
import {
  buildValidatedOverlayPatch,
  countSectionOverrides,
  createInitialDrafts,
  type SettingsFieldErrors,
} from "./settings-form";
import { SettingsRail, SettingsSectionsPanel } from "./settings-sections";

type NoticeState = Readonly<{
  message: string;
  tone: "error" | "info" | "success";
}> | null;

// eslint-disable-next-line @typescript-eslint/naming-convention
export function Settings(): ReactElement {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<SettingsFieldErrors>({});
  const [notice, setNotice] = useState<NoticeState>(null);
  useSSE();

  if (location.hash === "#credentials") {
    return <Navigate replace to="/secrets" />;
  }

  const settingsQuery = useQuery({
    queryKey: queryKeys.config,
    queryFn: fetchSettingsData,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }
    setDrafts(createInitialDrafts(settingsQuery.data.effective, settingsQuery.data.overlay));
    setFieldErrors({});
  }, [settingsQuery.data]);

  const summaries = useMemo(
    () =>
      settingsSections.map((section) => ({
        ...section,
        overrideCount: settingsQuery.data ? countSectionOverrides(section, settingsQuery.data.overlay) : 0,
      })),
    [settingsQuery.data],
  );

  const saveMutation = useMutation({
    mutationFn: async (): Promise<{ skipped: boolean }> => {
      const effective = settingsQuery.data?.effective;
      if (!effective) {
        throw new Error("Settings have not loaded yet.");
      }

      const validation = buildValidatedOverlayPatch(drafts, effective);
      setFieldErrors(validation.fieldErrors);
      if (validation.generalErrors.length > 0) {
        throw new Error(validation.generalErrors.join(" "));
      }
      if (Object.keys(validation.fieldErrors).length > 0) {
        throw new Error("Fix the highlighted fields before saving.");
      }
      return saveSettingsOverlay(validation.changedFieldPaths.length === 0 ? {} : validation.patch);
    },
    onSuccess: async ({ skipped }) => {
      setNotice({
        message: skipped ? "No config changes to save." : "Settings saved to the persistent config overlay.",
        tone: skipped ? "info" : "success",
      });
      if (!skipped) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.config });
      }
    },
    onError: (error) => {
      setNotice({ message: getErrorMessage(error), tone: "error" });
    },
  });

  function handleFieldChange(path: string) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
      const value = event.target.value;
      setDrafts((currentDrafts) => ({ ...currentDrafts, [path]: value }));
      setFieldErrors((currentErrors) => {
        if (!(path in currentErrors)) {
          return currentErrors;
        }
        const nextErrors = { ...currentErrors };
        delete nextErrors[path];
        return nextErrors;
      });
      if (notice?.tone === "error") {
        setNotice(null);
      }
    };
  }

  if (settingsQuery.isLoading) {
    return <section className={styles.state}>Loading settings…</section>;
  }

  if (settingsQuery.isError || !settingsQuery.data) {
    return (
      <section className={styles.state}>
        <h1 className={styles.stateTitle}>Settings unavailable</h1>
        <p className={styles.stateText}>{getErrorMessage(settingsQuery.error)}</p>
        <button className={styles.secondaryButton} onClick={() => void settingsQuery.refetch()} type="button">
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="settings-title">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>React parity route</p>
          <h1 className={styles.title} id="settings-title">
            Settings
          </h1>
          <p className={styles.description}>
            Edit the persistent config overlay without touching the checked-in workflow file. Changes merge into
            Symphony&apos;s effective runtime config.
          </p>
        </div>

        <div className={styles.heroActions}>
          <button
            className={styles.primaryButton}
            data-testid="settings-save"
            disabled={saveMutation.isPending}
            onClick={() => void saveMutation.mutateAsync()}
            type="button"
          >
            {saveMutation.isPending ? "Saving…" : "Save overlay"}
          </button>
          <p className={styles.heroHint}>Clearing saved overrides still requires the advanced overlay editor.</p>
        </div>
      </header>

      {notice ? (
        <div className={notice.tone === "error" ? styles.noticeError : styles.noticeSuccess} role="status">
          {notice.message}
        </div>
      ) : null}

      <div className={styles.layout}>
        <SettingsRail sections={summaries} />
        <SettingsSectionsPanel
          drafts={drafts}
          fieldErrors={fieldErrors}
          onFieldChange={handleFieldChange}
          overlay={settingsQuery.data.overlay}
        />
      </div>
    </section>
  );
}
