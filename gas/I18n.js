// Internationalization (i18n) module for Camper Monitor
// Supports: de (Deutsch), it (Italiano), en (English), uk (Українська), ru (Русский)

var SUPPORTED_LANGUAGES = ['de', 'it', 'en', 'uk', 'ru'];
var DEFAULT_LANGUAGE = 'ru';

var LANGUAGE_NAMES = {
  de: 'Deutsch 🇩🇪',
  it: 'Italiano 🇮🇹',
  en: 'English 🇬🇧',
  uk: 'Українська 🇺🇦',
  ru: 'Русский 🇷🇺'
};

var I18N_STRINGS = {
  en: {
    lang_name: 'English',
    offer_title_camper: '%icon% <b>%source% — Campervan found%priceSuffix%</b>',
    offer_title_car: '%icon% <b>%source% — Passenger car found%priceSuffix%</b>',
    offer_type_camper: '🚐 <b>Campervan / Motorhome%sleeping%</b>',
    offer_type_car: '🚗 <b>Passenger car (%operator%, no berths)</b>',
    offer_type_label: '🏷 Type: ',
    sleeping_places: ' (berths: %count%)',
    vehicle_model: '\n%icon% Model: <b>%model%</b>',
    price_line_1eur: '\n💶 Price: <b>1 €</b>',
    price_line_fixed: '\n💶 Price: <b>%price% €</b>',
    price_line_daily: '\n💶 Price: <b>%price%</b> € / day (total: <b>%total%</b> €)',
    price_suffix_1eur: ' for 1€!',
    price_suffix_from: ' from %price%€/day!',
    price_suffix_price: ' for %price%€!',
    btn_book: 'Book offer ➔',
    btn_disable_route: '🚫 Disable this route',
    btn_route_disabled: 'Route disabled 🚫',
    alert_route_disabled: 'Route disabled! 🚫',
    alert_route_already_disabled: 'Route is already disabled.',
    
    // Commands & Notifications
    start_welcome: '🚐 <b>Camper Monitor Bot</b>\n\n' +
      'Monitoring 1€ campervan and car relocations (Roadsurfer Rally, Movacar, Indie Campers, Imoova).\n\n' +
      '<b>Available commands:</b>\n' +
      '📊 /status — monitoring status & stats\n' +
      '📋 /digest — 24h summary digest\n' +
      '🎯 /actual — current offers matching your filters\n' +
      '🌙 /silent — silent hours configuration\n' +
      '🔍 /check — trigger scanning right now\n' +
      '🚗 /routes — list tracked routes\n' +
      '🌐 /lang — change language (EN/DE/IT/UK/RU)\n' +
      'ℹ️ /help — help & instructions',
      
    help_text: '🚐 <b>Camper Monitor — Help</b>\n\n' +
      'The bot automatically scans provider sites and sends relocation offers for 1 euro.\n\n' +
      '<b>Commands:</b>\n' +
      '/status — last poll time, interval, 24h statistics\n' +
      '/digest — summary digest of found offers in the last 24h\n' +
      '/actual — currently active offers matching your filters\n' +
      '/silent [on|off|HH:MM-HH:MM] — silent hours mode (no sound)\n' +
      '/check — trigger an immediate check\n' +
      '/routes — list of active monitored routes\n' +
      '/lang — switch language\n\n' +
      'Buttons below each alert: "Book offer ➔" and "🚫 Disable this route".\n\n' +
      'Issues & reports: https://github.com/anomalyco/opencode/issues',

    unknown_command: 'Sorry, I only understand commands. Tap /help to see the available commands.',
    
    check_starting: '⏳ Starting scan...',
    check_finished: '✅ Scan completed.',
    
    routes_header: '🚗 <b>Tracked routes:</b>\n',
    routes_empty: 'No routes found. Configure them in the Mini App and tap "Save".',
    routes_all_cities: 'All cities',
    routes_route_word: 'route',
    
    routes_cleared: '🗑️ All routes cleared. Now open Mini App and tap "Save".',
    
    campers_info: '🚐 <b>Vehicle type</b> is now configured individually for each route (in Mini App "Routes" tab or via /routes). You can choose: only campers, only cars, or all.',
    
    silent_on: '🌙 Silent hours enabled (default: 23:00-07:00).',
    silent_off: '☀️ Silent hours disabled. Notifications will always have sound.',
    silent_set: '🌙 Silent hours configured for: %start% – %end%',
    silent_invalid_format: '❌ Invalid time format. Example: /silent 22:00-08:00',
    silent_status_header: '🌙 <b>Silent Hours</b>\n\nCurrent status: %status%\n',
    silent_status_interval: 'Interval: %start% – %end%\n\n',
    silent_usage: 'Controls:\n' +
      '• <code>/silent on</code> — enable (23:00-07:00)\n' +
      '• <code>/silent off</code> — disable\n' +
      '• <code>/silent 22:00-08:00</code> — change interval',
    status_enabled: 'ENABLED',
    status_disabled: 'DISABLED',
    
    digest_title: '📋 <b>Daily digest (last 24h):</b>',
    digest_empty: '📋 <b>Daily Digest</b>\n\nNo new offers found in the last 24 hours.',
    digest_found: 'Offers found: %count%\n',
    digest_more: '\n... and %count% more offers in archive.',
    
    actual_title: '📋 <b>Current offers:</b>',
    actual_empty: '📋 <b>Current Offers</b>\n\nNo offers found matching your filters and routes.',
    actual_found: 'Slots found: %count%\n',
    actual_more: '\n... and %count% more slots.',
    actual_book_link: 'Book ➔',
    
    status_header: '📊 <b>Camper Monitor Status</b>',
    status_site_conn: '🌐 <b>Provider Connection:</b>',
    status_last_poll: '⏱ Last poll: %time%',
    status_total_24h: '📈 Total offers in 24h: %count%',
    status_active_routes: '🚗 My active routes: %count%',
    status_my_filters: 'My filters:',
    status_origin: '  Origin: %val%',
    status_dest: '  Destination: %val%',
    status_duration: '  Duration: %min%–%max% days',
    status_max_price: '  Max price: %val%',
    status_vehicle_type: '  Vehicle type: %val%',
    status_campers_only: '🚐 Only campers / motorhomes',
    status_all_vehicles: '🚗 All vehicles (including cars)',
    status_commands: 'Commands:\n/check — scan now\n/routes — list my routes\n/lang — change language',
    status_all: 'all',
    status_any: 'any',
    status_no_data: 'no data',

    lang_prompt: '🌐 <b>Language Settings</b>\nCurrent language: <b>English 🇬🇧</b>\n\nChoose your preferred language:',
    lang_changed: 'Language set to English 🇬🇧'
  },

  de: {
    lang_name: 'Deutsch',
    offer_title_camper: '%icon% <b>%source% — Wohnmobil gefunden%priceSuffix%</b>',
    offer_title_car: '%icon% <b>%source% — PKW gefunden%priceSuffix%</b>',
    offer_type_camper: '🚐 <b>Wohnmobil / Camper%sleeping%</b>',
    offer_type_car: '🚗 <b>PKW (%operator%, keine Schlafplätze)</b>',
    offer_type_label: '🏷 Typ: ',
    sleeping_places: ' (Schlafplätze: %count%)',
    vehicle_model: '\n%icon% Modell: <b>%model%</b>',
    price_line_1eur: '\n💶 Preis: <b>1 €</b>',
    price_line_fixed: '\n💶 Preis: <b>%price% €</b>',
    price_line_daily: '\n💶 Preis: <b>%price%</b> € / Tag (gesamt: <b>%total%</b> €)',
    price_suffix_1eur: ' für 1€!',
    price_suffix_from: ' ab %price%€/Tag!',
    price_suffix_price: ' für %price%€!',
    btn_book: 'Angebot buchen ➔',
    btn_disable_route: '🚫 Diese Route deaktivieren',
    btn_route_disabled: 'Route deaktiviert 🚫',
    alert_route_disabled: 'Route deaktiviert! 🚫',
    alert_route_already_disabled: 'Route ist bereits deaktiviert.',
    
    start_welcome: '🚐 <b>Camper Monitor Bot</b>\n\n' +
      'Überwachung von Wohnmobil- und PKW-Überführungen für 1€ (Roadsurfer Rally, Movacar, Indie Campers, Imoova).\n\n' +
      '<b>Verfügbare Befehle:</b>\n' +
      '📊 /status — Überwachungsstatus & Statistik\n' +
      '📋 /digest — Zusammenfassung der letzten 24 Std.\n' +
      '🎯 /actual — Aktuelle Angebote nach Ihren Filtern\n' +
      '🌙 /silent — Ruhezeiten-Einstellungen\n' +
      '🔍 /check — Jetzt sofort prüfen\n' +
      '🚗 /routes — Überwachte Routen anzeigen\n' +
      '🌐 /lang — Sprache wechseln (DE/EN/IT/UK/RU)\n' +
      'ℹ️ /help — Hilfe & Info',

    help_text: '🚐 <b>Camper Monitor — Hilfe</b>\n\n' +
      'Der Bot sucht automatisch nach Überführungsfahrten für 1 Euro.\n\n' +
      '<b>Befehle:</b>\n' +
      '/status — Letzte Abfrage, Intervall, 24h-Statistik\n' +
      '/digest — Zusammenfassung der Angebote der letzten 24 Std.\n' +
      '/actual — Aktuelle Angebote für Ihre Filter und Routen\n' +
      '/silent [on|off|HH:MM-HH:MM] — Lautlose Benachrichtigungen\n' +
      '/check — Suche sofort starten\n' +
      '/routes — Liste aktiver Routen\n' +
      '/lang — Sprache ändern\n\n' +
      'Buttons unter jedem Angebot: «Angebot buchen ➔» und «🚫 Diese Route deaktivieren».\n\n' +
      'Fehler melden: https://github.com/anomalyco/opencode/issues',

    unknown_command: 'Entschuldigung, ich verstehe nur Befehle. Tippen Sie auf /help für eine Übersicht.',
    
    check_starting: '⏳ Scan wird gestartet...',
    check_finished: '✅ Scan abgeschlossen.',
    
    routes_header: '🚗 <b>Überwachte Routen:</b>\n',
    routes_empty: 'Keine Routen vorhanden. Richten Sie diese in der Mini App ein und tippen Sie auf „Speichern“.',
    routes_all_cities: 'Alle Städte',
    routes_route_word: 'Route',
    
    routes_cleared: '🗑️ Alle Routen gelöscht. Öffnen Sie die Mini App und tippen Sie auf „Speichern“.',
    
    campers_info: '🚐 <b>Fahrzeugtyp</b> wird nun für jede Route individuell eingestellt (in der Mini App im Tab „Routen“ oder via /routes). Sie können wählen: nur Camper, nur PKW oder alle.',
    
    silent_on: '🌙 Ruhezeiten aktiviert (Standard 23:00-07:00).',
    silent_off: '☀️ Ruhezeiten deaktiviert. Benachrichtigungen erfolgen immer mit Ton.',
    silent_set: '🌙 Ruhezeiten eingestellt auf: %start% – %end%',
    silent_invalid_format: '❌ Ungültiges Zeitformat. Beispiel: /silent 22:00-08:00',
    silent_status_header: '🌙 <b>Ruhezeiten</b>\n\nAktueller Status: %status%\n',
    silent_status_interval: 'Intervall: %start% – %end%\n\n',
    silent_usage: 'Steuerung:\n' +
      '• <code>/silent on</code> — aktivieren (23:00-07:00)\n' +
      '• <code>/silent off</code> — deaktivieren\n' +
      '• <code>/silent 22:00-08:00</code> — Zeitspanne ändern',
    status_enabled: 'AKTIVIERT',
    status_disabled: 'DEAKTIVIERT',
    
    digest_title: '📋 <b>Tages-Digest (letzte 24h):</b>',
    digest_empty: '📋 <b>Tages-Digest</b>\n\nIn den letzten 24 Stunden wurden keine neuen Angebote gefunden.',
    digest_found: 'Gefundene Angebote: %count%\n',
    digest_more: '\n... und %count% weitere Angebote im Archiv.',
    
    actual_title: '📋 <b>Aktuelle Angebote:</b>',
    actual_empty: '📋 <b>Aktuelle Angebote</b>\n\nKeine Angebote für Ihre Filter und Routen gefunden.',
    actual_found: 'Gefundene Slots: %count%\n',
    actual_more: '\n... und %count% weitere Slots.',
    actual_book_link: 'Buchen ➔',
    
    status_header: '📊 <b>Status Camper Monitor</b>',
    status_site_conn: '🌐 <b>Verbindung zu Websites:</b>',
    status_last_poll: '⏱ Letzte Abfrage: %time%',
    status_total_24h: '📈 Angebote in 24h: %count%',
    status_active_routes: '🚗 Aktive Routen: %count%',
    status_my_filters: 'Meine Filter:',
    status_origin: '  Startländer: %val%',
    status_dest: '  Zielländer: %val%',
    status_duration: '  Dauer: %min%–%max% Tage',
    status_max_price: '  Max. Preis: %val%',
    status_vehicle_type: '  Fahrzeugtyp: %val%',
    status_campers_only: '🚐 Nur Wohnmobile (Camper)',
    status_all_vehicles: '🚗 Alle (inkl. PKW)',
    status_commands: 'Befehle:\n/check — Jetzt prüfen\n/routes — Meine Routen\n/lang — Sprache wählen',
    status_all: 'alle',
    status_any: 'beliebig',
    status_no_data: 'keine Daten',

    lang_prompt: '🌐 <b>Spracheinstellungen</b>\nAktuelle Sprache: <b>Deutsch 🇩🇪</b>\n\nWählen Sie Ihre gewünschte Sprache:',
    lang_changed: 'Sprache auf Deutsch geändert 🇩🇪'
  },

  it: {
    lang_name: 'Italiano',
    offer_title_camper: '%icon% <b>%source% — Camper trovato%priceSuffix%</b>',
    offer_title_car: '%icon% <b>%source% — Auto trovata%priceSuffix%</b>',
    offer_type_camper: '🚐 <b>Camper / Motorhome%sleeping%</b>',
    offer_type_car: '🚗 <b>Auto passeggeri (%operator%, senza posti letto)</b>',
    offer_type_label: '🏷 Tipo: ',
    sleeping_places: ' (posti letto: %count%)',
    vehicle_model: '\n%icon% Modello: <b>%model%</b>',
    price_line_1eur: '\n💶 Prezzo: <b>1 €</b>',
    price_line_fixed: '\n💶 Prezzo: <b>%price% €</b>',
    price_line_daily: '\n💶 Prezzo: <b>%price%</b> € / giorno (totale: <b>%total%</b> €)',
    price_suffix_1eur: ' a 1€!',
    price_suffix_from: ' da %price%€/giorno!',
    price_suffix_price: ' per %price%€!',
    btn_book: 'Prenota offerta ➔',
    btn_disable_route: '🚫 Disattiva questa rotta',
    btn_route_disabled: 'Rotta disattivata 🚫',
    alert_route_disabled: 'Rotta disattivata! 🚫',
    alert_route_already_disabled: 'La rotta è già disattivata.',
    
    start_welcome: '🚐 <b>Camper Monitor Bot</b>\n\n' +
      'Monitoraggio di trasferimenti camper e auto a 1€ (Roadsurfer Rally, Movacar, Indie Campers, Imoova).\n\n' +
      '<b>Comandi disponibili:</b>\n' +
      '📊 /status — stato monitoraggio e statistiche\n' +
      '📋 /digest — riepilogo delle ultime 24 ore\n' +
      '🎯 /actual — offerte attuali secondo i tuoi filtri\n' +
      '🌙 /silent — impostazioni modalità silenziosa\n' +
      '🔍 /check — avvia scansione immediata\n' +
      '🚗 /routes — elenco percorsi monitorati\n' +
      '🌐 /lang — cambia lingua (IT/EN/DE/UK/RU)\n' +
      'ℹ️ /help — guida e aiuto',

    help_text: '🚐 <b>Camper Monitor — Guida</b>\n\n' +
      'Il bot scansiona automaticamente i siti e invia nuove offerte a 1 euro.\n\n' +
      '<b>Comandi:</b>\n' +
      '/status — orario ultima scansione, intervallo, statistiche 24h\n' +
      '/digest — riepilogo offerte trovate nelle ultime 24h\n' +
      '/actual — offerte attuali per i tuoi filtri e percorsi\n' +
      '/silent [on|off|HH:MM-HH:MM] — modalità silenziosa (senza suono)\n' +
      '/check — verifica subito\n' +
      '/routes — lista percorsi attivi\n' +
      '/lang — cambia lingua\n\n' +
      'Pulsanti sotto ogni offerta: «Prenota offerta ➔» e «🚫 Disattiva questa rotta».\n\n' +
      'Segnala errori: https://github.com/anomalyco/opencode/issues',

    unknown_command: 'Spiacente, comprendo solo i comandi. Tocca /help per visualizzare la lista dei comandi.',
    
    check_starting: '⏳ Avvio scansione...',
    check_finished: '✅ Scansione completata.',
    
    routes_header: '🚗 <b>Percorsi monitorati:</b>\n',
    routes_empty: 'Nessun percorso trovato. Configurali nella Mini App e tocca "Salva".',
    routes_all_cities: 'Tutte le città',
    routes_route_word: 'rotta',
    
    routes_cleared: '🗑️ Tutti i percorsi cancellati. Ora apri la Mini App e tocca "Salva".',
    
    campers_info: '🚐 <b>Il tipo di veicolo</b> è ora configurabile individualmente per ogni rotta (nella Mini App nella scheda «Rotte» o con /routes). Puoi scegliere: solo camper, solo auto o tutti.',
    
    silent_on: '🌙 Modalità silenziosa attivata (default: 23:00-07:00).',
    silent_off: '☀️ Modalità silenziosa disattivata. Le notifiche suoneranno sempre.',
    silent_set: '🌙 Ore silenziose impostate su: %start% – %end%',
    silent_invalid_format: '❌ Formato orario non valido. Esempio: /silent 22:00-08:00',
    silent_status_header: '🌙 <b>Modalità Silenziosa</b>\n\nStato attuale: %status%\n',
    silent_status_interval: 'Intervallo: %start% – %end%\n\n',
    silent_usage: 'Comandi:\n' +
      '• <code>/silent on</code> — attiva (23:00-07:00)\n' +
      '• <code>/silent off</code> — disattiva\n' +
      '• <code>/silent 22:00-08:00</code> — modifica intervallo',
    status_enabled: 'ATTIVATA',
    status_disabled: 'DISATTIVATA',
    
    digest_title: '📋 <b>Riepilogo giornaliero (ultime 24h):</b>',
    digest_empty: '📋 <b>Riepilogo Giornaliero</b>\n\nNessuna nuova offerta trovata nelle ultime 24 ore.',
    digest_found: 'Offerte trovate: %count%\n',
    digest_more: '\n... e altre %count% offerte in archivio.',
    
    actual_title: '📋 <b>Offerte attuali:</b>',
    actual_empty: '📋 <b>Offerte Attuali</b>\n\nNessuna offerta trovata per i tuoi filtri e percorsi.',
    actual_found: 'Offerte trovate: %count%\n',
    actual_more: '\n... e altri %count% slot.',
    actual_book_link: 'Prenota ➔',
    
    status_header: '📊 <b>Stato Camper Monitor</b>',
    status_site_conn: '🌐 <b>Connessione ai provider:</b>',
    status_last_poll: '⏱ Ultima scansione: %time%',
    status_total_24h: '📈 Offerte totali 24h: %count%',
    status_active_routes: '🚗 Mie rotte attive: %count%',
    status_my_filters: 'Miei filtri:',
    status_origin: '  Partenza: %val%',
    status_dest: '  Destinazione: %val%',
    status_duration: '  Durata: %min%–%max% giorni',
    status_max_price: '  Prezzo max: %val%',
    status_vehicle_type: '  Tipo veicolo: %val%',
    status_campers_only: '🚐 Solo camper / motorhome',
    status_all_vehicles: '🚗 Tutti (incluse auto)',
    status_commands: 'Comandi:\n/check — verifica ora\n/routes — mie rotte\n/lang — cambia lingua',
    status_all: 'tutti',
    status_any: 'qualsiasi',
    status_no_data: 'nessun dato',

    lang_prompt: '🌐 <b>Impostazioni Lingua</b>\nLingua attuale: <b>Italiano 🇮🇹</b>\n\nScegli la tua lingua preferita:',
    lang_changed: 'Lingua impostata su Italiano 🇮🇹'
  },

  uk: {
    lang_name: 'Українська',
    offer_title_camper: '%icon% <b>%source% — знайдено кемпер%priceSuffix%</b>',
    offer_title_car: '%icon% <b>%source% — знайдено легковий авто%priceSuffix%</b>',
    offer_type_camper: '🚐 <b>Будинок на колесах%sleeping%</b>',
    offer_type_car: '🚗 <b>Легковий авто (%operator%, без спальних місць)</b>',
    offer_type_label: '🏷 Тип: ',
    sleeping_places: ' (спальних місць: %count%)',
    vehicle_model: '\n%icon% Модель: <b>%model%</b>',
    price_line_1eur: '\n💶 Ціна: <b>1 €</b>',
    price_line_fixed: '\n💶 Ціна: <b>%price% €</b>',
    price_line_daily: '\n💶 Ціна: <b>%price%</b> € / добу (разом: <b>%total%</b> €)',
    price_suffix_1eur: ' за 1€!',
    price_suffix_from: ' від %price%€/добу!',
    price_suffix_price: ' за %price%€!',
    btn_book: 'Забронювати оффер ➔',
    btn_disable_route: '🚫 Вимкнути цей маршрут',
    btn_route_disabled: 'Маршрут вимкнено 🚫',
    alert_route_disabled: 'Маршрут вимкнено! 🚫',
    alert_route_already_disabled: 'Маршрут вже вимкнено.',
    
    start_welcome: '🚐 <b>Camper Monitor Bot</b>\n\n' +
      'Моніторинг перегонів кемперів та авто за 1€ (Roadsurfer Rally, Movacar, Indie Campers, Imoova).\n\n' +
      '<b>Доступні команди:</b>\n' +
      '📊 /status — статус моніторингу та статистика\n' +
      '📋 /digest — зведений дайджест за 24г\n' +
      '🎯 /actual — актуальні пропозиції за вашими фільтрами\n' +
      '🌙 /silent — налаштування тихих годин\n' +
      '🔍 /check — примусовий запуск перевірки\n' +
      '🚗 /routes — список маршрутів\n' +
      '🌐 /lang — змінити мову (UK/EN/DE/IT/RU)\n' +
      'ℹ️ /help — довідка',

    help_text: '🚐 <b>Camper Monitor — Довідка</b>\n\n' +
      'Бот автоматично сканує сайти провайдерів та надсилає нові перегони за 1 євро.\n\n' +
      '<b>Команди:</b>\n' +
      '/status — час останнього опитування, інтервал, статистика за 24г\n' +
      '/digest — зведений дайджест знайдених офферів за 24г\n' +
      '/actual — актуальні пропозиції за вашими фільтрами та маршрутами\n' +
      '/silent [on|off|HH:MM-HH:MM] — режим тихих годин (без звуку)\n' +
      '/check — запустити перевірку прямо зараз\n' +
      '/routes — список активних напрямків\n' +
      '/lang — змінити мову\n\n' +
      'Під кожним оффером доступні кнопки: «Забронювати оффер ➔» та «🚫 Вимкнути цей маршрут».\n\n' +
      'Повідомити про помилку: https://github.com/anomalyco/opencode/issues',

    unknown_command: 'Вибачте, я розумію лише команди. Натисніть /help, щоб переглянути список доступних команд.',
    
    check_starting: '⏳ Запуск сканування...',
    check_finished: '✅ Сканування завершено.',
    
    routes_header: '🚗 <b>Маршрути, що відстежуються:</b>\n',
    routes_empty: 'Немає маршрутів. Налаштуйте їх у Mini App та натисніть «Зберегти».',
    routes_all_cities: 'Всі міста',
    routes_route_word: 'маршрут',
    
    routes_cleared: '🗑️ Всі маршрути очищено. Тепер відкрийте Mini App і натисніть «Зберегти».',
    
    campers_info: '🚐 <b>Тип транспорту</b> тепер налаштовується індивідуально в кожному маршруті (в додатку на вкладці «Маршрути» або командою /routes). Ви можете обрати: тільки кемпери, тільки легкові або всі.',
    
    silent_on: '🌙 Тихі години увімкнено (за замовчуванням 23:00-07:00).',
    silent_off: '☀️ Тихі години вимкнено. Сповіщення будуть надходити завжди.',
    silent_set: '🌙 Тихі години налаштовано на: %start% – %end%',
    silent_invalid_format: '❌ Невірний формат часу. Приклад: /silent 22:00-08:00',
    silent_status_header: '🌙 <b>Тихі години</b>\n\nПоточний статус: %status%\n',
    silent_status_interval: 'Інтервал: %start% – %end%\n\n',
    silent_usage: 'Керування:\n' +
      '• <code>/silent on</code> — увімкнути (23:00-07:00)\n' +
      '• <code>/silent off</code> — вимкнути\n' +
      '• <code>/silent 22:00-08:00</code> — змінити інтервал',
    status_enabled: 'УВІМКНЕНО',
    status_disabled: 'ВИМКНЕНО',
    
    digest_title: '📋 <b>Денний дайджест (за 24г):</b>',
    digest_empty: '📋 <b>Денний дайджест</b>\n\nЗа останні 24 години нових офферів не знайдено.',
    digest_found: 'Знайдено слотів: %count%\n',
    digest_more: '\n... та ще %count% слотів в архіві.',
    
    actual_title: '📋 <b>Актуальні пропозиції:</b>',
    actual_empty: '📋 <b>Актуальні пропозиції</b>\n\nЗа вашими фільтрами та маршрутами актуальних пропозицій не знайдено.',
    actual_found: 'Знайдено слотів: %count%\n',
    actual_more: '\n... та ще %count% слотів.',
    actual_book_link: 'Забронювати ➔',
    
    status_header: '📊 <b>Статус Camper Monitor</b>',
    status_site_conn: '🌐 <b>Звʼязок із сайтами:</b>',
    status_last_poll: '⏱ Останнє опитування: %time%',
    status_total_24h: '📈 Загальних офферів за 24г: %count%',
    status_active_routes: '🚗 Моїх маршрутів (активних): %count%',
    status_my_filters: 'Мої фільтри:',
    status_origin: '  Звідки: %val%',
    status_dest: '  Куди: %val%',
    status_duration: '  Тривалість: %min%–%max% днів',
    status_max_price: '  Макс. ціна: %val%',
    status_vehicle_type: '  Тип ТЗ: %val%',
    status_campers_only: '🚐 Тільки будинки на колесах (кемпери)',
    status_all_vehicles: '🚗 Всі (включаючи легкові)',
    status_commands: 'Команди:\n/check — запустити сканування прямо зараз\n/routes — список моїх маршрутів\n/lang — обрати мову',
    status_all: 'всі',
    status_any: 'будь-яка',
    status_no_data: 'немає даних',

    lang_prompt: '🌐 <b>Налаштування мови</b>\nПоточна мова: <b>Українська 🇺🇦</b>\n\nОберіть бажану мову:',
    lang_changed: 'Мову змінено на Українську 🇺🇦'
  },

  ru: {
    lang_name: 'Русский',
    offer_title_camper: '%icon% <b>%source% — найден кемпер%priceSuffix%</b>',
    offer_title_car: '%icon% <b>%source% — найден легковой авто%priceSuffix%</b>',
    offer_type_camper: '🚐 <b>Дом на колёсах%sleeping%</b>',
    offer_type_car: '🚗 <b>Легковой авто (%operator%, без спальных мест)</b>',
    offer_type_label: '🏷 Тип: ',
    sleeping_places: ' (спальных мест: %count%)',
    vehicle_model: '\n%icon% Модель: <b>%model%</b>',
    price_line_1eur: '\n💶 Цена: <b>1 €</b>',
    price_line_fixed: '\n💶 Цена: <b>%price% €</b>',
    price_line_daily: '\n💶 Цена: <b>%price%</b> € / сутки (всего: <b>%total%</b> €)',
    price_suffix_1eur: ' за 1€!',
    price_suffix_from: ' от %price%€/сутки!',
    price_suffix_price: ' за %price%€!',
    btn_book: 'Забронировать оффер ➔',
    btn_disable_route: '🚫 Отключить этот маршрут',
    btn_route_disabled: 'Маршрут отключен 🚫',
    alert_route_disabled: 'Маршрут отключен! 🚫',
    alert_route_already_disabled: 'Маршрут уже отключен.',
    
    start_welcome: '🚐 <b>Camper Monitor Bot</b>\n\n' +
      'Мониторинг перегонов кемперов за 1€ (Roadsurfer Rally, Movacar, Indie Campers, Imoova).\n\n' +
      '<b>Доступные команды:</b>\n' +
      '📊 /status — статус мониторинга и статистика\n' +
      '📋 /digest — сводный дайджест офферов за 24ч\n' +
      '🎯 /actual — актуальные предложения по вашим фильтрам\n' +
      '🌙 /silent — настройки режима тихих часов\n' +
      '🔍 /check — принудительный запуск сканирования\n' +
      '🚗 /routes — список отслеживаемых маршрутов\n' +
      '🌐 /lang — переключить язык (RU/EN/DE/IT/UK)\n' +
      'ℹ️ /help — справка',

    help_text: '🚐 <b>Camper Monitor — Справка</b>\n\n' +
      'Бот автоматически сканирует сайты и присылает новые перегоны за 1 евро.\n\n' +
      '<b>Команды:</b>\n' +
      '/status — время последнего опроса, интервал, статистика за 24ч\n' +
      '/digest — сводный дайджест найденных офферов за 24ч\n' +
      '/actual — актуальные предложения по вашим фильтрам и маршрутам\n' +
      '/silent [on|off|HH:MM-HH:MM] — режим тихих часов (без звука)\n' +
      '/check — запустить проверку прямо сейчас\n' +
      '/routes — список активных направлений\n' +
      '/lang — изменить язык интерфейса\n\n' +
      'Под каждым оффером доступны кнопки: «Забронировать оффер ➔» и «🚫 Отключить этот маршрут».\n\n' +
      'Чтобы сообщить об ошибке: https://github.com/anomalyco/opencode/issues',

    unknown_command: 'Извините, я понимаю только команды. Нажмите /help, чтобы посмотреть список доступных команд.',
    
    check_starting: '⏳ Запуск сканирования...',
    check_finished: '✅ Сканирование завершено.',
    
    routes_header: '🚗 <b>Отслеживаемые маршруты:</b>\n',
    routes_empty: 'Нет маршрутов. Настройте их в Mini App и нажмите «Сохранить».',
    routes_all_cities: 'Все города',
    routes_route_word: 'маршрут',
    
    routes_cleared: '🗑️ Все маршруты очищены. Теперь откройте Mini App и нажмите «Сохранить».',
    
    campers_info: '🚐 <b>Тип транспорта</b> теперь настраивается индивидуально в каждом маршруте (в приложении на вкладке «Маршруты» или командой /routes). Вы можете выбрать: только кемперы, только легковые или все.',
    
    silent_on: '🌙 Тихие часы включены (по умолчанию 23:00-07:00).',
    silent_off: '☀️ Тихие часы отключены. Уведомления будут приходить всегда.',
    silent_set: '🌙 Тихие часы настроены на: %start% – %end%',
    silent_invalid_format: '❌ Неверный формат времени. Пример: /silent 22:00-08:00',
    silent_status_header: '🌙 <b>Тихие часы</b>\n\nТекущий статус: %status%\n',
    silent_status_interval: 'Интервал: %start% – %end%\n\n',
    silent_usage: 'Управление:\n' +
      '• <code>/silent on</code> — включить (23:00-07:00)\n' +
      '• <code>/silent off</code> — выключить\n' +
      '• <code>/silent 22:00-08:00</code> — изменить интервал',
    status_enabled: 'ВКЛЮЧЕНЫ',
    status_disabled: 'ВЫКЛЮЧЕНЫ',
    
    digest_title: '📋 <b>Дневной дайджест (за 24ч):</b>',
    digest_empty: '📋 <b>Дневной дайджест</b>\n\nЗа последние 24 часа новых офферов не найдено.',
    digest_found: 'Найдено слотов: %count%\n',
    digest_more: '\n... и еще %count% слотов в архиве.',
    
    actual_title: '📋 <b>Актуальные предложения:</b>',
    actual_empty: '📋 <b>Актуальные предложения</b>\n\nПо вашим фильтрам и маршрутам актуальных предложений не найдено.',
    actual_found: 'Найдено слотов: %count%\n',
    actual_more: '\n... и еще %count% слотов.',
    actual_book_link: 'Забронировать ➔',
    
    status_header: '📊 <b>Статус Camper Monitor</b>',
    status_site_conn: '🌐 <b>Связь с сайтами:</b>',
    status_last_poll: '⏱ Последний опрос: %time%',
    status_total_24h: '📈 Общих офферов за 24ч: %count%',
    status_active_routes: '🚗 Моих маршрутов (активных): %count%',
    status_my_filters: 'Мои фильтры:',
    status_origin: '  Откуда: %val%',
    status_dest: '  Куди: %val%',
    status_duration: '  Длительность: %min%–%max% дней',
    status_max_price: '  Макс. цена: %val%',
    status_vehicle_type: '  Тип ТС: %val%',
    status_campers_only: '🚐 Только дома на колёсах (кемперы)',
    status_all_vehicles: '🚗 Все (включая легковые)',
    status_commands: 'Команды:\n/check — запустить сканирование прямо сейчас\n/routes — список моих маршрутов\n/lang — выбор языка',
    status_all: 'все',
    status_any: 'любая',
    status_no_data: 'нет данных',

    lang_prompt: '🌐 <b>Настройка языка</b>\nТекущий язык: <b>Русский 🇷🇺</b>\n\nВыберите желаемый язык:',
    lang_changed: 'Язык изменён на Русский 🇷🇺'
  }
};

/**
 * Pluralizes days count according to grammar rules of each language.
 * @param {number} days
 * @param {string} lang
 * @returns {string} E.g. ' (1 day)', ' (3 days)', ' (5 дней)', ' (2 дні)'
 */
function pluralizeDays_(days, lang) {
  if (!days || days <= 0) return '';
  var l = normalizeLanguage_(lang);
  
  if (l === 'de') {
    return days === 1 ? ' (1 Tag)' : ' (' + days + ' Tage)';
  }
  if (l === 'it') {
    return days === 1 ? ' (1 giorno)' : ' (' + days + ' giorni)';
  }
  if (l === 'en') {
    return days === 1 ? ' (1 day)' : ' (' + days + ' days)';
  }
  
  // Slavic plurals: ru and uk
  var mod10 = days % 10;
  var mod100 = days % 100;
  var isTeen = mod100 >= 11 && mod100 <= 19;
  
  if (l === 'uk') {
    if (!isTeen && mod10 === 1) {
      return ' (' + days + ' день)';
    } else if (!isTeen && mod10 >= 2 && mod10 <= 4) {
      return ' (' + days + ' дні)';
    } else {
      return ' (' + days + ' днів)';
    }
  }
  
  // Default 'ru'
  if (!isTeen && mod10 === 1) {
    return ' (' + days + ' день)';
  } else if (!isTeen && mod10 >= 2 && mod10 <= 4) {
    return ' (' + days + ' дня)';
  } else {
    return ' (' + days + ' дней)';
  }
}

/**
 * Normalizes language code to supported set.
 * @param {string} code
 * @returns {string}
 */
function normalizeLanguage_(code) {
  if (!code) return DEFAULT_LANGUAGE;
  var c = String(code).toLowerCase().trim().slice(0, 2);
  if (SUPPORTED_LANGUAGES.indexOf(c) !== -1) {
    return c;
  }
  if (c === 'be' || c === 'kk' || c === 'ky') return 'ru';
  return 'en';
}

/**
 * Resolves user language preference with fallback chain:
 * 1. Explicit user language from Firestore user doc
 * 2. Telegram client language_code
 * 3. Default fallback
 * @param {string|number} telegramId
 * @param {string} telegramLangCode
 * @returns {string}
 */
function resolveUserLanguage_(telegramId, telegramLangCode) {
  if (telegramId && typeof getUser === 'function') {
    try {
      var user = getUser(telegramId);
      if (user && user.language) {
        return normalizeLanguage_(user.language);
      }
    } catch (e) {}
  }
  if (telegramLangCode) {
    return normalizeLanguage_(telegramLangCode);
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Gets a localized string by key and replaces template parameters (%key%).
 * @param {string} key
 * @param {string} lang
 * @param {Object} [params]
 * @returns {string}
 */
function t_(key, lang, params) {
  var l = normalizeLanguage_(lang);
  var dict = I18N_STRINGS[l] || I18N_STRINGS[DEFAULT_LANGUAGE];
  var text = dict[key];
  if (text === undefined) {
    text = (I18N_STRINGS.en && I18N_STRINGS.en[key]) || key;
  }
  if (params && typeof params === 'object') {
    for (var p in params) {
      if (Object.prototype.hasOwnProperty.call(params, p)) {
        var re = new RegExp('%' + p + '%', 'g');
        var val = params[p] != null ? String(params[p]) : '';
        text = text.replace(re, function() { return val; });
      }
    }
  }
  return text;
}

/**
 * Builds inline keyboard for switching language.
 * @returns {Array<Array<Object>>}
 */
function buildLanguageKeyboard_() {
  return [
    [
      { text: '🇩🇪 Deutsch', callback_data: 'set_lang:de' },
      { text: '🇮🇹 Italiano', callback_data: 'set_lang:it' }
    ],
    [
      { text: '🇬🇧 English', callback_data: 'set_lang:en' },
      { text: '🇺🇦 Українська', callback_data: 'set_lang:uk' }
    ],
    [
      { text: '🇷🇺 Русский', callback_data: 'set_lang:ru' }
    ]
  ];
}
