import { describe, expect, it, vi } from 'vitest';
import { handlePaddleWebhook } from '../src/services/paddle-webhook';
import { expireSubscriptions } from '../src/services/subscription';
import { DbClient } from '../src/db/client';
import { TelegramService } from '../src/services/telegram';

const mockDbClient = {
  getUser: vi.fn(),
  getUserPayments: vi.fn(),
  recordPayment: vi.fn(),
  activateSubscription: vi.fn(),
  setPaddleIds: vi.fn(),
  setSubscription: vi.fn(),
  setUserRole: vi.fn(),
  getExpiredSubscriptions: vi.fn(),
  isSubscriptionActive: vi.fn(),
  getUserMaxRoutes: vi.fn(),
} as unknown as DbClient;

const mockTelegramService = {
  sendMessage: vi.fn(),
} as unknown as TelegramService;

describe('Paddle Webhook', () => {
  it('rejects invalid signature', async () => {
    const request = new Request('https://test.com', {
      method: 'POST',
      headers: { 'Paddle-Signature': 'ts=123;h1=invalid' },
      body: JSON.stringify({ event_type: 'transaction.completed' })
    });
    const response = await handlePaddleWebhook(request, mockDbClient, mockTelegramService, 'secret');
    expect(response.status).toBe(403);
  });
});

describe('Subscription Expiry', () => {
  it('expires subscriptions and notifies users', async () => {
    vi.mocked(mockDbClient.getExpiredSubscriptions).mockResolvedValue([{
      telegram_id: '123',
      chat_id: '123',
      role: 'premium',
      subscription_status: 'active',
      status: 'active',
      language: 'en'
    }]);

    await expireSubscriptions(mockDbClient, mockTelegramService);
    
    expect(mockDbClient.setSubscription).toHaveBeenCalledWith('123', 'expired', '', '');
    expect(mockDbClient.setUserRole).toHaveBeenCalledWith('123', 'free');
    expect(mockTelegramService.sendMessage).toHaveBeenCalled();
  });
});
