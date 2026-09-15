import json
from urllib.parse import parse_qs, urlparse
import pytest

from camper_monitor.http_client import FetchError
from camper_monitor.models import Route
from camper_monitor.providers import (
    ImoovaProvider,
    IndieCampersProvider,
    MovacarProvider,
    RoadsurferProvider,
)


def test_imoova_search_normalizes_offer():
    payload = {
        "data": {
            "relocations": {
                "data": [
                    {
                        "id": "116242",
                        "reference": "RLC116242",
                        "name": "Melbourne to Cairns",
                        "type": "RELOCATION",
                        "available_from_date": "2026-08-05",
                        "available_to_date": "2026-08-21",
                        "retail_rate": 50.0,
                        "vehicle": {"name": "9+ Seater Commuter"},
                        "departureCity": {"id": "66", "name": "Melbourne", "slug": "melbourne"},
                        "deliveryCity": {"id": "74", "name": "Cairns", "slug": "cairns"},
                    }
                ]
            }
        }
    }
    http = FakeHttp(payload)
    provider = ImoovaProvider(http)
    route = Route(
        source="imoova",
        origin="melbourne",
        destination="cairns",
        pickup_date="2026-08-05",
        return_date="2026-08-21",
    )

    offers = provider.fetch_offers(route)

    assert len(offers) == 1
    assert offers[0].offer_id == "116242"
    assert offers[0].vehicle == "9+ Seater Commuter"
    assert offers[0].price == "50.0"
    assert offers[0].booking_url == "https://www.imoova.com/relocations/deal/116242"




def test_indie_campers_search_normalizes_offer():
    payload = {
        "data": {
            "availability": [
                {
                    "available": True,
                    "van_id": 192,
                    "manufacturer_name": "Weinsberg",
                    "total_cost": 1872.2,
                    "checkin_date": "2026-09-27",
                    "checkout_date": "2026-10-07",
                }
            ]
        }
    }
    http = FakeHttp(payload)
    provider = IndieCampersProvider(http)
    route = Route(
        source="indiecampers",
        origin="lisbon",
        destination="porto",
        pickup_date="2026-09-27",
        return_date="2026-10-07",
    )

    offers = provider.fetch_offers(route)

    assert len(offers) == 1
    assert offers[0].offer_id == "192"
    assert offers[0].vehicle == "Weinsberg"
    assert offers[0].price == "1872.2"
    assert "from=lisbon&to=porto" in offers[0].booking_url
    assert http.post_payload["booking"]["checkin_city"] == "lisbon"



class FakeHttp:
    def __init__(self, payload=None, error=None):
        self.payload = payload
        self.error = error
        self.url = None
        self.headers = None
        self.post_payload = None

    def get(self, url, headers=None):
        self.url = url
        self.headers = headers
        if self.error:
            raise self.error
        return self.payload

    def post(self, url, payload=None, headers=None):
        self.url = url
        self.headers = headers
        self.post_payload = payload
        if self.error:
            raise self.error
        return self.payload


def test_roadsurfer_search_normalizes_offer():
    http = FakeHttp([{"id": 6, "name": "Beach Hostel", "model": {"name": "VW T6.1"}}])
    provider = RoadsurferProvider(http)
    route = Route(
        source="roadsurfer",
        origin="Berlin",
        destination="Rome Fiumicino Airport",
        origin_id=6,
        destination_id=35,
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )

    offers = provider.fetch_offers(route)

    assert len(offers) == 1
    assert offers[0].offer_id == "6"
    assert offers[0].vehicle == "Beach Hostel"
    assert "station=6" in offers[0].booking_url
    query = parse_qs(urlparse(http.url).query)
    assert json.loads(query["stations"][0]) == [[6, 35]]
    assert http.headers["X-Requested-Alias"] == "rally.search"


def test_movacar_offer_without_booking_url_normalizes():
    http = FakeHttp({"data": [{"id": "123", "attributes": {"price": 100, "name": "VW Crafter"}}]})
    provider = MovacarProvider(http)
    route = Route(
        source="movacar",
        origin="Berlin",
        destination="Paris",
        origin_id="abc",
        destination_id="def",
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )

    offers = provider.fetch_offers(route)

    assert len(offers) == 1
    assert offers[0].offer_id == "123"
    assert offers[0].booking_url is None


@pytest.mark.parametrize("error_msg", ["GET url failed with HTTP 429", "GET url failed with HTTP 500", "GET url failed: Invalid JSON"])
def test_roadsurfer_propagates_http_and_json_errors(error_msg):
    http = FakeHttp(error=FetchError(error_msg))
    provider = RoadsurferProvider(http)
    route = Route(
        source="roadsurfer",
        origin="Berlin",
        destination="Rome",
        origin_id=6,
        destination_id=35,
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )
    with pytest.raises(FetchError, match=error_msg):
        provider.fetch_offers(route)


@pytest.mark.parametrize("error_msg", ["GET url failed with HTTP 429", "GET url failed with HTTP 500", "GET url failed: Invalid JSON"])
def test_movacar_propagates_http_and_json_errors(error_msg):
    http = FakeHttp(error=FetchError(error_msg))
    provider = MovacarProvider(http)
    route = Route(
        source="movacar",
        origin="Berlin",
        destination="Paris",
        origin_id="abc",
        destination_id="def",
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )
    with pytest.raises(FetchError, match=error_msg):
        provider.fetch_offers(route)
