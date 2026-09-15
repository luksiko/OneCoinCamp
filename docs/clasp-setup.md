# GAS + clasp

Локальный код живёт в `gas/`. Деплой — через [clasp](https://github.com/google/clasp).

## 1. Login

Один раз в этом терминале:

```sh
clasp login
```

Откроется браузер Google. Разрешите доступ. Токен сохранится в `~/.clasprc.json`, не в репозиторий.

Если Google блокирует Apps Script API:

1. Откройте https://script.google.com/home/usersettings
2. Включите **Google Apps Script API**

## 2. Создать bound-проект

Скрипт должен быть привязан к таблице, не standalone.

```sh
cd gas
clasp create --title "Camper Monitor" --type sheets
clasp push
clasp open
```

`clasp create --type sheets` создаёт Spreadsheet и пишет `scriptId` в `gas/.clasp.json`. Этот файл в `.gitignore`.

## 3. Script Properties

В редакторе Apps Script: **Project Settings → Script Properties**:

| key | value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | токен бота |
| `TELEGRAM_CHAT_ID` | chat id |
| `SPREADSHEET_ID` | id таблицы (обычно ставится автоматически при `setupMonitor`) |
| `WEB_APP_REQUIRE_TELEGRAM_AUTH` | `true` только для production; если не задан, dev-версия доступна по прямой ссылке |
| `WEBAPP_SKIP_AUTH` | `1` или `true` — полностью отключает Telegram auth (dev). Значение читается как boolean |

Не класть токен в Git и не вставлять в код.

## 4. Первый запуск

В таблице меню **Camper Monitor**:

1. **Initialize sheets** — создаёт `Settings`, `Routes`, `Filters`, `OffersArchive`, `Runs`.
2. Проверить `Routes` и `Filters`.
3. **Run once** — один прогон.
4. **Install trigger** — time trigger по `poll_interval_minutes` (1/5/10/15/30).

Либо из редактора: выполнить `setupMonitor`, затем `runMonitorOnce`, затем `installTrigger`.

## 5. Повторный push

После правок:

```sh
cd gas
clasp push
```

## 6. Web App / Telegram Mini App

Страница настроек с меню **Camper Monitor → Run once / Install trigger** доступна и как Web App (сделан под Telegram Mini App: системная тема, `MainButton`).

Деплой:

```sh
cd gas
clasp push
clasp deploy -d "Settings UI"
clasp deployments
```

> **Если `clasp push` пишет "Script is already up to date"** при новых файлах — воспользуйтесь прямым API push (см. скрипт `gas/push_api.mjs` или вызовите Apps Script API `PUT /v1/projects/{id}/content` с файлами из `gas/` — манифест передаётся с `name: "appsscript"`, без расширения).

- `appsscript.json` уже содержит блок `webapp` (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`) — URL работает без логина в Google, сервер запускается под вашей учёткой.
- Тип webapp определяется из манифеста автоматически — флаг `--type` не нужен.
- Функции за кулисой: `doGet`, `getUiData`, `saveUiData`, `runMonitorOnce`.
- Чтобы открывать страницу внутри Telegram: в BotFather создайте кнопку Menu (или `/setmenubutton`) и укажите URL деплоя, либо отправьте его как обычную ссылку.
- В обычном браузере вместо `Telegram.WebApp.MainButton` покажется обычная кнопка «Сохранить».

## Что ещё нужно от вас

1. `clasp login` в этом терминале, если ещё не залогинены.
2. Telegram bot token и chat id в Script Properties.
3. Для Movacar — cURL **списка офферов** после выбора destination и дат. Сейчас Movacar архивирует только доступные направления, не сами машины.
4. Подтвердить фильтр: origin `DE,AT,NL,BE,FR,CH`, destination `ES,IT`, старт от ближайшего воскресенья + 14 дней.
