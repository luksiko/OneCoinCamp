export const SUPPORTED_LANGUAGES = ['ru', 'en', 'de', 'it', 'uk'];
export const DEFAULT_LANGUAGE = 'ru';

export const I18N_STRINGS: Record<string, Record<string, string>> = {
  ru: {
    start_welcome: '🚐 <b>Бот мониторинга кемперов за 1€</b>\n\nМониторинг перегонов кемперов и автомобилей за 1€ (Roadsurfer Rally, Movacar, Indie Campers, Imoova).\n\n<b>Доступные команды:</b>\n📊 /status — статус мониторинга и статистика\n📋 /digest — дайджест за 24 часа\n🎯 /actual — актуальные офферы по вашим фильтрам\n🌙 /silent — настройка тихих часов\n🔍 /check — принудительный запуск сканирования\n🚗 /routes — список отслеживаемых маршрутов\nℹ️ /help — справка по командам',
    help_text: '🚐 <b>Camper Monitor — Справка</b>\n\nБот автоматически сканирует сайты провайдеров и присылает предложения по перегону за 1 евро.\n\n<b>Команды:</b>\n/status — статус и время последнего прогона\n/digest — дайджест найденных офферов за 24 часа\n/actual — активные предложения по вашим фильтрам\n/silent [on|off|HH:MM-HH:MM] — режим тихих часов (без звука)\n/check — запустить проверку прямо сейчас\n/routes — список отслеживаемых маршрутов\n\nПод каждым алертом есть кнопки: «Забронировать оффер ➔» и «🚫 Отключить этот маршрут».',
    check_starting: '⏳ Запускаю сканирование провайдеров...',
    check_finished: '✅ Сканирование завершено. Новых офферов: %count%',
    status_header: '📊 <b>Статус мониторинга</b>\n\nПоследний прогон: %lastRun%\nСтатус: %status%\nНайдено офферов: %found%\nОтправлено алертов: %sent%\nАктивных пользователей: %users%',
    routes_header: '🚗 <b>Отслеживаемые маршруты:</b>\n',
    routes_empty: 'Маршруты не настроены. Откройте Mini App и сохраните нужные направления.',
    silent_on: '🌙 Режим тихих часов включен (по умолчанию: 23:00-07:00).',
    silent_off: '☀️ Режим тихих часов отключен. Уведомления будут приходить со звуком.',
    silent_set: '🌙 Тихие часы установлены: %start% – %end%',
    silent_invalid_format: '❌ Неверный формат времени. Пример: /silent 22:00-08:00',
    digest_empty: '📋 <b>Дайджест за 24 часа</b>\n\nНовых предложений за последние 24 часа не найдено.',
    actual_empty: '📋 <b>Актуальные офферы</b>\n\nСейчас нет доступных предложений по вашим фильтрам.',
    btn_book: 'Забронировать оффер ➔',
    btn_disable_route: '🚫 Отключить этот маршрут',
    route_disabled: '🚫 Маршрут отключен.',
  },
  en: {
    start_welcome: '🚐 <b>Camper Monitor Bot</b>\n\nMonitoring 1€ campervan and car relocations (Roadsurfer Rally, Movacar, Indie Campers, Imoova).\n\n<b>Available commands:</b>\n📊 /status — monitoring status & stats\n📋 /digest — 24h summary digest\n🎯 /actual — current offers matching your filters\n🌙 /silent — silent hours configuration\n🔍 /check — trigger scanning right now\n🚗 /routes — list tracked routes\nℹ️ /help — help & instructions',
    help_text: '🚐 <b>Camper Monitor — Help</b>\n\nThe bot automatically scans provider sites and sends relocation offers for 1 euro.\n\n<b>Commands:</b>\n/status — last poll time, interval, 24h statistics\n/digest — summary digest of found offers in the last 24h\n/actual — currently active offers matching your filters\n/silent [on|off|HH:MM-HH:MM] — silent hours mode (no sound)\n/check — trigger an immediate check\n/routes — list of active monitored routes\n\nButtons below each alert: "Book offer ➔" and "🚫 Disable this route".',
    check_starting: '⏳ Starting scan...',
    check_finished: '✅ Scan completed. New offers found: %count%',
    status_header: '📊 <b>Monitor Status</b>\n\nLast run: %lastRun%\nStatus: %status%\nOffers found: %found%\nAlerts sent: %sent%\nActive users: %users%',
    routes_header: '🚗 <b>Tracked routes:</b>\n',
    routes_empty: 'No routes found. Configure them in the Mini App and tap "Save".',
    silent_on: '🌙 Silent hours enabled (default: 23:00-07:00).',
    silent_off: '☀️ Silent hours disabled. Notifications will always have sound.',
    silent_set: '🌙 Silent hours configured for: %start% – %end%',
    silent_invalid_format: '❌ Invalid time format. Example: /silent 22:00-08:00',
    digest_empty: '📋 <b>Daily Digest</b>\n\nNo new offers found in the last 24 hours.',
    actual_empty: '📋 <b>Current Offers</b>\n\nNo offers found matching your filters and routes.',
    btn_book: 'Book offer ➔',
    btn_disable_route: '🚫 Disable this route',
    route_disabled: '🚫 Route disabled.',
  }
};

export function t(key: string, lang = DEFAULT_LANGUAGE, replacements: Record<string, any> = {}): string {
  const dict = I18N_STRINGS[lang] || I18N_STRINGS[DEFAULT_LANGUAGE] || I18N_STRINGS.en;
  let text = dict[key] || I18N_STRINGS.en[key] || key;
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replaceAll(`%${k}%`, String(v));
  }
  return text;
}
