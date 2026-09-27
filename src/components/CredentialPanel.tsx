import { useEffect, useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import type { CredentialMetadata } from "../domain/security";
import { api } from "./ImportPanel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
type Listing = { encryptionReady: boolean; credentials: CredentialMetadata[] };
export function CredentialPanel() {
  const { t } = useTranslation();
  const [listing, setListing] = useState<Listing>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    void api<Listing>("/api/credentials")
      .then(setListing)
      .catch(() => setError("unexpected"));
  }, []);
  async function run(body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setListing(await api<Listing>("/api/credentials", body));
      setNotice("credentials.saved");
      window.dispatchEvent(new Event("credentials-changed"));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "unexpected");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      id="provider-credentials"
      className="mb-6 rounded-xl border border-input p-5"
    >
      <summary className="cursor-pointer text-lg font-semibold">
        {t("credentials.title")}
      </summary>
      <div className="mt-4 space-y-4">
        <p>{t("credentials.hint")}</p>
        {listing && !listing.encryptionReady && (
          <p role="alert">{t("errors.encryptionConfiguration")}</p>
        )}
        {error && <p role="alert">{t(`errors.${error}`)}</p>}
        {notice && <p role="status">{t(notice)}</p>}
        {!listing ? (
          <p>{t("working")}</p>
        ) : (
          <>
            {listing.credentials.length === 0 && (
              <p>{t("credentials.empty")}</p>
            )}
            {listing.credentials.map((value) => (
              <CredentialForm
                key={`${value.id}:${value.version}`}
                value={value}
                ready={listing.encryptionReady}
                busy={busy}
                run={run}
              />
            ))}
            <CredentialForm
              key="new"
              ready={listing.encryptionReady}
              busy={busy}
              run={run}
            />
          </>
        )}
      </div>
    </details>
  );
}
function CredentialForm({
  value,
  ready,
  busy,
  run,
}: {
  value?: CredentialMetadata;
  ready: boolean;
  busy: boolean;
  run: (body: unknown) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(value?.name ?? ""),
    [secret, setSecret] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  async function save(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitted = secret;
    setSecret("");
    const okay = await run(
      value
        ? {
            action: "replace",
            id: value.id,
            version: value.version,
            name,
            ...(submitted ? { secret: submitted } : {}),
          }
        : { action: "create", name, secret: submitted },
    );
    if (okay && !value) setName("");
  }
  return (
    <section
      className="space-y-3 rounded-lg border border-input p-4"
      aria-label={value?.name ?? t("credentials.add")}
    >
      <h3 className="font-semibold">{value?.name ?? t("credentials.add")}</h3>
      {value && (
        <>
          <p>
            {t("credentials.masked")} · {t(`setup.states.${value.status}`)}
            {value.isDefault ? ` · ${t("credentials.default")}` : ""}
          </p>
          {value.verifiedAt && (
            <p>
              {t("setup.checked", {
                time: new Date(value.verifiedAt).toLocaleString(i18n.language),
              })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !ready}
              onClick={() =>
                void run({ action: "verify", id: value.id, confirmed: true })
              }
            >
              {t("credentials.test")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || value.isDefault}
              onClick={() => void run({ action: "default", id: value.id })}
            >
              {t("credentials.setDefault")}
            </Button>
          </div>
        </>
      )}
      <form className="space-y-3" onSubmit={save}>
        <label className="block">
          {t("credentials.name")}
          <Input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          {t(value ? "credentials.replacement" : "credentials.secret")}
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            required={!value}
            maxLength={4096}
            disabled={!ready}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        <Button disabled={busy || (!value && !ready)}>
          {t(value ? "credentials.save" : "credentials.add")}
        </Button>
      </form>
      {value && (
        <details>
          <summary className="cursor-pointer">
            {t("credentials.delete")}
          </summary>
          <p className="my-3">{t("credentials.deleteHint")}</p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t("credentials.confirmDelete", { name: value.name })}
          </label>
          <Button
            className="mt-3"
            variant="destructive"
            disabled={busy || !confirmed}
            onClick={() =>
              void run({
                action: "delete",
                id: value.id,
                version: value.version,
                confirmed: true,
              })
            }
          >
            {t("credentials.delete")}
          </Button>
        </details>
      )}
    </section>
  );
}
