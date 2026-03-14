-- response_preview is already stored as TEXT, so the 600-character extension
-- is enforced in application logic. This migration adds the new audit-review
-- fields surfaced by the admin endpoint.
ALTER TABLE audit_log ADD COLUMN confidence TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE audit_log ADD COLUMN drift_warning INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_log ADD COLUMN drift_details TEXT NOT NULL DEFAULT '[]';
