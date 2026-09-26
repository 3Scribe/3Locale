import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectDetail } from "../domain/model";
import { api } from "./ImportPanel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function ProjectSettings({
  project,
  busy,
  run,
  onChanged,
  onDeleted,
}: {
  project: ProjectDetail;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  onChanged: (project: ProjectDetail) => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(project.name),
    [confirmation, setConfirmation] = useState(""),
    [language, setLanguage] = useState(""),
    [removeConfirmed, setRemoveConfirmed] = useState(false);
  const endpoint = `/api/projects/${project.id}/manage`;
  const targets = project.languages.filter(
    (value) => value !== project.baseLanguage,
  );
  return (
    <details className="my-5 rounded-xl border border-input p-5">
      <summary className="cursor-pointer font-semibold">
        {t("manage.title")}
      </summary>
      <div className="mt-4 space-y-6">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              onChanged(
                await api<ProjectDetail>(endpoint, {
                  action: "rename",
                  name,
                  expectedVersion: project.version,
                }),
              );
            });
          }}
        >
          <label className="block">
            {t("manage.name")}
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
              required
              maxLength={120}
            />
          </label>
          <Button
            disabled={busy || !name.trim() || name.trim() === project.name}
          >
            {t("manage.rename")}
          </Button>
        </form>
        <div className="space-y-3">
          <p>{t("manage.removeHint")}</p>
          {targets.length === 1 && <p>{t("errors.lastTargetLanguage")}</p>}
          <label className="block">
            {t("manage.language")}
            <select
              className="ms-3 rounded border p-2"
              value={language}
              disabled={busy || targets.length === 1}
              onChange={(event) => {
                setLanguage(event.target.value);
                setRemoveConfirmed(false);
              }}
            >
              <option value="">{t("manage.choose")}</option>
              {targets.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {language && (
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={removeConfirmed}
                disabled={busy || !language}
                onChange={(event) => setRemoveConfirmed(event.target.checked)}
              />
              {t("manage.removeConfirm", { language })}
            </label>
          )}
          <Button
            variant="outline"
            disabled={busy || !language || !removeConfirmed}
            onClick={() =>
              void run(async () => {
                onChanged(
                  await api<ProjectDetail>(endpoint, {
                    action: "removeLanguage",
                    language,
                    confirmed: true,
                    expectedVersion: project.version,
                  }),
                );
              })
            }
          >
            {t("manage.remove")}
          </Button>
        </div>
        <div className="space-y-3 border-t border-destructive pt-4">
          <p>{t("manage.deleteHint")}</p>
          <label className="block">
            {t("manage.typeName", { name: project.name })}
            <Input
              value={confirmation}
              disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <Button
            variant="destructive"
            disabled={busy || confirmation !== project.name}
            onClick={() =>
              void run(async () => {
                await api(endpoint, {
                  action: "delete",
                  confirmedName: confirmation,
                  expectedVersion: project.version,
                });
                onDeleted();
              })
            }
          >
            {t("manage.delete")}
          </Button>
        </div>
      </div>
    </details>
  );
}
export function DraftExport({
  project,
  language,
  busy,
  run,
}: {
  project: ProjectDetail;
  language: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false),
    [done, setDone] = useState(false);
  return (
    <details className="my-4 rounded border border-input p-4">
      <summary className="cursor-pointer">{t("draft.title")}</summary>
      <div className="mt-3 space-y-3">
        <p>{t("draft.hint")}</p>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          {t("draft.confirm", { language })}
        </label>
        <Button
          variant="outline"
          disabled={busy || !confirmed || !project.entries.length}
          onClick={() =>
            void run(async () => {
              setDone(false);
              const response = await fetch(
                `/api/projects/${project.id}/manage`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "exportDraft",
                    language,
                    confirmed: true,
                    expectedVersion: project.version,
                  }),
                },
              );
              if (!response.ok)
                throw new Error(
                  ((await response.json()) as { error: string }).error,
                );
              const url = URL.createObjectURL(await response.blob()),
                link = document.createElement("a");
              link.href = url;
              link.download = `${language}.draft.zip`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setConfirmed(false);
              setDone(true);
            })
          }
        >
          {t("draft.download")}
        </Button>
        {done && <p aria-live="polite">{t("draft.downloaded")}</p>}
      </div>
    </details>
  );
}
