export const SUPPORTED_LANGUAGES = ['ru', 'en', 'de', 'it', 'uk'];
export const DEFAULT_LANGUAGE = 'ru';

export const I18N_STRINGS: Record<string, Record<string, string>> = {
  ru: {
    menu_welcome: `🚐 <b>Camper Monitor — перегоны кемперов за 1€</b>

Автоматический мониторинг кемперов и автомобилей за 1 евро (Roadsurfer, Movacar, Indie Campers, Imoova).

Команды бота:
/start — Главное меню
/actual — Актуальные офферы за 1€
/routes — Мои маршруты
/check — Проверить сейчас
/digest — Дайджест за 24 часа
/subscribe — Премиум подписка
/account — Мой аккаунт
/silent — Тихие часы
/status — Статус мониторинга
/help — Справка и инструкции

Откройте Mini App для управления и просмотра интерактивной карты:`,
    btn_miniapp: '🚐 Mini App ▫️',
    btn_actual: '🎯 Офферы 1€',
    btn_routes: '🚗 Мои маршруты',
    btn_check: '🔍 Проверить',
    btn_digest: '📋 Дайджест 24ч',
    btn_subscribe: '💎 Подписка',
    btn_account: '👤 Мой аккаунт',
    btn_silent: '🌙 Тихие часы',
    btn_status: '📊 Статус',
    btn_help: 'ℹ️ Помощь',
    btn_main_menu: '◀️ Главное меню',
    btn_setup_miniapp: '🚐 Настроить в Mini App ▫️',
    btn_clear_routes: '🗑 Очистить маршруты',
    btn_clear_confirm_prompt: '⚠️ <b>Вы уверены, что хотите удалить все сохранённые маршруты?</b>',
    btn_confirm_delete: '❌ Да, удалить все',
    btn_cancel: 'Отмена',
    btn_check_again: '🔍 Проверить ещё раз',
    btn_pay_card: '💳 Оплатить картой — €4.99/мес ▫️',
    btn_pay_stars: '⭐️ Оплатить звездами — 500 ⭐️',
    btn_pay_crypto: '💎 Оплатить USDT — $4.99',
    btn_silent_on: '🌙 Включить тихий режим',
    btn_silent_off: '☀️ Выключить тихий режим',
    silent_menu_title: '🌙 <b>Режим тихих часов</b>\n\nВ тихие часы бот присылает уведомления без звука.\n\nТекущий статус: <b>%status%</b>\nИнтервал: <code>%range%</code>\n\nВыберите действие или пресет времени:',
    silent_enabled: '🔔 ВКЛЮЧЕНЫ',
    silent_disabled: '🔕 ВЫКЛЮЧЕНЫ',
    silent_on: '🌙 Режим тихих часов включен.',
    silent_off: '☀️ Режим тихих часов отключен. Уведомления будут приходить со звуком.',
    silent_set: '🌙 Тихие часы установлены: %start% – %end%',
    silent_invalid_format: '❌ Неверный формат времени. Пример: /silent 22:00-08:00',
    check_starting: '⏳ <b>Сканирование провайдеров запущено...</b>\nПроверяем Roadsurfer, Movacar, Indie Campers и Imoova.',
    check_finished: '✅ <b>Сканирование завершено.</b>\nНайдено новых офферов: <b>%count%</b>.',
    status_header: '📊 <b>Статус мониторинга</b>\n\nПоследний прогон: %lastRun%\nСтатус: %status%\nНайдено офферов: %found%\nОтправлено алертов: %sent%\nАктивных пользователей: %users%',
    routes_header: '🚗 <b>Отслеживаемые маршруты (%count%):</b>\n\n',
    routes_empty: '🚗 <b>Отслеживаемые маршруты</b>\n\nУ вас пока нет активных маршрутов.\nОткройте Mini App, выберите нужные направления и сохраните их.',
    routes_cleared: '🗑 Все маршруты удалены (кол-во: <b>%count%</b>).',
    digest_empty: '📋 <b>Дайджест за 24 часа</b>\n\nНовых предложений за последние 24 часа не найдено.',
    digest_header: '📋 <b>Дайджест за 24 часа (%count%):</b>\n',
    digest_more: '\n<i>И ещё %count% предложений в архиве Mini App.</i>',
    actual_empty: '📋 <b>Актуальные офферы</b>\n\nСейчас нет доступных предложений по вашим фильтрам.\nЗапустите проверку провайдеров или добавьте новые маршруты в Mini App.',
    actual_header: '🎯 <b>Актуальные офферы (%count%):</b>',
    actual_footer: 'Показано предложений: <b>%shown%</b> из <b>%total%</b>.',
    sub_already_active: '💎 <b>Ваша подписка активна!</b>\n\nСтатус: <b>Premium</b>\nДействует до: <b>%expiry%</b>\n\nВам доступны безлимитные маршруты и мгновенные уведомления.',
    sub_promo: '💎 <b>Camper Monitor Premium</b>\n\n• Безлимитные маршруты и моментальные алерты\n• Полный архив офферов и аналитика\n• Приоритетный мониторинг перегонов\n\nСтоимость: <b>€4.99 / месяц</b>, <b>$4.99 USDT</b> или <b>500 ⭐️</b>\n\nВыберите удобный способ оплаты:',
    account_header: '👤 <b>Ваш аккаунт</b>\n\n%status%\n📍 %routes%',
    account_btn_upgrade: '💎 Оформить Premium',
    help_text: '🚐 <b>Camper Monitor — Справка</b>\n\nБот сканирует сайты провайдеров каждые несколько минут и мгновенно оповещает о доступных перегонах за <b>1€</b>.\n\n<b>Поддерживаемые провайдеры:</b>\n• <b>Roadsurfer Rally</b> — кемперы по всей Европе\n• <b>Movacar</b> — автомобили и кемперы\n• <b>Indie Campers</b> — кемпервэны\n• <b>Imoova</b> — международные перегоны\n\n<b>Быстрые команды:</b>\n• /actual — активные предложения\n• /routes — список ваших маршрутов\n• /check — запуск сканирования\n• /digest — дайджест за 24 часа\n• /silent — тихие часы (без звука)\n• /subscribe — премиум подписка\n• /account — статус аккаунта\n• /status — статус сканера\n\n💡 Меню доступно также по кнопке <b>[ ≡ Меню ]</b> в левом нижнем углу.',
    btn_book: 'Забронировать оффер ➔',
    btn_disable_route: '🚫 Отключить этот маршрут',
    route_disabled: '🚫 Маршрут отключен.',
    stars_invoice_title: 'Camper Monitor Premium (30 дней)',
    stars_invoice_desc: 'Безлимитные маршруты, моментальные алерты и полный архив офферов на 30 дней.',
    stars_payment_success: '🎉 <b>Оплата Telegram Stars успешно получена!</b>\n\nВаша подписка Premium активна на <b>%days% дней</b>.\n\nВам доступны безлимитные маршруты и приоритетные алерты!\nИспользуйте /account для проверки статуса.',
    crypto_invoice_created: '💎 <b>Оплата через CryptoBot (USDT)</b>\n\nСумма: <b>$4.99 USDT</b>\nСрок: <b>30 дней Premium</b>\n\nНажмите кнопку ниже для быстрой оплаты в боте CryptoBot:',
    crypto_pay_btn: 'Оплатить $4.99 USDT ➔',
    days_1: 'день',
    days_2_4: 'дня',
    days_5: 'дней',
    promo_prompt: '🎁 <b>Активация промокода</b>\n\nОтправьте команду вместе с промокодом:\n<code>/promo ВАШКОД</code>',
    promo_success: '🎉 <b>Промокод активирован!</b>\n\nВам начислено дней: <b>%days%</b>\nПодписка активна до: <b>%expiry%</b>',
    promo_err_invalid: '❌ Промокод не найден или указан неверно.',
    promo_err_expired: '⏱ Срок действия этого промокода истёк.',
    promo_err_exhausted: '⚠️ Лимит активаций этого промокода исчерпан.',
    promo_err_used: '⚠️ Вы уже активировали этот промокод ранее.',
  },
  en: {
    menu_welcome: `🚐 <b>Camper Monitor — 1€ campervan relocations</b>

Automated monitoring of 1€ camper and car relocations (Roadsurfer, Movacar, Indie Campers, Imoova).

Bot commands:
/start — Main menu
/actual — Active 1€ offers
/routes — My tracked routes
/check — Check offers now
/digest — 24-hour offers digest
/subscribe — Premium subscription
/account — My account & status
/silent — Silent hours settings
/status — Monitoring system status
/help — Help & instructions

Open the Mini App to manage settings and view the interactive map:`,
    btn_miniapp: '🚐 Mini App ▫️',
    btn_actual: '🎯 1€ Offers',
    btn_routes: '🚗 My Routes',
    btn_check: '🔍 Check Now',
    btn_digest: '📋 24h Digest',
    btn_subscribe: '💎 Subscribe',
    btn_account: '👤 My Account',
    btn_silent: '🌙 Silent Hours',
    btn_status: '📊 Status',
    btn_help: 'ℹ️ Help',
    btn_main_menu: '◀️ Main Menu',
    btn_setup_miniapp: '🚐 Configure in Mini App ▫️',
    btn_clear_routes: '🗑 Clear Routes',
    btn_clear_confirm_prompt: '⚠️ <b>Are you sure you want to remove all saved routes?</b>',
    btn_confirm_delete: '❌ Yes, delete all',
    btn_cancel: 'Cancel',
    btn_check_again: '🔍 Check Again',
    btn_pay_card: '💳 Subscribe (Card) — €4.99/mo ▫️',
    btn_pay_stars: '⭐️ Pay with Stars — 500 ⭐️',
    btn_pay_crypto: '💎 Pay (USDT) — $4.99',
    btn_silent_on: '🌙 Turn On Silent Mode',
    btn_silent_off: '☀️ Turn Off Silent Mode',
    silent_menu_title: '🌙 <b>Silent Hours</b>\n\nDuring silent hours, notifications arrive muted without sound.\n\nStatus: <b>%status%</b>\nInterval: <code>%range%</code>\n\nChoose an action or time preset:',
    silent_enabled: '🔔 ENABLED',
    silent_disabled: '🔕 DISABLED',
    silent_on: '🌙 Silent hours enabled.',
    silent_off: '☀️ Silent hours disabled. Notifications will have sound.',
    silent_set: '🌙 Silent hours configured for: %start% – %end%',
    silent_invalid_format: '❌ Invalid time format. Example: /silent 22:00-08:00',
    check_starting: '⏳ <b>Provider scan started...</b>\nChecking Roadsurfer, Movacar, Indie Campers and Imoova.',
    check_finished: '✅ <b>Scan finished.</b>\nNew offers found: <b>%count%</b>.',
    status_header: '📊 <b>Monitor Status</b>\n\nLast run: %lastRun%\nStatus: %status%\nOffers found: %found%\nAlerts sent: %sent%\nActive users: %users%',
    routes_header: '🚗 <b>Tracked routes (%count%):</b>\n\n',
    routes_empty: '🚗 <b>Tracked routes</b>\n\nNo routes saved yet.\nOpen the Mini App to select and save routes.',
    routes_cleared: '🗑 All routes deleted (count: <b>%count%</b>).',
    digest_empty: '📋 <b>24-Hour Digest</b>\n\nNo new offers found in the last 24 hours.',
    digest_header: '📋 <b>24-Hour Digest (%count%):</b>\n',
    digest_more: '\n<i>And %count% more offers in the Mini App archive.</i>',
    actual_empty: '📋 <b>Current Offers</b>\n\nNo offers currently matching your filters.\nTrigger a provider scan or configure new routes in Mini App.',
    actual_header: '🎯 <b>Active Offers (%count%):</b>',
    actual_footer: 'Showing offers: <b>%shown%</b> of <b>%total%</b>.',
    sub_already_active: '💎 <b>Your subscription is active!</b>\n\nStatus: <b>Premium</b>\nExpires: <b>%expiry%</b>\n\nEnjoy unlimited routes and instant alerts.',
    sub_promo: '💎 <b>Camper Monitor Premium</b>\n\n• Unlimited routes and instant alerts\n• Complete offer archive and route analytics\n• Priority provider monitoring\n\nPrice: <b>€4.99 / month</b>, <b>$4.99 USDT</b> or <b>500 ⭐️</b>\n\nChoose payment method:',
    account_header: '👤 <b>Your Account</b>\n\n%status%\n📍 %routes%',
    account_btn_upgrade: '💎 Get Premium',
    help_text: '🚐 <b>Camper Monitor — Help</b>\n\nThe bot scans relocation providers every few minutes and sends alerts for <b>1€</b> relocations.\n\n<b>Supported providers:</b>\n• <b>Roadsurfer Rally</b> — campers across Europe\n• <b>Movacar</b> — cars and campers\n• <b>Indie Campers</b> — campervans\n• <b>Imoova</b> — international relocations\n\n<b>Commands:</b>\n• /actual — active matching offers\n• /routes — list of tracked routes\n• /check — trigger instant scan\n• /digest — 24h summary digest\n• /silent — quiet hours mode (muted)\n• /subscribe — Premium subscription\n• /account — account status and limits\n• /status — monitor scan status\n\n💡 Tap <b>[ ≡ Menu ]</b> in the bottom left corner anytime.',
    btn_book: 'Book offer ➔',
    btn_disable_route: '🚫 Disable this route',
    route_disabled: '🚫 Route disabled.',
    stars_invoice_title: 'Camper Monitor Premium (30 Days)',
    stars_invoice_desc: 'Unlimited routes, instant alerts and full offer archive for 30 days.',
    stars_payment_success: '🎉 <b>Telegram Stars payment received!</b>\n\nYour Premium subscription is now active for <b>%days% days</b>.\n\nUnlimited routes and instant alerts are unlocked!\nUse /account to check your status.',
    crypto_invoice_created: '💎 <b>CryptoBot Payment (USDT)</b>\n\nAmount: <b>$4.99 USDT</b>\nPlan: <b>30 Days Premium</b>\n\nTap the button below to pay via CryptoBot:',
    crypto_pay_btn: 'Pay $4.99 USDT ➔',
    days_1: 'day',
    days_2_4: 'days',
    days_5: 'days',
    promo_prompt: '🎁 <b>Redeem Promo Code</b>\n\nSend the command with your code:\n<code>/promo YOURCODE</code>',
    promo_success: '🎉 <b>Promo code redeemed!</b>\n\nDays granted: <b>%days%</b>\nSubscription valid until: <b>%expiry%</b>',
    promo_err_invalid: '❌ Promo code not found or invalid.',
    promo_err_expired: '⏱ This promo code has expired.',
    promo_err_exhausted: '⚠️ This promo code has reached its maximum usage limit.',
    promo_err_used: '⚠️ You have already redeemed this promo code.',
  },
  de: {
    menu_welcome: `🚐 <b>Camper Monitor — 1€ Camper-Überführungen</b>

Automatische Überwachung von Wohnmobilen und Autos für 1 Euro (Roadsurfer, Movacar, Indie Campers, Imoova).

Bot-Befehle:
/start — Hauptmenü
/actual — Aktuelle 1€-Angebote
/routes — Meine Routen
/check — Jetzt prüfen
/digest — 24-Stunden-Übersicht
/subscribe — Premium-Abonnement
/account — Mein Konto
/silent — Ruhezeiten
/status — Monitor-Status
/help — Hilfe und Anleitung

Öffnen Sie die Mini App, um Einstellungen zu verwalten und die interaktive Karte anzuzeigen:`,
    btn_miniapp: '🚐 Mini App ▫️',
    btn_actual: '🎯 1€ Angebote',
    btn_routes: '🚗 Meine Routen',
    btn_check: '🔍 Jetzt prüfen',
    btn_digest: '📋 24h Digest',
    btn_subscribe: '💎 Premium Abo',
    btn_account: '👤 Mein Konto',
    btn_silent: '🌙 Ruhezeiten',
    btn_status: '📊 Status',
    btn_help: 'ℹ️ Hilfe',
    btn_main_menu: '◀️ Hauptmenü',
    btn_setup_miniapp: '🚐 In Mini App einstellen ▫️',
    btn_clear_routes: '🗑 Routen löschen',
    btn_clear_confirm_prompt: '⚠️ <b>Möchten Sie wirklich alle Routen entfernen?</b>',
    btn_confirm_delete: '❌ Ja, alle löschen',
    btn_cancel: 'Abbrechen',
    btn_check_again: '🔍 Erneut prüfen',
    btn_pay_card: '💳 Mit Karte — 4,99 €/Monat ▫️',
    btn_pay_stars: '⭐️ Mit Stars zahlen — 500 ⭐️',
    btn_pay_crypto: '💎 Mit USDT — $4.99',
    btn_silent_on: '🌙 Ruhemodus aktivieren',
    btn_silent_off: '☀️ Ruhemodus deaktivieren',
    silent_menu_title: '🌙 <b>Ruhezeiten</b>\n\nIn den Ruhezeiten sendet der Bot Benachrichtigungen stumm.\n\nStatus: <b>%status%</b>\nIntervall: <code>%range%</code>\n\nWählen Sie eine Option:',
    silent_enabled: '🔔 AKTIVIERT',
    silent_disabled: '🔕 DEAKTIVIERT',
    silent_on: '🌙 Ruhezeiten aktiviert.',
    silent_off: '☀️ Ruhezeiten deaktiviert.',
    silent_set: '🌙 Ruhezeiten eingestellt: %start% – %end%',
    silent_invalid_format: '❌ Ungültiges Zeitformat. Beispiel: /silent 22:00-08:00',
    check_starting: '⏳ <b>Suchlauf gestartet...</b>\nPrüfe Roadsurfer, Movacar, Indie Campers und Imoova.',
    check_finished: '✅ <b>Suchlauf beendet.</b>\nNeue Angebote gefunden: <b>%count%</b>.',
    status_header: '📊 <b>Monitor-Status</b>\n\nLetzter Lauf: %lastRun%\nStatus: %status%\nGefunden: %found%\nBenachrichtigungen: %sent%\nAktive Nutzer: %users%',
    routes_header: '🚗 <b>Gespeicherte Routen (%count%):</b>\n\n',
    routes_empty: '🚗 <b>Gespeicherte Routen</b>\n\nNoch keine Routen vorhanden.\nÖffnen Sie die Mini App, um Strecken zu wählen.',
    routes_cleared: '🗑 Alle Routen gelöscht (Anzahl: <b>%count%</b>).',
    digest_empty: '📋 <b>24-Stunden-Übersicht</b>\n\nKeine neuen Angebote in den letzten 24 Stunden gefunden.',
    digest_header: '📋 <b>24-Stunden-Übersicht (%count%):</b>\n',
    digest_more: '\n<i>Und %count% weitere im Mini App Archiv.</i>',
    actual_empty: '📋 <b>Aktuelle Angebote</b>\n\nZurzeit keine Angebote passend zu Ihren Filtern vorhanden.\nStarten Sie einen Suchlauf oder fügen Sie Routen hinzu.',
    actual_header: '🎯 <b>Aktuelle Angebote (%count%):</b>',
    actual_footer: 'Angezeigt: <b>%shown%</b> von <b>%total%</b>.',
    sub_already_active: '💎 <b>Ihr Abonnement ist aktiv!</b>\n\nStatus: <b>Premium</b>\nGültig bis: <b>%expiry%</b>\n\nUnbegrenzte Routen und Sofort-Benachrichtigungen.',
    sub_promo: '💎 <b>Camper Monitor Premium</b>\n\n• Unbegrenzte Routen und Sofort-Alerts\n• Komplettes Archiv und Routen-Analysen\n• Prioritäre Abfragen\n\nPreis: <b>€4.99 / Monat</b>, <b>$4.99 USDT</b> oder <b>500 ⭐️</b>',
    account_header: '👤 <b>Mein Konto</b>\n\n%status%\n📍 %routes%',
    account_btn_upgrade: '💎 Premium holen',
    help_text: '🚐 <b>Camper Monitor — Hilfe</b>\n\nDer Bot sucht alle paar Minuten nach <b>1€</b>-Überführungsfahrten.\n\n<b>Anbieter:</b>\n• <b>Roadsurfer Rally</b> — Wohnmobile in Europa\n• <b>Movacar</b> — Autos und Camper\n• <b>Indie Campers</b> — Campervans\n• <b>Imoova</b> — Weltweite Fahrten',
    btn_book: 'Angebot buchen ➔',
    btn_disable_route: '🚫 Diese Route deaktivieren',
    route_disabled: '🚫 Route deaktiviert.',
    stars_invoice_title: 'Camper Monitor Premium (30 Tage)',
    stars_invoice_desc: 'Unbegrenzte Routen, Sofort-Alerts und komplettes Archiv für 30 Tage.',
    stars_payment_success: '🎉 <b>Zahlung mit Telegram Stars erfolgreich!</b>\n\nIhr Premium-Abonnement ist jetzt für <b>%days% Tage</b> aktiv.\n\nNutzen Sie /account, um Ihren Status zu prüfen.',
    crypto_invoice_created: '💎 <b>Zahlung per CryptoBot (USDT)</b>\n\nBetrag: <b>$4.99 USDT</b>\nPlan: <b>30 Tage Premium</b>\n\nKlicken Sie unten zur Zahlung:',
    crypto_pay_btn: 'Mit $4.99 USDT zahlen ➔',
    days_1: 'Tag',
    days_2_4: 'Tage',
    days_5: 'Tage',
    promo_prompt: '🎁 <b>Gutscheincode einlösen</b>\n\nSenden Sie den Befehl mit Ihrem Code:\n<code>/promo DEINCODE</code>',
    promo_success: '🎉 <b>Gutschein eingelöst!</b>\n\nTage gutgeschrieben: <b>%days%</b>\nGültig bis: <b>%expiry%</b>',
    promo_err_invalid: '❌ Gutscheincode ungültig oder nicht gefunden.',
    promo_err_expired: '⏱ Dieser Gutschein ist abgelaufen.',
    promo_err_exhausted: '⚠️ Dieser Gutschein wurde bereits maximal oft eingelöst.',
    promo_err_used: '⚠️ Sie haben diesen Gutschein bereits eingelöst.',
  },
  it: {
    menu_welcome: `🚐 <b>Camper Monitor — Spostamenti camper a 1€</b>

Monitoraggio automatico di camper e auto a 1 euro (Roadsurfer, Movacar, Indie Campers, Imoova).

Comandi del bot:
/start — Menu principale
/actual — Offerte attive a 1€
/routes — I miei percorsi
/check — Controlla ora
/digest — Riepilogo 24 ore
/subscribe — Abbonamento Premium
/account — Il mio account
/silent — Ore silenziose
/status — Stato del monitor
/help — Aiuto e istruzioni

Apri la Mini App per gestire le impostazioni e visualizzare la mappa interattiva:`,
    btn_miniapp: '🚐 Mini App ▫️',
    btn_actual: '🎯 Offerte 1€',
    btn_routes: '🚗 I miei percorsi',
    btn_check: '🔍 Controlla ora',
    btn_digest: '📋 Digest 24h',
    btn_subscribe: '💎 Abbonamento',
    btn_account: '👤 Il mio account',
    btn_silent: '🌙 Ore silenziose',
    btn_status: '📊 Stato',
    btn_help: 'ℹ️ Aiuto',
    btn_main_menu: '◀️ Menu principale',
    btn_setup_miniapp: '🚐 Configura nella Mini App ▫️',
    btn_clear_routes: '🗑 Cancella percorsi',
    btn_clear_confirm_prompt: '⚠️ <b>Sei sicuro di voler rimuovere tutti i percorsi salvati?</b>',
    btn_confirm_delete: '❌ Sì, elimina tutti',
    btn_cancel: 'Annulla',
    btn_check_again: '🔍 Controlla di nuovo',
    btn_pay_card: '💳 Paga con carta — €4.99/mese ▫️',
    btn_pay_stars: '⭐️ Paga con Stars — 500 ⭐️',
    btn_pay_crypto: '💎 Paga con USDT — $4.99',
    btn_silent_on: '🌙 Attiva modalità silenziosa',
    btn_silent_off: '☀️ Disattiva modalità silenziosa',
    silent_menu_title: '🌙 <b>Ore silenziose</b>\n\nDurante le ore silenziose le notifiche arrivano senza audio.\n\nStato: <b>%status%</b>\nIntervallo: <code>%range%</code>\n\nScegli un\'azione o orario:',
    silent_enabled: '🔔 ATTIVO',
    silent_disabled: '🔕 DISATTIVO',
    silent_on: '🌙 Ore silenziose attivate.',
    silent_off: '☀️ Ore silenziose disattivate.',
    silent_set: '🌙 Ore silenziose impostate: %start% – %end%',
    silent_invalid_format: '❌ Formato non valido. Esempio: /silent 22:00-08:00',
    check_starting: '⏳ <b>Scansione avviata...</b>\nVerifica di Roadsurfer, Movacar, Indie Campers e Imoova.',
    check_finished: '✅ <b>Scansione completata.</b>\nNuove offerte trovate: <b>%count%</b>.',
    status_header: '📊 <b>Stato Monitor</b>\n\nUltima esecuzione: %lastRun%\nStato: %status%\nTrovate: %found%\nAlert inviati: %sent%\nUtenti attivi: %users%',
    routes_header: '🚗 <b>Percorsi monitorati (%count%):</b>\n\n',
    routes_empty: '🚗 <b>Percorsi monitorati</b>\n\nNessun percorso salvato.\nApri la Mini App per selezionare i percorsi.',
    routes_cleared: '🗑 Tutti i percorsi cancellati (totale: <b>%count%</b>).',
    digest_empty: '📋 <b>Digest 24 ore</b>\n\nNessuna nuova offerta trovata nelle ultime 24 ore.',
    digest_header: '📋 <b>Digest 24 ore (%count%):</b>\n',
    digest_more: '\n<i>E altre %count% offerte nell\'archivio Mini App.</i>',
    actual_empty: '📋 <b>Offerte attuali</b>\n\nNessuna offerta corrispondente ai tuoi filtri.\nAvvia una scansione o configura nuovi percorsi nella Mini App.',
    actual_header: '🎯 <b>Offerte attive (%count%):</b>',
    actual_footer: 'Visualizzate: <b>%shown%</b> di <b>%total%</b>.',
    sub_already_active: '💎 <b>Il tuo abbonamento è attivo!</b>\n\nStato: <b>Premium</b>\nScadenza: <b>%expiry%</b>\n\nPercorsi illimitati e alert istantanei.',
    sub_promo: '💎 <b>Camper Monitor Premium</b>\n\n• Percorsi illimitati e notifiche istantanee\n• Archivio offerte e statistiche\n• Scansione prioritaria\n\nPrezzo: <b>€4.99 / mese</b>, <b>$4.99 USDT</b> o <b>500 ⭐️</b>',
    account_header: '👤 <b>Il mio account</b>\n\n%status%\n📍 %routes%',
    account_btn_upgrade: '💎 Passa a Premium',
    help_text: '🚐 <b>Camper Monitor — Guida</b>\n\nIl bot controlla i fornitori di noleggio e avvisa quando sono disponibili veicoli a <b>1€</b>.\n\n<b>Fornitori supportati:</b>\n• <b>Roadsurfer Rally</b> — camper in Europa\n• <b>Movacar</b> — auto e camper\n• <b>Indie Campers</b> — van camperizzati\n• <b>Imoova</b> — spostamenti internazionali',
    btn_book: 'Prenota offerta ➔',
    btn_disable_route: '🚫 Disattiva questo percorso',
    route_disabled: '🚫 Percorso disattivato.',
    stars_invoice_title: 'Camper Monitor Premium (30 giorni)',
    stars_invoice_desc: 'Percorsi illimitati, notifiche istantanee e archivio offerte per 30 giorni.',
    stars_payment_success: '🎉 <b>Pagamento con Telegram Stars ricevuto!</b>\n\nIl tuo abbonamento Premium è attivo per <b>%days% giorni</b>.\n\nUsa /account per verificare il tuo stato.',
    crypto_invoice_created: '💎 <b>Pagamento CryptoBot (USDT)</b>\n\nImporto: <b>$4.99 USDT</b>\nPiano: <b>30 Giorni Premium</b>\n\nPremi il pulsante qui sotto per pagare:',
    crypto_pay_btn: 'Paga $4.99 USDT ➔',
    days_1: 'giorno',
    days_2_4: 'giorni',
    days_5: 'giorni',
    promo_prompt: '🎁 <b>Riscatta codice promozionale</b>\n\nInvia il comando con il tuo codice:\n<code>/promo TUOCODICE</code>',
    promo_success: '🎉 <b>Codice promo riscattato!</b>\n\nGiorni accreditati: <b>%days%</b>\nValido fino al: <b>%expiry%</b>',
    promo_err_invalid: '❌ Codice promozionale non trovato o non valido.',
    promo_err_expired: '⏱ Questo codice promozionale è scaduto.',
    promo_err_exhausted: '⚠️ Questo codice promozionale ha raggiunto il limite massimo di utilizzi.',
    promo_err_used: '⚠️ Hai già riscattato questo codice promozionale.',
  }
};

export function resolveLanguage(langCode?: string | null): string {
  if (!langCode) return DEFAULT_LANGUAGE;
  const l = langCode.toLowerCase().slice(0, 2);
  if (l === 'uk' || l === 'ru') return 'ru';
  if (l === 'de') return 'de';
  if (l === 'it') return 'it';
  if (l === 'en') return 'en';
  return DEFAULT_LANGUAGE;
}

export function t(key: string, lang = DEFAULT_LANGUAGE, replacements: Record<string, any> = {}): string {
  const resolved = resolveLanguage(lang);
  const dict = I18N_STRINGS[resolved] || I18N_STRINGS[DEFAULT_LANGUAGE] || I18N_STRINGS.en;
  let text = dict[key] || I18N_STRINGS.en[key] || I18N_STRINGS.ru?.[key] || key;
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replaceAll(`%${k}%`, String(v));
  }
  return text;
}

export function pluralizeDays(days: number, lang = DEFAULT_LANGUAGE): string {
  if (!days || days <= 0) return '';
  const l = (lang || DEFAULT_LANGUAGE).toLowerCase().slice(0, 2);

  if (l === 'de') {
    return days === 1 ? ' · 1 Tag' : ` · ${days} Tage`;
  }
  if (l === 'it') {
    return days === 1 ? ' · 1 giorno' : ` · ${days} giorni`;
  }
  if (l === 'en') {
    return days === 1 ? ' · 1 day' : ` · ${days} days`;
  }
  if (l === 'uk') {
    const mod10 = days % 10;
    const mod100 = days % 100;
    const isTeen = mod100 >= 11 && mod100 <= 19;
    if (!isTeen && mod10 === 1) {
      return ` · ${days} день`;
    } else if (!isTeen && mod10 >= 2 && mod10 <= 4) {
      return ` · ${days} дні`;
    } else {
      return ` · ${days} днів`;
    }
  }

  // Russian / Default
  const mod10 = days % 10;
  const mod100 = days % 100;
  const isTeen = mod100 >= 11 && mod100 <= 19;

  if (!isTeen && mod10 === 1) {
    return ` · ${days} день`;
  } else if (!isTeen && mod10 >= 2 && mod10 <= 4) {
    return ` · ${days} дня`;
  } else {
    return ` · ${days} дней`;
  }
}
