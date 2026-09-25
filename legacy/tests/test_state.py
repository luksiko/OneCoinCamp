from camper_monitor.state import StateStore


def test_state_store_remembers_sent_fingerprint(tmp_path):
    store = StateStore(tmp_path / "state.db")
    try:
        assert not store.was_sent("offer-1")
        store.mark_sent("offer-1")
        assert store.was_sent("offer-1")
    finally:
        store.close()


def test_state_store_creates_missing_parent_directory(tmp_path):
    database = tmp_path / "nested" / "state.db"
    store = StateStore(database)
    try:
        assert database.exists()
        store.mark_sent("offer-2")
    finally:
        store.close()
