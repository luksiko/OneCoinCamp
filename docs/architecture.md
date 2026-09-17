# Архитектура мониторинга

## Цель

Классический Google Apps Script без LLM в рантайме мониторит JSON/GraphQL API провайдеров кемперов за 1€ (Roadsurfer Rally, Movacar, Indie Campers, Imoova).
Google Sheets служит общим архивом офферов и журналом запусков. Cloud Firestore обеспечивает многопользовательское хранение (пользователи, персональные маршруты, фильтры и история отправленных алертов). Telegram-бот и Telegram Mini App (Web App) предоставляют интерфейс управления и оповещения пользователей. Скрипт не бронирует поездки и не обходит CAPTCHA/логин.

## Компоненты GAS

- `Monitor.js`:
  - Time-driven trigger (`runMonitorOnce`) для периодического опроса всех активных провайдеров.
  - Дедупликация через вычисление SHA-256 fingerprint.
  - Сохранение в `OffersArchive` и `Runs` в Google Sheets.
  - Диспетчеризация алертов пользователям в Firestore (`dispatchNewOffers_`) с учётом персональных фильтров и маршрутов.
  - Контроль свежести триггеров (`checkMonitorFreshness`) и self-healing.
- `Providers.js`:
  - Адаптеры к API 4 провайдеров (`roadsurfer`, `movacar`, `indiecampers`, `imoova`).
  - Нормализация разнородных форматов JSON/GraphQL в единую структуру слота.
  - Поддержка wildcard (`*`) для направлений и стран, автоматическое сопоставление станций.
- `Firestore.js`:
  - Интеграция с Cloud Firestore REST API v1 через Service Account с генерацией RS256 JWT токенов (кэширование в `CacheService`).
  - Хранение сущностей `users`, `users/{telegram_id}/routes`, `users/{telegram_id}/settings/filters`, `users/{telegram_id}/sent_alerts/{fingerprint}`.
  - Автоматическое определение идентификатора базы данных (`default` / `(default)` / кастомный).
- `Sheets.js`:
  - Инициализация и ведение листов Google Sheets (`Settings`, `Routes`, `Filters`, `OffersArchive`, `Runs`).
  - Пакетная запись новых строк и чтение архивных fingerprints.
- `Filters.js`:
  - Применение глобальных и персональных фильтров (страны выезда/прибытия, окно дат, максимальная цена, длительность поездки, тихие часы `silent_hours`).
- `Telegram.js`:
  - Отправка уведомлений с inline-кнопками («Забронировать оффер ➔», «🚫 Отключить этот маршрут»).
  - Обработка входящих команд Telegram (`/start`, `/help`, `/status`, `/digest`, `/actual`, `/silent`, `/check`, `/routes`).
  - Управление Webhook (`setupTelegramWebhook`, `deleteTelegramWebhook`, валидация `X-Telegram-Bot-Api-Secret-Token`).
  - Фоновый поллинг (`processTelegramUpdates`) как альтернатива/fallback вебхуку.
- `WebApp.js`:
  - Обработка Webhook (`doPost`) и бэкенд Telegram Mini App / Web App (`doGet`, `handleApiRequest_`).
  - Валидация подписи Telegram Mini App (`initData` через HMAC-SHA256).
  - API для проверки здоровья провайдеров (`checkProvidersHealth`), получения списка доступных станций/направлений и сохранения настроек.
- `Http.js`:
  - Обертка `fetchJson_` над `UrlFetchApp` с поддержкой экспоненциального бэкоффа и ретраев для кодов 429/5xx.
- `Config.js`:
  - Константы, схемы заголовков, дефолтные значения настроек и доступ к `ScriptProperties`.

## Хранилища данных

### 1. Google Cloud Firestore (Multi-user Data)
- `users/{telegram_id}` — профиль пользователя (`chat_id`, `username`, `status`, даты активности).
- `users/{telegram_id}/routes/{routeId}` — персональные маршруты пользователя.
- `users/{telegram_id}/settings/filters` — персональные фильтры (страны, цены, тихие часы, окно дат).
- `users/{telegram_id}/sent_alerts/{fingerprint}` — история отправленных уведомлений (быстрая проверка O(1) по document ID).
- `webhook_logs` — журнал ошибок вебхука для отладки.

### 2. Google Sheets (Global Archive & Logs)
- `Settings` — глобальные параметры (интервалы опроса, таймзона, флаги провайдеров).
- `Routes` — глобальные/дефолтные маршруты.
- `Filters` — глобальные/дефолтные фильтры.
- `OffersArchive` — append-only архив всех найденных офферов с колонками: `found_at`, `source`, `offer_id`, `vehicle_id`, `vehicle`, `origin`, `origin_country`, `destination`, `destination_country`, `pickup_date`, `return_date`, `price`, `currency`, `booking_url`, `fingerprint`, `matches_filter`, `telegram_sent_at`, `raw_json`.
- `Runs` — технический журнал выполнения опросов.

## Нормализованный слот

Каждый адаптер провайдера преобразует данные в единый формат:

```text
source, offer_id, vehicle_id, vehicle, origin, origin_country,
destination, destination_country, pickup_date, return_date,
price, currency, booking_url, raw_json
```

`fingerprint` вычисляется как SHA-256 от `source|offer_id|vehicle_id|origin|destination|pickup_date|return_date|price`.

## Поток выполнения (Lifecycle)

```
[Time Trigger / Manual /check]
           │
           ▼
     runMonitorOnce()
           │
    ┌──────┴───────────────────────────┐
    ▼                                  ▼
Fetch Providers              Deduplicate via Fingerprints
(Roadsurfer, Movacar,        (Sheets OffersArchive + Cache)
 IndieCampers, Imoova)                 │
    │                                  ▼
    └──────────┬───────────────────────┘
               ▼
     Append to OffersArchive (Google Sheets)
               │
               ▼
     dispatchNewOffers_() (Firestore)
     For each active user:
       ├── Check user routes & filters (Dates, Countries, Price, Silent Hours)
       ├── Check sent_alerts/{fingerprint}
       └── Send Telegram Notification + Mark sent_alerts
```

## Отказоустойчивость и безопасность

- **LockService**: предотвращает параллельные запуски тяжелых задач мониторинга.
- **Self-Healing Triggers**: проверка активности триггера и автоматическое пересоздание при зависании.
- **Graceful Error Handling**: ошибки отдельных провайдеров или сбои отправки в Telegram логируются и не прерывают общий цикл мониторинга.
- **HMAC / Secret Token Verification**: вебхуки Telegram проверяются по заголовку `X-Telegram-Bot-Api-Secret-Token`, а запросы Mini App — по алгоритму валидации Telegram WebApp `initData`.
