# Архитектура мониторинга

## Цель

Классический Google Apps Script без LLM в рантайме мониторит JSON API Movacar и roadsurfer Rally. Google Sheets — единственное долговременное хранилище, архив и конфигурация. Telegram получает только новые подходящие слоты. Скрипт не бронирует поездки и не обходит CAPTCHA, логин или ограничения сайтов.

## Компоненты GAS

- `Monitor.js`: installable time-driven trigger (`runMonitorOnce`), получает данные обоих провайдеров, ограничивает объём работы до лимита выполнения GAS.
- `Providers.js`: HTTP-запросы через `UrlFetchApp` для обоих провайдеров, нормализация разных JSON в единый слот.
- `Sheets.js`: создаёт листы, читает конфигурацию, записывает новые строки архива пачкой, проверяет архивные fingerprints.
- `Filters.js`: применяет бизнес-правила к нормализованным слотам.
- `Telegram.js`: отправляет `sendMessage` только для впервые найденных подходящих слотов.
- `Http.js`: оборачивает `UrlFetchApp` с ретраями для 429/5xx/таймаутов.
- `WebApp.js`: бэкенд Telegram Mini App (doPost/doGet), обрабатывающий запросы от статического фронтенда (docs/index.html).
- `Config.js`: доступ к `SpreadsheetApp`, секретам и скриптовым свойствам; `CacheService` в `Monitor.js` ускоряет проверку недавно обработанных fingerprints; Google Sheets остаётся источником истины.

## Листы Google Sheets

### `Settings`

Одна строка настроек: `poll_interval_minutes`, `window_days`, `timezone`, `telegram_enabled`.

### `Routes`

Редактируемые направления: `enabled`, `source`, `origin_name`, `origin_id`, `destination_name`, `destination_id`, `origin_country`, `destination_country`, `pickup_date`, `return_date`.
Допускается использование `*` (wildcard) в `origin_id` и `destination_id` для поиска по всем городам или фильтрации по стране/имени.

### `Filters`

Строгая фильтрация: `allowed_origin_countries`, `allowed_destination_countries`, `window_start_rule`, `window_days`. Стартовое правило: ближайшее воскресенье включительно; окно — 14 дней.

### `OffersArchive`

Append-only архив **всех** найденных предложений, включая неподходящие по правилам. Колонки: `found_at`, `source`, `offer_id`, `vehicle_id`, `vehicle`, `origin`, `origin_country`, `destination`, `destination_country`, `pickup_date`, `return_date`, `price`, `currency`, `booking_url`, `fingerprint`, `matches_filter`, `telegram_sent_at`, `raw_json`.

### `Runs`

Технический журнал: `started_at`, `finished_at`, `source`, `request_count`, `offers_found`, `archived`, `alerts_sent`, `status`, `error`.

## Нормализованный слот

Каждый адаптер возвращает:

```text
source, offer_id, vehicle_id, vehicle, origin, origin_country,
destination, destination_country, pickup_date, return_date,
price, currency, booking_url, raw_json
```

`fingerprint` вычисляется как SHA-256 от `source|offer_id|vehicle_id|origin|destination|pickup_date|return_date|price`. Если у источника нет стабильного `vehicle_id`, используется стабильный ID оффера.

## Архивация, фильтрация, уведомления

1. Получить все доступные офферы из API.
2. Нормализовать каждый оффер.
3. Найти fingerprints в `OffersArchive` одним чтением; `CacheService` использовать как быстрый предфильтр.
4. Добавить в `OffersArchive` только ранее не встречавшиеся fingerprints. Таким образом архив не раздувается повторными идентичными polling-результатами.
5. Каждый новый слот проверить: отправление — разрешённая страна, прибытие — разрешённая страна, дата старта от ближайшего воскресенья до конца 14-дневного окна.
6. Отправить Telegram только для нового слота, прошедшего фильтр; заполнить `telegram_sent_at` после успешного ответа Telegram.

## Отказоустойчивость

- `LockService` предотвращает одновременные запуски.
- Время выполнения контролируется дедлайном; перед лимитом скрипт завершает текущую пачку и пишет `Runs`.
- Для 429/5xx/таймаутов — ограниченные повторные попытки с задержкой. 403 и невалидный JSON — без повтора, с записью ошибки в `Runs`.
- Записи в Sheets выполняются пачками через `setValues`; Sheets API нужен только при необходимости расширенных batch-операций.
