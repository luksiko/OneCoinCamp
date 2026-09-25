ALTER TABLE offers ADD COLUMN last_seen_at TEXT;
UPDATE offers SET last_seen_at = found_at WHERE last_seen_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_offers_last_seen_at ON offers(last_seen_at);
