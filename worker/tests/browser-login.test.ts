import { describe, expect, it, vi } from 'vitest';
import { TelegramService } from '../src/services/telegram';
import { browserLoginCode, createBrowserLoginToken, createBrowserSession, verifyBrowserSession } from '../src/utils/telegram-login';

describe('browser login', () => {
  it('uses a Telegram-compatible random deep-link token and rejects altered sessions', async () => {
    const token = createBrowserLoginToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(createBrowserLoginToken()).not.toBe(token);
    expect(await browserLoginCode(token)).toMatch(/^\d{6}$/);

    const session = await createBrowserSession({ id: '12345', username: 'camper' }, 'bot-secret');
    expect(await verifyBrowserSession(session, 'bot-secret')).toMatchObject({ id: '12345', username: 'camper' });
    expect(await verifyBrowserSession(session, 'other-secret')).toBeNull();
    const [payload, signature] = session.split('.');
    expect(await verifyBrowserSession(`${payload}.${signature.slice(0, -1)}x`, 'bot-secret')).toBeNull();
  });

  it('requires a private bot conversation and explicit confirmation', async () => {
    const approve = vi.fn().mockResolvedValue(true);
    const db = { upsertUser: vi.fn(), hasBrowserLoginChallenge: vi.fn().mockResolvedValue(true), approveBrowserLoginChallenge: approve } as any;
    const service = new TelegramService({ botToken: 'bot-secret' }, db);
    vi.spyOn(service, 'sendMessage').mockResolvedValue({ ok: true });
    vi.spyOn(service, 'answerCallbackQuery').mockResolvedValue({ ok: true });
    const token = createBrowserLoginToken();
    const message = { text: `/start login_${token}`, from: { id: 12345, username: 'camper' }, chat: { id: 12345, type: 'private' } };

    await service.processUpdate({ message: { ...message, chat: { id: -1, type: 'group' } } }, async () => {});
    expect(approve).not.toHaveBeenCalled();

    await service.processUpdate({ message }, async () => {});
    expect(approve).not.toHaveBeenCalled();
    expect(service.sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining(await browserLoginCode(token)), expect.objectContaining({ reply_markup: expect.any(Object) }));

    await service.processUpdate({ callback_query: {
      id: 'callback-1', data: `browser_login:${token}`,
      from: { id: 12345, username: 'camper' },
      message: { chat: { id: 12345, type: 'private' } },
    } }, async () => {});
    expect(approve).toHaveBeenCalledWith(token, { id: '12345', username: 'camper', language: undefined });
    expect(service.sendMessage).toHaveBeenCalledWith(12345, expect.stringContaining('вход завершится автоматически'));
  });
});
