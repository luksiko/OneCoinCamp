from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Route:
    source: str
    origin: str
    destination: str
    pickup_date: str
    return_date: str
    origin_id: str | int | None = None
    destination_id: str | int | None = None
    enabled: bool = True


@dataclass(frozen=True)
class Offer:
    source: str
    offer_id: str
    origin: str
    destination: str
    pickup_date: str
    return_date: str
    price: str | None
    vehicle: str | None
    booking_url: str | None

    @property
    def fingerprint(self) -> str:
        raw = "|".join(
            (
                self.source,
                self.offer_id,
                self.origin,
                self.destination,
                self.pickup_date,
                self.return_date,
                self.price or "",
            )
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    @property
    def duration_days(self) -> int | None:
        try:
            start = datetime.strptime(self.pickup_date, "%Y-%m-%d")
            end = datetime.strptime(self.return_date, "%Y-%m-%d")
            return (end - start).days
        except (ValueError, TypeError):
            return None
