import { GlobalSettings } from './types';

export const SUPPORTED_PROVIDERS = [
  { id: 'roadsurfer', name: 'Roadsurfer Rally', icon: '🚐' },
  { id: 'movacar', name: 'Movacar', icon: '🚗' },
  { id: 'indiecampers', name: 'Indie Campers', icon: '⛺' },
  { id: 'imoova', name: 'Imoova', icon: '🌐' },
];

export const DEFAULT_SETTINGS: GlobalSettings = {
  poll_interval_minutes: 10,
  availability_check_interval_minutes: 60,
  window_days: 14,
  timezone: 'Europe/Berlin',
  telegram_enabled: true,
  provider_roadsurfer_enabled: true,
  provider_movacar_enabled: true,
  provider_indiecampers_enabled: true,
  provider_imoova_enabled: true,
};

export const DEFAULT_FILTERS = {
  allowed_origin_countries: 'DE,AT,NL,BE,FR,CH',
  allowed_destination_countries: 'ES,IT,FR,DE,AT,NL,BE,PT,DK,HR,SI,CH,PL,CZ',
  max_price: null,
  only_campers: false,
  vehicle_type: 'all',
  silent_hours_enabled: false,
  silent_hours_start: '23:00',
  silent_hours_end: '07:00',
  window_days: 14,
  window_start_rule: 'today',
  roadsurfer_origins_per_run: 2,
};

export const WEBAPP_COUNTRIES: [string, string][] = [
  ['DE', 'Германия'],
  ['AT', 'Австрия'],
  ['NL', 'Нидерланды'],
  ['BE', 'Бельгия'],
  ['FR', 'Франция'],
  ['CH', 'Швейцария'],
  ['ES', 'Испания'],
  ['IT', 'Италия'],
  ['PT', 'Португалия'],
  ['DK', 'Дания'],
  ['LU', 'Люксембург'],
  ['PL', 'Польша'],
  ['CZ', 'Чехия'],
  ['HR', 'Хорватия'],
  ['SI', 'Словения'],
  ['HU', 'Венгрия'],
];
