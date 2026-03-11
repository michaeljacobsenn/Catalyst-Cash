-- Household Sync migration
CREATE TABLE IF NOT EXISTS household_sync (
  household_id TEXT PRIMARY KEY,
  encrypted_blob TEXT NOT NULL,
  last_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_household_sync_id ON household_sync(household_id);
