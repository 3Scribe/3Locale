import { AppError } from "../domain/model";
import type { Owner, SecurityRepository } from "../domain/security";
export interface AuthenticationPrimitives {
  token(): string;
  hash(value: string): Promise<string>;
  registration(
    ownerId: string,
    name: string,
  ): Promise<{ challenge: string; options: unknown }>;
  authentication(): Promise<{ challenge: string; options: unknown }>;
  register(
    response: unknown,
    challenge: string,
  ): Promise<Pick<Owner, "credentialId" | "publicKey" | "counter">>;
  authenticate(
    response: unknown,
    challenge: string,
    owner: Owner,
  ): Promise<number>;
}
export class AuthenticationService {
  constructor(
    private repository: SecurityRepository,
    private primitives: AuthenticationPrimitives,
    private now = () => Date.now(),
  ) {}
  async status(token?: string) {
    const owner = await this.repository.owner();
    const identity = await this.identity(token);
    return {
      setup: !owner,
      authenticated: Boolean(identity),
      name: identity ? owner?.name : undefined,
    };
  }
  async identity(token?: string) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const session = await this.repository.findSession(
      await this.primitives.hash(token),
      this.now(),
    );
    return session ? { ownerId: session.ownerId } : undefined;
  }
  async begin(purpose: "setup" | "login", name = "") {
    const owner = await this.repository.owner();
    if (purpose === "setup" && owner) throw new AppError("setupComplete", 409);
    if (purpose === "login" && !owner) throw new AppError("setupRequired", 409);
    if (purpose === "setup" && (!name.trim() || name.trim().length > 120))
      throw new AppError("invalidRequest");
    const ownerId = owner?.id ?? crypto.randomUUID();
    const result =
      purpose === "setup"
        ? await this.primitives.registration(ownerId, name.trim())
        : await this.primitives.authentication();
    const token = this.primitives.token();
    await this.repository.challenge(
      {
        hash: await this.primitives.hash(token),
        challenge: result.challenge,
        purpose,
        ownerId,
        name: name.trim(),
        expires: this.now() + 300000,
      },
      this.now(),
    );
    return { token, options: result.options };
  }
  async finish(
    token: string | undefined,
    purpose: "setup" | "login",
    response: unknown,
  ) {
    if (!token) throw new AppError("authenticationFailed", 401);
    const challenge = await this.repository.consumeChallenge(
      await this.primitives.hash(token),
      this.now(),
    );
    if (!challenge || challenge.purpose !== purpose)
      throw new AppError("authenticationFailed", 401);
    const owner = await this.repository.owner();
    if (purpose === "setup") {
      if (owner) throw new AppError("setupComplete", 409);
      const verified = await this.primitives.register(
        response,
        challenge.challenge,
      );
      if (
        !(await this.repository.createOwner({
          id: challenge.ownerId,
          name: challenge.name,
          ...verified,
        }))
      )
        throw new AppError("setupComplete", 409);
    } else {
      if (!owner || owner.id !== challenge.ownerId)
        throw new AppError("authenticationFailed", 401);
      const counter = await this.primitives.authenticate(
        response,
        challenge.challenge,
        owner,
      );
      if (
        !(await this.repository.updateCounter(owner.id, owner.counter, counter))
      )
        throw new AppError("authenticationFailed", 401);
    }
    const sessionToken = this.primitives.token();
    await this.repository.session(
      {
        hash: await this.primitives.hash(sessionToken),
        ownerId: challenge.ownerId,
        expires: this.now() + 7 * 86400000,
      },
      this.now(),
    );
    return sessionToken;
  }
  async logout(token?: string) {
    if (token)
      await this.repository.deleteSession(await this.primitives.hash(token));
  }
}
// Community's permission policy is distinct from proof of identity.
export function authorizeOwner(identity: { ownerId: string } | undefined) {
  if (!identity) throw new AppError("authenticationRequired", 401);
  return identity;
}
