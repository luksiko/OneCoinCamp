from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.parse
from html import escape

from .http_client import FetchError, JsonHttpClient
from .models import Offer


def validate_telegram_init_data(
    init_data: str,
    bot_token: str,
    allowed_ids: list[str] | set[str] | None = None,
    max_age_seconds: int = 86400,
    current_time: int | None = None,
) -> dict:
    if not bot_token:
        raise ValueError("Telegram Bot Token is required")
    if not init_data or not isinstance(init_data, str) or not init_data.strip():
        raise ValueError("Missing Telegram WebApp initData")

    parts = init_data.strip().split("&")
    params: dict[str, str] = {}
    provided_hash = ""

    for part in parts:
        if not part or "=" not in part:
            continue
        raw_k, raw_v = part.split("=", 1)
        k = urllib.parse.unquote_plus(raw_k)
        v = urllib.parse.unquote_plus(raw_v)
        if k == "hash":
            provided_hash = v
        else:
            params[k] = v

    if not provided_hash:
        raise ValueError("Invalid Telegram WebApp initData: missing hash")
    if "auth_date" not in params:
        raise ValueError("Invalid Telegram WebApp initData: missing auth_date")

    try:
        auth_date = int(params["auth_date"])
        if auth_date <= 0:
            raise ValueError
    except ValueError:
        raise ValueError("Invalid Telegram WebApp initData: invalid auth_date")

    now = int(time.time()) if current_time is None else int(current_time)
    if now - auth_date > max_age_seconds:
        raise ValueError("Telegram WebApp initData expired")
    if auth_date > now + 300:
        raise ValueError("Telegram WebApp initData auth_date is in the future")

    sorted_pairs = [f"{k}={params[k]}" for k in sorted(params.keys())]
    data_check_string = "\n".join(sorted_pairs)

    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash.lower(), provided_hash.lower()):
        raise ValueError("Invalid Telegram WebApp initData signature")

    user = None
    if "user" in params:
        try:
            user = json.loads(params["user"])
        except json.JSONDecodeError:
            raise ValueError("Invalid Telegram WebApp initData: invalid user JSON")

    chat = None
    if "chat" in params:
        try:
            chat = json.loads(params["chat"])
        except json.JSONDecodeError:
            pass

    if allowed_ids is not None:
        allowed_set = {str(x).strip().lower().lstrip("@") for x in allowed_ids if str(x).strip()}
        if not allowed_set:
            raise ValueError("Access denied: No authorized Telegram users or chats configured.")

        user_id = str(user["id"]) if user and "id" in user and user["id"] is not None else None
        username = (
            str(user["username"]).lower().lstrip("@")
            if user and "username" in user and user["username"]
            else None
        )
        chat_id = str(chat["id"]) if chat and "id" in chat and chat["id"] is not None else None

        allowed = False
        if user_id and user_id in allowed_set:
            allowed = True
        elif username and username in allowed_set:
            allowed = True
        elif chat_id and chat_id in allowed_set:
            allowed = True

        if not allowed:
            raise ValueError("Access denied: Unauthorized Telegram user or chat.")

    return {
        "user": user,
        "chat": chat,
        "auth_date": auth_date,
        "params": params,
    }


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
