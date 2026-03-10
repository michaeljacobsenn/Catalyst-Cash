-- Item-level sync tracking migration
-- Adds item_id to sync_data so each institution has its own cooldown timer

-- Add item_id column for per-institution tracking
ALTER TABLE sync_data ADD COLUMN item_id TEXT;

-- Create index for item-level lookups
CREATE INDEX IF NOT EXISTS idx_sync_data_item ON sync_data(user_id, item_id);
