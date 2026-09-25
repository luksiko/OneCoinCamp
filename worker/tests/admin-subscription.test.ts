import { describe, expect, it, vi } from 'vitest';
import { DbClient } from '../src/db/client';

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
});
