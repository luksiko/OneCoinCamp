"""Import the historical GAS Sheets export into Cloudflare D1.

Usage: python3 scripts/migrate_sheets.py /path/to/export.xlsx [--apply]
Requires openpyxl for reading XLSX; writes no workbook files.
"""

import argparse
import datetime as dt
import os
from pathlib import Path
import subprocess
import tempfile

import openpyxl


def sql(value):
    if value is None or value == "":
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dt.datetime):
        value = value.isoformat(timespec="seconds")
    elif isinstance(value, dt.date):
        value = value.isoformat()
    return "'" + str(value).replace("'", "''") + "'"


def rows(workbook, sheet):
    data = workbook[sheet].values
    header = next(data)
    for values in data:
        record = dict(zip(header, values))
        if any(value is not None for value in values):
            yield record


def insert(table, columns, values, conflict=""):
    return (
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES "
        f"({', '.join(sql(value) for value in values)}) {conflict};"
    )


def setting_value(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def build_sql(workbook):
    statements = []
    counts = {"settings": 0, "offers": 0, "runs": 0}
    setting_keys = {
        "poll_interval_minutes", "availability_check_interval_minutes", "window_days",
        "check_neighbors", "timezone", "telegram_enabled", "notify_all_by_price",
        "silent_hours_enabled", "request_timeout_seconds",
        "provider_roadsurfer_enabled", "provider_movacar_enabled",
        "provider_indiecampers_enabled", "provider_imoova_enabled",
    }
    for row in workbook["Settings"].values:
        key = row[0] if row else None
        value = row[1] if len(row) > 1 else None
        if key not in setting_keys or value is None:
            continue
        statements.append(insert("settings", ["key", "value"], [key, setting_value(value)],
                                 "ON CONFLICT(key) DO UPDATE SET value=excluded.value"))
        counts["settings"] += 1

    for row in rows(workbook, "OffersArchive"):
        fingerprint = row.get("fingerprint")
        if not fingerprint or not row.get("source"):
            continue
        columns = [
            "fingerprint", "source", "offer_id", "vehicle_id", "vehicle", "origin",
            "origin_country", "destination", "destination_country", "pickup_date",
            "return_date", "price", "currency", "booking_url", "raw_json",
            "matches_filter", "archived_telegram_sent_at", "found_at", "is_active",
        ]
        values = [
            fingerprint, row.get("source"), row.get("offer_id"), row.get("vehicle_id"),
            row.get("vehicle"), row.get("origin"), row.get("origin_country"),
            row.get("destination"), row.get("destination_country"),
            row.get("pickup_date"), row.get("return_date"), row.get("price"),
            row.get("currency") or "EUR", row.get("booking_url"), row.get("raw_json"),
            row.get("matches_filter"), row.get("telegram_sent_at"), row.get("found_at"), 1,
        ]
        statements.append(insert("offers", columns, values,
                                 "ON CONFLICT(fingerprint) DO UPDATE SET "
                                 "matches_filter=COALESCE(excluded.matches_filter, offers.matches_filter), "
                                 "archived_telegram_sent_at=COALESCE(excluded.archived_telegram_sent_at, offers.archived_telegram_sent_at), "
                                 "is_active=CASE WHEN offers.is_dismissed=1 THEN 0 ELSE 1 END"))
        counts["offers"] += 1

    for row in rows(workbook, "Runs"):
        started = row.get("started_at")
        if not started:
            continue
        columns = ["started_at", "finished_at", "source", "request_count", "offers_found",
                   "archived", "alerts_sent", "status", "error"]
        values = [row.get(column) for column in columns]
        statements.append(
            "INSERT INTO runs (" + ", ".join(columns) + ") SELECT "
            + ", ".join(sql(value) for value in values)
            + " WHERE NOT EXISTS (SELECT 1 FROM runs WHERE started_at=" + sql(started)
            + " AND source=" + sql(row.get("source")) + " AND finished_at="
            + sql(row.get("finished_at")) + ");"
        )
        counts["runs"] += 1
    return "\n".join(statements) + "\n", counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    workbook = openpyxl.load_workbook(args.xlsx, read_only=True, data_only=True)
    sql_text, counts = build_sql(workbook)
    print(f"Sheets export: {counts['settings']} settings, {counts['offers']} offer rows, {counts['runs']} run rows.")
    if not args.apply:
        print("Preview complete. Pass --apply to import into remote D1.")
        return
    with tempfile.TemporaryDirectory(prefix="camper-sheet-d1-") as directory:
        file = Path(directory) / "import.sql"
        file.write_text(sql_text, encoding="utf-8")
        os.chmod(file, 0o600)
        subprocess.run(
            ["npx", "wrangler", "d1", "execute", "camper_monitor_db", "--remote", "--file", str(file), "--yes"],
            check=True,
            cwd=Path(__file__).resolve().parent.parent,
        )
    print("D1 archive import completed.")


if __name__ == "__main__":
    main()
