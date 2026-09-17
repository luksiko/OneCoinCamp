# Camper monitor

Google Apps Script мониторит JSON API провайдеров перегонов кемперов за 1€ (Roadsurfer Rally, Movacar, Indie Campers, Imoova).
Google Sheets используется как архив и глобальный конфиг, а Cloud Firestore — для многопользовательского хранения (пользователи, персональные маршруты, фильтры и история отправленных алертов). Telegram-бот отправляет уведомления о новых слотах, поддерживает Telegram Mini App и интерактивные команды.

LLM в рантайме нет.

## Стек

- `gas/` — Google Apps Script, деплой через `clasp`
- Google Sheets: `Settings`, `Routes`, `Filters`, `OffersArchive`, `Runs`
- Google Cloud Firestore (REST API v1 через Service Account JWT)
- Telegram Bot API (Webhook + Polling fallback, Telegram Mini App)

## Провайдеры

- **Roadsurfer Rally** — поиск станций, доступных временных окон и конкретных офферов.
- **Movacar** — поиск локаций по странам/городам, парсинг конкретных офферов и направлений (поддержка wildcard `*`).
- **Indie Campers** — проверка доступности кемперов (`availability API`).
- **Imoova** — GraphQL API для получения списка релокаций (`GetRelocations`).

## Возможности

- 🤖 **Telegram-бот**:
  - `/start` — приветствие и список возможностей
  - `/status` — статус мониторинга, время последнего прогона и статистика
  - `/digest` — сводный дайджест найденных офферов за 24 часа
  - `/actual` — актуальные предложения по персональным фильтрам пользователя
  - `/silent [on|off|HH:MM-HH:MM]` — управление режимом тихих часов
  - `/check` — принудительный запуск сканирования
  - `/routes` — список отслеживаемых направлений
  - `/help` — справка по командам
  - Кнопки под уведомлениями: «Забронировать оффер ➔» и «🚫 Отключить этот маршрут»
- 📱 **Telegram Mini App (Web App)**:
  - Управление маршрутами и фильтрами с автоподгрузкой городов/направлений
  - Мониторинг здоровья провайдеров (health check)
  - Просмотр и фильтрация найденных офферов
- 🛡 **Отказоустойчивость**:
  - Дедупликация офферов по SHA-256 fingerprint в Sheets и Firestore
  - Автоматическое продление и проверка триггеров (self-healing)
  - Поддержка Telegram Webhook с валидацией секретного токена (`X-Telegram-Bot-Api-Secret-Token`)

## Документация

- [docs/architecture.md](docs/architecture.md) — общая архитектура системы и поток данных
- [docs/clasp-setup.md](docs/clasp-setup.md) — пошаговая инструкция по настройке и деплою
- [docs/network-api.md](docs/network-api.md) — спецификация внешних API провайдеров и эндпоинтов
- [docs/implementation-plan.md](docs/implementation-plan.md) — статус реализации и бэклог
- [firestore-schema.md](firestore-schema.md) — схема коллекций Firestore и настройка Service Account
