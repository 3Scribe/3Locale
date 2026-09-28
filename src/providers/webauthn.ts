import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import type { AuthenticationPrimitives } from "../application/authentication";
import type { Owner } from "../domain/security";
import { AppError } from "../domain/model";
import { encode, decode, randomToken, tokenHash } from "./credential-crypto";
export function authenticationOrigin(value: string | undefined): string {
  try {
    const url = new URL(value ?? "http://localhost:4321");
    if (url.origin !== value && value !== undefined) throw new Error();
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && url.hostname === "localhost")
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new AppError("authConfiguration", 503);
  }
}
export class WebAuthnAdapter implements AuthenticationPrimitives {
  token = randomToken;
  hash = tokenHash;
  private rpID: string;
  constructor(private origin: string) {
    this.rpID = new URL(origin).hostname;
  }
  async registration(ownerId: string, name: string) {
    const options = await generateRegistrationOptions({
      rpName: "3Locale",
      rpID: this.rpID,
      userName: name,
      userDisplayName: name,
      userID: new TextEncoder().encode(ownerId),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    return { challenge: options.challenge, options };
  }
  async authentication() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: "required",
    });
    return { challenge: options.challenge, options };
  }
  async register(response: unknown, challenge: string) {
    try {
      const result = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });
      if (!result.verified || !result.registrationInfo) throw new Error();
      const credential = result.registrationInfo.credential;
      return {
        credentialId: credential.id,
        publicKey: encode(credential.publicKey),
        counter: credential.counter,
      };
    } catch {
      throw new AppError("authenticationFailed", 401);
    }
  }
  async authenticate(response: unknown, challenge: string, owner: Owner) {
    try {
      const assertion = response as AuthenticationResponseJSON;
      if (assertion.id !== owner.credentialId) throw new Error();
      const expectedHandle = encode(new TextEncoder().encode(owner.id))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      if (
        assertion.response.userHandle &&
        assertion.response.userHandle !== expectedHandle
      )
        throw new Error();
      const result = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: owner.credentialId,
          publicKey: decode(owner.publicKey),
          counter: owner.counter,
        },
        requireUserVerification: true,
      });
      if (!result.verified) throw new Error();
      return result.authenticationInfo.newCounter;
    } catch {
      throw new AppError("authenticationFailed", 401);
    }
  }
}
