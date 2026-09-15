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
        destinations = payload.get("routes", payload) if isinstance(payload, dict) else payload
        if not isinstance(destinations, list):
            return []
        return [
            d
            for d in destinations
            if d.get("country", "")
            .upper()
            .strip()
            in allowed_countries
            or d.get("destination_country", "")
            .upper()
            .strip()
            in allowed_countries
        ]

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

    def __init__(self, http: JsonHttpClient) -> None:
        self.http = http

    def fetch_destinations(self, origin_reference: str) -> list[dict[str, Any]]:
        query = urlencode({"locale": "de", "origin_reference": origin_reference})
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

    def fetch_offers(
        self,
        route: Route,
        allowed_destination_countries: tuple[str, ...] | None = None,
    ) -> list[Offer]:
        if route.origin_id is None or route.destination_id is None:
            raise ValueError("Movacar routes require origin_id and destination_id")
        query = urlencode(
            {
                "origin": route.origin_id,
                "destination": route.destination_id,
                "pickup_date": route.pickup_date,
                "return_date": route.return_date,
                "currency": "EUR",
            }
        )
        payload = self.http.get(
            f"{self.base_url}/v1/offers/search?{query}",
            headers={
                "Accept": "application/vnd.api+json",
                "Origin": "https://movacar.com",
                "Referer": "https://movacar.com/",
                "X-Request-Id": uuid.uuid4().hex[:12],
            },
        )
        items = payload.get("data", [])
        offers = []
        for item in items:
            attributes = item.get("attributes", {})
            price = None
            for key in ("price", "total_price", "totalPrice", "amount"):
                if key in attributes and attributes[key] is not None:
                    price = str(attributes[key])
                    break
                if key in item and item[key] is not None:
                    price = str(item[key])
                    break
            offers.append(
                Offer(
                    source="movacar",
                    offer_id=str(item.get("id", uuid.uuid4())),
                    origin=route.origin,
                    destination=route.destination,
                    pickup_date=route.pickup_date,
                    return_date=route.return_date,
                    price=price,
                    vehicle=str(attributes.get("name", "Movacar vehicle")),
                    booking_url=attributes.get("booking_url") or attributes.get("url"),
                )
            )
        return offers
