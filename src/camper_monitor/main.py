from __future__ import annotations

import argparse
import logging
import os
import time
from pathlib import Path

from .config import Settings, load_settings
from .http_client import FetchError, JsonHttpClient
from .providers import (
    FreewayCamperProvider,
    ImoovaProvider,
    IndieCampersProvider,
    MovacarProvider,
    RoadsurferProvider,
)
from .state import StateStore
from .telegram import TelegramNotifier

logger = logging.getLogger(__name__)


def filter_offers(offers, min_trip_days=None, max_trip_days=None, max_price_eur=None):
    result = []
    for offer in offers:
        duration = offer.duration_days
        if duration is not None:
            if min_trip_days is not None and duration < min_trip_days:
                continue
            if max_trip_days is not None and duration > max_trip_days:
                continue
        if max_price_eur is not None and offer.price is not None:
            try:
                price_val = float(offer.price)
                if price_val > max_price_eur:
                    continue
            except (ValueError, TypeError):
                pass  # if price cannot be parsed, let it through
        result.append(offer)
    return result


def poll_once(
    settings: Settings,
    state: StateStore,
    force: bool = False,
) -> int:
    http = JsonHttpClient(settings.request_timeout_seconds)
    providers = {
        "roadsurfer": RoadsurferProvider(http),
        "movacar": MovacarProvider(http),
        "indiecampers": IndieCampersProvider(http),
        "imoova": ImoovaProvider(http),
        "freewaycamper": FreewayCamperProvider(http),
    }
    notifier = (
        TelegramNotifier(http, settings.telegram_bot_token, settings.telegram_chat_id)
        if settings.telegram_bot_token and settings.telegram_chat_id
        else None
    )
    found = 0
    for route_index, route in enumerate(settings.routes):
        if not route.enabled:
            continue
        if settings.enabled_providers is not None and route.source.lower() not in settings.enabled_providers:
            continue
        provider = providers.get(route.source)
        if provider is None:
            logger.error("Unknown provider: %s", route.source)
            continue
        state.start_poll_run(route.source)
        request_count = 1
        try:
            offers = provider.fetch_offers(
                route,
                allowed_destination_countries=settings.allowed_destination_countries,
            )
        except (FetchError, ValueError, KeyError, TypeError) as error:
            logger.error(
                "%s %s → %s: %s", route.source, route.origin, route.destination, error
            )
            state.finish_poll_run(request_count=request_count, offers_found=0)
            continue
        filtered = filter_offers(
            offers,
            min_trip_days=None if settings.notify_all_by_price else settings.min_trip_days,
            max_trip_days=None if settings.notify_all_by_price else settings.max_trip_days,
            max_price_eur=settings.max_price_eur,
        )
        sent = 0
        for offer in filtered:
            if state.was_sent(offer.fingerprint):
                continue
            found += 1
            if notifier is None:
                logger.warning("Telegram is not configured; would alert: %s", offer)
                continue
            try:
                notifier.send_offer(offer, route_index=route_index)
            except FetchError as error:
                logger.error("Telegram send failed: %s", error)
                continue
            state.mark_sent(offer.fingerprint)
            sent += 1
        state.finish_poll_run(
            request_count=request_count,
            offers_found=len(filtered),
            telegram_sent=sent,
        )
    return found


def format_status(settings: Settings, state: StateStore) -> str:
    last = state.get_last_poll_status()
    if last["last_run"] == "never":
        last_run_text = "Никогда не запускался"
    else:
        last_run_text = last["last_run"]
    poll_interval = state.get_last_poll()
    sent_24h = state.get_offers_last_24h()
    enabled_routes = [r for r in settings.routes if r.enabled]
    disabled_routes = [r for r in settings.routes if not r.enabled]

    lines = [
        "<b>📊 Статус Camper Monitor</b>",
        "",
        f"⏱ Последний опрос: {last_run_text}",
        f"📬 Интервал опроса: {settings.poll_interval_seconds} сек",
        f"📈 Офферов за 24ч: {sent_24h}",
        "",
        f"🚗 Активные маршруты ({len(enabled_routes)}):",
    ]
    for route in enabled_routes:
        lines.append(f"  ✅ {route.source}: {route.origin} → {route.destination}")
    if disabled_routes:
        lines.append(f"\n🚫 Отключённые маршруты ({len(disabled_routes)}):")
        for route in disabled_routes:
            lines.append(f"  ⬜ {route.source}: {route.origin} → {route.destination}")
    lines.append("")
    lines.append("Фильтры:")
    lines.append(f"  Откуда: {', '.join(settings.allowed_origin_countries)}")
    lines.append(f"  Куда: {', '.join(settings.allowed_destination_countries)}")
    if settings.min_trip_days or settings.max_trip_days:
        lines.append(
            f"  Длительность: {settings.min_trip_days or 0}-{settings.max_trip_days or '∞'} дней"
        )
    if settings.max_price_eur is not None:
        lines.append(f"  Макс. цена: {settings.max_price_eur} €")
    if settings.notify_all_by_price:
        max_p = f"{settings.max_price_eur} €" if settings.max_price_eur is not None else "любая"
        lines.append(f"  🔔 Все слоты до цены: вкл (до {max_p})")
    lines.append("")
    lines.append("Команды: /check — запустить опрос сейчас, /actual — актуальные предложения")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Camper Monitor")
    parser.add_argument("--config", default="config/routes.json")
    parser.add_argument("--database", default="data/state.db")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    settings = load_settings(Path(args.config), bot_token, chat_id)
    state = StateStore(Path(args.database))
    try:
        if args.once:
            count = poll_once(settings, state, force=True)
            logger.info("Found %d new offers", count)
        else:
            while True:
                count = poll_once(settings, state)
                logger.info("Found %d new offers", count)
                time.sleep(settings.poll_interval_seconds)
    except KeyboardInterrupt:
        logger.info("Stopped")
    finally:
        state.close()


if __name__ == "__main__":
    main()
