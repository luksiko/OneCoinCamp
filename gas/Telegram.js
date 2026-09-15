function sendTelegramOffer_(secrets, offer) {
  if (!secrets.telegramBotToken || !secrets.telegramChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in Script Properties');
  }

  let durationDays = '';
  if (offer.pickupDate && offer.returnDate) {
    const p = parseIsoDate_(offer.pickupDate);
    const r = parseIsoDate_(offer.returnDate);
    if (p && r) {
      const days = Math.round((r.getTime() - p.getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        durationDays = ' (' + days + ' дней)';
      }
    }
  }

  const sourceTitle = offer.source === 'roadsurfer' ? 'Roadsurfer Rally' : escapeHtml_(offer.source);
  const vehicleLine = offer.vehicle ? '\n🚐 Модель: ' + escapeHtml_(offer.vehicle) : '';
  const priceLine = offer.price ? '\n💶 Цена: <b>' + escapeHtml_(String(offer.price)) + '</b> € / сутки' : '';
  const buttonLabel = offer.source === 'roadsurfer' ? 'Забронировать на Roadsurfer ➔' : 'Открыть бронирование ➔';

  const text =
    '🚐 <b>' + sourceTitle + ' — найден слот за 1€!</b>\n' +
    '📍 ' + escapeHtml_(offer.origin) + ' ➔ ' + escapeHtml_(offer.destination) + '\n' +
    '📅 ' + escapeHtml_(offer.pickupDate || '') + ' – ' + escapeHtml_(offer.returnDate || '') + durationDays +
    vehicleLine +
    priceLine;

  const inlineKeyboard = offer.bookingUrl
    ? {
        inline_keyboard: [
          [
            {
              text: buttonLabel,
              url: offer.bookingUrl,
            },
          ],
        ],
      }
    : null;

  const payload = {
    chat_id: secrets.telegramChatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };

  if (inlineKeyboard) {
    payload.reply_markup = inlineKeyboard;
  }

  const result = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/sendMessage', {
    method: 'post',
    payload: JSON.stringify(payload),
    retries: 1,
  });

  if (!result || result.ok !== true) {
    throw new Error('Telegram sendMessage failed: ' + ((result && result.description) || 'no ok=true in response'));
  }
}

function sendTelegramMessage_(secrets, text, chatId) {
  const targetChatId = chatId || secrets.telegramChatId;
  if (!secrets.telegramBotToken || !targetChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing');
  }
  const result = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/sendMessage', {
    method: 'post',
    payload: JSON.stringify({
      chat_id: targetChatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    retries: 1,
  });
  if (!result || result.ok !== true) {
    throw new Error('Telegram sendMessage failed: ' + ((result && result.description) || 'no ok=true in response'));
  }
}

function handleTelegramWebhook(e) {
  try {
    const secrets = getScriptSecrets();
    const expectedSecret = secrets.telegramWebhookSecret;
    const providedSecret =
      (e && e.parameter && (e.parameter.secret || e.parameter.secret_token)) ||
      (e && e.headers && (e.headers['x-telegram-bot-api-secret-token'] || e.headers['X-Telegram-Bot-Api-Secret-Token'])) ||
      '';

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return HtmlService.createHtmlOutput('Unauthorized');
    }

    if (!e || !e.postData || !e.postData.contents) {
      return HtmlService.createHtmlOutput('ok');
    }
    const update = JSON.parse(e.postData.contents);
    handleTelegramUpdate_(update);
  } catch (error) {
  }
  return HtmlService.createHtmlOutput('ok');
}

function handleTelegramUpdate_(update) {
  if (!update || !update.message) {
    return;
  }
  const message = update.message;
  if (!message.text) {
    return;
  }

  const secrets = getScriptSecrets();
  if (!secrets.telegramChatId) {
    return;
  }

  const incomingChatId = message.chat && message.chat.id != null ? String(message.chat.id) : '';
  if (incomingChatId !== String(secrets.telegramChatId)) {
    return;
  }

  const text = message.text.trim();
  const chatId = secrets.telegramChatId;
  const spreadsheet = ensureWorkbook_();

  const command = text.split(/\s+/)[0].split('@')[0];

  if (command === '/start') {
    const welcome =
      '🚐 <b>Camper Monitor Bot</b>\n\n' +
      'Мониторинг перегонов кемперов за 1€ (Roadsurfer Rally, Movacar).\n\n' +
      '<b>Доступные команды:</b>\n' +
      '📊 /status — статус мониторинга и статистика\n' +
      '🔍 /check — принудительный запуск сканирования\n' +
      '🚗 /routes — список отслеживаемых маршрутов\n' +
      'ℹ️ /help — справка';
    sendTelegramMessage_(secrets, welcome, chatId);
  } else if (command === '/help') {
    const help =
      '🚐 <b>Camper Monitor — Справка</b>\n\n' +
      'Бот опрашивает API аренды кемперов и присылает уведомления при появлении слотов за 1€.\n\n' +
      '<b>Команды:</b>\n' +
      '/status — время последнего опроса, интервал, статистика за 24ч\n' +
      '/check — запустить проверку прямо сейчас\n' +
      '/routes — список активных направлений\n\n' +
      'Чтобы сообщить об ошибке: https://github.com/anomalyco/opencode/issues';
    sendTelegramMessage_(secrets, help, chatId);
  } else if (command === '/status') {
    const statusText = buildStatusMessage_(spreadsheet);
    sendTelegramMessage_(secrets, statusText, chatId);
  } else if (command === '/check') {
    sendTelegramMessage_(secrets, '⏳ Запуск сканирования...', chatId);
    runMonitorOnce();
    sendTelegramMessage_(secrets, '✅ Сканирование завершено.', chatId);
  } else if (command === '/routes') {
    const routes = readRoutes_(spreadsheet);
    let lines = ['🚗 <b>Отслеживаемые маршруты:</b>\n'];
    routes.forEach(function (r) {
      const statusIcon = r.enabled ? '✅' : '⬜';
      lines.push(statusIcon + ' <b>' + r.source + '</b>: ' + r.originName + ' ➔ ' + (r.destinationName || 'все доступные'));
    });
    sendTelegramMessage_(secrets, lines.join('\n'), chatId);
  }
}

function processTelegramUpdates() {
  const secrets = getScriptSecrets();
  if (!secrets.telegramBotToken) {
    return;
  }
  const props = PropertiesService.getScriptProperties();
  const lastId = Number(props.getProperty('TELEGRAM_LAST_UPDATE_ID') || 0);
  const offset = lastId > 0 ? lastId + 1 : 0;
  let result;
  try {
    result = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/getUpdates?offset=' + offset + '&limit=10&timeout=0', {
      muteHttpExceptions: true,
      retries: 0,
    });
  } catch (e) {
    return;
  }
  if (!result || !result.ok || !Array.isArray(result.result)) {
    return;
  }
  let maxId = lastId;
  result.result.forEach(function (update) {
    if (update.update_id > maxId) {
      maxId = update.update_id;
    }
    handleTelegramUpdate_(update);
  });
  if (maxId > lastId) {
    props.setProperty('TELEGRAM_LAST_UPDATE_ID', String(maxId));
  }
}

function configureTelegramSecrets() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const currentToken = props.getProperty(PROPERTY_KEYS.TELEGRAM_BOT_TOKEN) || '';
  const currentChatId = props.getProperty(PROPERTY_KEYS.TELEGRAM_CHAT_ID) || '';

  const tokenResponse = ui.prompt(
    'Настройка Telegram бота',
    'Введите TELEGRAM_BOT_TOKEN (от @BotFather):' + (currentToken ? '\n(Текущий: ' + currentToken.slice(0, 10) + '...)' : ''),
    ui.ButtonSet.OK_CANCEL
  );
  if (tokenResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  const newToken = tokenResponse.getResponseText().trim() || currentToken;

  const chatResponse = ui.prompt(
    'Настройка Telegram бота',
    'Введите TELEGRAM_CHAT_ID (ваш Chat ID или ID группы):\n(Текущий: ' + (currentChatId || 'не задан') + ')',
    ui.ButtonSet.OK_CANCEL
  );
  if (chatResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  const newChatId = chatResponse.getResponseText().trim() || currentChatId;

  if (newToken) {
    props.setProperty(PROPERTY_KEYS.TELEGRAM_BOT_TOKEN, newToken);
  }
  if (newChatId) {
    props.setProperty(PROPERTY_KEYS.TELEGRAM_CHAT_ID, newChatId);
  }

  ui.alert('✅ Настройки сохранены!\nTELEGRAM_BOT_TOKEN: ' + (newToken ? 'OK' : 'пусто') + '\nTELEGRAM_CHAT_ID: ' + (newChatId || 'пусто'));
}

function testTelegramConnection() {
  const ui = SpreadsheetApp.getUi();
  const secrets = getScriptSecrets();

  if (!secrets.telegramBotToken) {
    ui.alert('❌ Ошибка: TELEGRAM_BOT_TOKEN не задан!\nИспользуйте меню "Camper Monitor → Configure Telegram Bot".');
    return;
  }
  if (!secrets.telegramChatId) {
    ui.alert('❌ Ошибка: TELEGRAM_CHAT_ID не задан!\nИспользуйте меню "Camper Monitor → Configure Telegram Bot".');
    return;
  }

  try {
    const me = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/getMe');
    if (!me || !me.ok) {
      ui.alert('❌ Ошибка токена бота: ' + ((me && me.description) || 'неверный токен'));
      return;
    }

    const botName = me.result && me.result.username ? '@' + me.result.username : 'Bot';
    sendTelegramMessage_(
      secrets,
      '🚐 <b>Camper Monitor</b>\n✅ Тестовое сообщение успешно отправлено!\nБот: ' + botName + '\nChat ID: <code>' + secrets.telegramChatId + '</code>'
    );
    ui.alert('✅ Успех!\nБот: ' + botName + '\nТестовое сообщение отправлено в чат ID: ' + secrets.telegramChatId);
  } catch (error) {
    ui.alert('❌ Ошибка отправки в Telegram:\n' + (error.message || ''));
  }
}

function setupTelegramWebhook() {
  const secrets = getScriptSecrets();
  if (!secrets.telegramBotToken) {
    SpreadsheetApp.getUi().alert('TELEGRAM_BOT_TOKEN не задан в Script Properties');
    return;
  }
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    SpreadsheetApp.getUi().alert('Сначала опубликуйте Web App (Deploy -> New deployment -> Web app)!');
    return;
  }

  let secret = secrets.telegramWebhookSecret;
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '');
    PropertiesService.getScriptProperties().setProperty(PROPERTY_KEYS.TELEGRAM_WEBHOOK_SECRET, secret);
  }

  const webhookUrl = url + (url.indexOf('?') === -1 ? '?' : '&') + 'secret=' + encodeURIComponent(secret);
  const payload = {
    url: webhookUrl,
    secret_token: secret,
  };

  try {
    const res = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/setWebhook', {
      method: 'post',
      payload: JSON.stringify(payload),
    });
    if (res && res.ok) {
      SpreadsheetApp.getUi().alert('✅ Webhook успешно установлен!');
    } else {
      SpreadsheetApp.getUi().alert('❌ Ошибка установки Webhook: ' + ((res && res.description) || 'неизвестная ошибка'));
    }
  } catch (error) {
    SpreadsheetApp.getUi().alert('❌ Ошибка установки Webhook: ' + (error.message || ''));
  }
}

function deleteTelegramWebhook() {
  const secrets = getScriptSecrets();
  if (!secrets.telegramBotToken) {
    SpreadsheetApp.getUi().alert('TELEGRAM_BOT_TOKEN не задан в Script Properties');
    return;
  }
  try {
    const res = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/deleteWebhook');
    if (res && res.ok) {
      SpreadsheetApp.getUi().alert('✅ Webhook успешно удален!');
    } else {
      SpreadsheetApp.getUi().alert('❌ Ошибка удаления Webhook: ' + ((res && res.description) || 'неизвестная ошибка'));
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Ошибка удаления Webhook: ' + (e.message || ''));
  }
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
