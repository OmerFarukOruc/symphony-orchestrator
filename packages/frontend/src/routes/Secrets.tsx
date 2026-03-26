/* eslint-disable complexity, sonarjs/cognitive-complexity */
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { queryKeys } from "../hooks/query-client.js";
import { useSSE } from "../hooks/useSSE.js";
import styles from "./Secrets.module.css";
import { fetchSecrets, removeSecret, saveSecret } from "./secrets-api.js";

type NoticeState = Readonly<{
  message: string;
  tone: "error" | "success";
}> | null;

type FieldErrors = Readonly<{
  key?: string;
  value?: string;
}>;

function validateFields(key: string, value: string): FieldErrors {
  return {
    key: /^[\w.:=-]+$/.test(key) ? undefined : "Use letters, numbers, dots, colons, equals, underscores, or dashes.",
    value: value.length > 0 ? undefined : "Secret value is required.",
  };
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function SecretsRoute(): ReactElement {
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [draftKey, setDraftKey] = useState<string>("");
  const [draftValue, setDraftValue] = useState<string>("");
  const [creatingNew, setCreatingNew] = useState<boolean>(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<NoticeState>(null);
  useSSE();

  const secretsQuery = useQuery({
    queryKey: queryKeys.secrets,
    queryFn: fetchSecrets,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!secretsQuery.data || creatingNew) {
      return;
    }

    const nextSelectedKey = secretsQuery.data.keys.includes(selectedKey)
      ? selectedKey
      : (secretsQuery.data.keys[0] ?? "");
    setSelectedKey(nextSelectedKey);
    setDraftKey(nextSelectedKey);
  }, [creatingNew, secretsQuery.data, selectedKey]);

  const knownKeys = secretsQuery.data?.keys ?? [];
  const isExistingKey = useMemo(() => knownKeys.includes(draftKey), [draftKey, knownKeys]);

  const saveMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const trimmedKey = draftKey.trim();
      const errors = validateFields(trimmedKey, draftValue);
      setFieldErrors(errors);
      if (errors.key || errors.value) {
        throw new Error("Fix the highlighted fields before saving.");
      }
      await saveSecret(trimmedKey, draftValue);
    },
    onSuccess: async () => {
      const savedKey = draftKey.trim();
      setNotice({ message: `Secret ${savedKey} saved.`, tone: "success" });
      setCreatingNew(false);
      setSelectedKey(savedKey);
      setDraftKey(savedKey);
      setDraftValue("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.secrets });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "Saving secret failed.", tone: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string): Promise<void> => {
      await removeSecret(key);
    },
    onSuccess: async (_, key) => {
      setNotice({ message: `Secret ${key} deleted.`, tone: "success" });
      setCreatingNew(false);
      setDraftKey("");
      setDraftValue("");
      setSelectedKey("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.secrets });
    },
    onError: (error) => {
      setNotice({ message: error instanceof Error ? error.message : "Deleting secret failed.", tone: "error" });
    },
  });

  function selectExistingKey(key: string): void {
    setCreatingNew(false);
    setSelectedKey(key);
    setDraftKey(key);
    setDraftValue("");
    setFieldErrors({});
    setNotice(null);
  }

  function startNewSecret(): void {
    setCreatingNew(true);
    setSelectedKey("");
    setDraftKey("");
    setDraftValue("");
    setFieldErrors({});
    setNotice(null);
  }

  if (secretsQuery.isLoading) {
    return <section className={styles.state}>Loading credentials…</section>;
  }

  if (secretsQuery.isError || !secretsQuery.data) {
    return (
      <section className={styles.state}>
        <h1 className={styles.stateTitle}>Credentials unavailable</h1>
        <p className={styles.stateText}>
          {secretsQuery.error instanceof Error ? secretsQuery.error.message : "Secrets request failed."}
        </p>
        <button className={styles.secondaryButton} onClick={() => void secretsQuery.refetch()} type="button">
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="secrets-title" data-testid="secrets-route">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>React parity route</p>
          <h1 className={styles.title} id="secrets-title">
            Credentials
          </h1>
          <p className={styles.description}>
            Store API keys and tokens securely. Values are encrypted and never shown again after saving.
          </p>
        </div>
        <button className={styles.primaryButton} data-testid="secrets-new" onClick={startNewSecret} type="button">
          New secret
        </button>
      </header>

      <section className={styles.helpCallout}>
        <h2 className={styles.sectionTitle}>What credentials should I store?</h2>
        <ul className={styles.helpList}>
          <li>
            <code>LINEAR_API_KEY</code> — your Linear API token for issue tracking
          </li>
          <li>
            <code>OPENAI_API_KEY</code> — OpenAI API key for Codex and model access
          </li>
          <li>
            <code>ANTHROPIC_API_KEY</code> — Anthropic API key when using Claude
          </li>
          <li>
            <code>GITHUB_TOKEN</code> — GitHub personal access token for repo operations
          </li>
        </ul>
      </section>

      {notice ? (
        <div className={notice.tone === "error" ? styles.noticeError : styles.noticeSuccess}>{notice.message}</div>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <section className={styles.editorPanel} aria-labelledby="secret-editor-title">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle} id="secret-editor-title">
                {creatingNew ? "Add secret" : isExistingKey ? "Update secret" : "Create first secret"}
              </h2>
              <p className={styles.sectionDescription}>
                Secret values are write-only. Updating a key stores a fresh encrypted value.
              </p>
            </div>
            <label className={styles.field} htmlFor="secret-key-input">
              <span className={styles.fieldLabel}>Secret key</span>
              <input
                aria-invalid={fieldErrors.key ? true : undefined}
                className={styles.input}
                data-testid="secret-key-input"
                disabled={!creatingNew && isExistingKey}
                id="secret-key-input"
                onChange={(event) => setDraftKey(event.target.value)}
                placeholder="OPENAI_API_KEY"
                value={draftKey}
              />
              {fieldErrors.key ? <span className={styles.fieldError}>{fieldErrors.key}</span> : null}
            </label>
            <label className={styles.field} htmlFor="secret-value-input">
              <span className={styles.fieldLabel}>Secret value</span>
              <input
                aria-invalid={fieldErrors.value ? true : undefined}
                className={styles.input}
                data-testid="secret-value-input"
                id="secret-value-input"
                onChange={(event) => setDraftValue(event.target.value)}
                placeholder="Paste the credential value"
                type="password"
                value={draftValue}
              />
              {fieldErrors.value ? <span className={styles.fieldError}>{fieldErrors.value}</span> : null}
            </label>
            <div className={styles.actions}>
              <button
                className={styles.primaryButton}
                data-testid="secret-save"
                disabled={saveMutation.isPending}
                onClick={() => void saveMutation.mutateAsync()}
                type="button"
              >
                {saveMutation.isPending ? "Saving…" : isExistingKey && !creatingNew ? "Update secret" : "Save secret"}
              </button>
              <button className={styles.secondaryButton} onClick={startNewSecret} type="button">
                Clear form
              </button>
            </div>
          </section>

          <section className={styles.tablePanel} aria-labelledby="stored-secrets-title">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle} id="stored-secrets-title">
                Stored secret keys
              </h2>
              <p className={styles.sectionDescription}>
                {knownKeys.length === 0
                  ? "No secrets stored yet."
                  : `${knownKeys.length} credential key(s) configured.`}
              </p>
            </div>
            {knownKeys.length === 0 ? (
              <div className={styles.emptyState}>
                <p className={styles.emptyTitle}>No secrets stored</p>
                <p className={styles.emptyText}>
                  Add the first credential your workflow needs, or continue through the setup wizard.
                </p>
                <Link className={styles.inlineLink} to="/setup">
                  Open setup
                </Link>
              </div>
            ) : (
              <table className={styles.table} data-testid="secrets-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Value</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {knownKeys.map((key) => (
                    <tr className={key === selectedKey ? styles.selectedRow : undefined} key={key}>
                      <td>
                        <button className={styles.rowKeyButton} onClick={() => selectExistingKey(key)} type="button">
                          {key}
                        </button>
                      </td>
                      <td className={styles.mutedCell}>••••••••</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button className={styles.inlineButton} onClick={() => selectExistingKey(key)} type="button">
                            Update
                          </button>
                          <button
                            aria-label={`Delete ${key}`}
                            className={styles.inlineDangerButton}
                            disabled={deleteMutation.isPending}
                            onClick={() => void deleteMutation.mutateAsync(key)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside className={styles.trustPanel}>
          <h2 className={styles.sectionTitle}>Encryption boundary</h2>
          <p className={styles.sectionDescription}>
            Symphony stores only secret keys in the UI. Values remain write-only, encrypted at rest, and redacted from
            all subsequent reads.
          </p>
        </aside>
      </div>
    </section>
  );
}
