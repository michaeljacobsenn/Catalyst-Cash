ALTER TABLE household_sync ADD COLUMN auth_token_hash TEXT;
ALTER TABLE household_sync ADD COLUMN integrity_tag TEXT;
ALTER TABLE household_sync ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE household_sync ADD COLUMN last_request_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_household_sync_auth_hash ON household_sync(auth_token_hash);
