CREATE TABLE IF NOT EXISTS telemetry_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('funnel', 'support')),
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  context_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_created_at
  ON telemetry_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_type_event
  ON telemetry_events(event_type, event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_device
  ON telemetry_events(device_id, created_at DESC);
