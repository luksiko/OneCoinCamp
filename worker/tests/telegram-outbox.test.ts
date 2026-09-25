import { describe, expect, it, vi } from 'vitest';
import { dispatchAlertOutbox } from '../src/services/telegram-outbox';
import type { DbClient, AlertOutboxItem } from '../src/db/client';
import type { TelegramService } from '../src/services/telegram';

function fixture(error?: Error) {
  const item: AlertOutboxItem = {
    telegram_id: '123', fingerprint: 'offer-1', chat_id: '123',
    offer_json: JSON.stringify({ source: 'roadsurfer', offer_id: 'offer-1', origin: 'Berlin', destination: 'Paris', origin_country: 'DE', destination_country: 'FR', price: 1 }),
    route_json: JSON.stringify({ id: 'route-1', source: 'roadsurfer', origin_id: '*', destination_id: '*' }), silent: 0,
    offer_summary: 'offer', attempts: 1,
  };
  const db = {
    acquireAlertDispatchLock: vi.fn().mockResolvedValue(true),
    releaseAlertDispatchLock: vi.fn().mockResolvedValue(undefined),
    claimNextAlert: vi.fn().mockResolvedValueOnce(item).mockResolvedValue(null),
    getUser: vi.fn().mockResolvedValue({ status: 'active' }),
    getUserRoutes: vi.fn().mockResolvedValue([{ id: 'route-1', enabled: true, source: 'roadsurfer', origin_id: '*', destination_id: '*' }]),
    getUserFilters: vi.fn().mockResolvedValue({ allowed_origin_countries: '', allowed_destination_countries: '' }),
    completeAlert: vi.fn().mockResolvedValue(undefined),
    retryAlert: vi.fn().mockResolvedValue(undefined),
    markUserUnreachable: vi.fn().mockResolvedValue(undefined),
  };
  const telegram = {
    sendOfferAlert: error ? vi.fn().mockRejectedValue(error) : vi.fn().mockResolvedValue(undefined),
  };
  return { db, telegram, item };
}

describe('Telegram alert outbox dispatcher', () => {
  it('marks an alert complete only after Telegram accepts it', async () => {
    const { db, telegram, item } = fixture();
    const result = await dispatchAlertOutbox(db as unknown as DbClient,
      telegram as unknown as TelegramService, { maxMessages: 1 });
    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(telegram.sendOfferAlert).toHaveBeenCalledOnce();
    expect(db.completeAlert).toHaveBeenCalledWith(item, expect.any(String));
    expect(db.retryAlert).not.toHaveBeenCalled();
    expect(db.releaseAlertDispatchLock).toHaveBeenCalledOnce();
  });

  it('defers on Telegram 429 using retry_after and stops the batch', async () => {
    const { db, telegram, item } = fixture(new Error('HTTP 429: {"parameters":{"retry_after":17}}'));
    const result = await dispatchAlertOutbox(db as unknown as DbClient,
      telegram as unknown as TelegramService, { maxMessages: 40 });
    expect(result).toEqual({ sent: 0, retried: 1, failed: 0, rateLimited: true, retryAfterSeconds: 17 });
    expect(db.retryAlert).toHaveBeenCalledWith(item, expect.any(String), expect.any(String), 17, false);
    expect(db.claimNextAlert).toHaveBeenCalledOnce();
  });

  it('drops an alert when its route is disabled', async () => {
    const { db, telegram, item } = fixture();
    db.getUserRoutes.mockResolvedValue([]);
    const result = await dispatchAlertOutbox(db as unknown as DbClient,
      telegram as unknown as TelegramService, { maxMessages: 1 });
    expect(result.failed).toBe(1);
    expect(telegram.sendOfferAlert).not.toHaveBeenCalled();
    expect(db.retryAlert).toHaveBeenCalledWith(item, expect.any(String), expect.any(String), 1, true);
  });

  it('stops monitoring a user whose Telegram chat is unreachable', async () => {
    const { db, telegram } = fixture(new Error('HTTP 403: bot was blocked by the user'));
    const result = await dispatchAlertOutbox(db as unknown as DbClient,
      telegram as unknown as TelegramService, { maxMessages: 1 });
    expect(result.failed).toBe(1);
    expect(db.markUserUnreachable).toHaveBeenCalledWith('123');
  });
});
