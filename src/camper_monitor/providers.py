from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urlencode

from .http_client import FetchError, JsonHttpClient
from .models import Offer, Route


class RoadsurferProvider:
    base_url = "https://booking.roadsurfer.com"

    def __init__(self, http: JsonHttpClient) -> None:
        self.http = http

    def fetch_available_destinations(
        self, origin_id: str | int, allowed_countries: tuple[str, ...]
    ) -> list[dict[str, Any]]:
        station_url = f"{self.base_url}/api/en/rally/stations/{origin_id}"
        payload = self.http.get(
            station_url,
            headers={
                "Accept": "application/json, text/plain, */*",
                "X-Requested-Alias": "rally.fetchRoutes",
            },
        )
        destinations: list[dict[str, Any]] = []
        if isinstance(payload, dict):
            if "routes" in payload and isinstance(payload["routes"], list):
                destinations = payload["routes"]
            elif "returns" in payload and isinstance(payload["returns"], list):
                destinations = [{"id": rid, "country": ""} for rid in payload["returns"]]
            elif isinstance(payload.get("data"), list):
                destinations = payload["data"]
        elif isinstance(payload, list):
            destinations = payload

        if not destinations:
            return []
        if not allowed_countries:
            return destinations
        res = []
        for d in destinations:
            country = (d.get("country") or d.get("destination_country") or "").upper().strip()
            if not country or country in allowed_countries:
                res.append(d)
        return res

    def fetch_offers(
        self,
        route: Route,
        allowed_destination_countries: tuple[str, ...] | None = None,
    ) -> list[Offer]:
        if route.origin_id is None:
            raise ValueError("Roadsurfer routes require origin_id")
        origin_id = route.origin_id
        if route.destination_id is not None:
            destinations = [route.destination_id]
        else:
            allowed = allowed_destination_countries or ("IT", "ES")
            raw = self.fetch_available_destinations(origin_id, allowed)
            destinations = [d["id"] for d in raw]
        if not destinations:
            return []
        offers: list[Offer] = []
        for dest_id in destinations:
            offers.extend(self._fetch_for_destination(route, dest_id))
        return offers

    def _fetch_for_destination(self, route: Route, destination_id: str | int) -> list[Offer]:
        query = urlencode(
            {
                "stations": f"[[{route.origin_id},{destination_id}]]",
                "range": f'["{route.pickup_date}","{route.return_date}"]',
                "currency": "EUR",
                "models": "[]",
            }
        )
        booking_url = (
            f"{self.base_url}/en/rally/pick?station={route.origin_id}"
            f"&end_station={destination_id}&pickup_date={route.pickup_date}"
            f"&return_date={route.return_date}&currency=EUR"
        )
        payload = self.http.get(
            f"{self.base_url}/api/en/rally/search?{query}",
            headers={
                "Accept": "application/json, text/plain, */*",
                "Referer": booking_url,
                "X-Requested-Alias": "rally.search",
            },
        )
        items = (
            payload
            if isinstance(payload, list)
            else payload.get("results", payload.get("data", []))
        )
        return [self._to_offer(item, route, booking_url) for item in items]

    @staticmethod
    def _to_offer(item: dict[str, Any], route: Route, booking_url: str) -> Offer:
        model = item.get("model") or {}
        price = None
        for key in ("price", "total_price", "totalPrice", "amount"):
            if key in item and item[key] is not None:
                price = str(item[key])
                break
        vehicle_name = item.get("name") or model.get("name")
        return Offer(
            source="roadsurfer",
            offer_id=str(item.get("id", uuid.uuid4())),
            origin=route.origin,
            destination=route.destination,
            pickup_date=route.pickup_date,
            return_date=route.return_date,
            price=price,
            vehicle=vehicle_name,
            booking_url=booking_url,
        )


class MovacarProvider:
    base_url = "https://crowd-api-production-615013621295.europe-west1.run.app"

    def __init__(self, http) -> None:
        self.http = http

    def fetch_destinations(self, origin_reference: str):
        import uuid, urllib.parse
        query = urllib.parse.urlencode({"locale": "de", "origin_reference": origin_reference})
        payload = self.http.get(
            f"{self.base_url}/v1/locations/offers?{query}",
            headers={
                "Accept": "application/vnd.api+json",
                "Origin": "https://movacar.com",
                "Referer": "https://movacar.com/",
                "X-Request-Id": uuid.uuid4().hex[:12],
            },
        )
        return payload.get("included", [])

    def fetch_offers(self, route, allowed_destination_countries = None):
        import uuid, urllib.parse
        
        if route.origin_id is None:
            raise ValueError("Movacar routes require origin_id")
            
        query_params = {"locale": "en", "origin": route.origin_id}
        if route.destination_id and route.destination_id != "*":
            query_params["destination"] = route.destination_id
            
        query = urllib.parse.urlencode(query_params)
        payload = self.http.get(
            f"{self.base_url}/v1/offers?{query}",
            headers={
                "Accept": "application/vnd.api+json",
                "Origin": "https://movacar.com",
                "Referer": "https://movacar.com/",
                "X-Request-Id": uuid.uuid4().hex[:12],
            },
        )

        stations = {}
        prices = {}
        for item in payload.get("included", []):
            if item.get("type") == "station":
                stations[item.get("id")] = item.get("attributes", {})
            elif item.get("type") == "monetary_amount":
                prices[item.get("id")] = item.get("attributes", {})

        offers = []
        for item in payload.get("data", []):
            if item.get("type") != "offer":
                continue
                
            attrs = item.get("attributes", {})
            rels = item.get("relationships", {})
            
            dest_station_id = rels.get("destination", {}).get("data", {}).get("id")
            dest_station = stations.get(dest_station_id, {})
            dest_name = dest_station.get("city") or dest_station.get("alternative_city") or "Unknown"
            
            price_id = rels.get("base_price", {}).get("data", {}).get("id")
            price_info = prices.get(price_id, {})
            price_val = price_info.get("amount_minor_units", 100) / 100.0

            v_make = attrs.get("make") or attrs.get("model") or attrs.get("vehicle_category_name") or "Movacar vehicle"
            if attrs.get("model") and attrs.get("model") != v_make:
                v_make += f" {attrs.get('model')}"
                
            start_date = attrs.get("start_date") or ""
            end_date = attrs.get("end_date") or ""
            start_date = start_date.split("T")[0] if start_date else route.pickup_date
            end_date = end_date.split("T")[0] if end_date else route.return_date
            
            offer_id = attrs.get("offer_id") or item.get("id")
            
            offers.append(
                Offer(
                    offer_id=str(offer_id),
                    source="movacar",
                    vehicle=v_make.strip(),
                    price=str(price_val),
                    pickup_date=start_date,
                    return_date=end_date,
                    origin=route.origin,
                    destination=dest_name,
                    booking_url="https://movacar.com/",
                )
            )

        return offers
class IndieCampersProvider:
    base_url = "https://edge.indiecampers.com"

    def __init__(self, http: JsonHttpClient) -> None:
        self.http = http

    def fetch_offers(
        self,
        route: Route,
        allowed_destination_countries: tuple[str, ...] | None = None,
    ) -> list[Offer]:
        origin = str(route.origin_id or route.origin).lower()
        destination = str(route.destination_id or route.destination).lower()

        payload = {
            "booking": {
                "checkin_city": origin,
                "checkout_city": destination,
                "checkin_datetime": f"{route.pickup_date}T16:30:00+00:00",
                "checkout_datetime": f"{route.return_date}T11:00:00+00:00",
                "locale": "en",
                "legacy_search": False,
                "van_category": "",
                "limit": 50,
                "offset": 0,
                "only_marketplace": False,
            },
            "filters": {},
            "meta": {
                "current_route": "rent-an-rv-search",
            },
        }

        headers = {
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://indiecampers.com",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
            ),
        }

        url = f"{self.base_url}/api/v3/availability"
        res = self.http.post(url, payload, headers=headers)

        items = res.get("data", {}).get("availability", []) if isinstance(res, dict) else []
        offers: list[Offer] = []
        booking_url = (
            f"https://indiecampers.com/rent-an-rv/search?"
            f"from={origin}&to={destination}&start={route.pickup_date}&end={route.return_date}"
        )

        for item in items:
            if not item.get("available", True):
                continue

            van_id = item.get("van_id") or item.get("van_category") or uuid.uuid4()
            price = str(item.get("total_cost") or item.get("daily_cost") or "")
            vehicle_name = (
                item.get("manufacturer_name")
                or item.get("van_category")
                or item.get("category_badge")
            )

            offers.append(
                Offer(
                    source="indiecampers",
                    offer_id=str(van_id),
                    origin=route.origin,
                    destination=route.destination,
                    pickup_date=item.get("checkin_date") or route.pickup_date,
                    return_date=item.get("checkout_date") or route.return_date,
                    price=price if price else None,
                    vehicle=str(vehicle_name) if vehicle_name else "Indie Camper",
                    booking_url=booking_url,
                )
            )

        return offers



class ImoovaProvider:
    base_url = "https://api.imoova.com"

    def __init__(self, http: JsonHttpClient) -> None:
        self.http = http

    def fetch_offers(
        self,
        route: Route,
        allowed_destination_countries: tuple[str, ...] | None = None,
    ) -> list[Offer]:
        payload = {
            "query": """
            query GetRelocations {
              relocations(first: 100) {
                data {
                  id
                  reference
                  name
                  type
                  available_from_date
                  available_to_date
                  earliest_departure_date
                  latest_departure_date
                  hire_unit_rate
                  retail_rate
                  currency
                  vehicle {
                    name
                  }
                  departureCity {
                    id
                    name
                    slug
                    region
                  }
                  deliveryCity {
                    id
                    name
                    slug
                  }
                }
              }
            }
            """,
            "operationName": "GetRelocations",
        }

        headers = {
            "Accept": "application/json",
            "Origin": "https://www.imoova.com",
            "Referer": "https://www.imoova.com/",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
            ),
        }

        url = f"{self.base_url}/graphql"
        res = self.http.post(url, payload, headers=headers)

        items = (
            res.get("data", {}).get("relocations", {}).get("data", [])
            if isinstance(res, dict)
            else []
        )
        offers: list[Offer] = []

        for item in items:
            dep = item.get("departureCity") or {}
            deliv = item.get("deliveryCity") or {}

            if not self._city_matches(route.origin_id or route.origin, dep):
                continue
            if not self._city_matches(route.destination_id or route.destination, deliv):
                continue

            rel_id = item.get("id") or str(uuid.uuid4())
            booking_url = f"https://www.imoova.com/relocations/deal/{rel_id}"
            vehicle_info = item.get("vehicle") or {}
            vehicle_name = vehicle_info.get("name") or item.get("name") or "Imoova vehicle"

            raw_price = item.get("hire_unit_rate") or item.get("retail_rate")
            price = str(raw_price) if raw_price is not None else None

            pickup = (
                item.get("available_from_date")
                or item.get("earliest_departure_date")
                or route.pickup_date
            )
            ret = (
                item.get("available_to_date")
                or item.get("latest_departure_date")
                or route.return_date
            )

            offers.append(
                Offer(
                    source="imoova",
                    offer_id=str(rel_id),
                    origin=route.origin,
                    destination=route.destination,
                    pickup_date=pickup,
                    return_date=ret,
                    price=price,
                    vehicle=str(vehicle_name),
                    booking_url=booking_url,
                )
            )

        return offers


    @staticmethod
    def _city_matches(target: str | int | None, city_info: dict[str, Any]) -> bool:
        if target is None or target == "*":
            return True
        t = str(target).lower().strip()
        if not t:
            return True
        name = str(city_info.get("name") or "").lower().strip()
        slug = str(city_info.get("slug") or "").lower().strip()
        city_id = str(city_info.get("id") or "").lower().strip()
        return t in (name, slug, city_id)



class FreewayCamperProvider:
    base_url = "https://freeway-camper.com"  # TODO: Update with real API

    def __init__(self, http: JsonHttpClient) -> None:
        self.http = http

    def fetch_offers(
        self,
        route: Route,
        allowed_destination_countries: tuple[str, ...] | None = None,
    ) -> list[Offer]:
        # TODO: Implement actual API request and parsing
        return []
