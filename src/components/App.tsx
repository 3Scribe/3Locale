import type { ImportPreview, ConflictPolicy } from "../application/imports";
import { ImportPanel, ImportSummary } from "./ImportPanel";
import { ProjectHistory } from "./ProjectHistory";
import { useEffect, useState, type SubmitEvent } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { createI18n } from "../i18n";
import {
  translationFor,
  isReady,
  languageProgress,
  type Entry,
  type Project,
  type ProjectDetail,
} from "../domain/model";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

async function request<T>(url: string, body?: unknown): Promise<T> {
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
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "unexpected");
  return result as T;
}
export default function App({ language }: { language: string }) {
  const [i18n] = useState(() => createI18n(language));
  return (
    <I18nextProvider i18n={i18n}>
      <Workspace />
    </I18nextProvider>
  );
}
function Workspace() {
  const { t, i18n } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<ProjectDetail>();
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [batchNotice, setBatchNotice] = useState<{
    preview: ImportPreview;
    policy: ConflictPolicy;
  }>();
  const [missingOnly, setMissingOnly] = useState(false);
  const [file, setFile] = useState<File>();
  function open(project: ProjectDetail) {
    setProject(project);
    setBatchNotice(undefined);
    setSelectedLanguage(
      project.languages.find((language) => language !== project.baseLanguage)!,
    );
    setDrafts({});
    setMissingOnly(false);
    setFile(undefined);
  }
  useEffect(() => {
    let active = true;
    request<Project[]>("/api/projects")
      .then((value) => {
        if (active) {
          setProjects(value);
          setBusy(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("unexpected");
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    setBatchNotice(undefined);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      const code = error instanceof Error ? error.message : "unexpected";
      setError(i18n.exists(`errors.${code}`) ? code : "unexpected");
    } finally {
      setBusy(false);
    }
  }
  function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const created = await request<ProjectDetail>("/api/projects", {
        name: data.get("name"),
        baseLanguage: data.get("baseLanguage"),
        targetLanguages: String(data.get("targetLanguages"))
          .split(",")
          .map((value) => value.trim()),
      });
      setProjects((previous) => [created, ...previous]);
      open(created);
      setNotice("created");
    });
  }
  function imported(
    value: ProjectDetail,
    preview: ImportPreview,
    policy: ConflictPolicy,
  ) {
    updated(value);
    setBatchNotice({ preview, policy });
  }
  function updated(value: ProjectDetail) {
    open(value);
    setProjects((previous) => [
      value,
      ...previous.filter((item) => item.id !== value.id),
    ]);
  }
  const targets =
    project?.languages.filter(
      (language) => language !== project.baseLanguage,
    ) ?? [];
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-4 border-b border-input pb-6">
        <a
          href={i18n.language === "ar" ? "/?lang=ar" : "/"}
          className="text-2xl font-bold tracking-tight"
        >
          {t("appName")}
        </a>
        <label className="flex items-center gap-3 text-sm">
          {t("uiLanguage")}
          <select
            value={i18n.language}
            onChange={(event) => {
              window.location.href = `/?lang=${event.target.value}`;
            }}
          >
            <option value="en">{t("english")}</option>
            <option value="ar">{t("arabic")}</option>
          </select>
        </label>
      </header>
      <div
        role="alert"
        className={
          error
            ? "mb-5 rounded-md border border-destructive p-4 text-destructive"
            : ""
        }
      >
        {error ? t(`errors.${error}`) : ""}
      </div>
      <p role="status" className="mb-4 text-sm text-primary">
        {busy ? t("working") : notice ? t(notice) : ""}
      </p>
      {batchNotice && (
        <section className="my-5 rounded border border-input p-5" role="status">
          <h2 className="font-semibold">{t("batch.complete")}</h2>
          <ImportSummary summary={batchNotice.preview.summary} />
          <p>{t(`batch.${batchNotice.policy}`)}</p>
        </section>
      )}
      {!project ? (
        <>
          <ImportPanel disabled={busy} onApplied={imported} />
          <h1 className="text-4xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>
          <div className="mt-10 grid gap-8 md:grid-cols-[1fr_1.2fr]">
            <section className="rounded-xl border border-input bg-white p-6">
              <h2 className="mb-6 text-xl font-semibold">{t("newProject")}</h2>
              <form onSubmit={create} className="space-y-5">
                <fieldset disabled={busy} className="space-y-5">
                  <label className="block space-y-2">
                    <span>{t("name")}</span>
                    <Input
                      name="name"
                      required
                      maxLength={120}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span>{t("baseLanguage")}</span>
                    <Input
                      name="baseLanguage"
                      required
                      defaultValue="en"
                      maxLength={35}
                      aria-describedby="language-hint"
                      dir="ltr"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span>{t("targetLanguages")}</span>
                    <Input
                      name="targetLanguages"
                      required
                      maxLength={3600}
                      aria-describedby="language-hint"
                      dir="ltr"
                    />
                  </label>
                  <p
                    id="language-hint"
                    className="text-sm text-muted-foreground"
                  >
                    {t("languageHint")}
                  </p>
                  <Button type="submit">{t("newProject")}</Button>
                </fieldset>
              </form>
            </section>
            <section>
              <h2 className="mb-5 text-xl font-semibold">{t("projects")}</h2>
              {!projects.length && (
                <p className="rounded-xl border border-dashed border-input p-8 text-muted-foreground">
                  {t("emptyProjects")}
                </p>
              )}
              <ul className="space-y-3">
                {projects.map((item) => (
                  <li key={item.id}>
                    <Button
                      variant="outline"
                      className="h-auto w-full justify-between gap-5 whitespace-normal p-5 text-start"
                      disabled={busy}
                      aria-label={t("openProject", { name: item.name })}
                      onClick={() =>
                        void run(async () =>
                          open(
                            await request<ProjectDetail>(
                              `/api/projects/${item.id}`,
                            ),
                          ),
                        )
                      }
                    >
                      <span className="font-semibold" dir="auto">
                        {item.name}
                      </span>
                      <span className="text-muted-foreground">
                        <bdi>{item.baseLanguage}</bdi> /{" "}
                        <bdi>
                          {item.languages
                            .filter(
                              (language) => language !== item.baseLanguage,
                            )
                            .join(", ")}
                        </bdi>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      ) : (
        <>
          <Button
            variant="link"
            className="mb-5 px-0"
            disabled={busy}
            onClick={() => {
              setProject(undefined);
              setBatchNotice(undefined);
              setFile(undefined);
              setNotice("");
              setDrafts({});
            }}
          >
            {t("back")}
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-semibold" dir="auto">
                {project.name}
              </h1>
              <p className="mt-3 text-muted-foreground">
                {t("baseLanguage")}: <bdi>{project.baseLanguage}</bdi>
              </p>
            </div>
            <Button
              disabled={busy || !project.entries.length}
              onClick={() =>
                void run(async () => {
                  const response = await fetch(
                    `/api/projects/${project.id}?export=true&language=${encodeURIComponent(selectedLanguage)}`,
                  );
                  if (!response.ok) {
                    const result = await response.json();
                    throw new Error(result.error);
                  }
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${selectedLanguage}.json`;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  setNotice("exported");
                })
              }
            >
              {t("export")}
            </Button>
          </div>
          <ImportPanel disabled={busy} project={project} onApplied={imported} />
          <ProjectHistory
            key={project.version}
            project={project}
            onRestored={updated}
          />
          <section className="my-6 space-y-4 rounded-xl border border-input bg-white p-5">
            <h2 className="text-lg font-semibold">{t("languages")}</h2>
            <ul className="space-y-2">
              {targets.map((language) => (
                <li key={language} dir="auto">
                  {t("languageProgress", {
                    language,
                    ...languageProgress(project, language),
                  })}
                </li>
              ))}
            </ul>
            <label className="flex flex-wrap items-center gap-3">
              {t("editingLanguage")}
              <select
                disabled={busy}
                value={selectedLanguage}
                onChange={(event) => {
                  setSelectedLanguage(event.target.value);
                  setNotice("");
                  setError("");
                }}
              >
                {targets.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </select>
            </label>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const language = String(new FormData(form).get("language"));
                void run(async () => {
                  const updated = await request<ProjectDetail>(
                    `/api/projects/${project.id}`,
                    { action: "addLanguage", language },
                  );
                  setProject(updated);
                  setProjects((previous) =>
                    previous.map((item) =>
                      item.id === updated.id ? updated : item,
                    ),
                  );
                  setNotice("languageAdded");
                  form.reset();
                });
              }}
            >
              <label className="space-y-2">
                <span className="block">{t("newLanguage")}</span>
                <Input
                  name="language"
                  required
                  maxLength={35}
                  dir="ltr"
                  disabled={busy}
                />
              </label>
              <Button variant="secondary" type="submit" disabled={busy}>
                {t("addLanguage")}
              </Button>
            </form>
          </section>
          <section className="my-8 rounded-xl border border-input bg-white p-5">
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  if (!file) return;
                  if (file.size > 1_000_000) throw new Error("tooLarge");
                  setProject(
                    await request<ProjectDetail>(
                      `/api/projects/${project.id}`,
                      { action: "import", text: await file.text() },
                    ),
                  );
                  setNotice("imported");
                });
              }}
            >
              <label className="min-w-0 flex-1 space-y-2">
                <span className="block font-medium">{t("file")}</span>
                <Input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy}
                  onChange={(event) => setFile(event.target.files?.[0])}
                  aria-describedby="import-hint"
                />
              </label>
              <Button
                variant="secondary"
                type="submit"
                disabled={busy || !file}
              >
                {t("import")}
              </Button>
            </form>
            <p id="import-hint" className="mt-3 text-sm text-muted-foreground">
              {t("importHint")}
            </p>
          </section>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <p>{t("progress", languageProgress(project, selectedLanguage))}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(event) => setMissingOnly(event.target.checked)}
              />
              {t("missingOnly")}
            </label>
          </div>
          {!project.entries.length && (
            <p className="py-12 text-center text-muted-foreground">
              {t("emptyEntries")}
            </p>
          )}
          <div className="space-y-4">
            {project.entries
              .filter(
                (entry) =>
                  !missingOnly ||
                  !isReady(translationFor(entry, selectedLanguage)),
              )
              .map((entry) => {
                const draftKey = `${selectedLanguage}:${entry.id}`;
                return (
                  <Editor
                    key={draftKey}
                    entry={entry}
                    baseLanguage={project.baseLanguage}
                    targetLanguage={selectedLanguage}
                    value={
                      drafts[draftKey] ??
                      translationFor(entry, selectedLanguage).value
                    }
                    onChange={(value) =>
                      setDrafts((previous) => ({
                        ...previous,
                        [draftKey]: value,
                      }))
                    }
                    busy={busy}
                    onSave={(value) =>
                      run(async () => {
                        setProject(
                          await request<ProjectDetail>(
                            `/api/projects/${project.id}`,
                            {
                              action: "translate",
                              entryId: entry.id,
                              language: selectedLanguage,
                              value,
                            },
                          ),
                        );
                        setDrafts((previous) => {
                          const updated = { ...previous };
                          delete updated[draftKey];
                          return updated;
                        });
                        setNotice("saved");
                      })
                    }
                  />
                );
              })}
          </div>
        </>
      )}
    </main>
  );
}
function Editor({
  entry,
  baseLanguage,
  targetLanguage,
  value,
  onChange,
  busy,
  onSave,
}: {
  entry: Entry;
  baseLanguage: string;
  targetLanguage: string;
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const translation = translationFor(entry, targetLanguage);
  const path = entry.path.map((segment) => JSON.stringify(segment)).join(" › ");
  return (
    <form
      className="rounded-xl border border-input bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(value);
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="break-all font-mono text-sm" dir="auto">
          {path}
        </h2>
        <span className="text-sm text-muted-foreground">
          {t(
            translation.needsReview
              ? "review"
              : translation.value.trim()
                ? "translated"
                : "untranslated",
          )}
        </span>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium">{t("baseText")}</p>
          <p
            className="whitespace-pre-wrap break-words rounded-md bg-background p-3"
            lang={baseLanguage}
            dir="auto"
          >
            {translationFor(entry, baseLanguage).value}
          </p>
        </div>
        <label className="min-w-0 space-y-2">
          <span className="text-sm font-medium">{t("translation")}</span>
          <Textarea
            aria-label={t("translationFor", { key: path })}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            maxLength={20000}
            disabled={busy}
            lang={targetLanguage}
            dir="auto"
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          variant="outline"
          disabled={busy}
          aria-label={t("saveFor", { key: path })}
        >
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
