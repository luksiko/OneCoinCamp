const SHEET_NAMES = {
  SETTINGS: 'Settings',
  ROUTES: 'Routes',
  FILTERS: 'Filters',
  ARCHIVE: 'OffersArchive',
  RUNS: 'Runs',
};

const PROPERTY_KEYS = {
  TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  TELEGRAM_CHAT_ID: 'TELEGRAM_CHAT_ID',
  TELEGRAM_ALLOWED_USERS: 'TELEGRAM_ALLOWED_USERS',
  TELEGRAM_WEBHOOK_SECRET: 'TELEGRAM_WEBHOOK_SECRET',
  WEB_APP_REQUIRE_TELEGRAM_AUTH: 'WEB_APP_REQUIRE_TELEGRAM_AUTH',
  WEBAPP_SKIP_AUTH: 'WEBAPP_SKIP_AUTH',
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  MONITOR_FRESHNESS_INSTALLED_AT: 'MONITOR_FRESHNESS_INSTALLED_AT',
  MONITOR_FRESHNESS_ALERT_ACTIVE: 'MONITOR_FRESHNESS_ALERT_ACTIVE',
  MONITOR_LAST_ERROR: 'MONITOR_LAST_ERROR',
  OFFERS_AVAILABILITY_LAST_RUN: 'OFFERS_AVAILABILITY_LAST_RUN',
  TELEGRAM_WEBHOOK_ACTIVE: 'TELEGRAM_WEBHOOK_ACTIVE',
};

const SUPPORTED_PROVIDERS = [
  { id: 'roadsurfer', name: 'Roadsurfer Rally', icon: '🚐' },
  { id: 'movacar', name: 'Movacar', icon: '🚗' },
  { id: 'indiecampers', name: 'Indie Campers', icon: '⛺' },
  { id: 'imoova', name: 'Imoova', icon: '🌐' },
];

const DEFAULT_SETTINGS = {
  poll_interval_minutes: 5,
  availability_check_interval_minutes: 60,
  window_days: 14,
  pickup_date: '',
  return_date: '',
  check_neighbors: false,
  timezone: 'Europe/Berlin',
  telegram_enabled: true,
  notify_all_by_price: false,
  silent_hours_enabled: false,
  silent_hours_start: '23:00',
  silent_hours_end: '07:00',
  request_timeout_seconds: 20,
  provider_roadsurfer_enabled: true,
  provider_movacar_enabled: true,
  provider_indiecampers_enabled: true,
  provider_imoova_enabled: true,
};

function isProviderEnabled_(source, settings) {
  if (!settings) {
    return true;
  }
  const key = 'provider_' + String(source || '').toLowerCase().trim() + '_enabled';
  if (settings[key] !== undefined && settings[key] !== '') {
    if (typeof settings[key] === 'boolean') {
      return settings[key];
    }
    const normalized = String(settings[key]).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return true;
}

const DEFAULT_FILTERS = {
  allowed_origin_countries: 'DE,AT,NL,BE,FR,CH',
  allowed_destination_countries: 'ES,IT',
  roadsurfer_origins_per_run: 20,
  window_start_rule: 'next_sunday',
  window_days: 14,
  max_price: '',
  only_campers: false,
  vehicle_type: 'all',
  allowed_operators: '',
};

const DEFAULT_ROUTES = [
  {
    enabled: true,
    source: 'roadsurfer',
    origin_name: 'Berlin',
    origin_id: '6',
    destination_name: 'Rome Fiumicino Airport',
    destination_id: '35',
    origin_country: 'DE',
    destination_country: 'IT',
  },
  {
    enabled: false,
    source: 'movacar',
    origin_name: 'Berlin',
    origin_id: '01JCRJ5NGV9E2YFNVSYKJR9W3J',
    destination_name: 'Rom',
    destination_id: '01JCRAMYCK7MCQ50E59X6Q7ZDT',
    origin_country: 'DE',
    destination_country: 'IT',
  },
];

const ARCHIVE_HEADERS = [
  'found_at',
  'source',
  'offer_id',
  'vehicle_id',
  'vehicle',
  'origin',
  'origin_country',
  'destination',
  'destination_country',
  'pickup_date',
  'return_date',
  'price',
  'currency',
  'booking_url',
  'fingerprint',
  'matches_filter',
  'telegram_sent_at',
  'raw_json',
];

const RUN_HEADERS = [
  'started_at',
  'finished_at',
  'source',
  'request_count',
  'offers_found',
  'archived',
  'alerts_sent',
  'status',
  'error',
];

function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty(PROPERTY_KEYS.SPREADSHEET_ID);
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty(PROPERTY_KEYS.SPREADSHEET_ID, active.getId());
    return active;
  }
  throw new Error('Set SPREADSHEET_ID in Script Properties or bind the script to a spreadsheet.');
}

function getScriptSecrets() {
  const props = PropertiesService.getScriptProperties();
  return {
    telegramBotToken: props.getProperty(PROPERTY_KEYS.TELEGRAM_BOT_TOKEN) || '',
    telegramChatId: props.getProperty(PROPERTY_KEYS.TELEGRAM_CHAT_ID) || '',
    telegramAllowedUsers: props.getProperty(PROPERTY_KEYS.TELEGRAM_ALLOWED_USERS) || '',
    telegramWebhookSecret: props.getProperty(PROPERTY_KEYS.TELEGRAM_WEBHOOK_SECRET) || '',
    webAppRequireTelegramAuth: props.getProperty(PROPERTY_KEYS.WEB_APP_REQUIRE_TELEGRAM_AUTH) === 'true',
    webAppSkipAuth: props.getProperty(PROPERTY_KEYS.WEBAPP_SKIP_AUTH) === 'true' || props.getProperty(PROPERTY_KEYS.WEBAPP_SKIP_AUTH) === '1',
    spreadsheetId: props.getProperty(PROPERTY_KEYS.SPREADSHEET_ID) || '',
  };
}
