import json
from urllib.parse import parse_qs, urlparse
import pytest

from camper_monitor.http_client import FetchError
from camper_monitor.models import Route
from camper_monitor.providers import MovacarProvider, RoadsurferProvider


class FakeHttp:
    def __init__(self, payload=None, error=None):
        self.payload = payload
        self.error = error
        self.url = None
        self.headers = None

    def get(self, url, headers=None):
        self.url = url
        self.headers = headers
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
