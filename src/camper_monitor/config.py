from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .models import Route


@dataclass(frozen=True)
class Settings:
    routes: tuple[Route, ...]
    poll_interval_seconds: int
    request_timeout_seconds: int
    telegram_bot_token: str | None
    telegram_chat_id: str | None
    allowed_origin_countries: tuple[str, ...]
    allowed_destination_countries: tuple[str, ...]
    min_trip_days: int | None
    max_trip_days: int | None


def _parse_countries(value) -> tuple[str, ...]:
    if isinstance(value, list):
        return tuple(str(item).upper().strip() for item in value if item)
    if isinstance(value, str):
        return tuple(item.strip().upper() for item in value.split(",") if item.strip())
    return tuple()


def load_settings(path: Path, bot_token: str | None, chat_id: str | None) -> Settings:
    data = json.loads(path.read_text(encoding="utf-8"))
    routes = tuple(
        Route(
            source=item["source"],
            origin=item["origin"],
            destination=item["destination"],
            pickup_date=item["pickup_date"],
            return_date=item["return_date"],
            origin_id=item.get("origin_id"),
            destination_id=item.get("destination_id"),
            enabled=item.get("enabled", True),
        )
        for item in data["routes"]
    )
    return Settings(
        routes=routes,
        poll_interval_seconds=data.get("poll_interval_seconds", 180),
        request_timeout_seconds=data.get("request_timeout_seconds", 20),
        telegram_bot_token=bot_token,
        telegram_chat_id=chat_id,
        allowed_origin_countries=_parse_countries(
            data.get("allowed_origin_countries", ["DE", "AT", "NL", "CH"])
        ),
        allowed_destination_countries=_parse_countries(
            data.get("allowed_destination_countries", ["IT", "ES", "PT", "FR"])
        ),
        min_trip_days=data.get("min_trip_days"),
        max_trip_days=data.get("max_trip_days"),
    )
