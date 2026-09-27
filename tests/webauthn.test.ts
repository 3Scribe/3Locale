import { expect, it } from "vitest";
import {
  authenticationOrigin,
  WebAuthnAdapter,
} from "../src/providers/webauthn";
import { cookieOptions } from "../src/server/security";
it("rejects insecure remote origins and binds generated passkey options to the configured host", async () => {
  for (const origin of [
    "http://example.com",
    "http://127.0.0.1:4321",
    "https://example.com/path",
    "https://example.com/",
  ])
    expect(() => authenticationOrigin(origin)).toThrow();
  const adapter = new WebAuthnAdapter(
    authenticationOrigin("https://locale.example.com"),
  );
  const registration = await adapter.registration(crypto.randomUUID(), "Owner");
  expect(registration.options.rp.id).toBe("locale.example.com");
  expect(registration.options.authenticatorSelection?.userVerification).toBe(
    "required",
  );
  expect(cookieOptions("https://locale.example.com", 300)).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "strict",
  });
  await expect(
    adapter.register({ id: "invalid" }, registration.challenge),
  ).rejects.toMatchObject({ code: "authenticationFailed" });
  expect(authenticationOrigin(undefined)).toBe("http://localhost:4321");
});
