CREATE TABLE IF NOT EXISTS alert_outbox (
    telegram_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    offer_json TEXT NOT NULL,
    route_json TEXT,
    silent INTEGER NOT NULL DEFAULT 0,
    offer_summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
    lease_owner TEXT,
    lease_until INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    sent_at INTEGER,
    PRIMARY KEY (telegram_id, fingerprint),
    FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
    FOREIGN KEY (fingerprint) REFERENCES offers(fingerprint) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alert_outbox_due
ON alert_outbox(status, next_attempt_at, lease_until, created_at);

CREATE INDEX IF NOT EXISTS idx_alert_outbox_chat_sent
ON alert_outbox(chat_id, sent_at);
