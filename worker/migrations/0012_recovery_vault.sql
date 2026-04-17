CREATE TABLE IF NOT EXISTS recovery_vault (
  recovery_id TEXT PRIMARY KEY,
  encrypted_blob TEXT NOT NULL,
  auth_token_hash TEXT NOT NULL,
  backup_kind TEXT,
  exported_at TEXT,
  last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recovery_vault_updated_at
  ON recovery_vault(last_updated_at);
