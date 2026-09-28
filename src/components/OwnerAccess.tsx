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
    <main className="mx-auto max-w-lg space-y-5 p-6" dir={i18n.dir()}>
      <h1 className="text-2xl font-bold">{t("appName")}</h1>
      <a
        className="underline"
        href={`/?lang=${i18n.language === "ar" ? "en" : "ar"}`}
      >
        {t("switchLanguage")}
      </a>
      <h2 className="text-xl font-semibold">
        {t(setup ? "auth.setup" : "auth.login")}
      </h2>
      <p>{t(setup ? "auth.setupHint" : "auth.loginHint")}</p>
      {setup && <p>{t("auth.retention")}</p>}
      <form onSubmit={submit} className="space-y-4">
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
        <Button disabled={busy}>
          {busy ? t("working") : t(setup ? "auth.register" : "auth.signIn")}
        </Button>
      </form>
      {error && <p role="alert">{t(`errors.${error}`)}</p>}
    </main>
  );
}
export function OwnerSession() {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="mb-4 space-y-2">
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
