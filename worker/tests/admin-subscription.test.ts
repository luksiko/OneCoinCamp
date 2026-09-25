import { describe, expect, it, vi } from 'vitest';
import { DbClient } from '../src/db/client';
import { handleRpcRequest } from '../src/api/rpc';
import { createBrowserSession } from '../src/utils/telegram-login';

function createMockD1() {
  const prepare = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
  });
  return { prepare } as any;
}

describe('Admin Subscription & Payments', () => {
  it('adds time to an active user subscription', async () => {
    const d1 = createMockD1();
    const client = new DbClient(d1);

    const futureDate = new Date(Date.now() + 10 * 86400000).toISOString();
    vi.spyOn(client, 'getUser').mockResolvedValue({
      telegram_id: 'user1',
      chat_id: 'user1',
      role: 'free',
      status: 'active',
      subscription_status: 'active',
      subscription_expires_at: futureDate,
      language: 'ru',
    });
    const setSubSpy = vi.spyOn(client, 'setSubscription').mockResolvedValue(undefined);
    const setRoleSpy = vi.spyOn(client, 'setUserRole').mockResolvedValue(undefined);

    const result = await client.adjustSubscription('user1', 30);
    expect(result.status).toBe('active');
    expect(result.role).toBe('premium');
    expect(setSubSpy).toHaveBeenCalled();
    expect(setRoleSpy).toHaveBeenCalledWith('user1', 'premium');

    // New expiry should be ~40 days from now (futureDate + 30 days)
    const expectedApprox = new Date(new Date(futureDate).getTime() + 30 * 86400000).getTime();
    const actualTime = new Date(result.expiresAt!).getTime();
    expect(Math.abs(actualTime - expectedApprox)).toBeLessThan(5000);
  });

  it('subtracts time from an active subscription without expiring it', async () => {
    const d1 = createMockD1();
    const client = new DbClient(d1);

    const futureDate = new Date(Date.now() + 20 * 86400000).toISOString();
    vi.spyOn(client, 'getUser').mockResolvedValue({
      telegram_id: 'user2',
      chat_id: 'user2',
      role: 'premium',
      status: 'active',
      subscription_status: 'active',
      subscription_expires_at: futureDate,
      language: 'ru',
    });
    const setSubSpy = vi.spyOn(client, 'setSubscription').mockResolvedValue(undefined);
    const setRoleSpy = vi.spyOn(client, 'setUserRole').mockResolvedValue(undefined);

    // Subtract 5 days
    const result = await client.adjustSubscription('user2', -5);
    expect(result.status).toBe('active');
    expect(result.role).toBe('premium');
    expect(setSubSpy).toHaveBeenCalled();
    expect(setRoleSpy).not.toHaveBeenCalled(); // Still active premium

    const expectedApprox = new Date(new Date(futureDate).getTime() - 5 * 86400000).getTime();
    const actualTime = new Date(result.expiresAt!).getTime();
    expect(Math.abs(actualTime - expectedApprox)).toBeLessThan(5000);
  });

  it('expires subscription when subtracted time exceeds remaining time', async () => {
    const d1 = createMockD1();
    const client = new DbClient(d1);

    const futureDate = new Date(Date.now() + 3 * 86400000).toISOString(); // 3 days remaining
    vi.spyOn(client, 'getUser').mockResolvedValue({
      telegram_id: 'user3',
      chat_id: 'user3',
      role: 'premium',
      status: 'active',
      subscription_status: 'active',
      subscription_expires_at: futureDate,
      language: 'ru',
    });
    const setSubSpy = vi.spyOn(client, 'setSubscription').mockResolvedValue(undefined);
    const setRoleSpy = vi.spyOn(client, 'setUserRole').mockResolvedValue(undefined);

    // Subtract 10 days -> should expire
    const result = await client.adjustSubscription('user3', -10);
    expect(result.status).toBe('expired');
    expect(result.role).toBe('free');
    expect(setSubSpy).toHaveBeenCalledWith('user3', 'expired', expect.any(String), expect.any(String));
    expect(setRoleSpy).toHaveBeenCalledWith('user3', 'free');
  });

  it('keeps admin role even if subscription time is subtracted to zero', async () => {
    const d1 = createMockD1();
    const client = new DbClient(d1);

    const futureDate = new Date(Date.now() + 3 * 86400000).toISOString();
    vi.spyOn(client, 'getUser').mockResolvedValue({
      telegram_id: 'admin_user',
      chat_id: 'admin_user',
      role: 'admin',
      status: 'active',
      subscription_status: 'active',
      subscription_expires_at: futureDate,
      language: 'ru',
    });
    const setSubSpy = vi.spyOn(client, 'setSubscription').mockResolvedValue(undefined);
    const setRoleSpy = vi.spyOn(client, 'setUserRole').mockResolvedValue(undefined);

    const result = await client.adjustSubscription('admin_user', -10);
    expect(result.status).toBe('expired');
    expect(result.role).toBe('admin');
    expect(setRoleSpy).not.toHaveBeenCalled(); // Admin role preserved!
  });

  it('redeems promo code successfully and grants subscription days', async () => {
    const d1 = createMockD1();
    const client = new DbClient(d1);

    // Mock promo code exists
    const promoCode = {
      code: 'TEST30',
      days: 30,
      max_uses: 5,
      used_count: 1,
      expires_at: null,
    };
    d1.prepare.mockImplementation((sql: string) => {
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          if (sql.includes('SELECT * FROM promo_codes')) return Promise.resolve(promoCode);
          if (sql.includes('SELECT 1 FROM promo_code_redemptions')) return Promise.resolve(null); // not redeemed yet
          return Promise.resolve(null);
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
    });

    vi.spyOn(client, 'adjustSubscription').mockResolvedValue({
      expiresAt: '2026-10-25T00:00:00.000Z',
      status: 'active',
      role: 'premium',
    });

    const res = await client.redeemPromoCode('user10', 'test30');
    expect(res.success).toBe(true);
    expect(res.days).toBe(30);
    expect(client.adjustSubscription).toHaveBeenCalledWith('user10', 30);
  });

  it('rejects already redeemed promo code for the same user', async () => {
    const d1 = createMockD1();
    const client = new DbClient(d1);

    const promoCode = { code: 'VIP', days: 14, max_uses: 10, used_count: 1 };
    d1.prepare.mockImplementation((sql: string) => {
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          if (sql.includes('SELECT * FROM promo_codes')) return Promise.resolve(promoCode);
          if (sql.includes('SELECT 1 FROM promo_code_redemptions')) return Promise.resolve({ 1: 1 }); // already redeemed!
          return Promise.resolve(null);
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
    });

    const res = await client.redeemPromoCode('user10', 'VIP');
    expect(res.success).toBe(false);
    expect(res.error).toBe('code_already_used');
  });

  it('rejects expired promo code', async () => {
    const d1 = createMockD1();
    const client = new DbClient(d1);

    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const promoCode = { code: 'OLD', days: 7, max_uses: 10, used_count: 0, expires_at: pastDate };
    d1.prepare.mockImplementation((sql: string) => {
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          if (sql.includes('SELECT * FROM promo_codes')) return Promise.resolve(promoCode);
          return Promise.resolve(null);
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
    });

    const res = await client.redeemPromoCode('user10', 'OLD');
    expect(res.success).toBe(false);
    expect(res.error).toBe('code_expired');
  });

  it('prevents an admin from demoting themselves or revoking their own subscription via RPC', async () => {
    const d1 = createMockD1();
    const client = new DbClient(d1);
    vi.spyOn(client, 'getUser').mockResolvedValue({
      telegram_id: '999999999',
      chat_id: '999999999',
      role: 'admin',
      status: 'active',
      subscription_status: 'active',
    } as any);

    const token = await createBrowserSession({ id: '999999999', username: 'admin' }, 'secret');
    const ctx = {
      db: client,
      botToken: 'secret',
      workerUrl: 'http://test',
    } as any;

    // Try to demote self
    const demoteReq = new Request('http://test/api/rpc', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'adminSetRole',
        args: ['999999999', 'premium'],
      }),
    });
    const demoteRes = await handleRpcRequest(demoteReq, ctx);
    expect(demoteRes.status).toBe(400);
    const demoteJson = await demoteRes.json<any>();
    expect(demoteJson.error).toContain('Cannot demote yourself');

    // Try to revoke own subscription
    const revokeReq = new Request('http://test/api/rpc', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'adminRevokeSubscription',
        args: ['999999999'],
      }),
    });
    const revokeRes = await handleRpcRequest(revokeReq, ctx);
    expect(revokeRes.status).toBe(400);
    const revokeJson = await revokeRes.json<any>();
    expect(revokeJson.error).toContain('Cannot revoke subscription from yourself');
  });
});
