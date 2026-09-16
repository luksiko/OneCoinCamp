import json
import sys
from unittest.mock import MagicMock, patch

from camper_monitor.config import Settings
from camper_monitor.http_client import FetchError
from camper_monitor.main import main, poll_once
from camper_monitor.models import Route
from camper_monitor.state import StateStore


def test_main_once_with_mocked_network(tmp_path, monkeypatch):
    config_file = tmp_path / "routes.json"
    db_file = tmp_path / "state.db"

    config_data = {
        "poll_interval_seconds": 60,
        "request_timeout_seconds": 10,
        "routes": [
            {
                "source": "roadsurfer",
                "origin": "Berlin",
                "destination": "Rome",
                "origin_id": 6,
                "destination_id": 35,
                "pickup_date": "2026-10-26",
                "return_date": "2026-11-02",
                "enabled": True,
            }
        ],
    }
    config_file.write_text(json.dumps(config_data), encoding="utf-8")

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "mock_token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "mock_chat")
    monkeypatch.setattr(
        sys,
        "argv",
        ["camper-monitor", "--config", str(config_file), "--database", str(db_file), "--once"],
    )

    mock_client = MagicMock()
    mock_client.get.return_value = [
        {
            "id": 101,
            "price": 1,
            "model": {"name": "Surfer Suite"},
            "pickup_date": "2026-10-26",
            "return_date": "2026-11-02",
        }
    ]
    mock_client.post.return_value = {"ok": True}

    with patch("camper_monitor.main.JsonHttpClient", return_value=mock_client):
        main()

    assert mock_client.get.called
    assert mock_client.post.called

    store = StateStore(db_file)
    try:
        assert store.get_offers_last_24h() == 1
        status = store.get_last_poll_status()
        assert status["requests"] == 1
        assert status["offers"] == 1
        assert status["telegram"] == 1
    finally:
        store.close()


def test_poll_once_successful_request(tmp_path):
    db_file = tmp_path / "state.db"
    store = StateStore(db_file)
    route = Route(
        source="roadsurfer",
        origin="Berlin",
        destination="Rome",
        origin_id=6,
        destination_id=35,
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )
    settings = Settings(
        routes=(route,),
        poll_interval_seconds=60,
        request_timeout_seconds=10,
        telegram_bot_token=None,
        telegram_chat_id=None,
        allowed_origin_countries=(),
        allowed_destination_countries=(),
        min_trip_days=None,
        max_trip_days=None,
    )
    mock_client = MagicMock()
    mock_client.get.return_value = [
        {
            "id": 101,
            "price": 1,
            "model": {"name": "Surfer Suite"},
            "pickup_date": "2026-10-26",
            "return_date": "2026-11-02",
        }
    ]

    try:
        with patch("camper_monitor.main.JsonHttpClient", return_value=mock_client):
            found = poll_once(settings, store)
        assert found == 1
        rows = store.connection.execute(
            "SELECT source, request_count, offers_found, telegram_sent FROM poll_runs"
        ).fetchall()
        assert len(rows) == 1
        assert rows[0] == ("roadsurfer", 1, 1, 0)
    finally:
        store.close()


def test_poll_once_failed_request(tmp_path):
    db_file = tmp_path / "state.db"
    store = StateStore(db_file)
    route = Route(
        source="roadsurfer",
        origin="Berlin",
        destination="Rome",
        origin_id=6,
        destination_id=35,
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )
    settings = Settings(
        routes=(route,),
        poll_interval_seconds=60,
        request_timeout_seconds=10,
        telegram_bot_token=None,
        telegram_chat_id=None,
        allowed_origin_countries=(),
        allowed_destination_countries=(),
        min_trip_days=None,
        max_trip_days=None,
    )
    mock_client = MagicMock()
    mock_client.get.side_effect = FetchError("Network error")

    try:
        with patch("camper_monitor.main.JsonHttpClient", return_value=mock_client):
            found = poll_once(settings, store)
        assert found == 0
        rows = store.connection.execute(
            "SELECT source, request_count, offers_found, telegram_sent FROM poll_runs"
        ).fetchall()
        assert len(rows) == 1
        assert rows[0] == ("roadsurfer", 1, 0, 0)
    finally:
        store.close()


def test_poll_once_multiple_routes_with_first_failed_and_second_successful(tmp_path):
    db_file = tmp_path / "state.db"
    store = StateStore(db_file)
    route1 = Route(
        source="roadsurfer",
        origin="Berlin",
        destination="Rome",
        origin_id=6,
        destination_id=35,
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )
    route2 = Route(
        source="movacar",
        origin="Berlin",
        destination="Paris",
        origin_id="ber",
        destination_id="par",
        pickup_date="2026-10-26",
        return_date="2026-11-02",
    )
    settings = Settings(
        routes=(route1, route2),
        poll_interval_seconds=60,
        request_timeout_seconds=10,
        telegram_bot_token=None,
        telegram_chat_id=None,
        allowed_origin_countries=(),
        allowed_destination_countries=(),
        min_trip_days=None,
        max_trip_days=None,
    )
    mock_client = MagicMock()

    def mock_get(url, headers=None):
        if "roadsurfer" in url:
            raise FetchError("Connection timeout")
        return {"data": [{"id": "201", "type": "offer", "attributes": {"price": 1, "name": "Movacar Van"}}]}

    mock_client.get.side_effect = mock_get

    try:
        with patch("camper_monitor.main.JsonHttpClient", return_value=mock_client):
            found = poll_once(settings, store)
        assert found == 1
        rows = store.connection.execute(
            "SELECT source, request_count, offers_found, telegram_sent FROM poll_runs ORDER BY id ASC"
        ).fetchall()
        assert len(rows) == 2
        assert rows[0] == ("roadsurfer", 1, 0, 0)
        assert rows[1] == ("movacar", 1, 1, 0)
    finally:
        store.close()
