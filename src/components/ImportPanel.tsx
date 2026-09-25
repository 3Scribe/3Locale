import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectDetail } from "../domain/model";
import type {
  LocaleFile,
  ImportPreview,
  ConflictPolicy,
} from "../application/imports";
import { inferLanguage } from "../domain/languages";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "unexpected");
  return result as T;
}
export function ImportSummary({
  summary,
}: {
  summary: Record<string, number>;
}) {
  const { t } = useTranslation();
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {Object.entries(summary).map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4">
          <dt>{t(`batch.counts.${key}`)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function ImportPanel({
  project,
  disabled = false,
  onApplied,
}: {
  project?: ProjectDetail;
  disabled?: boolean;
  onApplied: (
    project: ProjectDetail,
    preview: ImportPreview,
    policy: ConflictPolicy,
  ) => void;
}) {
  const { t, i18n } = useTranslation();
  const [files, setFiles] = useState<LocaleFile[]>([]);
  const [name, setName] = useState("");
  const [baseLanguage, setBaseLanguage] = useState("en");
  const [preview, setPreview] = useState<ImportPreview>();

  const [policy, setPolicy] = useState<ConflictPolicy | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = project
    ? `/api/projects/${project.id}/imports`
    : "/api/imports";
  const body = (action: unknown) =>
    project ? action : { name, baseLanguage, import: action };
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (error) {
      const code = error instanceof Error ? error.message : "unexpected";
      setError(i18n.exists(`errors.${code}`) ? code : "unexpected");
    } finally {
      setBusy(false);
    }
  }
  function invalidate() {
    setPreview(undefined);
  }
  async function select(selected: FileList | null) {
    invalidate();
    setFiles([]);
    if (!selected) return;
    await run(async () => {
      const values = Array.from(selected);
      if (
        values.length > 20 ||
        values.reduce((sum, file) => sum + file.size, 0) > 10_000_000
      )
        throw new Error("batchTooLarge");
      if (values.some((file) => file.size > 1_000_000))
        throw new Error("tooLarge");
      setFiles(
        await Promise.all(
          values.map(async (file) => ({
            name: file.name,
            text: await file.text(),
            language: inferLanguage(file.name),
            confirmed: false,
          })),
        ),
      );
    });
  }
  return (
    <section
      className="my-6 space-y-5 rounded-xl border border-input bg-white p-5"
      aria-label={t("batch.title")}
    >
      <h2 className="text-xl font-semibold">{t("batch.title")}</h2>
      <p>{t("batch.hint")}</p>
      <fieldset disabled={busy || disabled} className="space-y-4">
        {!project && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              {t("batch.projectName")}
              <Input
                value={name}
                maxLength={120}
                onChange={(e) => {
                  setName(e.target.value);
                  invalidate();
                }}
              />
            </label>
            <label>
              {t("batch.baseLanguage")}
              <Input
                value={baseLanguage}
                maxLength={35}
                dir="ltr"
                onChange={(e) => {
                  setBaseLanguage(e.target.value);
                  invalidate();
                }}
              />
            </label>
          </div>
        )}
        {project && (
          <p>
            {t("baseLanguage")}: <bdi>{project.baseLanguage}</bdi>
          </p>
        )}
        <label className="block">
          {t("batch.files")}
          <Input
            type="file"
            multiple
            accept=".json,application/json"
            onChange={(e) => void select(e.target.files)}
          />
        </label>
        {files.map((file, index) => (
          <div
            key={index}
            className="flex flex-wrap items-center gap-3 rounded border border-input p-3"
          >
            <bdi>{file.name}</bdi>
            <label>
              {t("batch.mapping", { name: file.name })}
              <Input
                value={file.language}
                maxLength={35}
                dir="ltr"
                onChange={(e) => {
                  invalidate();
                  setFiles(
                    files.map((value, i) =>
                      i === index
                        ? {
                            ...value,
                            language: e.target.value,
                            confirmed: false,
                          }
                        : value,
                    ),
                  );
                }}
              />
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={file.confirmed}
                onChange={(e) => {
                  invalidate();
                  setFiles(
                    files.map((value, i) =>
                      i === index
                        ? { ...value, confirmed: e.target.checked }
                        : value,
                    ),
                  );
                }}
              />
              {t("batch.confirm", { name: file.name })}
            </label>
          </div>
        ))}
        <Button
          disabled={
            !files.length ||
            files.some((file) => !file.confirmed) ||
            (!project && !name.trim())
          }
          onClick={() =>
            void run(async () => {
              setPreview(
                await api<ImportPreview>(
                  endpoint,
                  body({ action: "preview", files }),
                ),
              );
            })
          }
        >
          {t("batch.analyse")}
        </Button>
        {preview && (
          <div className="space-y-4" aria-label={t("batch.preview")}>
            <h3 className="font-semibold">{t("batch.preview")}</h3>
            <p>
              {t("batch.mapped")}: <bdi>{preview.languages.join(", ")}</bdi>
            </p>
            <p>
              {t("batch.added")}:{" "}
              <bdi>{preview.addedLanguages.join(", ") || t("batch.none")}</bdi>
            </p>
            <ImportSummary summary={preview.summary} />
            {preview.issues.map((issue, index) => (
              <p role="alert" key={index}>
                <bdi>
                  {issue.file}{" "}
                  {issue.path
                    ?.map((segment) => JSON.stringify(segment))
                    .join(" › ")}
                </bdi>
                : {t(`errors.${issue.code}`)}
              </p>
            ))}
            {!!preview.conflicts.length && (
              <details>
                <summary>{t("batch.conflicts")}</summary>
                <ul>
                  {preview.conflicts.map((conflict, index) => (
                    <li key={index} className="my-3">
                      <bdi>
                        {conflict.language} {JSON.stringify(conflict.path)}
                      </bdi>
                      <p>
                        {t("batch.existing")}: <bdi>{conflict.existing}</bdi>
                      </p>
                      <p>
                        {t("batch.incoming")}: <bdi>{conflict.imported}</bdi>
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {!!preview.orphans.length && (
              <details>
                <summary>{t("batch.orphans")}</summary>
                <ul>
                  {preview.orphans.map((orphan, index) => (
                    <li key={index}>
                      <bdi>
                        {orphan.language} {JSON.stringify(orphan.path)}:{" "}
                        {orphan.value}
                      </bdi>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <label className="block">
              {t("batch.policy")}
              <select
                className="ms-3"
                value={policy}
                onChange={(e) =>
                  setPolicy(e.target.value as ConflictPolicy | "")
                }
              >
                <option value="">{t("batch.choosePolicy")}</option>
                <option value="keepExisting">{t("batch.keepExisting")}</option>
                <option value="useImported">{t("batch.useImported")}</option>
              </select>
            </label>
            <Button
              disabled={!policy || !!preview.issues.length}
              onClick={() =>
                void run(async () => {
                  const result = await api<{
                    project: ProjectDetail;
                    preview: ImportPreview;
                  }>(
                    endpoint,
                    body({
                      action: "apply",
                      files,
                      policy,
                      expectedVersion: preview.version,
                    }),
                  );

                  setPreview(undefined);
                  setFiles([]);
                  onApplied(
                    result.project,
                    result.preview,
                    policy as ConflictPolicy,
                  );
                })
              }
            >
              {t(project ? "batch.apply" : "batch.create")}
            </Button>
          </div>
        )}
      </fieldset>
      {error && <p role="alert">{t(`errors.${error}`)}</p>}
    </section>
  );
}
