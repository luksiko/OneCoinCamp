function computeRouteHash_(route) {
  if (!route) return '';
  const raw = [
    route.source || '',
    route.originId !== undefined ? route.originId : route.origin_id || '',
    route.originName !== undefined ? route.originName : route.origin_name || '',
    route.destinationId !== undefined ? route.destinationId : route.destination_id || '',
    route.destinationName !== undefined ? route.destinationName : route.destination_name || '',
  ].join('|');
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  const hex = signature
    .map(function (byte) {
      const positive = (byte + 256) % 256;
      return positive.toString(16).padStart(2, '0');
    })
    .join('');
  return hex.substring(0, 10);
}

function sendTelegramOffer_(secrets, offer, route, routeIndex, settings) {
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
  const buttonLabel = 'Забронировать оффер ➔';

  const text =
    '🚐 <b>' + sourceTitle + ' — найден слот за 1€!</b>\n' +
    '📍 ' + escapeHtml_(offer.origin) + ' ➔ ' + escapeHtml_(offer.destination) + '\n' +
    '📅 ' + escapeHtml_(offer.pickupDate || '') + ' – ' + escapeHtml_(offer.returnDate || '') + durationDays +
    vehicleLine +
    priceLine;

  const keyboard = [];
  if (offer.bookingUrl) {
    keyboard.push([
      {
        text: buttonLabel,
        url: offer.bookingUrl,
      },
    ]);
  }

  if (route && routeIndex != null) {
    const routeHash = computeRouteHash_(route);
    keyboard.push([
      {
        text: '🚫 Отключить этот маршрут',
        callback_data: 'dis_r:' + routeIndex + ':' + routeHash,
      },
    ]);
  }

  const payload = {
    chat_id: secrets.telegramChatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };

  if (keyboard.length > 0) {
    payload.reply_markup = { inline_keyboard: keyboard };
  }

  if (settings && isSilentHoursActive_(settings)) {
    payload.disable_notification = true;
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

function answerTelegramCallbackQuery_(secrets, callbackQueryId, text, showAlert) {
  if (!secrets.telegramBotToken || !callbackQueryId) return;
  try {
    fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/answerCallbackQuery', {
      method: 'post',
      payload: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || '',
        show_alert: !!showAlert,
      }),
      retries: 0,
    });
  } catch (e) {}
}

function editTelegramMessageReplyMarkup_(secrets, chatId, messageId, replyMarkup) {
  if (!secrets.telegramBotToken || !chatId || !messageId) return;
  try {
    fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/editMessageReplyMarkup', {
      method: 'post',
      payload: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup || { inline_keyboard: [] },
      }),
      retries: 0,
    });
  } catch (e) {}
}

function handleTelegramCallbackQuery_(callbackQuery) {
  if (!callbackQuery) return;
  const secrets = getScriptSecrets();
  const queryId = callbackQuery.id;
  const data = String(callbackQuery.data || '');
  const fromUser = callbackQuery.from;
  const message = callbackQuery.message;
  const chatId = message && message.chat && message.chat.id != null ? String(message.chat.id) : '';

  // Authorization check
  const allowedList = getAllowedTelegramIds_(secrets);
  if (allowedList.length > 0) {
    const userId = fromUser && fromUser.id != null ? String(fromUser.id) : null;
    const username = fromUser && fromUser.username ? String(fromUser.username).toLowerCase().replace(/^@/, '') : null;
    const isAllowed = allowedList.some(function (allowed) {
      return (userId && userId === allowed) ||
             (username && username === allowed) ||
             (chatId && chatId === allowed);
    });
    if (!isAllowed) {
      answerTelegramCallbackQuery_(secrets, queryId, 'Доступ запрещен', true);
      return;
    }
  }

  if (data === 'none' || data === 'disabled_already') {
    answerTelegramCallbackQuery_(secrets, queryId, 'Маршрут уже отключен в настройках.', false);
    return;
  }

  if (data.indexOf('dis_r:') === 0) {
    const parts = data.split(':');
    const targetIndex = parseInt(parts[1], 10);
    const targetHash = parts[2] || '';

    const spreadsheet = ensureWorkbook_();
    const routes = readRoutes_(spreadsheet);
    let matchedIndex = -1;

    if (!isNaN(targetIndex) && routes[targetIndex]) {
      const candidateHash = computeRouteHash_(routes[targetIndex]);
      if (candidateHash === targetHash) {
        matchedIndex = targetIndex;
      }
    }

    if (matchedIndex === -1 && targetHash) {
      for (let i = 0; i < routes.length; i++) {
        if (computeRouteHash_(routes[i]) === targetHash) {
          matchedIndex = i;
          break;
        }
      }
    }

    if (matchedIndex === -1) {
      answerTelegramCallbackQuery_(secrets, queryId, 'Маршрут не найден или был изменен.', true);
      return;
    }

    const targetRoute = routes[matchedIndex];
    const routeLabel = (targetRoute.originName || targetRoute.originId || '') + ' ➔ ' + (targetRoute.destinationName || targetRoute.destinationId || 'все');

    if (!targetRoute.enabled) {
      answerTelegramCallbackQuery_(secrets, queryId, 'Маршрут ' + routeLabel + ' уже отключен.', false);
    } else {
      routes[matchedIndex].enabled = false;
      saveRoutes_(spreadsheet, routes);
      answerTelegramCallbackQuery_(secrets, queryId, 'Маршрут ' + routeLabel + ' отключен! 🚫', false);
    }

    // Update inline keyboard on message
    if (message && message.message_id && chatId) {
      const existingMarkup = message.reply_markup || {};
      const newKeyboard = [];
      const oldKeyboard = existingMarkup.inline_keyboard || [];
      for (let r = 0; r < oldKeyboard.length; r++) {
        const row = oldKeyboard[r];
        const newRow = [];
        for (let c = 0; c < row.length; c++) {
          const btn = row[c];
          if (btn.callback_data && btn.callback_data.indexOf('dis_r:') === 0) {
            newRow.push({
              text: 'Маршрут отключен 🚫',
              callback_data: 'disabled_already',
            });
          } else {
            newRow.push(btn);
          }
        }
        if (newRow.length) {
          newKeyboard.push(newRow);
        }
      }
      editTelegramMessageReplyMarkup_(secrets, chatId, message.message_id, { inline_keyboard: newKeyboard });
    }
  }
}

function buildDigestMessage_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SHEET_NAMES.ARCHIVE);
  if (!sheet || sheet.getLastRow() < 2) {
    return '📋 <b>Дневной дайджест</b>\n\nЗа последние 24 часа новых офферов не найдено.';
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, ARCHIVE_HEADERS.length).getValues();
  const oneDayAgo = new Date().getTime() - 24 * 60 * 60 * 1000;
  const recentOffers = [];

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const foundAt = row[0] ? new Date(row[0]).getTime() : 0;
    if (foundAt >= oneDayAgo) {
      recentOffers.push({
        source: row[1] || '',
        origin: row[5] || '',
        destination: row[7] || '',
        pickupDate: row[9] || '',
        returnDate: row[10] || '',
        price: row[11],
        url: row[13] || '',
      });
    }
  }

  if (recentOffers.length === 0) {
    return '📋 <b>Дневной дайджест</b>\n\nЗа последние 24 часа новых офферов не найдено.';
  }

  const lines = [
    '📋 <b>Дневной дайджест (за 24ч):</b>',
    'Найдено слотов: ' + recentOffers.length + '\n',
  ];

  const maxItems = Math.min(recentOffers.length, 10);
  for (let j = 0; j < maxItems; j++) {
    const off = recentOffers[j];
    const sourceLabel = off.source === 'roadsurfer' ? 'Roadsurfer' : off.source;
    let itemLine = (j + 1) + '. 🚐 <b>' + escapeHtml_(sourceLabel) + '</b>: ' +
      escapeHtml_(off.origin) + ' ➔ ' + escapeHtml_(off.destination);
    if (off.pickupDate && off.returnDate) {
      itemLine += ' (' + escapeHtml_(off.pickupDate) + ' – ' + escapeHtml_(off.returnDate) + ')';
    }
    if (off.price) {
      itemLine += ' — <b>' + escapeHtml_(String(off.price)) + '€</b>';
    }
    if (off.url) {
      itemLine += '\n   <a href="' + escapeHtml_(off.url, true) + '">Забронировать ➔</a>';
    }
    lines.push(itemLine);
  }

  if (recentOffers.length > maxItems) {
    lines.push('\n... и еще ' + (recentOffers.length - maxItems) + ' слотов в архиве.');
  }

  return lines.join('\n');
}

function handleTelegramUpdate_(update) {
  if (!update) {
    return;
  }
  if (update.callback_query) {
    handleTelegramCallbackQuery_(update.callback_query);
    return;
  }
  if (!update.message) {
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
      '📋 /digest — сводный дайджест офферов за 24ч\n' +
      '🌙 /silent — настройки режима тихих часов\n' +
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
      '/digest — сводный дайджест найденных офферов за 24ч\n' +
      '/silent [on|off|HH:MM-HH:MM] — режим тихих часов (без звука)\n' +
      '/check — запустить проверку прямо сейчас\n' +
      '/routes — список активных направлений\n\n' +
      'Под каждым оффером доступны кнопки: «Забронировать оффер ➔» и «🚫 Отключить этот маршрут».\n\n' +
      'Чтобы сообщить об ошибке: https://github.com/anomalyco/opencode/issues';
    sendTelegramMessage_(secrets, help, chatId);
  } else if (command === '/status') {
    const statusText = buildStatusMessage_(spreadsheet);
    sendTelegramMessage_(secrets, statusText, chatId);
  } else if (command === '/digest') {
    const digestText = buildDigestMessage_(spreadsheet);
    sendTelegramMessage_(secrets, digestText, chatId);
  } else if (command === '/silent') {
    const settings = readKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, DEFAULT_SETTINGS);
    const parts = text.split(/\s+/);
    if (parts.length > 1) {
      const arg = parts[1].trim().toLowerCase();
      if (arg === 'on' || arg === '1' || arg === 'true') {
        settings.silent_hours_enabled = true;
        writeKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, settings);
        sendTelegramMessage_(secrets, '🌙 Тихие часы <b>включены</b> (' + (settings.silent_hours_start || '23:00') + ' – ' + (settings.silent_hours_end || '07:00') + '). Ночные уведомления приходят без звука.', chatId);
      } else if (arg === 'off' || arg === '0' || arg === 'false') {
        settings.silent_hours_enabled = false;
        writeKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, settings);
        sendTelegramMessage_(secrets, '☀️ Тихие часы <b>отключены</b>. Все уведомления будут приходить со звуком.', chatId);
      } else if (/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(arg)) {
        const timeParts = arg.split('-');
        settings.silent_hours_enabled = true;
        settings.silent_hours_start = timeParts[0];
        settings.silent_hours_end = timeParts[1];
        writeKeyValueSheet_(spreadsheet, SHEET_NAMES.SETTINGS, settings);
        sendTelegramMessage_(secrets, '🌙 Установлен интервал тихих часов: <b>' + timeParts[0] + ' – ' + timeParts[1] + '</b> (включены).', chatId);
      } else {
        sendTelegramMessage_(secrets, 'Формат команды:\n/silent on — включить\n/silent off — выключить\n/silent 22:00-08:00 — задать интервал', chatId);
      }
    } else {
      const isEnabled = isTruthy_(settings.silent_hours_enabled);
      const statusStr = isEnabled ? 'Включены ✅' : 'Выключены ⬜';
      const msg =
        '🌙 <b>Режим тихих часов</b>\n\n' +
        'Статус: ' + statusStr + '\n' +
        'Интервал: ' + (settings.silent_hours_start || '23:00') + ' – ' + (settings.silent_hours_end || '07:00') + '\n\n' +
        'Команды управления:\n' +
        '• <code>/silent on</code> — включить\n' +
        '• <code>/silent off</code> — выключить\n' +
        '• <code>/silent 22:00-08:00</code> — изменить интервал';
      sendTelegramMessage_(secrets, msg, chatId);
    }
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

function setupTelegramMiniApp() {
  const secrets = getScriptSecrets();
  if (!secrets.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing in Script Properties');
  }

  const webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) {
    throw new Error('Web App is not deployed');
  }

  const result = fetchJson_('https://api.telegram.org/bot' + secrets.telegramBotToken + '/setChatMenuButton', {
    method: 'post',
    payload: JSON.stringify({
      menu_button: {
        type: 'web_app',
        text: 'Открыть монитор',
        web_app: { url: webAppUrl },
      },
    }),
  });

  if (!result || result.ok !== true) {
    throw new Error('Telegram setChatMenuButton failed: ' + ((result && result.description) || 'unknown error'));
  }

  return { ok: true, webAppUrl: webAppUrl };
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
