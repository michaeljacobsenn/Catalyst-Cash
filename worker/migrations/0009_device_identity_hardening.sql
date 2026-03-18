ALTER TABLE identity_actors ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE identity_actors ADD COLUMN active_device_key_fingerprint TEXT;

CREATE TABLE IF NOT EXISTS identity_device_keys (
  key_fingerprint TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  public_key_jwk TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  replaced_by_key_fingerprint TEXT
);

CREATE INDEX IF NOT EXISTS idx_identity_device_keys_actor
  ON identity_device_keys(actor_id, status);

CREATE TABLE IF NOT EXISTS identity_bootstrap_challenges (
  challenge_id TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  public_key_fingerprint TEXT NOT NULL,
  public_key_jwk TEXT NOT NULL,
  verified_revenuecat_app_user_id TEXT,
  legacy_device_alias_hash TEXT,
  intent TEXT NOT NULL DEFAULT 'bootstrap',
  actor_id TEXT,
  current_key_fingerprint TEXT,
  next_key_fingerprint TEXT,
  next_public_key_jwk TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_identity_bootstrap_challenges_expiry
  ON identity_bootstrap_challenges(expires_at, used_at);
