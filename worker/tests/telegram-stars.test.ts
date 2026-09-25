import { describe, it, expect, vi } from 'vitest';
import { TelegramService } from '../src/services/telegram';
import { handleRpcRequest } from '../src/api/rpc';
import * as httpUtils from '../src/utils/http';

describe('Telegram Stars Payment Integration', () => {
  it('sendStarsInvoice sends correct Telegram Bot API payload for Stars', async () => {
    const fakeDb = {
      getSettings: vi.fn().mockResolvedValue({}),
    } as any;
    const service = new TelegramService({ botToken: 'mock-bot-token' }, fakeDb);

    let apiUrl = '';
    let apiBody: any = null;
    vi.spyOn(httpUtils, 'fetchJson').mockImplementation(async (url: string, opts: any) => {
      apiUrl = url;
      apiBody = JSON.parse(opts.body);
      return { ok: true, result: { message_id: 123 } };
    });

    await service.sendStarsInvoice('12345', '12345', 'ru', 500);

    expect(apiUrl).toBe('https://api.telegram.org/botmock-bot-token/sendInvoice');
    expect(apiBody.chat_id).toBe('12345');
    expect(apiBody.currency).toBe('XTR');
    expect(apiBody.provider_token).toBe('');
    expect(apiBody.prices).toEqual([{ label: 'Camper Monitor Premium (30 дней)', amount: 500 }]);
    expect(JSON.parse(apiBody.payload)).toEqual({ telegram_id: '12345', plan: 'premium_30d' });
  });

  it('createStarsInvoiceLink requests link with XTR currency and empty provider_token', async () => {
    const fakeDb = {} as any;
    const service = new TelegramService({ botToken: 'mock-bot-token' }, fakeDb);

    let apiUrl = '';
    let apiBody: any = null;
    vi.spyOn(httpUtils, 'fetchJson').mockImplementation(async (url: string, opts: any) => {
      apiUrl = url;
      apiBody = JSON.parse(opts.body);
      return { ok: true, result: 'https://t.me/$invoice_link_xyz' };
    });

    const link = await service.createStarsInvoiceLink('998877', 'en', 500);

    expect(link).toBe('https://t.me/$invoice_link_xyz');
    expect(apiUrl).toBe('https://api.telegram.org/botmock-bot-token/createInvoiceLink');
    expect(apiBody.currency).toBe('XTR');
    expect(apiBody.provider_token).toBe('');
    expect(apiBody.prices).toEqual([{ label: 'Camper Monitor Premium (30 Days)', amount: 500 }]);
    expect(JSON.parse(apiBody.payload)).toEqual({ telegram_id: '998877', plan: 'premium_30d' });
  });

  it('processUpdate automatically approves pre_checkout_query', async () => {
    const fakeDb = {} as any;
    const service = new TelegramService({ botToken: 'mock-bot-token' }, fakeDb);

    const answerSpy = vi.spyOn(service, 'answerPreCheckoutQuery').mockResolvedValue({ ok: true });

    await service.processUpdate(
      {
        update_id: 1,
        pre_checkout_query: {
          id: 'pcq_123',
          from: { id: 777, username: 'starbuyer' },
          currency: 'XTR',
          total_amount: 500,
          invoice_payload: JSON.stringify({ telegram_id: '777' }),
        },
      },
      async () => ({})
    );

    expect(answerSpy).toHaveBeenCalledWith('pcq_123', true);
  });

  it('processUpdate processes successful_payment, activates subscription, records payment, and confirms to user', async () => {
    const fakeDb = {
      upsertUser: vi.fn().mockResolvedValue(undefined),
      getUser: vi.fn().mockResolvedValue({ language: 'ru' }),
      isPaymentRecorded: vi.fn().mockResolvedValue(false),
      activateSubscription: vi.fn().mockResolvedValue(undefined),
      recordPayment: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new TelegramService({ botToken: 'mock-bot-token' }, fakeDb);

    let sentMessage = '';
    vi.spyOn(service, 'sendMessage').mockImplementation(async (_chatId, text) => {
      sentMessage = text;
      return { ok: true };
    });

    await service.processUpdate(
      {
        update_id: 2,
        message: {
          message_id: 55,
          from: { id: 888, username: 'staruser', language_code: 'ru' },
          chat: { id: 888, type: 'private' },
          date: 1727260000,
          successful_payment: {
            currency: 'XTR',
            total_amount: 500,
            invoice_payload: JSON.stringify({ telegram_id: '888', plan: 'premium_30d' }),
            telegram_payment_charge_id: 'tg_charge_abc123',
            provider_payment_charge_id: '',
          },
        },
      },
      async () => ({})
    );

    expect(fakeDb.upsertUser).toHaveBeenCalledWith('888', 888, 'staruser', undefined, 'ru');
    expect(fakeDb.activateSubscription).toHaveBeenCalledWith('888', 30);
    expect(fakeDb.recordPayment).toHaveBeenCalledWith({
      telegram_id: '888',
      paddle_transaction_id: 'stars_tg_charge_abc123',
      amount: 500,
      currency: 'XTR',
      status: 'completed',
      subscription_days: 30,
    });
    expect(sentMessage).toContain('Оплата Telegram Stars успешно получена');
  });

  it('processUpdate skips duplicate processing if payment already recorded (idempotency)', async () => {
    const fakeDb = {
      upsertUser: vi.fn().mockResolvedValue(undefined),
      isPaymentRecorded: vi.fn().mockResolvedValue(true),
      activateSubscription: vi.fn().mockResolvedValue(undefined),
      recordPayment: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new TelegramService({ botToken: 'mock-bot-token' }, fakeDb);

    const sendSpy = vi.spyOn(service, 'sendMessage');

    await service.processUpdate(
      {
        update_id: 3,
        message: {
          message_id: 56,
          from: { id: 888 },
          chat: { id: 888 },
          successful_payment: {
            currency: 'XTR',
            total_amount: 500,
            invoice_payload: JSON.stringify({ telegram_id: '888' }),
            telegram_payment_charge_id: 'tg_charge_abc123',
          },
        },
      },
      async () => ({})
    );

    expect(fakeDb.activateSubscription).not.toHaveBeenCalled();
    expect(fakeDb.recordPayment).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('pay_stars callback triggers sendStarsInvoice with 500 stars default', async () => {
    const fakeDb = {
      upsertUser: vi.fn().mockResolvedValue(undefined),
      getUser: vi.fn().mockResolvedValue({ language: 'ru' }),
      getSettings: vi.fn().mockResolvedValue({ telegram_stars_price: '500' }),
    } as any;
    const service = new TelegramService({ botToken: 'mock-bot-token' }, fakeDb);

    const answerSpy = vi.spyOn(service, 'answerCallbackQuery').mockResolvedValue({ ok: true });
    const sendInvoiceSpy = vi.spyOn(service, 'sendStarsInvoice').mockResolvedValue({ ok: true });

    await service.processUpdate(
      {
        callback_query: {
          id: 'cb_stars_1',
          data: 'pay_stars',
          from: { id: 555, language_code: 'ru' },
          message: { chat: { id: 555 } },
        },
      },
      async () => ({})
    );

    expect(answerSpy).toHaveBeenCalledWith('cb_stars_1');
    expect(sendInvoiceSpy).toHaveBeenCalledWith(555, '555', 'ru', 500);
  });

  it('showSubscriptionMenu contains Stars payment button with 500 Stars', async () => {
    const fakeDb = {
      getUser: vi.fn().mockResolvedValue({ subscription_status: 'inactive' }),
      isSubscriptionActive: vi.fn().mockReturnValue(false),
    } as any;
    const service = new TelegramService({ botToken: 'mock-bot-token' }, fakeDb);

    let sentButtons: any[] = [];
    vi.spyOn(service, 'sendMessage').mockImplementation(async (_chatId, _text, opts) => {
      sentButtons = opts?.reply_markup?.inline_keyboard || [];
      return { ok: true };
    });

    await service.showSubscriptionMenu('123', '123', 'ru');

    const flatButtons = sentButtons.flat();
    const starsBtn = flatButtons.find((b) => b.callback_data === 'pay_stars');
    expect(starsBtn).toBeDefined();
    expect(starsBtn.text).toContain('Оплатить звездами');
    expect(starsBtn.text).toContain('500 ⭐️');
  });

  it('generateStarsInvoice RPC method returns invoice link with 500 Stars', async () => {
    const fakeDb = {
      getUser: vi.fn().mockResolvedValue({ role: 'free', language: 'en' }),
      getSettings: vi.fn().mockResolvedValue({ telegram_stars_price: '500' }),
    } as any;

    const fakeTelegram = {
      createStarsInvoiceLink: vi.fn().mockResolvedValue('https://t.me/$stars_invoice_link'),
    } as any;

    const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

    const req = new Request('https://worker.test/api/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-session',
      },
      body: JSON.stringify({
        method: 'generateStarsInvoice',
        args: [],
      }),
    });

    const loginUtils = await import('../src/utils/telegram-login');
    vi.spyOn(loginUtils, 'verifyBrowserSession').mockResolvedValue({
      id: '123456',
      first_name: 'Test',
      auth_date: Date.now(),
      hash: 'hash',
    });

    const res = await handleRpcRequest(req, {
      db: fakeDb,
      telegram: fakeTelegram,
      botToken,
      workerUrl: 'https://worker.test',
      triggerMonitorFn: async () => ({}),
    });

    expect(res.status).toBe(200);
    const data = await res.json<any>();
    expect(data.result).toBe('https://t.me/$stars_invoice_link');
    expect(fakeTelegram.createStarsInvoiceLink).toHaveBeenCalledWith('123456', 'en', 500);
  });
});
