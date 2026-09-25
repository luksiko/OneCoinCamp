-- Promo codes and redemptions table
CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    days INTEGER NOT NULL,
    max_uses INTEGER DEFAULT 1,
    used_count INTEGER DEFAULT 0,
    expires_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_created ON promo_codes(created_at);

CREATE TABLE IF NOT EXISTS promo_code_redemptions (
    code TEXT NOT NULL,
    telegram_id TEXT NOT NULL,
    redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(code, telegram_id),
    FOREIGN KEY(code) REFERENCES promo_codes(code) ON DELETE CASCADE,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_code_redemptions(telegram_id);
