export interface Owner {
  id: string;
  name: string;
  credentialId: string;
  publicKey: string;
  counter: number;
}
export interface Challenge {
  hash: string;
  challenge: string;
  purpose: "setup" | "login";
  ownerId: string;
  name: string;
  expires: number;
}
export interface Session {
  hash: string;
  ownerId: string;
  expires: number;
}
export interface SealedSecret {
  ciphertext: string;
  iv: string;
  algorithm: "AES-256-GCM-v1";
}
export interface ProviderCredential extends SealedSecret {
  id: string;
  provider: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  checkedAt: string | null;
  status: string;
  isDefault: boolean;
}
export type CredentialMetadata = Omit<ProviderCredential, keyof SealedSecret>;
export interface SecretVault {
  readonly configured: boolean;
  seal(value: string, id: string, provider: string): Promise<SealedSecret>;
  open(value: ProviderCredential): Promise<string>;
}
export interface SecurityRepository {
  owner(): Promise<Owner | undefined>;
  createOwner(owner: Owner): Promise<boolean>;
  updateCounter(id: string, previous: number, next: number): Promise<boolean>;
  challenge(value: Challenge, now: number): Promise<void>;
  consumeChallenge(hash: string, now: number): Promise<Challenge | undefined>;
  session(value: Session, now: number): Promise<void>;
  findSession(hash: string, now: number): Promise<Session | undefined>;
  deleteSession(hash: string): Promise<void>;
  credentials(): Promise<ProviderCredential[]>;
  credential(id: string): Promise<ProviderCredential | undefined>;
  saveCredential(
    value: ProviderCredential,
    expectedVersion?: number,
  ): Promise<void>;
  deleteCredential(id: string, expectedVersion: number): Promise<void>;
  setDefault(id: string): Promise<void>;
  verifyCredential(
    id: string,
    version: number,
    status: string,
    time: string,
  ): Promise<void>;
}
