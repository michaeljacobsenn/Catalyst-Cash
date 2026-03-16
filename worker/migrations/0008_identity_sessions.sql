CREATE TABLE IF NOT EXISTS identity_actors (
  actor_id TEXT PRIMARY KEY,
  revenuecat_app_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS identity_actor_aliases (
  alias_type TEXT NOT NULL,
  alias_hash TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alias_type, alias_hash)
);

CREATE INDEX IF NOT EXISTS idx_identity_actor_aliases_actor_id
  ON identity_actor_aliases(actor_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_actors_revenuecat_user
  ON identity_actors(revenuecat_app_user_id)
  WHERE revenuecat_app_user_id IS NOT NULL;
