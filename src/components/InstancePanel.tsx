import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InstanceStatus } from "../application/instance";
import { Button } from "./ui/button";
import { api } from "./ImportPanel";
export function InstancePanel() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<InstanceStatus>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    api<InstanceStatus>("/api/instance")
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section
      id="instance-setup"
      aria-label={t("setup.title")}
      className="mb-6 space-y-3 rounded-xl border border-input p-5"
    >
      <h2 className="text-lg font-semibold">{t("setup.title")}</h2>
      <p aria-live="polite">
        {failed
          ? t("setup.failed")
          : !status
            ? t("working")
            : t(`setup.storage.${status.storage}`)}
      </p>
      <p className="text-sm">{t("setup.security")}</p>
      {failed || status?.storage === "unavailable" ? (
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("setup.reload")}
        </Button>
      ) : null}
      {status && (
        <>
          <p aria-live="polite">
            {t("machine.provider", { provider: status.provider.displayName })} ·{" "}
            {t(`setup.states.${status.provider.state}`)}
          </p>
          {status.provider.checkedAt && (
            <p className="text-sm">
              {t("setup.checked", {
                time: new Date(status.provider.checkedAt).toLocaleString(
                  i18n.language,
                ),
              })}
            </p>
          )}
          <details>
            <summary className="cursor-pointer font-medium">
              {t("setup.instructions")}
            </summary>
            <div className="mt-3 space-y-3">
              <p>{t("setup.optional")}</p>
              <p>{t(`setup.${status.runtime}`)}</p>
              {status.runtime === "cloudflare" && (
                <code className="block break-all">{t("setup.command")}</code>
              )}
              <p>{t("setup.checkHint")}</p>
              <Button
                disabled={busy || status.provider.state === "missing"}
                onClick={() => {
                  setBusy(true);
                  setFailed(false);
                  void api<InstanceStatus>("/api/instance", {
                    action: "checkProvider",
                    confirmed: true,
                  })
                    .then(setStatus)
                    .catch(() => setFailed(true))
                    .finally(() => setBusy(false));
                }}
              >
                {busy ? t("working") : t("setup.check")}
              </Button>
              <a
                className="block underline"
                href="https://github.com/3Scribe/3Locale/blob/main/docs/DEPLOYMENT.md#optional-automatic-translation-byok"
                target="_blank"
                rel="noreferrer"
              >
                {t("setup.guide")}
              </a>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                {t("setup.reload")}
              </Button>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
