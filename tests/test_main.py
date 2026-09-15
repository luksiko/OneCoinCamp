import json
import sys
from unittest.mock import MagicMock, patch

from camper_monitor.main import main
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
        assert status["offers"] == 1
        assert status["telegram"] == 1
    finally:
        store.close()
