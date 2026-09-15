from __future__ import annotations

from html import escape

from .http_client import FetchError, JsonHttpClient
from .models import Offer


class TelegramNotifier:
    def __init__(self, http: JsonHttpClient, bot_token: str, chat_id: str) -> None:
        self.http = http
        self.bot_token = bot_token
        self.chat_id = chat_id

    def send_offer(self, offer: Offer) -> None:
        source_label = "Roadsurfer Rally" if offer.source == "roadsurfer" else offer.source
        emoji = "🚐" if offer.source == "roadsurfer" else "🚗"
        vehicle_line = f"\n{emoji} Модель: {escape(offer.vehicle)}" if offer.vehicle else ""
        price_line = f"\n💶 Цена: <b>{escape(offer.price or '')}</b> € / сутки" if offer.price else ""
        route_line = f"📍 {escape(offer.origin)} ➔ {escape(offer.destination)}"
        date_line = f"📅 {escape(offer.pickup_date)} – {escape(offer.return_date)}"
        duration = offer.duration_days
        duration_line = f" ({duration} дней)" if duration else ""
        text = (
            f"🚐 {source_label} — найден слот за 1€!\n"
            f"{route_line}\n"
            f"{date_line}{duration_line}{vehicle_line}{price_line}"
        )
        if offer.booking_url:
            button_label = "Забронировать на Roadsurfer ➔" if offer.source == "roadsurfer" else "Открыть бронирование"
            text += f'\n<a href="{escape(offer.booking_url, quote=True)}">[ {button_label} ]</a>'
        response = self.http.post(
            f"https://api.telegram.org/bot{self.bot_token}/sendMessage",
            {"chat_id": self.chat_id, "text": text, "parse_mode": "HTML"},
        )
        self.ensure_ok(response)

    @staticmethod
    def ensure_ok(response: dict | None) -> None:
        if response is None:
            raise FetchError("Telegram returned an empty response")
        if not response.get("ok"):
            raise FetchError(f'Telegram error: {response.get("description", "unknown")}')
