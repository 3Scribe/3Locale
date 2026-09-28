import { AuthenticationService } from "../application/authentication";
import {
  CredentialService,
  type ProviderFactory,
} from "../application/credentials";
import type { SecurityRepository } from "../domain/security";
import { WebCryptoVault } from "../providers/credential-crypto";
import { authenticationOrigin, WebAuthnAdapter } from "../providers/webauthn";
import { DeepLProvider } from "../providers/deepl";
export function composeSecurity(
  repository: SecurityRepository,
  originValue?: string,
  key?: string,
  factory: ProviderFactory = (_provider, secret) => new DeepLProvider(secret),
) {
  const origin = authenticationOrigin(originValue);
  return {
    origin,
    auth: new AuthenticationService(repository, new WebAuthnAdapter(origin)),
    credentials: new CredentialService(
      repository,
      new WebCryptoVault(key),
      factory,
    ),
  };
}
export const sessionCookie = "threeLocaleSession";
export const challengeCookie = "threeLocaleChallenge";
export function cookieOptions(origin: string, maxAge: number) {
  return {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}
