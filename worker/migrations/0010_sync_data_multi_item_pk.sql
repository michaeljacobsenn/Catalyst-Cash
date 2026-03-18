-- Repair sync_data schema for multi-item Plaid sync caching.
-- Historical schema used user_id as the only primary key, but the live code
-- now stores one cache row per (user_id, item_id).

PRAGMA foreign_keys=off;

CREATE TABLE IF NOT EXISTS sync_data_new (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  balances_json TEXT,
  liabilities_json TEXT,
  transactions_json TEXT,
  last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id)
);

INSERT OR REPLACE INTO sync_data_new (
  user_id,
  item_id,
  balances_json,
  liabilities_json,
  transactions_json,
  last_synced_at
)
SELECT
  user_id,
  COALESCE(NULLIF(item_id, ''), 'default') AS item_id,
  balances_json,
  liabilities_json,
  transactions_json,
  last_synced_at
FROM sync_data;

DROP TABLE sync_data;
ALTER TABLE sync_data_new RENAME TO sync_data;

CREATE INDEX IF NOT EXISTS idx_sync_data_user_id ON sync_data(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_data_last_synced_at ON sync_data(last_synced_at);

PRAGMA foreign_keys=on;
