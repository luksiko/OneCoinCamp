-- Camper Monitor Cloudflare D1 Database Schema

CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    username TEXT,
    first_name TEXT,
    status TEXT DEFAULT 'active',
    language TEXT DEFAULT 'en',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_routes (
    id TEXT PRIMARY KEY,
    telegram_id TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1,
    source TEXT NOT NULL,
    origin_name TEXT,
    origin_id TEXT,
    origin_country TEXT,
    destination_name TEXT,
    destination_id TEXT,
    destination_country TEXT,
    pickup_date TEXT,
    return_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_routes_user ON user_routes(telegram_id);

CREATE TABLE IF NOT EXISTS user_filters (
    telegram_id TEXT PRIMARY KEY,
    allowed_origin_countries TEXT DEFAULT 'DE,AT,NL,BE,FR,CH',
    allowed_destination_countries TEXT DEFAULT 'ES,IT,FR,DE,AT,NL,BE,PT,DK,HR,SI,CH,PL,CZ',
    max_price REAL,
    only_campers BOOLEAN DEFAULT 0,
    vehicle_type TEXT DEFAULT 'all',
    silent_hours_enabled BOOLEAN DEFAULT 0,
    silent_hours_start TEXT DEFAULT '23:00',
    silent_hours_end TEXT DEFAULT '07:00',
    window_days INTEGER DEFAULT 14,
    window_start_rule TEXT DEFAULT 'today',
    min_duration_days INTEGER,
    max_duration_days INTEGER,
    roadsurfer_origins_per_run INTEGER DEFAULT 20,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS offers (
    fingerprint TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    offer_id TEXT,
    vehicle_id TEXT,
    vehicle TEXT,
    origin TEXT,
    origin_country TEXT,
    destination TEXT,
    destination_country TEXT,
    pickup_date TEXT,
    return_date TEXT,
    price REAL,
    currency TEXT DEFAULT 'EUR',
    booking_url TEXT,
    raw_json TEXT,
    is_active BOOLEAN DEFAULT 1,
    is_dismissed BOOLEAN DEFAULT 0,
    matches_filter BOOLEAN,
    archived_telegram_sent_at TEXT,
    found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_offers_source ON offers(source);
CREATE INDEX IF NOT EXISTS idx_offers_found_at ON offers(found_at);
CREATE INDEX IF NOT EXISTS idx_offers_last_seen_at ON offers(last_seen_at);

CREATE TABLE IF NOT EXISTS sent_alerts (
    telegram_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    offer_summary TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (telegram_id, fingerprint),
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
    FOREIGN KEY(fingerprint) REFERENCES offers(fingerprint) ON DELETE CASCADE
);

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
CREATE INDEX IF NOT EXISTS idx_alert_outbox_due ON alert_outbox(status, next_attempt_at, lease_until, created_at);
CREATE INDEX IF NOT EXISTS idx_alert_outbox_chat_sent ON alert_outbox(chat_id, sent_at);

CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    source TEXT,
    request_count INTEGER DEFAULT 0,
    offers_found INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    alerts_sent INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ok',
    error TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitor_locks (
    name TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);

-- Seed default global settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('poll_interval_minutes', '10'),
    ('availability_check_interval_minutes', '60'),
    ('window_days', '14'),
    ('timezone', 'Europe/Berlin'),
    ('telegram_enabled', 'true'),
    ('provider_roadsurfer_enabled', 'true'),
    ('provider_movacar_enabled', 'true'),
    ('provider_indiecampers_enabled', 'false'),
    ('provider_imoova_enabled', 'false');
