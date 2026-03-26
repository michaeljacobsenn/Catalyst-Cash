CREATE TABLE IF NOT EXISTS plaid_usage_daily (
  day_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source TEXT NOT NULL,
  balance_calls INTEGER NOT NULL DEFAULT 0,
  transaction_refresh_calls INTEGER NOT NULL DEFAULT 0,
  liability_calls INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (day_key, user_id, item_id, source)
);

CREATE INDEX IF NOT EXISTS idx_plaid_usage_daily_day_key ON plaid_usage_daily(day_key);
CREATE INDEX IF NOT EXISTS idx_plaid_usage_daily_user_id ON plaid_usage_daily(user_id);
