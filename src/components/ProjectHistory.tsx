import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditEvent, ProjectDetail, Revision } from "../domain/model";
import { Button } from "./ui/button";
import { api, ImportSummary } from "./ImportPanel";
export function ProjectHistory({
  project,
  onRestored,
}: {
  project: ProjectDetail;
  onRestored: (project: ProjectDetail) => void;
}) {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState<AuditEvent[]>();
  const [revisions, setRevisions] = useState<Revision[]>();
  const [selected, setSelected] = useState<number>();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/projects/${project.id}/imports`;
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
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(value));
  const detail = (value: unknown): string => {
    if (typeof value === "boolean") return t(value ? "review" : "translated");
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "value" in value)
      return String(value.value);
    return "";
  };
  return (
    <section
      className="my-6 space-y-4 rounded-xl border border-input bg-white p-5"
      aria-label={t("history.title")}
    >
      <h2 className="text-xl font-semibold">{t("history.title")}</h2>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          variant="outline"
          onClick={() =>
            void run(async () => {
              setEvents(await api<AuditEvent[]>(`${endpoint}?view=audit`));
              setRevisions(undefined);
            })
          }
        >
          {t("history.audit")}
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() =>
            void run(async () => {
              setRevisions(await api<Revision[]>(`${endpoint}?view=revisions`));
              setEvents(undefined);
            })
          }
        >
          {t("history.revisions")}
        </Button>
        <Button
          disabled={busy || !project.entries.length}
          variant="outline"
          onClick={() =>
            void run(async () => {
              const response = await fetch(`${endpoint}?view=archive`);
              if (!response.ok) throw new Error((await response.json()).error);
              const url = URL.createObjectURL(await response.blob());
              const link = document.createElement("a");
              link.href = url;
              link.download = "translations.zip";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            })
          }
        >
          {t("history.exportAll")}
        </Button>
      </div>
      {error && <p role="alert">{t(`errors.${error}`)}</p>}
      {events && (
        <div>
          <h3 className="font-semibold">{t("history.audit")}</h3>
          {!events.length && <p>{t("history.empty")}</p>}
          <ol>
            {events.map((event) => (
              <li
                key={event.id}
                className="my-4 space-y-2 border-b border-input pb-4"
              >
                <time dateTime={event.occurredAt}>
                  {date(event.occurredAt)}
                </time>
                <h4 className="font-medium">
                  {t(`history.events.${event.kind}`)}
                </h4>
                {event.language && (
                  <p>
                    <bdi>{event.language}</bdi>
                  </p>
                )}
                {event.path && (
                  <p dir="auto">
                    {event.path
                      .map((segment) => JSON.stringify(segment))
                      .join(" › ")}
                  </p>
                )}
                {event.previous !== undefined && (
                  <p>
                    {t("history.previous")}: <bdi>{detail(event.previous)}</bdi>
                  </p>
                )}
                {event.next !== undefined && (
                  <p>
                    {t("history.next")}: <bdi>{detail(event.next)}</bdi>
                  </p>
                )}
                {event.next &&
                typeof event.next === "object" &&
                "origin" in event.next ? (
                  <p>
                    {t("history.origin")}:{" "}
                    {t(`history.origins.${event.next.origin}`)}
                  </p>
                ) : null}
                {event.summary && <ImportSummary summary={event.summary} />}
                {event.policy && <p>{t(`batch.${event.policy}`)}</p>}
                {event.files && (
                  <ul>
                    {event.files.map((file) => (
                      <li key={file.language}>
                        <bdi>
                          {file.name}: {file.language}
                        </bdi>
                      </li>
                    ))}
                  </ul>
                )}
                {event.revisionId && (
                  <p>{t("history.revisionNumber", { id: event.revisionId })}</p>
                )}
              </li>
            ))}
          </ol>
          {events.length > 0 && events.length % 100 === 0 && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                void run(async () =>
                  setEvents([
                    ...events,
                    ...(await api<AuditEvent[]>(
                      `${endpoint}?view=audit&before=${events.at(-1)!.id}`,
                    )),
                  ]),
                )
              }
            >
              {t("history.more")}
            </Button>
          )}
        </div>
      )}
      {revisions && (
        <div className="space-y-3">
          <h3 className="font-semibold">{t("history.revisions")}</h3>
          <p>{t("history.retention")}</p>
          {!revisions.length && <p>{t("history.empty")}</p>}
          <ol>
            {revisions.map((revision) => (
              <li
                key={revision.id}
                className="my-3 flex flex-wrap items-center gap-3"
              >
                <span>
                  {t("history.revisionNumber", { id: revision.id })}:{" "}
                  {t(`history.${revision.kind}`)} — {date(revision.createdAt)}
                </span>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => {
                    setSelected(revision.id);
                    setConfirmed(false);
                  }}
                >
                  {t("history.restore")}
                </Button>
              </li>
            ))}
          </ol>
          {selected && (
            <div className="space-y-3 rounded border border-input p-4">
              <p>{t("history.warning", { id: selected })}</p>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={busy}
                />
                {t("history.confirm")}
              </label>
              <Button
                disabled={busy || !confirmed}
                onClick={() =>
                  void run(async () => {
                    const updated = await api<ProjectDetail>(endpoint, {
                      action: "restore",
                      revisionId: selected,
                      expectedVersion: project.version,
                      confirmed: true,
                    });
                    onRestored(updated);
                    setSelected(undefined);
                    setRevisions(
                      await api<Revision[]>(`${endpoint}?view=revisions`),
                    );
                  })
                }
              >
                {t("history.restoreConfirm")}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
