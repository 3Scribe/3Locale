import { useEffect, useState, type SubmitEvent } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { createI18n } from "../i18n";
import type { Entry, Project, ProjectDetail } from "../domain/model";
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
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [file, setFile] = useState<File>();
  const report = (error: unknown) => {
    const code = error instanceof Error ? error.message : "unexpected";
    setError(i18n.exists(`errors.${code}`) ? code : "unexpected");
  };
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const created = await request<ProjectDetail>(
        "/api/projects",
        Object.fromEntries(data),
      );
      setProjects((previous) => [created, ...previous]);
      setProject(created);
      setNotice("created");
    });
  }
  const ready =
    project?.entries.filter(
      (entry) => entry.translation.trim() && !entry.needsReview,
    ).length ?? 0;
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
      {!project ? (
        <>
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
                    <span>{t("sourceLanguage")}</span>
                    <Input
                      name="sourceLanguage"
                      required
                      defaultValue="en"
                      maxLength={35}
                      aria-describedby="language-hint"
                      dir="ltr"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span>{t("targetLanguage")}</span>
                    <Input
                      name="targetLanguage"
                      required
                      maxLength={35}
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
                        void run(async () => {
                          setProject(
                            await request<ProjectDetail>(
                              `/api/projects/${item.id}`,
                            ),
                          );
                          setFile(undefined);
                          setMissingOnly(false);
                        })
                      }
                    >
                      <span className="font-semibold" dir="auto">
                        {item.name}
                      </span>
                      <span className="text-muted-foreground">
                        <bdi>{item.sourceLanguage}</bdi> /{" "}
                        <bdi>{item.targetLanguage}</bdi>
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
              setFile(undefined);
              setNotice("");
              setMissingOnly(false);
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
                {t("sourceLanguage")}: <bdi>{project.sourceLanguage}</bdi> ·{" "}
                {t("targetLanguage")}: <bdi>{project.targetLanguage}</bdi>
              </p>
            </div>
            <Button
              disabled={busy || !project.entries.length}
              onClick={() =>
                void run(async () => {
                  const response = await fetch(
                    `/api/projects/${project.id}?export=true`,
                  );
                  if (!response.ok) {
                    const result = await response.json();
                    throw new Error(result.error);
                  }
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `${project.targetLanguage}.json`;
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  setNotice("exported");
                })
              }
            >
              {t("export")}
            </Button>
          </div>
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
            <p>
              {t("progress", {
                translated: ready,
                total: project.entries.length,
              })}
            </p>
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
                  !entry.translation.trim() ||
                  entry.needsReview,
              )
              .map((entry) => (
                <Editor
                  key={entry.key}
                  entry={entry}
                  sourceLanguage={project.sourceLanguage}
                  targetLanguage={project.targetLanguage}
                  busy={busy}
                  onSave={(value) =>
                    run(async () => {
                      setProject(
                        await request<ProjectDetail>(
                          `/api/projects/${project.id}`,
                          { action: "translate", key: entry.key, value },
                        ),
                      );
                      setNotice("saved");
                    })
                  }
                />
              ))}
          </div>
        </>
      )}
    </main>
  );
}
function Editor({
  entry,
  sourceLanguage,
  targetLanguage,
  busy,
  onSave,
}: {
  entry: Entry;
  sourceLanguage: string;
  targetLanguage: string;
  busy: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(entry.translation);
  return (
    <form
      className="rounded-xl border border-input bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(value);
      }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-sm" dir="auto">
          {entry.key}
        </h2>
        <span className="text-sm text-muted-foreground">
          {t(
            entry.needsReview
              ? "review"
              : entry.translation.trim()
                ? "translated"
                : "untranslated",
          )}
        </span>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">{t("source")}</p>
          <p
            className="whitespace-pre-wrap break-words rounded-md bg-background p-3"
            lang={sourceLanguage}
            dir="auto"
          >
            {entry.source}
          </p>
        </div>
        <label className="space-y-2">
          <span className="text-sm font-medium">{t("translation")}</span>
          <Textarea
            aria-label={t("translationFor", { key: entry.key })}
            value={value}
            onChange={(event) => setValue(event.target.value)}
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
          aria-label={t("saveFor", { key: entry.key })}
        >
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
