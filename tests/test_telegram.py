import pytest

from camper_monitor.http_client import FetchError
from camper_monitor.models import Offer
from camper_monitor.telegram import TelegramNotifier


class FakeHttp:
    def __init__(self, response=None):
        self.response = {"ok": True} if response is None else response
        self.posts = []

    def post(self, url, payload):
        self.posts.append((url, payload))
        return self.response


def make_offer(booking_url=None, vehicle=None, price=None):
    return Offer(
        source="movacar",
        offer_id="1",
        origin="Berlin",
        destination="Paris",
        pickup_date="2026-10-26",
        return_date="2026-11-02",
        price=price,
        vehicle=vehicle,
        booking_url=booking_url,
    )


def test_send_offer_without_booking_url_does_not_crash():
    http = FakeHttp()
    notifier = TelegramNotifier(http, "token", "chat-id")
    notifier.send_offer(make_offer(booking_url=None))
    assert len(http.posts) == 1
    text = http.posts[0][1]["text"]
    assert "Открыть бронирование" not in text


def test_send_offer_with_booking_url_includes_link():
    http = FakeHttp()
    notifier = TelegramNotifier(http, "token", "chat-id")
    notifier.send_offer(make_offer(booking_url="https://movacar.com/offers?a=1&b=2"))
    text = http.posts[0][1]["text"]
    assert "Открыть бронирование" in text
    assert "a=1&amp;b=2" in text


def test_send_offer_raises_when_telegram_ok_is_false():
    http = FakeHttp(response={"ok": False, "description": "chat not found"})
    notifier = TelegramNotifier(http, "token", "chat-id")
    with pytest.raises(FetchError, match="chat not found"):
        notifier.send_offer(make_offer())