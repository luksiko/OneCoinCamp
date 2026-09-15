import hashlib
from camper_monitor.models import Offer, Route
from camper_monitor.providers import RoadsurferProvider


def test_offer_fingerprint_sha256():
    offer = Offer(
        source="roadsurfer",
        offer_id="123",
        origin="Berlin",
        destination="Rome",
        pickup_date="2026-10-26",
        return_date="2026-11-02",
        price="1",
        vehicle="Surfer Suite",
        booking_url="https://example.com",
    )
    raw = "roadsurfer|123|Berlin|Rome|2026-10-26|2026-11-02|1"
    expected = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    assert offer.fingerprint == expected
    assert len(offer.fingerprint) == 64


def test_offer_duration_days():
    offer = Offer(
        source="roadsurfer",
        offer_id="123",
        origin="Berlin",
        destination="Rome",
        pickup_date="2026-10-26",
        return_date="2026-11-02",
        price="1",
        vehicle="Surfer Suite",
        booking_url="https://example.com",
    )
    assert offer.duration_days == 7


class FakeMultiHttp:
    def __init__(self):
        self.urls = []

    def get(self, url, headers=None):
        self.urls.append(url)
        if "stations/6" in url:
            return {
                "routes": [
                    {"id": 35, "name": "Rome Fiumicino Airport", "country": "IT"},
                    {"id": 40, "name": "Barcelona", "country": "ES"},
                    {"id": 99, "name": "Oslo", "country": "NO"},
                ]
            }
        if "rally/search" in url:
            return [{"id": 101, "price": 1, "model": {"name": "Surfer Suite"}}]
        return []


def test_roadsurfer_auto_queries_allowed_destinations():
    http = FakeMultiHttp()
    provider = RoadsurferProvider(http)
    route = Route(
        source="roadsurfer",
        origin="Berlin",
        destination="",
        origin_id=6,
        destination_id=None,
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )
    offers = provider.fetch_offers(route, allowed_destination_countries=("IT", "ES"))
    assert len(offers) == 2
    assert any("stations/6" in u for u in http.urls)
    search_urls = [u for u in http.urls if "rally/search" in u]
    assert len(search_urls) == 2
