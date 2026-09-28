
CREATE TABLE community_owner (
 slot INTEGER PRIMARY KEY CHECK (slot = 1),
 id TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 credentialId TEXT NOT NULL UNIQUE,
 publicKey TEXT NOT NULL,
 counter INTEGER NOT NULL
);
CREATE TABLE auth_challenges (
 hash TEXT PRIMARY KEY,
 challenge TEXT NOT NULL,
 purpose TEXT NOT NULL,
 ownerId TEXT NOT NULL,
 name TEXT NOT NULL,
 expires INTEGER NOT NULL
);
CREATE INDEX auth_challenges_expiry ON auth_challenges(expires);
CREATE TABLE auth_sessions (
 hash TEXT PRIMARY KEY,
 ownerId TEXT NOT NULL REFERENCES community_owner(id) ON DELETE CASCADE,
 expires INTEGER NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires);
CREATE TABLE provider_credentials (
 id TEXT PRIMARY KEY,
 provider TEXT NOT NULL,
 name TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 iv TEXT NOT NULL,
 algorithm TEXT NOT NULL,
 version INTEGER NOT NULL,
 createdAt TEXT NOT NULL,
 updatedAt TEXT NOT NULL,
 checkedAt TEXT,
 status TEXT NOT NULL,
 UNIQUE (provider, id)
);
CREATE TABLE provider_defaults (
 provider TEXT PRIMARY KEY,
 credentialId TEXT NOT NULL,
 FOREIGN KEY (provider, credentialId) REFERENCES provider_credentials(provider, id) ON DELETE CASCADE
);
