# Firestore: схема и настройка

## Зачем Firestore, а не Sheets для всего

`OffersArchive` остаётся в Google Sheets — общий, не растёт быстро (дедуп по fingerprint), Sheets
для него удобен для ручного просмотра. В Firestore выносится только то, что нужно шардировать
по пользователям: аккаунты, маршруты, фильтры и история отправленных алертов. Это минимальная
миграция, укладывающаяся в уже описанную в `implementation-plan.md` архитектуру
Worker (сбор офферов) + Dispatcher (сверка с фильтрами и рассылка).

## Коллекции

```
users/{telegram_id}
  telegram_id: number
  chat_id: number
  username: string
  status: "active" | "paused"
  created_at: timestamp
  last_seen_at: timestamp

  users/{telegram_id}/routes/{routeId}      (subcollection, авто-ID)
    enabled: boolean
    source: "movacar" | "roadsurfer"
    origin_name: string
    origin_id: string
    destination_name: string
    destination_id: string
    origin_country: string
    destination_country: string

  users/{telegram_id}/settings/filters      (единственный документ с фикс. ID "filters")
    allowed_origin_countries: string[]
    allowed_destination_countries: string[]
    window_start_rule: string
    window_days: number
    price_max: number | null
    min_duration_days: number | null
    max_duration_days: number | null
    silent_hours: { from: string, to: string } | null

  users/{telegram_id}/sent_alerts/{fingerprint}   (document ID = offer fingerprint)
    sent_at: timestamp
    source: string
    origin: string
    destination: string
    price: number
```

Почему такая вложенность, а не плоские коллекции `user_routes`, `user_filters`, `sent_alerts`
с полем `user_id`:

- Каждый запрос — это уже "запрос по конкретному пользователю", subcollection даёт это бесплатно,
  без композитных индексов и фильтров `WHERE user_id = ...`.
- `sent_alerts` с ID = fingerprint превращает проверку "уже слали?" в один `GET` (200/404),
  вместо запроса с фильтром — быстрее и укладывается в дневную квоту чтений.
- `settings/filters` с фиксированным ID — не нужно искать документ, сразу известен путь.

## Поток Dispatcher (псевдокод на основе Firestore.js)

```javascript
function dispatchNewOffers(newOffers) {
  var users = listActiveUsers();
  users.forEach(function (user) {
    var filters = getUserFilters(user.telegram_id);
    if (!filters) return;

    newOffers.forEach(function (offer) {
      if (!matchesFilter_(offer, filters)) return;
      if (hasAlertBeenSent(user.telegram_id, offer.fingerprint)) return;

      sendTelegramMessage(user.chat_id, formatOfferMessage_(offer));
      markAlertSent(user.telegram_id, offer.fingerprint, {
        source: offer.source, origin: offer.origin,
        destination: offer.destination, price: offer.price
      });
    });
  });
}
```

## Настройка Service Account (один раз)

1. Открыть [console.cloud.google.com](https://console.cloud.google.com), выбрать/создать проект
   (можно использовать тот же проект, что и для Firebase, если он уже есть).
2. **APIs & Services → Library** → включить **Cloud Firestore API**.
3. **Firestore → Create Database** → режим **Native mode** (не Datastore mode), выбрать регион.
4. **IAM & Admin → Service Accounts → Create Service Account**.
   - Роль: **Cloud Datastore User** (минимально достаточно для чтения/записи документов).
5. На созданном Service Account: **Keys → Add Key → Create new key → JSON** — скачается файл вида
   `project-name-xxxxx.json`.
6. Из этого JSON взять три поля и записать в **Project Settings → Script Properties** проекта GAS:

   | Script Property | Откуда |
   | --- | --- |
   | `FIRESTORE_PROJECT_ID` | `project_id` |
   | `FIRESTORE_CLIENT_EMAIL` | `client_email` |
   | `FIRESTORE_PRIVATE_KEY` | `private_key` (вставить как есть, вместе с `\n`) |

7. Скачанный JSON-файл — **не коммитить**, удалить после переноса значений в Script Properties.

## Проверка

В редакторе Apps Script выполнить разово:

```javascript
function testFirestore() {
  upsertUser(123456789, 987654321, { username: 'test_user' });
  Logger.log(getUser(123456789));
}
```

Если в логе появился объект с `telegram_id`, `chat_id`, `status: "active"` — подключение работает.

## Квоты (бесплатный Spark tier)

1 ГБ хранилища, 50 000 чтений/день, 20 000 записей/день, 20 000 удалений/день, 10 ГБ исходящего
трафика/месяц. Для нескольких сотен пользователей с поллингом раз в 1–15 минут этого хватает с
большим запасом — основной расход чтений идёт на `listActiveUsers()` в каждом цикле Dispatcher,
что при 500 пользователях и запуске раз в 5 минут — это ~144 000 чтений/день уже на пределе.
При росте базы стоит кэшировать список активных пользователей в `CacheService` на 4–5 минут
(TTL чуть меньше интервала поллинга), как уже сделано для fingerprint-проверок в `Monitor.js`.
