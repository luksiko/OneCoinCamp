import { describe, it, expect, vi } from 'vitest';
import { pluralizeDays } from '../src/services/i18n';
import { TelegramService } from '../src/services/telegram';
import { NormalizedOffer } from '../src/types';

describe('pluralizeDays', () => {
  it('correctly pluralizes days in Russian', () => {
    expect(pluralizeDays(1, 'ru')).toBe(' (1 день)');
    expect(pluralizeDays(2, 'ru')).toBe(' (2 дня)');
    expect(pluralizeDays(4, 'ru')).toBe(' (4 дня)');
    expect(pluralizeDays(5, 'ru')).toBe(' (5 дней)');
    expect(pluralizeDays(7, 'ru')).toBe(' (7 дней)');
    expect(pluralizeDays(11, 'ru')).toBe(' (11 дней)');
    expect(pluralizeDays(14, 'ru')).toBe(' (14 дней)');
    expect(pluralizeDays(21, 'ru')).toBe(' (21 день)');
    expect(pluralizeDays(22, 'ru')).toBe(' (22 дня)');
    expect(pluralizeDays(25, 'ru')).toBe(' (25 дней)');
  });

  it('correctly pluralizes other supported languages', () => {
    expect(pluralizeDays(1, 'en')).toBe(' (1 day)');
    expect(pluralizeDays(3, 'en')).toBe(' (3 days)');

    expect(pluralizeDays(1, 'de')).toBe(' (1 Tag)');
    expect(pluralizeDays(3, 'de')).toBe(' (3 Tage)');

    expect(pluralizeDays(1, 'it')).toBe(' (1 giorno)');
    expect(pluralizeDays(3, 'it')).toBe(' (3 giorni)');

    expect(pluralizeDays(1, 'uk')).toBe(' (1 день)');
    expect(pluralizeDays(2, 'uk')).toBe(' (2 дні)');
    expect(pluralizeDays(5, 'uk')).toBe(' (5 днів)');
  });

  it('handles invalid or non-positive days', () => {
    expect(pluralizeDays(0, 'ru')).toBe('');
    expect(pluralizeDays(-5, 'ru')).toBe('');
  });
});

describe('TelegramService.sendOfferAlert', () => {
  it('formats alert with duration in days after dates', async () => {
    const fakeDb = {} as any;
    const service = new TelegramService({ botToken: 'mock-token' }, fakeDb);

    let sentText = '';
    vi.spyOn(service, 'sendMessage').mockImplementation(async (_chatId, text) => {
      sentText = text;
      return { ok: true };
    });

    const offer: NormalizedOffer = {
      source: 'roadsurfer',
      offer_id: 'test-1',
      origin: 'Bielefeld',
      origin_country: 'DE',
      destination: 'Bordeaux',
      destination_country: 'FR',
      pickup_date: '2026-10-19',
      return_date: '2026-10-26',
      price: 18.43,
      currency: 'EUR',
      booking_url: 'https://example.com',
      vehicle: 'Surfer Suite',
      vehicle_type: 'camper',
      sleeping_places: 4,
    };

    await service.sendOfferAlert('123456', offer);

    expect(sentText).toContain('🚐 <b>Roadsurfer — Кемпер найден!</b>');
    expect(sentText).toContain('📍 Откуда: <b>Bielefeld</b> 🇩🇪');
    expect(sentText).toContain('🏁 Куда: <b>Bordeaux</b> 🇫🇷');
    expect(sentText).toContain('📅 Даты: <code>2026-10-19</code> ➔ <code>2026-10-26</code> (7 дней)');
    expect(sentText).toContain('💶 Цена: <b>18.43 €</b>');
    expect(sentText).toContain('🚘 Модель: <b>Surfer Suite</b>');
    expect(sentText).toContain('🛏 Спальных мест: <b>4</b>');
  });
});

describe('TelegramService main menu & navigation', () => {
  it('builds a 5-row 2-column inline keyboard with web app and action callbacks', async () => {
    const { getMainMenuKeyboard } = await import('../src/services/telegram');
    const kb = getMainMenuKeyboard('https://example.com/miniapp');
    expect(kb.inline_keyboard).toHaveLength(5);
    for (const row of kb.inline_keyboard) {
      expect(row).toHaveLength(2);
    }
    // Row 1: Mini App and Actual Offers
    expect(kb.inline_keyboard[0][0]).toEqual({
      text: '🚐 Mini App ▫️',
      web_app: { url: 'https://example.com/miniapp' },
    });
    expect(kb.inline_keyboard[0][1]).toEqual({
      text: '🎯 Офферы 1€',
      callback_data: 'menu_actual',
    });
    // Row 2: Routes and Check
    expect(kb.inline_keyboard[1][0].callback_data).toBe('menu_routes');
    expect(kb.inline_keyboard[1][1].callback_data).toBe('menu_check');
    // Row 3: Digest and Subscribe
    expect(kb.inline_keyboard[2][0].callback_data).toBe('menu_digest');
    expect(kb.inline_keyboard[2][1].callback_data).toBe('menu_subscribe');
    // Row 4: Account and Silent
    expect(kb.inline_keyboard[3][0].callback_data).toBe('menu_account');
    expect(kb.inline_keyboard[3][1].callback_data).toBe('menu_silent');
    // Row 5: Status and Help
    expect(kb.inline_keyboard[4][0].callback_data).toBe('menu_status');
    expect(kb.inline_keyboard[4][1].callback_data).toBe('menu_help');
  });

  it('sendMainMenu sets chat menu button to commands and sends 2-column keyboard', async () => {
    const fakeDb = {
      upsertUser: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new TelegramService(
      { botToken: 'mock-token', workerUrl: 'https://worker.test' },
      fakeDb
    );

    const setMenuSpy = vi.spyOn(service, 'setChatMenuButton').mockResolvedValue({ ok: true });
    let sentPayload: any = null;
    vi.spyOn(service, 'sendMessage').mockImplementation(async (_chatId, text, options) => {
      sentPayload = { text, options };
      return { ok: true };
    });

    await service.sendMainMenu('999');

    expect(setMenuSpy).toHaveBeenCalledWith('999', 'commands');
    expect(sentPayload.text).toContain('Camper Monitor — перегоны кемперов за 1€');
    expect(sentPayload.options.reply_markup.inline_keyboard).toHaveLength(5);
  });

  it('handles menu_help callback query and answers callback', async () => {
    const fakeDb = {
      upsertUser: vi.fn().mockResolvedValue(undefined),
    } as any;
    const service = new TelegramService(
      { botToken: 'mock-token', workerUrl: 'https://worker.test' },
      fakeDb
    );

    const answerSpy = vi.spyOn(service, 'answerCallbackQuery').mockResolvedValue({ ok: true });
    let sentMsg = '';
    let sentMarkup: any = null;
    vi.spyOn(service, 'sendMessage').mockImplementation(async (_chatId, text, options) => {
      sentMsg = text;
      sentMarkup = options?.reply_markup;
      return { ok: true };
    });

    await service.processUpdate(
      {
        callback_query: {
          id: 'cb-123',
          data: 'menu_help',
          message: { chat: { id: 777 } },
          from: { id: 777, username: 'testuser' },
        },
      },
      async () => ({ offersFound: 0 })
    );

    expect(answerSpy).toHaveBeenCalledWith('cb-123');
    expect(sentMsg).toContain('Camper Monitor — Справка');
    expect(sentMarkup.inline_keyboard[0][0].callback_data).toBe('menu_main');
  });
});

