import { DbClient } from '../db/client';
import { NormalizedOffer, UserRoute } from '../types';
import { t, pluralizeDays, resolveLanguage } from './i18n';
import { fetchJson } from '../utils/http';
import { routeMatchesOffer, offerMatchesUserFilters, parseIsoDate } from './filters';
import { browserLoginCode } from '../utils/telegram-login';
import { formatSubscriptionStatus } from './subscription';

export interface TelegramSecrets {
  botToken: string;
  chatId?: string;
  webhookSecret?: string;
  workerUrl?: string;
  cryptoBotToken?: string;
}

export const BOT_COMMANDS_EN = [
  { command: 'start', description: 'Main menu' },
  { command: 'actual', description: 'Active 1€ offers' },
  { command: 'routes', description: 'My tracked routes' },
  { command: 'check', description: 'Check offers now' },
  { command: 'digest', description: '24-hour offers digest' },
  { command: 'subscribe', description: 'Premium subscription' },
  { command: 'account', description: 'My account & status' },
  { command: 'silent', description: 'Silent hours settings' },
  { command: 'status', description: 'Monitoring system status' },
  { command: 'help', description: 'Help & instructions' },
];

export const BOT_COMMANDS_RU = [
  { command: 'start', description: 'Главное меню' },
  { command: 'actual', description: 'Актуальные офферы за 1€' },
  { command: 'routes', description: 'Мои маршруты' },
  { command: 'check', description: 'Проверить сейчас' },
  { command: 'digest', description: 'Дайджест за 24 часа' },
  { command: 'subscribe', description: 'Премиум подписка' },
  { command: 'account', description: 'Мой аккаунт' },
  { command: 'silent', description: 'Тихие часы' },
  { command: 'status', description: 'Статус мониторинга' },
  { command: 'help', description: 'Справка и инструкции' },
];

export const BOT_COMMANDS_DE = [
  { command: 'start', description: 'Hauptmenü' },
  { command: 'actual', description: 'Aktuelle 1€-Angebote' },
  { command: 'routes', description: 'Meine Routen' },
  { command: 'check', description: 'Jetzt prüfen' },
  { command: 'digest', description: '24-Stunden-Übersicht' },
  { command: 'subscribe', description: 'Premium-Abonnement' },
  { command: 'account', description: 'Mein Konto' },
  { command: 'silent', description: 'Ruhezeiten' },
  { command: 'status', description: 'Monitor-Status' },
  { command: 'help', description: 'Hilfe und Anleitung' },
];

export const BOT_COMMANDS_IT = [
  { command: 'start', description: 'Menu principale' },
  { command: 'actual', description: 'Offerte attive a 1€' },
  { command: 'routes', description: 'I miei percorsi' },
  { command: 'check', description: 'Controlla ora' },
  { command: 'digest', description: 'Riepilogo 24 ore' },
  { command: 'subscribe', description: 'Abbonamento Premium' },
  { command: 'account', description: 'Il mio account' },
  { command: 'silent', description: 'Ore silenziose' },
  { command: 'status', description: 'Stato del monitor' },
  { command: 'help', description: 'Guida e istruzioni' },
];

export function getMainMenuKeyboard(webAppUrl?: string, lang: string = 'en') {
  const l = resolveLanguage(lang);
  const miniAppBtn = webAppUrl
    ? { text: t('btn_miniapp', l), web_app: { url: webAppUrl } }
    : { text: t('btn_miniapp', l), callback_data: 'menu_help' };

  return {
    inline_keyboard: [
      [
        miniAppBtn,
        { text: t('btn_actual', l), callback_data: 'menu_actual' },
      ],
      [
        { text: t('btn_routes', l), callback_data: 'menu_routes' },
        { text: t('btn_check', l), callback_data: 'menu_check' },
      ],
      [
        { text: t('btn_digest', l), callback_data: 'menu_digest' },
        { text: t('btn_subscribe', l), callback_data: 'menu_subscribe' },
      ],
      [
        { text: t('btn_account', l), callback_data: 'menu_account' },
        { text: t('btn_silent', l), callback_data: 'menu_silent' },
      ],
      [
        { text: t('btn_status', l), callback_data: 'menu_status' },
        { text: t('btn_help', l), callback_data: 'menu_help' },
      ],
    ],
  };
}

export class TelegramService {
  constructor(private secrets: TelegramSecrets, private db: DbClient) {}

  getWebhookSecret(): string {
    if (!this.secrets.webhookSecret) throw new Error('Webhook secret not configured');
    return this.secrets.webhookSecret;
  }

  async getUserLanguage(telegramId: string | number, tgLangCode?: string | null): Promise<string> {
    try {
      const user = typeof this.db?.getUser === 'function' ? await this.db.getUser(telegramId) : null;
      return resolveLanguage(user?.language || tgLangCode);
    } catch {
      return resolveLanguage(tgLangCode);
    }
  }

  async setMyCommands(): Promise<any> {
    if (!this.secrets.botToken) return null;

    // Set default / English commands
    await fetchJson(this.apiUrl('setMyCommands'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: BOT_COMMANDS_EN }),
      retries: 1,
    });

    // Set Russian commands
    await fetchJson(this.apiUrl('setMyCommands'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: BOT_COMMANDS_RU, language_code: 'ru' }),
      retries: 1,
    });

    // Set German commands
    await fetchJson(this.apiUrl('setMyCommands'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: BOT_COMMANDS_DE, language_code: 'de' }),
      retries: 1,
    });

    // Set Italian commands
    return fetchJson(this.apiUrl('setMyCommands'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: BOT_COMMANDS_IT, language_code: 'it' }),
      retries: 1,
    });
  }

  async setChatMenuButton(
    chatId?: string | number,
    menuType: 'commands' | 'default' | 'web_app' | string = 'commands',
    webAppUrl?: string
  ): Promise<any> {
    if (!this.secrets.botToken) return null;
    let menu_button: any;
    if (menuType.startsWith('http')) {
      menu_button = {
        type: 'web_app',
        text: 'Open Monitor',
        web_app: { url: menuType },
      };
    } else if (menuType === 'web_app') {
      const url = webAppUrl || this.secrets.workerUrl;
      if (!url) return null;
      menu_button = {
        type: 'web_app',
        text: 'Open Monitor',
        web_app: { url },
      };
    } else {
      menu_button = { type: 'commands' };
    }

    return fetchJson(this.apiUrl('setChatMenuButton'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(chatId ? { chat_id: String(chatId) } : {}),
        menu_button,
      }),
      retries: 1,
    });
  }

  async registerWebhook(webhookUrl: string): Promise<void> {
    const response = await fetchJson<any>(this.apiUrl('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, secret_token: this.getWebhookSecret() }),
      retries: 1,
    });
    if (!response?.ok) throw new Error(response?.description || 'Telegram rejected webhook');
    await this.setMyCommands();
    await this.setChatMenuButton(undefined, 'commands');
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
    disableNotification = false,
    lang = 'ru'
  ): Promise<void> {
    if (!this.secrets.botToken) throw new Error('Telegram Bot Token not configured');
    const isCamper = offer.vehicle_type === 'camper';
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
          durationText = pluralizeDays(days, lang);
        }
      }
    }

    const vehicleTypeName = isCamper ? (lang === 'ru' ? 'Кемпер' : 'Camper') : (lang === 'ru' ? 'Автомобиль' : 'Car');
    const foundLabel = lang === 'ru' ? 'найден!' : 'found!';
    const fromLabel = lang === 'ru' ? 'Откуда' : 'From';
    const toLabel = lang === 'ru' ? 'Куда' : 'To';
    const datesLabel = lang === 'ru' ? 'Даты' : 'Dates';
    const priceLabel = lang === 'ru' ? 'Цена' : 'Price';
    const modelLabel = lang === 'ru' ? 'Модель' : 'Model';
    const bedsLabel = lang === 'ru' ? 'Спальных мест' : 'Beds';

    let text = `${pIcon} <b>${capitalize(offer.source)} — ${vehicleTypeName} ${foundLabel}</b>\n\n`;
    text += `📍 ${fromLabel}: <b>${escapeHtml(offer.origin)}</b> ${originFlag}\n`;
    text += `🏁 ${toLabel}: <b>${escapeHtml(offer.destination)}</b> ${destFlag}\n`;
    text += `📅 ${datesLabel}: <code>${offer.pickup_date}</code> ➔ <code>${offer.return_date}</code>${durationText}\n`;
    text += `💶 ${priceLabel}: ${priceText}\n`;
    if (offer.vehicle) {
      text += `🚘 ${modelLabel}: <b>${escapeHtml(offer.vehicle)}</b>\n`;
    }
    if (offer.sleeping_places && isCamper) {
      text += `🛏 ${bedsLabel}: <b>${offer.sleeping_places}</b>\n`;
    }

    const inlineKeyboard: any[] = [];
    if (offer.booking_url) {
      inlineKeyboard.push([
        { text: t('btn_book', lang), url: offer.booking_url },
      ]);
    }
    if (route?.id) {
      inlineKeyboard.push([
        { text: t('btn_disable_route', lang), callback_data: `disable_route:${route.id}` },
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

  async sendMainMenu(chatId: string | number, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
    const webAppUrl = this.secrets.workerUrl || '';
    const welcomeText = t('menu_welcome', l);

    // Ensure user has commands button (≡) available in their chat bar
    await this.setChatMenuButton(chatId, 'commands');

    await this.sendMessage(chatId, welcomeText, {
      reply_markup: getMainMenuKeyboard(webAppUrl, l),
    });
  }

  async showActualOffers(chatId: string | number, telegramId: string, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
    const userFilters = await this.db.getUserFilters(telegramId);
    const userRoutes = await this.db.getUserRoutes(telegramId);
    const activeOffers = await this.db.getOffers(50, 0);

    const matched = activeOffers.filter((offer) => {
      const r = userRoutes.find((route) => routeMatchesOffer(route, offer));
      return r && offerMatchesUserFilters(offer, userFilters, r);
    });

    const webAppUrl = this.secrets.workerUrl || '';

    if (matched.length === 0) {
      const emptyButtons = [
        [{ text: t('btn_check', l), callback_data: 'menu_check' }],
        webAppUrl ? [{ text: t('btn_setup_miniapp', l), web_app: { url: webAppUrl } }] : [],
        [{ text: t('btn_main_menu', l), callback_data: 'menu_main' }],
      ].filter((r) => r.length > 0);

      await this.sendMessage(
        chatId,
        t('actual_empty', l),
        { reply_markup: { inline_keyboard: emptyButtons } }
      );
      return;
    }

    await this.sendMessage(chatId, t('actual_header', l, { count: matched.length }));
    for (const off of matched.slice(0, 5)) {
      await this.sendOfferAlert(chatId, off, undefined, false, l);
    }

    await this.sendMessage(chatId, t('actual_footer', l, { shown: Math.min(matched.length, 5), total: matched.length }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('btn_check_again', l), callback_data: 'menu_check' }],
          [{ text: t('btn_main_menu', l), callback_data: 'menu_main' }],
        ],
      },
    });
  }

  async showRoutesMenu(chatId: string | number, telegramId: string, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
    const routes = await this.db.getUserRoutes(telegramId);
    const webAppUrl = this.secrets.workerUrl || '';

    let resp = '';
    if (routes.length === 0) {
      resp = t('routes_empty', l);
    } else {
      resp = t('routes_header', l, { count: routes.length });
      for (const r of routes) {
        const statusIcon = r.enabled ? '✅' : '⏸️';
        resp += `${statusIcon} <b>${escapeHtml(r.source)}</b>: ${escapeHtml(r.origin_name || '*')} ➔ ${escapeHtml(r.destination_name || '*')}\n`;
      }
    }

    const inlineKeyboard: any[] = [];
    if (webAppUrl) {
      inlineKeyboard.push([{ text: t('btn_setup_miniapp', l), web_app: { url: webAppUrl } }]);
    }
    if (routes.length > 0) {
      inlineKeyboard.push([{ text: t('btn_clear_routes', l), callback_data: 'clear_routes_confirm' }]);
    }
    inlineKeyboard.push([{ text: t('btn_main_menu', l), callback_data: 'menu_main' }]);

    await this.sendMessage(chatId, resp, { reply_markup: { inline_keyboard: inlineKeyboard } });
  }

  async showDigest(chatId: string | number, telegramId: string, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
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
      await this.sendMessage(chatId, t('digest_empty', l), {
        reply_markup: {
          inline_keyboard: [[{ text: t('btn_main_menu', l), callback_data: 'menu_main' }]],
        },
      });
      return;
    }

    const lines = [t('digest_header', l, { count: recent.length })];
    for (const offer of recent.slice(0, 10)) {
      lines.push(`• <b>${escapeHtml(offer.origin)}</b> ➔ <b>${escapeHtml(offer.destination)}</b> · ${offer.price} € · <code>${escapeHtml(offer.pickup_date)}</code>`);
    }
    if (recent.length > 10) lines.push(t('digest_more', l, { count: recent.length - 10 }));

    await this.sendMessage(chatId, lines.join('\n'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('btn_actual', l), callback_data: 'menu_actual' }],
          [{ text: t('btn_main_menu', l), callback_data: 'menu_main' }],
        ],
      },
    });
  }

  async showSubscriptionMenu(chatId: string | number, telegramId: string, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
    const user = await this.db.getUser(telegramId);
    const isActive = this.db.isSubscriptionActive(user);

    if (isActive && user?.subscription_status !== 'trial') {
      const expiry = user?.subscription_expires_at
        ? new Date(user.subscription_expires_at).toLocaleDateString(l === 'ru' ? 'ru-RU' : 'en-GB')
        : '?';
      await this.sendMessage(
        chatId,
        t('sub_already_active', l, { expiry }),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: t('btn_account', l), callback_data: 'menu_account' }],
              [{ text: t('btn_main_menu', l), callback_data: 'menu_main' }],
            ],
          },
        }
      );
      return;
    }

    const webAppUrl = this.secrets.workerUrl || '';
    const text = t('sub_promo', l);

    const buttons: any[] = [];
    if (webAppUrl) {
      buttons.push([{ text: t('btn_pay_card', l), web_app: { url: webAppUrl + '?subscribe=1' } }]);
    }
    buttons.push([{ text: t('btn_pay_crypto', l), callback_data: 'pay_crypto' }]);
    buttons.push([{ text: t('btn_main_menu', l), callback_data: 'menu_main' }]);

    await this.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async showAccountMenu(chatId: string | number, telegramId: string, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
    const user = await this.db.getUser(telegramId);
    const isActive = this.db.isSubscriptionActive(user);
    const statusText = formatSubscriptionStatus(user!, isActive);
    const routes = await this.db.getUserRoutes(telegramId);
    const routeCount = routes.length;
    const maxRoutes = this.db.getUserMaxRoutes(user);
    const routeInfo = maxRoutes >= 999
      ? `${l === 'ru' ? 'Маршрутов' : 'Routes'}: <b>${routeCount}</b> (${l === 'ru' ? 'без ограничений' : 'unlimited'})`
      : `${l === 'ru' ? 'Маршрутов' : 'Routes'}: <b>${routeCount} / ${maxRoutes}</b>`;

    const msgStr = t('account_header', l, { status: statusText, routes: routeInfo });

    const buttons: any[] = [];
    if (!isActive) {
      buttons.push([{ text: t('account_btn_upgrade', l), callback_data: 'menu_subscribe' }]);
    }
    buttons.push([{ text: t('btn_routes', l), callback_data: 'menu_routes' }]);
    buttons.push([{ text: t('btn_main_menu', l), callback_data: 'menu_main' }]);

    await this.sendMessage(chatId, msgStr, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async showSilentMenu(chatId: string | number, telegramId: string, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
    const current = await this.db.getUserFilters(telegramId);
    const isEnabled = Boolean(current.silent_hours_enabled);
    const statusStr = isEnabled ? t('silent_enabled', l) : t('silent_disabled', l);
    const rangeStr = `${current.silent_hours_start || '23:00'} – ${current.silent_hours_end || '07:00'}`;

    const toggleBtn = isEnabled
      ? { text: t('btn_silent_off', l), callback_data: 'silent_set:off' }
      : { text: t('btn_silent_on', l), callback_data: 'silent_set:on' };

    const msg = t('silent_menu_title', l, { status: statusStr, range: rangeStr });

    const keyboard = {
      inline_keyboard: [
        [toggleBtn],
        [
          { text: '⏱ 23:00–07:00', callback_data: 'silent_set:23:00-07:00' },
          { text: '⏱ 22:00–08:00', callback_data: 'silent_set:22:00-08:00' },
        ],
        [
          { text: '⏱ 00:00–08:00', callback_data: 'silent_set:00:00-08:00' },
          { text: '⏱ 23:00–09:00', callback_data: 'silent_set:23:00-09:00' },
        ],
        [{ text: t('btn_main_menu', l), callback_data: 'menu_main' }],
      ],
    };

    await this.sendMessage(chatId, msg, { reply_markup: keyboard });
  }

  async showStatusMenu(chatId: string | number, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
    const latestRun = await this.db.getLatestRun();
    const activeUsers = await this.db.listActiveUsers();
    const message = t('status_header', l, {
      lastRun: latestRun?.finished_at || (l === 'ru' ? 'Нет данных' : 'No data'),
      status: latestRun?.status || 'ok',
      found: latestRun?.offers_found || 0,
      sent: latestRun?.alerts_sent || 0,
      users: activeUsers.length,
    });

    await this.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t('btn_check', l), callback_data: 'menu_check' }],
          [{ text: t('btn_main_menu', l), callback_data: 'menu_main' }],
        ],
      },
    });
  }

  async showHelpMenu(chatId: string | number, lang: string = 'en'): Promise<void> {
    const l = resolveLanguage(lang);
    const helpMsg = t('help_text', l);

    await this.sendMessage(chatId, helpMsg, {
      reply_markup: {
        inline_keyboard: [[{ text: t('btn_main_menu', l), callback_data: 'menu_main' }]],
      },
    });
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
      const fromId = String(cb.from?.id || chatId);

      if (chatId) {
        await this.db.upsertUser(fromId, chatId, cb.from?.username, cb.from?.first_name, cb.from?.language_code);
      }

      const lang = await this.getUserLanguage(fromId, cb.from?.language_code);

      const browserLogin = data.match(/^browser_login:([A-Za-z0-9_-]{32})$/);
      if (browserLogin) {
        if (cb.message?.chat?.type !== 'private' || String(chatId) !== String(cb.from?.id)) {
          await this.answerCallbackQuery(cb.id, lang === 'ru' ? 'Подтверждение доступно только в личном чате.' : 'Login confirmation only available in private chat.');
          return;
        }
        const approved = await this.db.approveBrowserLoginChallenge(browserLogin[1], {
          id: String(cb.from.id),
          username: cb.from.username,
          language: cb.from.language_code,
        });
        await this.answerCallbackQuery(cb.id, approved ? (lang === 'ru' ? 'Вход подтверждён' : 'Login approved') : (lang === 'ru' ? 'Ссылка устарела' : 'Link expired'));
        if (approved) {
          try {
            await this.sendMessage(chatId, lang === 'ru' ? '✅ Вернитесь на вкладку с Camper Monitor — вход завершится автоматически.' : '✅ Return to Camper Monitor — you will be logged in automatically.');
          } catch (error) {
            console.error('Could not send browser login confirmation:', error);
          }
        }
        return;
      }

      if (data === 'menu_main') {
        await this.answerCallbackQuery(cb.id);
        await this.sendMainMenu(chatId, lang);
        return;
      }

      if (data === 'menu_actual') {
        await this.answerCallbackQuery(cb.id);
        await this.showActualOffers(chatId, fromId, lang);
        return;
      }

      if (data === 'menu_routes') {
        await this.answerCallbackQuery(cb.id);
        await this.showRoutesMenu(chatId, fromId, lang);
        return;
      }

      if (data === 'menu_check') {
        await this.answerCallbackQuery(cb.id, lang === 'ru' ? 'Запускаю сканирование...' : 'Starting scan...');
        await this.sendMessage(chatId, t('check_starting', lang));
        try {
          const result = await triggerMonitorFn();
          const found = result?.offersFound || 0;
          await this.sendMessage(chatId, t('check_finished', lang, { count: found }), {
            reply_markup: {
              inline_keyboard: [
                [{ text: t('btn_actual', lang), callback_data: 'menu_actual' }],
                [{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }],
              ],
            },
          });
        } catch (err: any) {
          await this.sendMessage(chatId, `❌ Error: ${err.message || err}`, {
            reply_markup: { inline_keyboard: [[{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }]] },
          });
        }
        return;
      }

      if (data === 'menu_digest') {
        await this.answerCallbackQuery(cb.id);
        await this.showDigest(chatId, fromId, lang);
        return;
      }

      if (data === 'menu_subscribe') {
        await this.answerCallbackQuery(cb.id);
        await this.showSubscriptionMenu(chatId, fromId, lang);
        return;
      }

      if (data === 'menu_account') {
        await this.answerCallbackQuery(cb.id);
        await this.showAccountMenu(chatId, fromId, lang);
        return;
      }

      if (data === 'menu_silent') {
        await this.answerCallbackQuery(cb.id);
        await this.showSilentMenu(chatId, fromId, lang);
        return;
      }

      if (data.startsWith('silent_set:')) {
        const val = data.replace('silent_set:', '');
        if (val === 'on') {
          await this.db.setUserFilters(fromId, { silent_hours_enabled: true });
          await this.answerCallbackQuery(cb.id, t('silent_on', lang));
        } else if (val === 'off') {
          await this.db.setUserFilters(fromId, { silent_hours_enabled: false });
          await this.answerCallbackQuery(cb.id, t('silent_off', lang));
        } else if (val.includes('-')) {
          const [start, end] = val.split('-');
          await this.db.setUserFilters(fromId, {
            silent_hours_enabled: true,
            silent_hours_start: start,
            silent_hours_end: end,
          });
          await this.answerCallbackQuery(cb.id, `${start} - ${end}`);
        }
        await this.showSilentMenu(chatId, fromId, lang);
        return;
      }

      if (data === 'clear_routes_confirm') {
        await this.answerCallbackQuery(cb.id);
        await this.sendMessage(chatId, t('btn_clear_confirm_prompt', lang), {
          reply_markup: {
            inline_keyboard: [
              [{ text: t('btn_confirm_delete', lang), callback_data: 'clear_routes_do' }],
              [{ text: t('btn_cancel', lang), callback_data: 'menu_routes' }],
            ],
          },
        });
        return;
      }

      if (data === 'clear_routes_do') {
        const removed = await this.db.clearUserRoutes(fromId);
        await this.answerCallbackQuery(cb.id);
        await this.sendMessage(chatId, t('routes_cleared', lang, { count: removed }), {
          reply_markup: {
            inline_keyboard: [[{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }]],
          },
        });
        return;
      }

      if (data === 'menu_status') {
        await this.answerCallbackQuery(cb.id);
        await this.showStatusMenu(chatId, lang);
        return;
      }

      if (data === 'menu_help') {
        await this.answerCallbackQuery(cb.id);
        await this.showHelpMenu(chatId, lang);
        return;
      }

      if (data === 'pay_crypto') {
        if (!this.secrets.cryptoBotToken) {
          await this.answerCallbackQuery(cb.id, lang === 'ru' ? 'Оплата криптой временно недоступна' : 'Crypto payments currently unavailable');
          return;
        }
        try {
          const res = await fetch('https://pay.crypt.bot/api/createInvoice', {
            method: 'POST',
            headers: {
              'Crypto-Pay-API-Token': this.secrets.cryptoBotToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              asset: 'USDT',
              amount: '4.99',
              description: 'Camper Monitor Premium (1 Month)',
              hidden_message: 'Thank you for your purchase!',
              payload: JSON.stringify({ telegram_id: fromId }),
            }),
          });
          const cryptoData = await res.json<any>();
          if (cryptoData.ok && cryptoData.result?.pay_url) {
            await this.answerCallbackQuery(cb.id);
            await this.sendMessage(
              chatId,
              t('crypto_invoice_created', lang),
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: t('crypto_pay_btn', lang), url: cryptoData.result.pay_url }],
                    [{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }],
                  ],
                },
              }
            );
          } else {
            await this.answerCallbackQuery(cb.id, 'Failed to create invoice');
          }
        } catch (e) {
          console.error('CryptoBot invoice error:', e);
          await this.answerCallbackQuery(cb.id, 'Error creating invoice');
        }
        return;
      }

      if (data.startsWith('disable_route:')) {
        const routeId = data.replace('disable_route:', '');
        if (chatId) {
          await this.db.disableUserRoute(chatId, routeId);
          await this.answerCallbackQuery(cb.id, t('route_disabled', lang));
          await this.sendMessage(chatId, t('route_disabled', lang), {
            reply_markup: {
              inline_keyboard: [
                [{ text: t('btn_routes', lang), callback_data: 'menu_routes' }],
                [{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }],
              ],
            },
          });
        }
        return;
      }

      return;
    }

    const msg = update.message;
    if (!msg || !msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const telegramId = String(msg.from?.id || chatId);

    // Register / update user in DB with their Telegram language preference
    await this.db.upsertUser(telegramId, chatId, msg.from?.username, msg.from?.first_name, msg.from?.language_code);

    const lang = await this.getUserLanguage(telegramId, msg.from?.language_code);

    const browserLogin = text.match(/^\/start(?:@\w+)?\s+login_([A-Za-z0-9_-]{32})$/);
    if (browserLogin) {
      if (msg.chat?.type !== 'private' || !msg.from?.id) return;
      const available = await this.db.hasBrowserLoginChallenge(browserLogin[1]);
      if (!available) {
        await this.sendMessage(chatId, lang === 'ru' ? '⏱ Ссылка для входа устарела. Вернитесь на сайт и нажмите «Открыть бота в Telegram» ещё раз.' : '⏱ Login link expired. Please try again from the website.');
        return;
      }
      const code = await browserLoginCode(browserLogin[1]);
      const loginPrompt = lang === 'ru'
        ? `🔐 Вход в Camper Monitor. Код на сайте: <b>${code}</b>. Если код совпадает, подтвердите вход.`
        : `🔐 Camper Monitor login. Verification code: <b>${code}</b>. Confirm login if codes match:`;
      const confirmBtn = lang === 'ru' ? '✅ Подтвердить вход' : '✅ Confirm Login';
      await this.sendMessage(chatId, loginPrompt, {
        reply_markup: { inline_keyboard: [[{ text: confirmBtn, callback_data: `browser_login:${browserLogin[1]}` }]] },
      });
      return;
    }

    if (text.startsWith('/start')) {
      await this.sendMainMenu(chatId, lang);
      return;
    }

    if (text.startsWith('/actual')) {
      await this.showActualOffers(chatId, telegramId, lang);
      return;
    }

    if (text.startsWith('/routes')) {
      await this.showRoutesMenu(chatId, telegramId, lang);
      return;
    }

    if (text.startsWith('/check')) {
      await this.sendMessage(chatId, t('check_starting', lang));
      try {
        const result = await triggerMonitorFn();
        const found = result?.offersFound || 0;
        await this.sendMessage(chatId, t('check_finished', lang, { count: found }), {
          reply_markup: {
            inline_keyboard: [
              [{ text: t('btn_actual', lang), callback_data: 'menu_actual' }],
              [{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }],
            ],
          },
        });
      } catch (err: any) {
        await this.sendMessage(chatId, `❌ Error: ${err.message || err}`, {
          reply_markup: { inline_keyboard: [[{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }]] },
        });
      }
      return;
    }

    if (text.startsWith('/digest')) {
      await this.showDigest(chatId, telegramId, lang);
      return;
    }

    if (text.startsWith('/subscribe')) {
      await this.showSubscriptionMenu(chatId, telegramId, lang);
      return;
    }

    if (text.startsWith('/account')) {
      await this.showAccountMenu(chatId, telegramId, lang);
      return;
    }

    if (text.startsWith('/silent')) {
      const parts = text.split(/\s+/);
      const arg = parts[1] || '';
      if (arg === 'on') {
        await this.db.setUserFilters(telegramId, { silent_hours_enabled: true });
        await this.sendMessage(chatId, t('silent_on', lang), {
          reply_markup: { inline_keyboard: [[{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }]] },
        });
      } else if (arg === 'off') {
        await this.db.setUserFilters(telegramId, { silent_hours_enabled: false });
        await this.sendMessage(chatId, t('silent_off', lang), {
          reply_markup: { inline_keyboard: [[{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }]] },
        });
      } else if (arg.includes('-')) {
        const [start, end] = arg.split('-');
        if (/^\d{1,2}:\d{2}$/.test(start) && /^\d{1,2}:\d{2}$/.test(end)) {
          await this.db.setUserFilters(telegramId, {
            silent_hours_enabled: true,
            silent_hours_start: start,
            silent_hours_end: end,
          });
          await this.sendMessage(chatId, t('silent_set', lang, { start, end }), {
            reply_markup: { inline_keyboard: [[{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }]] },
          });
        } else {
          await this.sendMessage(chatId, t('silent_invalid_format', lang));
        }
      } else {
        await this.showSilentMenu(chatId, telegramId, lang);
      }
      return;
    }

    if (text.startsWith('/status')) {
      await this.showStatusMenu(chatId, lang);
      return;
    }

    if (text.startsWith('/help')) {
      await this.showHelpMenu(chatId, lang);
      return;
    }

    if (text.startsWith('/clear_routes') || text.startsWith('/reset_routes')) {
      const removed = await this.db.clearUserRoutes(telegramId);
      await this.sendMessage(chatId, t('routes_cleared', lang, { count: removed }), {
        reply_markup: { inline_keyboard: [[{ text: t('btn_main_menu', lang), callback_data: 'menu_main' }]] },
      });
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
