import { AppError } from "../domain/model";
import type {
  Challenge,
  Owner,
  ProviderCredential,
  SecurityRepository,
  Session,
} from "../domain/security";

export interface SecuritySql {
  rows<T>(sql: string, values?: (string | number | null)[]): Promise<T[]>;
}
// Every security mutation is one parameterised statement on both runtimes.
export class SqlSecurityRepository implements SecurityRepository {
  constructor(private sql: SecuritySql) {}
  async owner() {
    return (
      await this.sql.rows<Owner>(
        "SELECT id,name,credentialId,publicKey,counter FROM community_owner WHERE slot=1",
      )
    )[0];
  }
  async createOwner(o: Owner) {
    return (
      (
        await this.sql.rows(
          "INSERT INTO community_owner(slot,id,name,credentialId,publicKey,counter) VALUES(1,?,?,?,?,?) ON CONFLICT(slot) DO NOTHING RETURNING id",
          [o.id, o.name, o.credentialId, o.publicKey, o.counter],
        )
      ).length === 1
    );
  }
  async updateCounter(id: string, previous: number, next: number) {
    return (
      (
        await this.sql.rows(
          "UPDATE community_owner SET counter=? WHERE id=? AND counter=? RETURNING id",
          [next, id, previous],
        )
      ).length === 1
    );
  }
  async challenge(v: Challenge, now: number) {
    await this.sql.rows("DELETE FROM auth_challenges WHERE expires<=?", [now]);
    const rows = await this.sql.rows(
      "INSERT INTO auth_challenges(hash,challenge,purpose,ownerId,name,expires) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM auth_challenges)<1000 RETURNING hash",
      [v.hash, v.challenge, v.purpose, v.ownerId, v.name, v.expires],
    );
    if (!rows.length) throw new AppError("authBusy", 429);
  }
  async consumeChallenge(hash: string, now: number) {
    const v = (
      await this.sql.rows<Challenge>(
        "DELETE FROM auth_challenges WHERE hash=? RETURNING *",
        [hash],
      )
    )[0];
    return v && v.expires > now ? v : undefined;
  }
  async session(v: Session, now: number) {
    await this.sql.rows("DELETE FROM auth_sessions WHERE expires<=?", [now]);
    await this.sql.rows(
      "INSERT INTO auth_sessions(hash,ownerId,expires) VALUES(?,?,?)",
      [v.hash, v.ownerId, v.expires],
    );
  }
  async findSession(hash: string, now: number) {
    return (
      await this.sql.rows<Session>(
        "SELECT * FROM auth_sessions WHERE hash=? AND expires>?",
        [hash, now],
      )
    )[0];
  }
  async deleteSession(hash: string) {
    await this.sql.rows("DELETE FROM auth_sessions WHERE hash=?", [hash]);
  }
  async credentials() {
    return (
      await this.sql.rows<ProviderCredential>(
        "SELECT c.*, CASE WHEN d.credentialId=c.id THEN 1 ELSE 0 END AS isDefault FROM provider_credentials c LEFT JOIN provider_defaults d ON c.provider=d.provider ORDER BY c.createdAt,c.id",
      )
    ).map((v) => ({ ...v, isDefault: Boolean(v.isDefault) }));
  }
  async credential(id: string) {
    return (await this.credentials()).find((v) => v.id === id);
  }
  async saveCredential(v: ProviderCredential, expectedVersion?: number) {
    if (expectedVersion === undefined) {
      await this.sql.rows(
        "INSERT INTO provider_credentials(id,provider,name,ciphertext,iv,algorithm,version,createdAt,updatedAt,checkedAt,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [
          v.id,
          v.provider,
          v.name,
          v.ciphertext,
          v.iv,
          v.algorithm,
          v.version,
          v.createdAt,
          v.updatedAt,
          v.checkedAt,
          v.status,
        ],
      );
    } else {
      const rows = await this.sql.rows(
        "UPDATE provider_credentials SET name=?,ciphertext=?,iv=?,algorithm=?,version=?,updatedAt=?,checkedAt=?,status=? WHERE id=? AND version=? RETURNING id",
        [
          v.name,
          v.ciphertext,
          v.iv,
          v.algorithm,
          v.version,
          v.updatedAt,
          v.checkedAt,
          v.status,
          v.id,
          expectedVersion,
        ],
      );
      if (!rows.length) throw new AppError("staleCredential", 409);
    }
  }
  async deleteCredential(id: string, version: number) {
    if (
      !(
        await this.sql.rows(
          "DELETE FROM provider_credentials WHERE id=? AND version=? RETURNING id",
          [id, version],
        )
      ).length
    )
      throw new AppError("staleCredential", 409);
  }
  async setDefault(id: string) {
    if (
      !(
        await this.sql.rows(
          "INSERT INTO provider_defaults(provider,credentialId) SELECT provider,id FROM provider_credentials WHERE id=? ON CONFLICT(provider) DO UPDATE SET credentialId=excluded.credentialId RETURNING credentialId",
          [id],
        )
      ).length
    )
      throw new AppError("credentialMissing", 404);
  }
  async verifyCredential(
    id: string,
    version: number,
    status: string,
    time: string,
  ) {
    if (
      !(
        await this.sql.rows(
          "UPDATE provider_credentials SET status=?,checkedAt=? WHERE id=? AND version=? RETURNING id",
          [status, time, id, version],
        )
      ).length
    )
      throw new AppError("staleCredential", 409);
  }
}
