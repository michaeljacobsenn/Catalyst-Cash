CREATE TABLE IF NOT EXISTS recovery_vault_trusted_continuity (
  actor_id TEXT PRIMARY KEY,
  recovery_id TEXT NOT NULL,
  encrypted_recovery_key TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recovery_id) REFERENCES recovery_vault(recovery_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recovery_vault_trusted_continuity_recovery_id
  ON recovery_vault_trusted_continuity(recovery_id);
