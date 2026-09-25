import { DbClient } from '../db/client';
import { NormalizedOffer, UserRoute, UserFilters } from '../types';
import { t, pluralizeDays } from './i18n';
import { fetchJson } from '../utils/http';
import { routeMatchesOffer, offerMatchesUserFilters, isSilentHoursActive, parseIsoDate } from './filters';
import { browserLoginCode } from '../utils/telegram-login';
import { formatSubscriptionStatus } from './subscription';

export interface TelegramSecrets {
  botToken: string;
  chatId?: string;
  webhookSecret?: string;
  workerUrl?: string;
}

export class TelegramService {
  constructor(private secrets: TelegramSecrets, private db: DbClient) {}

  getWebhookSecret(): string {
    if (!this.secrets.webhookSecret) throw new Error('Webhook secret not configured');
    return this.secrets.webhookSecret;
  }

  async registerWebhook(webhookUrl: string): Promise<void> {
    const response = await fetchJson<any>(this.apiUrl('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, secret_token: this.getWebhookSecret() }),
      retries: 1,
    });
    if (!response?.ok) throw new Error(response?.description || 'Telegram rejected webhook');
  }

  async setChatMenuButton(chatId?: string | number, webAppUrl?: string): Promise<any> {
    if (!this.secrets.botToken) return null;
    const url = webAppUrl || this.secrets.workerUrl;
    if (!url) return null;
    return fetchJson(this.apiUrl('setChatMenuButton'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(chatId ? { chat_id: String(chatId) } : {}),
        menu_button: {
          type: 'web_app',
          text: 'Open Monitor',
          web_app: { url },
        },
      }),
      retries: 1,
    });
  }

  private apiUrl(method: string): string {
    return `https://api.telegram.org/bot${this.secrets.botToken}/${method}`;
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    options: {
      reply_markup?: any;
      disable_notification?: boolean;
      parse_mode?: string;
      retries?: number;
    } = {}
  ): Promise<any> {
    if (!this.secrets.botToken) {
      console.warn('Telegram Bot Token not configured!');
      return null;
    }

    return fetchJson(this.apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text,
        parse_mode: options.parse_mode || 'HTML',
        disable_web_page_preview: false,
        disable_notification: Boolean(options.disable_notification),
        reply_markup: options.reply_markup,
      }),
      retries: options.retries ?? 2,
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<any> {
    return fetchJson(this.apiUrl('answerCallbackQuery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
      }),
      retries: 1,
    });
  }

  async sendOfferAlert(
    chatId: string | number,
    offer: NormalizedOffer,
    route?: UserRoute,
    disableNotification = false
  ): Promise<void> {
    if (!this.secrets.botToken) throw new Error('Telegram Bot Token not configured');
    const isCamper = offer.vehicle_type === 'camper';
    const icon = isCamper ? '🚐' : '🚗';
    const providerIcons: Record<string, string> = {
      roadsurfer: '🚐',
      movacar: '🚗',
      indiecampers: '⛺',
      imoova: '🌐',
    };
    const pIcon = providerIcons[offer.source] || '🚐';

    const originFlag = flagEmoji(offer.origin_country);
    const destFlag = flagEmoji(offer.destination_country);

    const priceText = offer.price === 1 ? '<b>1 €</b>' : `<b>${offer.price} €</b>`;

    let durationText = '';
    if (offer.pickup_date && offer.return_date) {
      const p = parseIsoDate(offer.pickup_date);
      const r = parseIsoDate(offer.return_date);
      if (p && r) {
        const days = Math.round((r.getTime() - p.getTime()) / (1000 * 60 * 60 * 24));
        if (days > 0) {
          durationText = pluralizeDays(days, 'ru');
        }
      }
    }

    let text = `${pIcon} <b>${capitalize(offer.source)} — ${isCamper ? 'Кемпер' : 'Автомобиль'} найден!</b>\n\n`;
    text += `📍 Откуда: <b>${escapeHtml(offer.origin)}</b> ${originFlag}\n`;
    text += `🏁 Куда: <b>${escapeHtml(offer.destination)}</b> ${destFlag}\n`;
    text += `📅 Даты: <code>${offer.pickup_date}</code> ➔ <code>${offer.return_date}</code>${durationText}\n`;
    text += `💶 Цена: ${priceText}\n`;
    if (offer.vehicle) {
      text += `🚘 Модель: <b>${escapeHtml(offer.vehicle)}</b>\n`;
    }
    if (offer.sleeping_places && isCamper) {
      text += `🛏 Спальных мест: <b>${offer.sleeping_places}</b>\n`;
    }

    const inlineKeyboard: any[] = [];
    if (offer.booking_url) {
      inlineKeyboard.push([
        { text: 'Забронировать оффер ➔', url: offer.booking_url },
      ]);
    }
    if (route?.id) {
      inlineKeyboard.push([
        { text: '🚫 Отключить этот маршрут', callback_data: `disable_route:${route.id}` },
      ]);
    }

    const result = await this.sendMessage(chatId, text, {
      reply_markup: inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : undefined,
      disable_notification: disableNotification,
      retries: 0,
    });
    if (!result?.ok) {
      throw new Error(`Telegram rejected alert: ${result?.description || 'unknown error'}${result?.parameters?.retry_after ? ` retry_after=${result.parameters.retry_after}` : ''}`);
    }
  }

  async handleWebhook(request: Request, triggerMonitorFn: () => Promise<any>): Promise<Response> {
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (!this.secrets.webhookSecret) return new Response('Webhook secret not configured', { status: 503 });
    const encoder = new TextEncoder();
    const [actual, expected] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(secret || '')),
      crypto.subtle.digest('SHA-256', encoder.encode(this.secrets.webhookSecret)),
    ]);
    if (!secret || !crypto.subtle.timingSafeEqual(actual, expected)) {
      return new Response('Unauthorized', { status: 403 });
    }

    try {
      const update = await request.json<any>();
      await this.processUpdate(update, triggerMonitorFn);
      return new Response('OK', { status: 200 });
    } catch (err: any) {
      console.error('Error processing webhook:', err);
      return new Response('Error', { status: 500 });
    }
  }

  async processUpdate(update: any, triggerMonitorFn: () => Promise<any>): Promise<void> {
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = String(cb.data || '');
      const chatId = cb.message?.chat?.id;

      const browserLogin = data.match(/^browser_login:([A-Za-z0-9_-]{32})$/);
      if (browserLogin) {
        if (cb.message?.chat?.type !== 'private' || String(chatId) !== String(cb.from?.id)) {
          await this.answerCallbackQuery(cb.id, 'Подтверждение доступно только в личном чате.');
          return;
        }
        const approved = await this.db.approveBrowserLoginChallenge(browserLogin[1], {
          id: String(cb.from.id), username: cb.from.username, language: cb.from.language_code,
        });
        await this.answerCallbackQuery(cb.id, approved ? 'Вход подтверждён' : 'Ссылка устарела');
        if (approved) {
          try {
            await this.sendMessage(chatId, '✅ Вернитесь на вкладку с Camper Monitor — вход завершится автоматически.');
          } catch (error) {
            console.error('Could not send browser login confirmation:', error);
          }
        }
        return;
      }

      if (data.startsWith('disable_route:')) {
        const routeId = data.replace('disable_route:', '');
        if (chatId) {
          await this.db.disableUserRoute(chatId, routeId);
          await this.answerCallbackQuery(cb.id, 'Маршрут успешно отключен!');
          await this.sendMessage(chatId, '🚫 Маршрут был отключен.');
        }
      }
      return;
    }

    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const telegramId = String(msg.from?.id || chatId);

    // Register / update user in DB
    await this.db.upsertUser(telegramId, chatId, msg.from?.username, msg.from?.first_name);

    if (text.startsWith('/subscribe')) {
      const user = await this.db.getUser(telegramId);
      const isActive = this.db.isSubscriptionActive(user);
      if (isActive && user?.subscription_status !== 'trial') {
        const expiry = user?.subscription_expires_at
          ? new Date(user.subscription_expires_at).toLocaleDateString('en-GB')
          : '?';
        await this.sendMessage(chatId,
          `✅ You already have an active Premium subscription until <b>${expiry}</b>.`
        );
        return;
      }
      // Send link to Mini App with subscribe intent
      const webAppUrl = this.secrets.workerUrl || '';
      await this.sendMessage(chatId,
        '💳 <b>Subscribe to Camper Monitor Premium</b>\n\n' +
        '• Unlimited routes and monitoring alerts\n' +
        '• Full offer archive and analytics\n' +
        `• <b>€4.99/month</b>\n\n` +
        'Open the app below to complete payment:',
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '💳 Subscribe — €4.99/mo', web_app: { url: webAppUrl + '?subscribe=1' } }
            ]]
          }
        }
      );
      return;
    }

    if (text.startsWith('/account')) {
      const user = await this.db.getUser(telegramId);
      const isActive = this.db.isSubscriptionActive(user);
      const statusText = formatSubscriptionStatus(user!, isActive);
      const routeCount = (await this.db.getUserRoutes(telegramId)).length;
      const maxRoutes = this.db.getUserMaxRoutes(user);
      const routeInfo = maxRoutes >= 999
        ? `📍 Routes: ${routeCount} (unlimited)`
        : `📍 Routes: ${routeCount} / ${maxRoutes}`;

      let msgStr = `👤 <b>Your Account</b>\n\n${statusText}\n${routeInfo}`;
      if (!isActive) {
        msgStr += '\n\n💡 Use /subscribe to get Premium access.';
      }
      await this.sendMessage(chatId, msgStr);
      return;
    }

    const browserLogin = text.match(/^\/start(?:@\w+)?\s+login_([A-Za-z0-9_-]{32})$/);
    if (browserLogin) {
      if (msg.chat?.type !== 'private' || !msg.from?.id) return;
      const available = await this.db.hasBrowserLoginChallenge(browserLogin[1]);
      if (!available) {
        await this.sendMessage(chatId, '⏱ Ссылка для входа устарела. Вернитесь на сайт и нажмите «Открыть бота в Telegram» ещё раз.');
        return;
      }
      const code = await browserLoginCode(browserLogin[1]);
      await this.sendMessage(chatId, `🔐 Вход в Camper Monitor. Код на сайте: <b>${code}</b>. Если код совпадает, подтвердите вход.`, {
        reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить вход', callback_data: `browser_login:${browserLogin[1]}` }]] },
      });
      return;
    }

    if (text.startsWith('/start')) {
      if (this.secrets.workerUrl) {
        await this.setChatMenuButton(chatId, this.secrets.workerUrl);
      }
      await this.sendMessage(chatId, t('start_welcome', 'ru'));
      return;
    }

    if (text.startsWith('/help')) {
      await this.sendMessage(chatId, t('help_text', 'ru'));
      return;
    }

    if (text.startsWith('/status')) {
      const latestRun = await this.db.getLatestRun();
      const activeUsers = await this.db.listActiveUsers();
      const message = t('status_header', 'ru', {
        lastRun: latestRun?.finished_at || 'Нет данных',
        status: latestRun?.status || 'ok',
        found: latestRun?.offers_found || 0,
        sent: latestRun?.alerts_sent || 0,
        users: activeUsers.length,
      });
      await this.sendMessage(chatId, message);
      return;
    }

    if (text.startsWith('/routes')) {
      const routes = await this.db.getUserRoutes(telegramId);
      if (routes.length === 0) {
        await this.sendMessage(chatId, t('routes_empty', 'ru'));
        return;
      }
      let resp = t('routes_header', 'ru');
      for (let i = 0; i < routes.length; i++) {
        const r = routes[i];
        const statusIcon = r.enabled ? '✅' : '⏸️';
        resp += `${statusIcon} ${r.source}: ${r.origin_name || '*'} (${r.origin_country || '*'}) ➔ ${r.destination_name || '*'} (${r.destination_country || '*'})\n`;
      }
      await this.sendMessage(chatId, resp);
      return;
    }

    if (text.startsWith('/clear_routes') || text.startsWith('/reset_routes')) {
      const removed = await this.db.clearUserRoutes(telegramId);
      await this.sendMessage(chatId, `Удалено маршрутов: ${removed}.`);
      return;
    }

    if (text.startsWith('/digest')) {
      const userFilters = await this.db.getUserFilters(telegramId);
      const userRoutes = await this.db.getUserRoutes(telegramId);
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const archive = await this.db.getOfferArchive(telegramId);
      const recent = archive.filter((offer) => {
        if (Date.parse(offer.found_at || '') < since) return false;
        const route = userRoutes.find((item) => routeMatchesOffer(item, offer));
        return route && offerMatchesUserFilters(offer, userFilters, route);
      });
      if (recent.length === 0) {
        await this.sendMessage(chatId, '📋 За последние 24 часа новых подходящих офферов не найдено.');
        return;
      }
      const lines = [`📋 <b>Дайджест за 24 часа: ${recent.length}</b>`];
      for (const offer of recent.slice(0, 10)) {
        lines.push(`${escapeHtml(offer.origin)} → ${escapeHtml(offer.destination)} · ${offer.price} € · ${escapeHtml(offer.pickup_date)}`);
      }
      if (recent.length > 10) lines.push(`И ещё ${recent.length - 10} в архиве.`);
      await this.sendMessage(chatId, lines.join('\n'));
      return;
    }

    if (text.startsWith('/check')) {
      await this.sendMessage(chatId, t('check_starting', 'ru'));
      try {
        const result = await triggerMonitorFn();
        const found = result?.offersFound || 0;
        await this.sendMessage(chatId, t('check_finished', 'ru', { count: found }));
      } catch (err: any) {
        await this.sendMessage(chatId, `❌ Ошибка проверки: ${err.message || err}`);
      }
      return;
    }

    if (text.startsWith('/actual')) {
      const userFilters = await this.db.getUserFilters(telegramId);
      const userRoutes = await this.db.getUserRoutes(telegramId);
      const activeOffers = await this.db.getOffers(50, 0);

      const matched = activeOffers.filter((offer) => {
        const r = userRoutes.find((route) => routeMatchesOffer(route, offer));
        return r && offerMatchesUserFilters(offer, userFilters, r);
      });

      if (matched.length === 0) {
        await this.sendMessage(chatId, t('actual_empty', 'ru'));
        return;
      }

      await this.sendMessage(chatId, `🎯 <b>Актуальные офферы (${matched.length}):</b>`);
      for (const off of matched.slice(0, 5)) {
        await this.sendOfferAlert(chatId, off);
      }
      return;
    }

    if (text.startsWith('/silent')) {
      const parts = text.split(/\s+/);
      const arg = parts[1] || '';
      if (arg === 'on') {
        await this.db.setUserFilters(telegramId, { silent_hours_enabled: true });
        await this.sendMessage(chatId, t('silent_on', 'ru'));
      } else if (arg === 'off') {
        await this.db.setUserFilters(telegramId, { silent_hours_enabled: false });
        await this.sendMessage(chatId, t('silent_off', 'ru'));
      } else if (arg.includes('-')) {
        const [start, end] = arg.split('-');
        if (/^\d{1,2}:\d{2}$/.test(start) && /^\d{1,2}:\d{2}$/.test(end)) {
          await this.db.setUserFilters(telegramId, {
            silent_hours_enabled: true,
            silent_hours_start: start,
            silent_hours_end: end,
          });
          await this.sendMessage(chatId, t('silent_set', 'ru', { start, end }));
        } else {
          await this.sendMessage(chatId, t('silent_invalid_format', 'ru'));
        }
      } else {
        const current = await this.db.getUserFilters(telegramId);
        const status = current.silent_hours_enabled ? 'ВКЛЮЧЕНЫ' : 'ВЫКЛЮЧЕНЫ';
        await this.sendMessage(
          chatId,
          `🌙 <b>Тихие часы</b>\n\nТекущий статус: <b>${status}</b>\nИнтервал: <code>${current.silent_hours_start} - ${current.silent_hours_end}</code>\n\nКоманды:\n• <code>/silent on</code>\n• <code>/silent off</code>\n• <code>/silent 23:00-08:00</code>`
        );
      }
      return;
    }
  }
}

function escapeHtml(text?: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalize(s?: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function flagEmoji(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const code = countryCode.toUpperCase();
  const offset = 127397;
  return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
}
