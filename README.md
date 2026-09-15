# Camper monitor

Google Apps Script мониторит JSON API Movacar и roadsurfer Rally. Google Sheets — архив и конфиг. Telegram получает только новые слоты, прошедшие фильтр.

LLM в рантайме нет.

## Стек

- `gas/` — Apps Script, деплой через `clasp`
- Google Sheets: `Settings`, `Routes`, `Filters`, `OffersArchive`, `Runs`
- Telegram Bot API

## Старт

Инструкция: [docs/clasp-setup.md](docs/clasp-setup.md).

Архитектура: [docs/architecture.md](docs/architecture.md).  
API: [docs/network-api.md](docs/network-api.md).

```sh
clasp login
cd gas
clasp create --title "Camper Monitor" --type sheets
clasp push
clasp open
```

Затем Script Properties (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) и меню таблицы **Camper Monitor → Initialize sheets**.

## Статус провайдеров

- **Roadsurfer Rally**: search API подтверждён, адаптер активен.
- **Movacar**: подтверждён только endpoint направлений. Список машин по датам ждёт cURL. Пока в архив пишутся доступные destination, не конкретные офферы.
