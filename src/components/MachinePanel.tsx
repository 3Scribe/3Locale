import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translationFor, type ProjectDetail } from "../domain/model";
import type {
  MachinePlan,
  MachineOutcome,
} from "../application/machine-translation";
import { api } from "./ImportPanel";
import { Button } from "./ui/button";
export function MachinePanel({
  project,
  language,
  busy,
  run,
  onApplied,
}: {
  project: ProjectDetail;
  language: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  onApplied: (project: ProjectDetail) => void;
}) {
  const { t, i18n } = useTranslation();
  const [entry, setEntry] = useState("");
  const [plan, setPlan] = useState<MachinePlan>();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [approveConfirm, setApproveConfirm] = useState(false);
  const [outcome, setOutcome] = useState<MachineOutcome>();
  const endpoint = `/api/projects/${project.id}/machine`;
  useEffect(() => {
    let active = true;
    setPlan(undefined);
    setError("");
    setConfirming(false);
    setConfirmed(false);
    setApproveConfirm(false);
    api<MachinePlan>(endpoint, {
      action: "preview",
      language,
      ...(entry ? { entryIds: [Number(entry)] } : {}),
    })
      .then((plan) => {
        if (active) setPlan(plan);
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error && i18n.exists(`errors.${error.message}`)
              ? error.message
              : "unexpected",
          );
      });
    return () => {
      active = false;
    };
  }, [endpoint, project.version, language, entry, i18n]);
  const machineCount = project.entries.filter((entry) => {
    const value = translationFor(entry, language);
    return value.origin === "machine" && value.needsReview;
  }).length;
  return (
    <section
      className="my-6 space-y-4 rounded-xl border border-input bg-white p-5"
      aria-label={t("machine.title")}
    >
      <h2 className="text-xl font-semibold">{t("machine.title")}</h2>
      {error && <p role="alert">{t(`errors.${error}`)}</p>}
      <label className="block space-y-2">
        <span>{t("machine.scope")}</span>
        <select
          className="ms-3 max-w-full rounded border border-input p-2"
          value={entry}
          disabled={busy}
          onChange={(e) => {
            setEntry(e.target.value);
            setOutcome(undefined);
          }}
        >
          <option value="">{t("machine.allMissing")}</option>
          {project.entries
            .filter((entry) => !translationFor(entry, language).value.trim())
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.path
                  .map((segment) => JSON.stringify(segment))
                  .join(" › ")}
              </option>
            ))}
        </select>
      </label>
      {plan && (
        <>
          <p>{t("machine.provider", { provider: plan.displayName })}</p>
          <p>
            {t("machine.direction", {
              source: plan.sourceLanguage,
              target: plan.targetLanguage,
            })}
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(plan.summary).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4">
                <dt>{t(`machine.counts.${key}`)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {!plan.configured ? (
            <p>{t("errors.machineNotConfigured")}</p>
          ) : !plan.supported ? (
            <p>{t("errors.machineUnsupported")}</p>
          ) : (
            <Button
              disabled={busy || !plan.summary.eligible}
              onClick={() => {
                setConfirming(true);
                setConfirmed(false);
              }}
            >
              {t("machine.translateMissing")}
            </Button>
          )}
          {confirming && (
            <div className="space-y-3 rounded border border-input p-4">
              <p>
                {t("machine.warning", {
                  provider: plan.displayName,
                  target: language,
                  count: plan.summary.eligible,
                  characters: plan.summary.sourceCharacters,
                })}
              </p>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {t("machine.confirm")}
              </label>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    setConfirmed(false);
                  }}
                >
                  {t("machine.cancel")}
                </Button>
                <Button
                  disabled={busy || !confirmed}
                  onClick={() =>
                    void run(async () => {
                      const result = await api<MachineOutcome>(endpoint, {
                        action: "apply",
                        language,
                        entryIds: plan.entryIds,
                        expectedVersion: plan.version,
                        provider: plan.provider,
                        confirmed: true,
                      });
                      setOutcome(result);
                      if (result.translated) setEntry("");
                      setConfirming(false);
                      setConfirmed(false);
                      onApplied(result.project);
                    })
                  }
                >
                  {busy ? t("machine.working") : t("machine.translateConfirm")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {outcome && (
        <div role="status">
          <p>
            {t("machine.result", {
              translated: outcome.translated,
              failed: outcome.failures.length,
            })}
          </p>
          {outcome.billedCharacters !== undefined && (
            <p>
              {t("machine.billedCharacters", {
                count: outcome.billedCharacters,
              })}
            </p>
          )}
          <ul>
            {outcome.failures.map((failure) => (
              <li key={failure.id}>
                <bdi>
                  {failure.path
                    .map((segment) => JSON.stringify(segment))
                    .join(" › ")}
                </bdi>
                : {t(`errors.${failure.code}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {machineCount > 0 && (
        <div className="space-y-3">
          <label className="flex gap-2">
            <input
              type="checkbox"
              disabled={busy}
              checked={approveConfirm}
              onChange={(e) => setApproveConfirm(e.target.checked)}
            />
            {t("machine.approveWarning", { count: machineCount })}
          </label>
          <Button
            variant="outline"
            disabled={busy || !approveConfirm}
            onClick={() =>
              void run(async () => {
                onApplied(
                  await api<ProjectDetail>(endpoint, {
                    action: "approve",
                    language,
                    expectedVersion: project.version,
                    confirmed: true,
                  }),
                );
                setApproveConfirm(false);
                setOutcome(undefined);
              })
            }
          >
            {t("machine.approveAll")}
          </Button>
        </div>
      )}
    </section>
  );
}
