UPDATE users SET status = 'unreachable'
WHERE status = 'active' AND telegram_id IN (
  SELECT telegram_id FROM alert_outbox
  WHERE status = 'failed' AND
    (last_error LIKE '%chat not found%' OR last_error LIKE '%bot was blocked by the user%')
);

UPDATE alert_outbox
SET status = 'failed', last_error = 'Telegram chat unreachable', updated_at = unixepoch()
WHERE status = 'pending' AND telegram_id IN (
  SELECT telegram_id FROM users WHERE status = 'unreachable'
);
