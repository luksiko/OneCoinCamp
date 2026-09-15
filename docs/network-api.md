# Зафиксированные JSON API

Проверено 2026-09-14 через Network / Fetch-XHR. Analytics Amplitude исключена из мониторинга.

## Roadsurfer Rally

Минимальные заголовки: `Accept`, `Referer`, `X-Requested-Alias`. Captured cookies для поиска не требуются.

1. Доступные назначения:

```text
GET https://booking.roadsurfer.com/api/en/rally/stations/{originId}
X-Requested-Alias: rally.fetchRoutes
```

2. Доступные временные окна:

```text
GET https://booking.roadsurfer.com/api/en/rally/timeframes/{originId}-{destinationId}
X-Requested-Alias: rally.timeframes
```

3. Офферы:

```text
GET https://booking.roadsurfer.com/api/en/rally/search?stations=[[{originId},{destinationId}]]&range=["YYYY-MM-DD","YYYY-MM-DD"]&currency=EUR&models=[]
X-Requested-Alias: rally.search
```

Подтверждённый пример: `Berlin=6`, `Rome Fiumicino Airport=35`.

## Movacar

Подтверждён endpoint направлений для точки отправления:

```text
GET https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de&origin_reference={originReference}
Accept: application/vnd.api+json
Origin: https://movacar.com
Referer: https://movacar.com/
X-Request-Id: random per request
```

Ответ содержит `included[]` с `locationsummary`: `name`, `reference`, `offer_count`, `location_type`.

Офферы (поиск по маршруту):

```text
GET https://crowd-api-production-615013621295.europe-west1.run.app/v1/locations/offers?locale=de&origin_reference={originReference}&destination_reference={destinationReference}
Accept: application/vnd.api+json
Origin: https://movacar.com
Referer: https://movacar.com/
X-Request-Id: random per request
```

Адаптер поддерживает поиск `locationsummary` по названию через запрос всех локаций (без параметров), если ID не передан.
