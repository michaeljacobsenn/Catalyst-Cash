-- Plaid transaction cursor tracking
ALTER TABLE plaid_items ADD COLUMN transactions_cursor TEXT;
