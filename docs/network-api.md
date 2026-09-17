# Зафиксированные сетевые API

Спецификация внешних API и протоколов обмена данными, используемых в мониторинге.

## 1. Roadsurfer Rally

- Базовый хост: `https://booking.roadsurfer.com`
- Заголовки: `Accept: application/json, text/plain, */*`, `X-Requested-Alias: <alias>`, `User-Agent: Mozilla/5.0...`

### Эндпоинты:

1. **Список всех станций отправления**:
   ```text
   GET https://booking.roadsurfer.com/api/en/rally/stations
   X-Requested-Alias: rally.startStations
   ```

2. **Доступные пункты назначения для станции**:
   ```text
   GET https://booking.roadsurfer.com/api/en/rally/stations/{originId}
   X-Requested-Alias: rally.fetchRoutes
   ```

3. **Доступные временные окна**:
   ```text
   GET https://booking.roadsurfer.com/api/en/rally/timeframes/{originId}-{destinationId}
   X-Requested-Alias: rally.timeframes
   ```

4. **Поиск офферов**:
   ```text
   GET https://booking.roadsurfer.com/api/en/rally/search?stations=[[{originId},{destinationId}]]&range=["YYYY-MM-DD","YYYY-MM-DD"]&currency=EUR&models=[]
   X-Requested-Alias: rally.search
   ```

---

## 2. Movacar

- Базовый хост: `https://crowd-api-production-615013621295.europe-west1.run.app`
- Заголовки: `Accept: application/vnd.api+json`, `Origin: https://movacar.com`, `Referer: https://movacar.com/`, `X-Request-Id: <uuid>`

### Эндпоинты:

1. **Список доступных локаций и направлений**:
   ```text
   GET /v1/locations/offers?locale=de&origin_reference={originReference}
   ```
   Ответ содержит `included[]` с типом `locationsummary`: `name`, `reference`, `offer_count`, `location_type`.

2. **Поиск конкретных офферов по маршруту**:
   ```text
   GET /v1/locations/offers?locale=de&origin_reference={originReference}&destination_reference={destinationReference}
   ```
   Возвращает список доступных перегонов, дат и моделей авто. Поддерживает поиск всех локаций при отсутствии `originReference`.

---

## 3. Indie Campers

- Базовый хост: `https://edge.indiecampers.com`
- Заголовки: `Content-Type: application/json`, `Origin: https://indiecampers.com`

### Поиск доступных слотов (Availability API):
```text
POST https://edge.indiecampers.com/api/v3/availability
```

**Payload:**
```json
{
  "booking": {
    "checkin_city": "berlin",
    "checkout_city": "rome",
    "checkin_datetime": "2026-09-27T16:30:00+00:00",
    "checkout_datetime": "2026-10-07T11:00:00+00:00",
    "locale": "en",
    "legacy_search": false,
    "van_category": "",
    "limit": 50,
    "offset": 0,
    "only_marketplace": false
  },
  "filters": {},
  "meta": { "current_route": "rent-an-rv-search" }
}
```

---

## 4. Imoova

- Базовый хост: `https://api.imoova.com`
- Протокол: GraphQL
- Заголовки: `Content-Type: application/json`, `Origin: https://www.imoova.com`

### Запрос списка релокаций:
```text
POST https://api.imoova.com/graphql
```

**Query:**
```graphql
query GetRelocations {
  relocations(first: 100, whereDepartureCity: { column: SLUG, operator: EQ, value: "berlin" }) {
    data {
      id
      name
      available_from_date
      available_to_date
      hire_unit_rate
      retail_rate
      currency
      vehicle { name }
      departureCity { id name slug }
      deliveryCity { id name slug }
    }
  }
}
```

---

## 5. Google Apps Script WebApp & Telegram Webhook

- Эндпоинт развернутого Web App: `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`

### `POST /exec`
1. **Telegram Webhook Updates**:
   - Заголовок: `X-Telegram-Bot-Api-Secret-Token: <secret>`
   - Тело: стандартный объект Telegram `Update` (`message`, `callback_query`).
2. **Mini App API**:
   - Тело: JSON с полями `{ action: "<methodName>", payload: {...}, initData: "<tgWebAppData>" }`.
   - Поддерживаемые action: `getUiData`, `saveUiData`, `getProviderStations`, `getProviderDestinations`, `checkProvidersHealth`, `runMonitorFromUi`.

### `GET /exec`
- Отдает статический HTML интерфейс Telegram Mini App (`HtmlService.createHtmlOutputFromFile('docs/index.html')`).
