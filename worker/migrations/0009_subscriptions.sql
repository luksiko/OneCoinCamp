-- Add role and subscription fields to users table
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'free';
-- 'free' | 'premium' | 'admin'

ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'inactive';
-- 'active' | 'inactive' | 'trial' | 'expired'

ALTER TABLE users ADD COLUMN subscription_started_at TEXT;
ALTER TABLE users ADD COLUMN subscription_expires_at TEXT;
ALTER TABLE users ADD COLUMN max_routes INTEGER DEFAULT 2;
-- free/trial: 2, premium: unlimited (NULL = unlimited)

ALTER TABLE users ADD COLUMN paddle_customer_id TEXT;
ALTER TABLE users ADD COLUMN paddle_subscription_id TEXT;

-- Payments log
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL,
    paddle_transaction_id TEXT UNIQUE,
    amount INTEGER NOT NULL,        -- in smallest currency units (cents)
    currency TEXT DEFAULT 'EUR',
    status TEXT DEFAULT 'completed', -- 'completed' | 'refunded'
    subscription_days INTEGER DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(telegram_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);

-- Seed admin role for the owner
UPDATE users SET role = 'admin', max_routes = NULL WHERE telegram_id = '369796958';
