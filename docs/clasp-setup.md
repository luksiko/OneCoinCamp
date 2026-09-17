# Настройка GAS + Clasp

Локальный код проекта находится в `gas/`. Деплой и синхронизация осуществляются через [clasp](https://github.com/google/clasp).

## 1. Авторизация в Google

Один раз выполните вход в консоли:

```sh
clasp login
```

В браузере подтвердите доступ. Убедитесь, что Google Apps Script API включён:
1. Перейдите на https://script.google.com/home/usersettings
2. Включите переключатель **Google Apps Script API**.

## 2. Создание или привязка проекта

### Новый bound-проект (рекомендуется)
```sh
cd gas
clasp create --title "Camper Monitor" --type sheets
clasp push
clasp open
```

`clasp.json` будет сохранён локально в `gas/.clasp.json` (добавлен в `.gitignore`).

### Существующий проект
Создайте файл `gas/.clasp.json`:
```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "."
}
```

## 3. Настройка Script Properties

В редакторе Apps Script: **Project Settings → Script Properties** (или через меню скрипта):

| Ключ | Описание | Обязателен |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather | Да |
| `TELEGRAM_CHAT_ID` | Chat ID основного администратора/канала | Да |
| `TELEGRAM_ALLOWED_USERS` | Разрешенные ID пользователей или usernames через запятую | Нет |
| `TELEGRAM_WEBHOOK_SECRET`| Секретный токен для заголовка `X-Telegram-Bot-Api-Secret-Token` | Рекомендуется |
| `FIRESTORE_PROJECT_ID` | Project ID из Google Cloud / Firebase | Для многопользовательского режима |
| `FIRESTORE_CLIENT_EMAIL` | `client_email` сервисного аккаунта GCP | Для многопользовательского режима |
| `FIRESTORE_PRIVATE_KEY` | `private_key` сервисного аккаунта GCP (с `\n`) | Для многопользовательского режима |
| `FIRESTORE_DATABASE_ID` | Идентификатор БД Firestore (по умолчанию `default` или `(default)`) | Нет |
| `SPREADSHEET_ID` | ID таблицы Google Sheets (ставится автоматически при `setupMonitor`) | Да |
| `WEB_APP_REQUIRE_TELEGRAM_AUTH` | `true` для проверки подписи WebApp initData | Для production |
| `WEBAPP_SKIP_AUTH` | `1` или `true` — пропуск валидации подписи (для локальной отладки) | Нет |

> **Важно**: Никогда не коммитьте секретные ключи, токены и JSON-файлы сервисных аккаунтов в репозиторий.

## 4. Первый запуск и инициализация

1. В меню Google Таблицы **Camper Monitor**:
   - Нажмите **Initialize sheets** — создадутся листы `Settings`, `Routes`, `Filters`, `OffersArchive`, `Runs`.
   - Проверьте заполнение параметров в `Settings` и `Filters`.
   - Нажмите **Run once** для выполнения первого тестового сканирования.
   - Нажмите **Install trigger** для включения автоматического опроса по расписанию.
2. В редакторе кода можно выполнить функцию `setupMonitor()`.

## 5. Настройка Telegram Webhook и Mini App

1. **Деплой Web App**:
   ```sh
   cd gas
   clasp push
   clasp deploy -d "Camper Monitor WebApp"
   ```
2. **Активация Webhook**:
   - Запустите функцию `setupTelegramWebhook()` из редактора или выполните `runSetup()` из `run_setup.js`.
   - Это зарегистрирует URL развернутого Web App в Telegram API с поддержкой секретного токена.
3. **Подключение Telegram Mini App**:
   - В [@BotFather](https://t.me/BotFather) вызовите команду `/setmenubutton`.
   - Выберите вашего бота и укажите URL Web App из вывода `clasp deploy`.
   - Пользователи смогут открывать интерфейс мониторинга прямо из Telegram через кнопку Menu.

## 6. Синхронизация и обновление кода

```sh
cd gas
clasp push
```

Если обновлялся веб-интерфейс (`docs/index.html` или методы `WebApp.js`), выполните повторный деплой версии в Apps Script (`clasp deploy`).
