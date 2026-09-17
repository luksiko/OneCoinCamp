from __future__ import annotations

import sqlite3
from pathlib import Path

import time


class StateStore:
    def __init__(self, database_path: Path) -> None:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(database_path)
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sent_alerts (
                fingerprint TEXT PRIMARY KEY,
                sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS poll_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                source TEXT,
                request_count INTEGER DEFAULT 0,
                offers_found INTEGER DEFAULT 0,
                telegram_sent INTEGER DEFAULT 0
            )
            """
        )
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_sent_alerts_sent ON sent_alerts(sent_at)"
        )
        self.connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_poll_runs_started ON poll_runs(started_at)"
        )
        self.connection.commit()
        self._last_run_start: str | None = None
        self._last_run_end: str | None = None
        self._last_run_source: str | None = None

    def was_sent(self, fingerprint: str) -> bool:
        return (
            self.connection.execute(
                "SELECT 1 FROM sent_alerts WHERE fingerprint = ?", (fingerprint,)
            ).fetchone()
            is not None
        )

    def mark_sent(self, fingerprint: str) -> None:
        self.connection.execute(
            "INSERT OR IGNORE INTO sent_alerts (fingerprint) VALUES (?)", (fingerprint,)
        )
        self.connection.commit()

    def start_poll_run(self, source: str) -> None:
        self._last_run_start = self._now()
        self._last_run_end = None
        self._last_run_source = source

    def finish_poll_run(
        self,
        request_count: int = 0,
        offers_found: int = 0,
        telegram_sent: int = 0,
    ) -> None:
        self._last_run_end = self._now()
        self.connection.execute(
            """
            INSERT INTO poll_runs (started_at, finished_at, source, request_count, offers_found, telegram_sent)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                self._last_run_start or self._now(),
                self._last_run_end,
                self._last_run_source or "",
                request_count,
                offers_found,
                telegram_sent,
            ),
        )
        self.connection.commit()

    def get_last_poll(self) -> str | None:
        row = self.connection.execute(
            "SELECT MAX(started_at) FROM poll_runs"
        ).fetchone()
        return row[0] if row and row[0] else None

    def get_last_poll_status(self) -> dict:
        row = self.connection.execute(
            "SELECT started_at, finished_at, source, request_count, offers_found, telegram_sent FROM poll_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if not row:
            return {"last_run": "never", "source": "-", "requests": 0, "offers": 0, "telegram": 0}
        return {
            "last_run": row[0],
            "finished": row[1] or "-",
            "source": row[2],
            "requests": row[3],
            "offers": row[4],
            "telegram": row[5],
        }

    def get_offers_last_24h(self) -> int:
        row = self.connection.execute(
            "SELECT COUNT(*) FROM sent_alerts WHERE sent_at >= datetime('now', '-1 day')"
        ).fetchone()
        return row[0] if row else 0

    @staticmethod
    def _now() -> str:
        return time.strftime("%Y-%m-%d %H:%M:%S")

    def close(self) -> None:
        self.connection.close()
