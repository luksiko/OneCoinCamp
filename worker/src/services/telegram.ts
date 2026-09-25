import { DbClient } from '../db/client';
import { NormalizedOffer, UserRoute, UserFilters } from '../types';
import { t, pluralizeDays } from './i18n';
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

export const BOT_COMMANDS_EN = [
  { command: 'start', description: 'Main menu' },
  { command: 'actual', description: 'Active 1€ offers' },
  { command: 'routes', description: 'My tracked routes' },
  { command: 'check', description: 'Check offers now' },
  { command: 'digest', description: '24h digest' },
  { command: 'subscribe', description: 'Premium subscription' },
  { command: 'account', description: 'My account' },
  { command: 'silent', description: 'Silent hours' },
  { command: 'status', description: 'System status' },
  { command: 'help', description: 'Help & instructions' },
];

export function getMainMenuKeyboard(webAppUrl?: string) {
  const miniAppBtn = webAppUrl
    ? { text: '🚐 Mini App ▫️', web_app: { url: webAppUrl } }
    : { text: '🚐 Mini App', callback_data: 'menu_help' };

  return {
    inline_keyboard: [
      [
        miniAppBtn,
        { text: '🎯 Офферы 1€', callback_data: 'menu_actual' },
      ],
      [
        { text: '🚗 Мои маршруты', callback_data: 'menu_routes' },
        { text: '🔍 Проверить', callback_data: 'menu_check' },
      ],
      [
        { text: '📋 Дайджест 24ч', callback_data: 'menu_digest' },
        { text: '💎 Подписка', callback_data: 'menu_subscribe' },
      ],
      [
        { text: '👤 Мой аккаунт', callback_data: 'menu_account' },
        { text: '🌙 Тихие часы', callback_data: 'menu_silent' },
      ],
      [
        { text: '📊 Статус', callback_data: 'menu_status' },
        { text: 'ℹ️ Помощь', callback_data: 'menu_help' },
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
    return fetchJson(this.apiUrl('setMyCommands'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: BOT_COMMANDS_RU, language_code: 'ru' }),
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
    disableNotification = false
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

  async sendMainMenu(chatId: string | number): Promise<void> {
    const webAppUrl = this.secrets.workerUrl || '';
    const welcomeText =
      `🚐 <b>Camper Monitor — перегоны кемперов за 1€</b>\n\n` +
      `Автоматический мониторинг кемперов и автомобилей за 1 евро (Roadsurfer, Movacar, Indie Campers, Imoova).\n\n` +
      `Используйте меню ниже для быстрого доступа ко всем функциям или откройте Mini App для интерактивной карты:`;

    // Ensure user has commands button (≡) available in their chat bar
    await this.setChatMenuButton(chatId, 'commands');

    await this.sendMessage(chatId, welcomeText, {
      reply_markup: getMainMenuKeyboard(webAppUrl),
    });
  }

  async showActualOffers(chatId: string | number, telegramId: string): Promise<void> {
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
        [{ text: '🔍 Запустить проверку', callback_data: 'menu_check' }],
        webAppUrl ? [{ text: '🚐 Настроить в Mini App ▫️', web_app: { url: webAppUrl } }] : [],
        [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
      ].filter((r) => r.length > 0);

      await this.sendMessage(
        chatId,
        `📋 <b>Актуальные офферы</b>\n\nСейчас нет доступных предложений по вашим фильтрам.\nЗапустите проверку провайдеров или добавьте новые маршруты в Mini App.`,
        { reply_markup: { inline_keyboard: emptyButtons } }
      );
      return;
    }

    await this.sendMessage(chatId, `🎯 <b>Актуальные офферы (${matched.length}):</b>`);
    for (const off of matched.slice(0, 5)) {
      await this.sendOfferAlert(chatId, off);
    }

    await this.sendMessage(chatId, `Показано предложений: <b>${Math.min(matched.length, 5)}</b> из <b>${matched.length}</b>.`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Проверить ещё раз', callback_data: 'menu_check' }],
          [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
        ],
      },
    });
  }

  async showRoutesMenu(chatId: string | number, telegramId: string): Promise<void> {
    const routes = await this.db.getUserRoutes(telegramId);
    const webAppUrl = this.secrets.workerUrl || '';

    let resp = '';
    if (routes.length === 0) {
      resp = `🚗 <b>Отслеживаемые маршруты</b>\n\nУ вас пока нет активных маршрутов.\nОткройте Mini App, выберите нужные направления и сохраните их.`;
    } else {
      resp = `🚗 <b>Отслеживаемые маршруты (${routes.length}):</b>\n\n`;
      for (const r of routes) {
        const statusIcon = r.enabled ? '✅' : '⏸️';
        resp += `${statusIcon} <b>${escapeHtml(r.source)}</b>: ${escapeHtml(r.origin_name || '*')} ➔ ${escapeHtml(r.destination_name || '*')}\n`;
      }
    }

    const inlineKeyboard: any[] = [];
    if (webAppUrl) {
      inlineKeyboard.push([{ text: '🚐 Настроить маршруты в Mini App ▫️', web_app: { url: webAppUrl } }]);
    }
    if (routes.length > 0) {
      inlineKeyboard.push([{ text: '🗑 Очистить все маршруты', callback_data: 'clear_routes_confirm' }]);
    }
    inlineKeyboard.push([{ text: '◀️ Главное меню', callback_data: 'menu_main' }]);

    await this.sendMessage(chatId, resp, { reply_markup: { inline_keyboard: inlineKeyboard } });
  }

  async showDigest(chatId: string | number, telegramId: string): Promise<void> {
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
      await this.sendMessage(chatId, '📋 <b>Дайджест за 24 часа</b>\n\nНовых подходящих офферов за последние 24 часа не найдено.', {
        reply_markup: {
          inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]],
        },
      });
      return;
    }

    const lines = [`📋 <b>Дайджест за 24 часа (${recent.length}):</b>\n`];
    for (const offer of recent.slice(0, 10)) {
      lines.push(`• <b>${escapeHtml(offer.origin)}</b> ➔ <b>${escapeHtml(offer.destination)}</b> · ${offer.price} € · <code>${escapeHtml(offer.pickup_date)}</code>`);
    }
    if (recent.length > 10) lines.push(`\n<i>И ещё ${recent.length - 10} предложений в архиве Mini App.</i>`);

    await this.sendMessage(chatId, lines.join('\n'), {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎯 Актуальные офферы', callback_data: 'menu_actual' }],
          [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
        ],
      },
    });
  }

  async showSubscriptionMenu(chatId: string | number, telegramId: string): Promise<void> {
    const user = await this.db.getUser(telegramId);
    const isActive = this.db.isSubscriptionActive(user);

    if (isActive && user?.subscription_status !== 'trial') {
      const expiry = user?.subscription_expires_at
        ? new Date(user.subscription_expires_at).toLocaleDateString('ru-RU')
        : '?';
      await this.sendMessage(
        chatId,
        `💎 <b>Ваша подписка активна!</b>\n\nСтатус: <b>Premium</b>\nДействует до: <b>${expiry}</b>\n\nВам доступны безлимитные маршруты и мгновенные уведомления.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👤 Мой аккаунт', callback_data: 'menu_account' }],
              [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
            ],
          },
        }
      );
      return;
    }

    const webAppUrl = this.secrets.workerUrl || '';
    const text =
      `💎 <b>Camper Monitor Premium</b>\n\n` +
      `• Безлимитные маршруты и моментальные алерты\n` +
      `• Полный архив офферов и аналитика\n` +
      `• Приоритетный мониторинг перегонов\n\n` +
      `Стоимость: <b>€4.99 / месяц</b> или <b>$5.99 USDT</b>\n\n` +
      `Выберите удобный способ оплаты:`;

    const buttons: any[] = [];
    if (webAppUrl) {
      buttons.push([{ text: '💳 Оплатить картой — €4.99/мес ▫️', web_app: { url: webAppUrl + '?subscribe=1' } }]);
    }
    buttons.push([{ text: '💎 Оплатить USDT — $5.99', callback_data: 'pay_crypto' }]);
    buttons.push([{ text: '◀️ Главное меню', callback_data: 'menu_main' }]);

    await this.sendMessage(chatId, text, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async showAccountMenu(chatId: string | number, telegramId: string): Promise<void> {
    const user = await this.db.getUser(telegramId);
    const isActive = this.db.isSubscriptionActive(user);
    const statusText = formatSubscriptionStatus(user!, isActive);
    const routes = await this.db.getUserRoutes(telegramId);
    const routeCount = routes.length;
    const maxRoutes = this.db.getUserMaxRoutes(user);
    const routeInfo = maxRoutes >= 999
      ? `Маршрутов: <b>${routeCount}</b> (без ограничений)`
      : `Маршрутов: <b>${routeCount} / ${maxRoutes}</b>`;

    let msgStr = `👤 <b>Ваш аккаунт</b>\n\n${statusText}\n📍 ${routeInfo}`;

    const buttons: any[] = [];
    if (!isActive) {
      buttons.push([{ text: '💎 Оформить Premium', callback_data: 'menu_subscribe' }]);
    }
    buttons.push([{ text: '🚗 Мои маршруты', callback_data: 'menu_routes' }]);
    buttons.push([{ text: '◀️ Главное меню', callback_data: 'menu_main' }]);

    await this.sendMessage(chatId, msgStr, {
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async showSilentMenu(chatId: string | number, telegramId: string): Promise<void> {
    const current = await this.db.getUserFilters(telegramId);
    const isEnabled = Boolean(current.silent_hours_enabled);
    const statusStr = isEnabled ? '🔔 ВКЛЮЧЕНЫ' : '🔕 ВЫКЛЮЧЕНЫ';
    const rangeStr = `${current.silent_hours_start || '23:00'} – ${current.silent_hours_end || '07:00'}`;

    const toggleBtn = isEnabled
      ? { text: '☀️ Выключить тихий режим', callback_data: 'silent_set:off' }
      : { text: '🌙 Включить тихий режим', callback_data: 'silent_set:on' };

    const msg =
      `🌙 <b>Режим тихих часов</b>\n\n` +
      `В тихие часы бот присылает уведомления без звука, чтобы не беспокоить вас.\n\n` +
      `Текущий статус: <b>${statusStr}</b>\n` +
      `Интервал: <code>${rangeStr}</code>\n\n` +
      `Выберите действие или пресет времени:`;

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
        [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
      ],
    };

    await this.sendMessage(chatId, msg, { reply_markup: keyboard });
  }

  async showStatusMenu(chatId: string | number): Promise<void> {
    const latestRun = await this.db.getLatestRun();
    const activeUsers = await this.db.listActiveUsers();
    const message = t('status_header', 'ru', {
      lastRun: latestRun?.finished_at || 'Нет данных',
      status: latestRun?.status || 'ok',
      found: latestRun?.offers_found || 0,
      sent: latestRun?.alerts_sent || 0,
      users: activeUsers.length,
    });

    await this.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔍 Запустить проверку сейчас', callback_data: 'menu_check' }],
          [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
        ],
      },
    });
  }

  async showHelpMenu(chatId: string | number): Promise<void> {
    const helpMsg =
      `🚐 <b>Camper Monitor — Справка</b>\n\n` +
      `Бот сканирует сайты провайдеров каждые несколько минут и мгновенно оповещает о доступных перегонах за <b>1€</b>.\n\n` +
      `<b>Поддерживаемые провайдеры:</b>\n` +
      `• <b>Roadsurfer Rally</b> — кемперы по всей Европе\n` +
      `• <b>Movacar</b> — автомобили и кемперы\n` +
      `• <b>Indie Campers</b> — кемпервэны\n` +
      `• <b>Imoova</b> — международные перегоны\n\n` +
      `<b>Быстрые команды:</b>\n` +
      `• /actual — активные предложения по фильтрам\n` +
      `• /routes — список ваших маршрутов\n` +
      `• /check — запуск сканирования прямо сейчас\n` +
      `• /digest — дайджест найденного за 24 часа\n` +
      `• /silent — тихие часы (без звука)\n` +
      `• /subscribe — оформление Premium\n` +
      `• /account — статус аккаунта и лимиты\n` +
      `• /status — статус сканера и последний прогон\n\n` +
      `💡 Вы также можете в любой момент нажать кнопку <b>[ ≡ Меню ]</b> в левом нижнем углу экрана.`;

    await this.sendMessage(chatId, helpMsg, {
      reply_markup: {
        inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]],
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
        await this.db.upsertUser(fromId, chatId, cb.from?.username, cb.from?.first_name);
      }

      const browserLogin = data.match(/^browser_login:([A-Za-z0-9_-]{32})$/);
      if (browserLogin) {
        if (cb.message?.chat?.type !== 'private' || String(chatId) !== String(cb.from?.id)) {
          await this.answerCallbackQuery(cb.id, 'Подтверждение доступно только в личном чате.');
          return;
        }
        const approved = await this.db.approveBrowserLoginChallenge(browserLogin[1], {
          id: String(cb.from.id),
          username: cb.from.username,
          language: cb.from.language_code,
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

      if (data === 'menu_main') {
        await this.answerCallbackQuery(cb.id);
        await this.sendMainMenu(chatId);
        return;
      }

      if (data === 'menu_actual') {
        await this.answerCallbackQuery(cb.id);
        await this.showActualOffers(chatId, fromId);
        return;
      }

      if (data === 'menu_routes') {
        await this.answerCallbackQuery(cb.id);
        await this.showRoutesMenu(chatId, fromId);
        return;
      }

      if (data === 'menu_check') {
        await this.answerCallbackQuery(cb.id, 'Запускаю сканирование...');
        await this.sendMessage(chatId, '⏳ <b>Сканирование провайдеров запущено...</b>\nПроверяем Roadsurfer, Movacar, Indie Campers и Imoova.');
        try {
          const result = await triggerMonitorFn();
          const found = result?.offersFound || 0;
          await this.sendMessage(chatId, `✅ <b>Сканирование завершено.</b>\nНайдено новых офферов: <b>${found}</b>.`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🎯 Посмотреть актуальные', callback_data: 'menu_actual' }],
                [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
              ],
            },
          });
        } catch (err: any) {
          await this.sendMessage(chatId, `❌ Ошибка проверки: ${err.message || err}`, {
            reply_markup: { inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]] },
          });
        }
        return;
      }

      if (data === 'menu_digest') {
        await this.answerCallbackQuery(cb.id);
        await this.showDigest(chatId, fromId);
        return;
      }

      if (data === 'menu_subscribe') {
        await this.answerCallbackQuery(cb.id);
        await this.showSubscriptionMenu(chatId, fromId);
        return;
      }

      if (data === 'menu_account') {
        await this.answerCallbackQuery(cb.id);
        await this.showAccountMenu(chatId, fromId);
        return;
      }

      if (data === 'menu_silent') {
        await this.answerCallbackQuery(cb.id);
        await this.showSilentMenu(chatId, fromId);
        return;
      }

      if (data.startsWith('silent_set:')) {
        const val = data.replace('silent_set:', '');
        if (val === 'on') {
          await this.db.setUserFilters(fromId, { silent_hours_enabled: true });
          await this.answerCallbackQuery(cb.id, 'Тихий режим включен');
        } else if (val === 'off') {
          await this.db.setUserFilters(fromId, { silent_hours_enabled: false });
          await this.answerCallbackQuery(cb.id, 'Тихий режим выключен');
        } else if (val.includes('-')) {
          const [start, end] = val.split('-');
          await this.db.setUserFilters(fromId, {
            silent_hours_enabled: true,
            silent_hours_start: start,
            silent_hours_end: end,
          });
          await this.answerCallbackQuery(cb.id, `Установлено: ${start} - ${end}`);
        }
        await this.showSilentMenu(chatId, fromId);
        return;
      }

      if (data === 'clear_routes_confirm') {
        await this.answerCallbackQuery(cb.id);
        await this.sendMessage(chatId, '⚠️ <b>Вы уверены, что хотите удалить все сохранённые маршруты?</b>', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Да, удалить все', callback_data: 'clear_routes_do' }],
              [{ text: 'Отмена', callback_data: 'menu_routes' }],
            ],
          },
        });
        return;
      }

      if (data === 'clear_routes_do') {
        const removed = await this.db.clearUserRoutes(fromId);
        await this.answerCallbackQuery(cb.id, `Удалено: ${removed}`);
        await this.sendMessage(chatId, `🗑 Все маршруты удалены (кол-во: <b>${removed}</b>).`, {
          reply_markup: {
            inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]],
          },
        });
        return;
      }

      if (data === 'menu_status') {
        await this.answerCallbackQuery(cb.id);
        await this.showStatusMenu(chatId);
        return;
      }

      if (data === 'menu_help') {
        await this.answerCallbackQuery(cb.id);
        await this.showHelpMenu(chatId);
        return;
      }

      if (data === 'pay_crypto') {
        if (!this.secrets.cryptoBotToken) {
          await this.answerCallbackQuery(cb.id, 'Оплата криптой временно недоступна');
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
              amount: '5.99',
              description: 'Camper Monitor Premium (1 Month)',
              hidden_message: 'Спасибо за оплату подписки Camper Monitor!',
              payload: JSON.stringify({ telegram_id: fromId }),
            }),
          });
          const cryptoData = await res.json<any>();
          if (cryptoData.ok && cryptoData.result?.pay_url) {
            await this.answerCallbackQuery(cb.id);
            await this.sendMessage(
              chatId,
              `💎 <b>Оплата через CryptoBot (USDT)</b>\n\nСумма: <b>$5.99 USDT</b>\nСрок: <b>30 дней Premium</b>\n\nНажмите кнопку ниже для быстрой оплаты в боте CryptoBot:`,
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: 'Оплатить $5.99 USDT ➔', url: cryptoData.result.pay_url }],
                    [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
                  ],
                },
              }
            );
          } else {
            await this.answerCallbackQuery(cb.id, 'Не удалось создать счет в CryptoBot');
          }
        } catch (e) {
          console.error('CryptoBot invoice error:', e);
          await this.answerCallbackQuery(cb.id, 'Ошибка при обращении к CryptoBot');
        }
        return;
      }

      if (data.startsWith('disable_route:')) {
        const routeId = data.replace('disable_route:', '');
        if (chatId) {
          await this.db.disableUserRoute(chatId, routeId);
          await this.answerCallbackQuery(cb.id, 'Маршрут успешно отключен!');
          await this.sendMessage(chatId, '🚫 Маршрут был отключен.', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚗 Мои маршруты', callback_data: 'menu_routes' }],
                [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
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

    // Register / update user in DB
    await this.db.upsertUser(telegramId, chatId, msg.from?.username, msg.from?.first_name);

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
      await this.sendMainMenu(chatId);
      return;
    }

    if (text.startsWith('/actual')) {
      await this.showActualOffers(chatId, telegramId);
      return;
    }

    if (text.startsWith('/routes')) {
      await this.showRoutesMenu(chatId, telegramId);
      return;
    }

    if (text.startsWith('/check')) {
      await this.sendMessage(chatId, '⏳ <b>Сканирование провайдеров запущено...</b>\nПроверяем Roadsurfer, Movacar, Indie Campers и Imoova.');
      try {
        const result = await triggerMonitorFn();
        const found = result?.offersFound || 0;
        await this.sendMessage(chatId, `✅ <b>Сканирование завершено.</b>\nНайдено новых офферов: <b>${found}</b>.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎯 Посмотреть актуальные', callback_data: 'menu_actual' }],
              [{ text: '◀️ Главное меню', callback_data: 'menu_main' }],
            ],
          },
        });
      } catch (err: any) {
        await this.sendMessage(chatId, `❌ Ошибка проверки: ${err.message || err}`, {
          reply_markup: { inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]] },
        });
      }
      return;
    }

    if (text.startsWith('/digest')) {
      await this.showDigest(chatId, telegramId);
      return;
    }

    if (text.startsWith('/subscribe')) {
      await this.showSubscriptionMenu(chatId, telegramId);
      return;
    }

    if (text.startsWith('/account')) {
      await this.showAccountMenu(chatId, telegramId);
      return;
    }

    if (text.startsWith('/silent')) {
      const parts = text.split(/\s+/);
      const arg = parts[1] || '';
      if (arg === 'on') {
        await this.db.setUserFilters(telegramId, { silent_hours_enabled: true });
        await this.sendMessage(chatId, t('silent_on', 'ru'), {
          reply_markup: { inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]] },
        });
      } else if (arg === 'off') {
        await this.db.setUserFilters(telegramId, { silent_hours_enabled: false });
        await this.sendMessage(chatId, t('silent_off', 'ru'), {
          reply_markup: { inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]] },
        });
      } else if (arg.includes('-')) {
        const [start, end] = arg.split('-');
        if (/^\d{1,2}:\d{2}$/.test(start) && /^\d{1,2}:\d{2}$/.test(end)) {
          await this.db.setUserFilters(telegramId, {
            silent_hours_enabled: true,
            silent_hours_start: start,
            silent_hours_end: end,
          });
          await this.sendMessage(chatId, t('silent_set', 'ru', { start, end }), {
            reply_markup: { inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]] },
          });
        } else {
          await this.sendMessage(chatId, t('silent_invalid_format', 'ru'));
        }
      } else {
        await this.showSilentMenu(chatId, telegramId);
      }
      return;
    }

    if (text.startsWith('/status')) {
      await this.showStatusMenu(chatId);
      return;
    }

    if (text.startsWith('/help')) {
      await this.showHelpMenu(chatId);
      return;
    }

    if (text.startsWith('/clear_routes') || text.startsWith('/reset_routes')) {
      const removed = await this.db.clearUserRoutes(telegramId);
      await this.sendMessage(chatId, `🗑 Удалено маршрутов: <b>${removed}</b>.`, {
        reply_markup: { inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: 'menu_main' }]] },
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
