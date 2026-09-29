import { useState, type SubmitEvent } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import {
  startRegistration,
  startAuthentication,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { createI18n } from "../i18n";
import { api } from "./ImportPanel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
export default function OwnerAccess({
  language,
  setup,
}: {
  language: string;
  setup: boolean;
}) {
  const [i18n] = useState(() => createI18n(language));
  return (
    <I18nextProvider i18n={i18n}>
      <Access setup={setup} />
    </I18nextProvider>
  );
}
function Access({ setup }: { setup: boolean }) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const purpose = setup ? "setup" : "login";
      const options = await api<
        PublicKeyCredentialCreationOptionsJSON &
          PublicKeyCredentialRequestOptionsJSON
      >("/api/auth", { action: "begin", purpose, ...(setup ? { name } : {}) });
      const response = setup
        ? await startRegistration({ optionsJSON: options })
        : await startAuthentication({ optionsJSON: options });
      await api("/api/auth", { action: "finish", purpose, response });
      window.location.reload();
    } catch (e) {
      const code = e instanceof Error ? e.message : "authenticationFailed";
      setError(
        [
          "setupComplete",
          "setupRequired",
          "authBusy",
          "authConfiguration",
        ].includes(code)
          ? code
          : "authenticationFailed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className="mx-auto grid min-h-dvh max-w-lg grid-rows-[1fr_auto_1fr] justify-items-center p-6"
      dir={i18n.dir()}
    >
      <section
        className="row-start-2 w-full space-y-5 rounded-xl border border-input p-6 text-center"
        aria-labelledby="access-title"
      >
        <header className="space-y-1">
          <h1
            className="flex items-center justify-center gap-3 text-3xl font-semibold"
            id="access-title"
          >
            <img
              src="/logo.svg"
              alt=""
              width="48"
              height="48"
              className="size-12 shrink-0"
            />
            {t("appName")}
          </h1>
          <h2 className="pb-8 text-xl font-semibold">
            {t(setup ? "auth.setup" : "auth.login")}
          </h2>
        </header>
        {setup && <p>{t("auth.setupHint")}</p>}
        {setup && <p>{t("auth.retention")}</p>}
        <form onSubmit={submit} className="flex flex-col items-center gap-4">
          {setup && (
            <label className="block">
              {t("auth.name")}
              <Input
                required
                maxLength={120}
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <Button disabled={busy} className="min-w-1/2 text-white">
            {busy ? t("working") : t(setup ? "auth.register" : "auth.signIn")}
          </Button>
        </form>
        {!setup && (
          <p className="text-sm text-slate-500">{t("auth.loginHint")}</p>
        )}
        {error && <p role="alert">{t(`errors.${error}`)}</p>}
      </section>
      <div className="row-start-3 mt-6 self-start">
        <Select
          value={i18n.language}
          dir={i18n.dir()}
          onValueChange={(language) => {
            window.location.href = `/?lang=${language}`;
          }}
        >
          <SelectTrigger
            aria-label={t("uiLanguage")}
            className="min-w-[16em] text-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="text-sm">
            <SelectItem value="en">{t("english")}</SelectItem>
            <SelectItem value="ar">{t("arabic")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </main>
  );
}
export function OwnerSession({
  className = "mb-4 space-y-2",
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className={className}>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void api("/api/auth", { action: "logout" })
            .then(() => window.location.reload())
            .catch(() => setFailed(true))
            .finally(() => setBusy(false));
        }}
      >
        {t("auth.logout")}
      </Button>
      {failed && <p role="alert">{t("errors.unexpected")}</p>}
    </div>
  );
}
