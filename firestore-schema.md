# Firestore: схема и настройка

## Зачем Firestore, а не Sheets для всего

`OffersArchive` и технический журнал `Runs` остаются в Google Sheets — они общие для системы и удобны для ручного анализа. В Cloud Firestore выносится то, что требует шардирования по пользователям: аккаунты, персональные маршруты, фильтры и история отправленных алертов. Это обеспечивает масштабируемость архитектуры Worker (сбор офферов) + Dispatcher (персональная фильтрация и рассылка).

## Коллекции

```text
users/{telegram_id}
  telegram_id: number
  chat_id: number | string
  username: string
  status: "active" | "paused"
  created_at: timestamp
  last_seen_at: timestamp

  users/{telegram_id}/routes/{routeId}      (subcollection, авто-ID)
    enabled: boolean
    source: "roadsurfer" | "movacar" | "indiecampers" | "imoova"
    origin_name: string
    origin_id: string
    destination_name: string
    destination_id: string
    origin_country: string
    destination_country: string
    pickup_date: string (опционально "YYYY-MM-DD")
    return_date: string (опционально "YYYY-MM-DD")

  users/{telegram_id}/settings/filters      (документ с ID "filters")
    allowed_origin_countries: string[]
    allowed_destination_countries: string[]
    window_start_rule: string
    window_days: number
    price_max: number | null
    min_duration_days: number | null
    max_duration_days: number | null
    silent_hours: { enabled: boolean, start: string, end: string } | null

  users/{telegram_id}/sent_alerts/{fingerprint}   (ID документа = SHA-256 fingerprint оффера)
    sent_at: timestamp
    source: string
    origin: string
    destination: string
    price: number | string

webhook_logs/{logId}                        (коллекция для отладки вебхука)
  timestamp: string
  chatId: string
  error_start: string
```

### Преимущества такой структуры:
- Каждый запрос изолирован контекстом пользователя (subcollection).
- `sent_alerts` с ID = fingerprint превращает проверку «уже слали?» в один быстрый `GET` (O(1)), экономя лимиты квот.
- `settings/filters` с фиксированным ID не требует поисковых запросов.

## Настройка Service Account в Google Cloud

1. В [Google Cloud Console](https://console.cloud.google.com) выберите ваш проект (или Firebase проект).
2. **APIs & Services → Library** → включите **Cloud Firestore API**.
3. **Firestore Database** → создайте базу в режиме **Native mode**, выберите подходящий регион.
4. **IAM & Admin → Service Accounts → Create Service Account**:
   - Название: например, `camper-monitor-gas`.
   - Роль: **Cloud Datastore User** (или Firebase Admin).
5. **Keys → Add Key → Create new key → JSON** — скачается ключ.
6. В Google Apps Script (**Project Settings → Script Properties**) добавьте:

| Script Property | Значение из JSON | Примечание |
| --- | --- | --- |
| `FIRESTORE_PROJECT_ID` | `project_id` | ID проекта GCP |
| `FIRESTORE_CLIENT_EMAIL` | `client_email` | Email сервисного аккаунта |
| `FIRESTORE_PRIVATE_KEY` | `private_key` | Приватный ключ целиком с `\n` |
| `FIRESTORE_DATABASE_ID` | `default` или `(default)` | Опционально. Код автоматически определяет подходящий формат ID |

7. Удалите скачанный JSON-файл с компьютера и не коммитьте его в репозиторий.

## Проверка соединения

В редакторе Apps Script выполните функцию `testFirestore()`:

```javascript
function testFirestore() {
  upsertUser(123456789, 987654321, { username: 'test_user' });
  Logger.log(getUser(123456789));
}
```

Если в логе вернулся объект пользователя со статусом `"active"` — подключение успешно настроено.
