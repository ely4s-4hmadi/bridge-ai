"""Tiny SQLite persistence layer (demo-grade, single user).

Not production banking storage: no encryption at rest, no per-user auth.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Optional

from .models import LedgerItem, UserPreferences, UserProfile

SCHEMA = """
CREATE TABLE IF NOT EXISTS profile (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY, event_type TEXT, source TEXT, via TEXT,
  received_at TEXT, payload TEXT, result TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS pending_events (
  event_id TEXT PRIMARY KEY, payload TEXT, created_at TEXT, delivered_at TEXT);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, signature TEXT UNIQUE, level TEXT,
  title TEXT, body TEXT, created_at TEXT, read INTEGER DEFAULT 0, via TEXT);
CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, status TEXT);
CREATE TABLE IF NOT EXISTS monitoring_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT, via TEXT, result TEXT);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.RLock()
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    # -- generic -------------------------------------------------------------
    def q(self, sql: str, args: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            cur = self.conn.execute(sql, args)
            rows = cur.fetchall()
            self.conn.commit()
            return rows

    def wipe(self) -> None:
        with self._lock:
            for t in ("profile", "ledger", "events", "pending_events", "alerts", "actions", "monitoring_runs"):
                self.conn.execute(f"DELETE FROM {t}")
            self.conn.execute("DELETE FROM sqlite_sequence") if self._has_seq() else None
            self.conn.commit()

    def _has_seq(self) -> bool:
        return bool(self.conn.execute(
            "SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").fetchall())

    # -- profile -------------------------------------------------------------
    def get_profile(self) -> UserProfile:
        rows = self.q("SELECT data FROM profile LIMIT 1")
        if not rows:
            raise LookupError("No profile — run demo reset")
        return UserProfile.model_validate_json(rows[0]["data"])

    def save_profile(self, p: UserProfile) -> None:
        self.q("INSERT OR REPLACE INTO profile (id, data) VALUES (?, ?)", (p.id, p.model_dump_json()))

    def update_preferences(self, changes: dict[str, Any]) -> UserProfile:
        p = self.get_profile()
        merged = p.preferences.model_dump() | changes
        p.preferences = UserPreferences.model_validate(merged)
        self.save_profile(p)
        return p

    # -- ledger --------------------------------------------------------------
    def ledger(self) -> list[LedgerItem]:
        items = [LedgerItem.model_validate_json(r["data"]) for r in self.q("SELECT data FROM ledger")]
        return sorted(items, key=lambda i: (i.date, i.id))

    def save_item(self, item: LedgerItem) -> None:
        self.q("INSERT OR REPLACE INTO ledger (id, data) VALUES (?, ?)", (item.id, item.model_dump_json()))

    # -- events --------------------------------------------------------------
    def event_exists(self, event_id: str) -> bool:
        return bool(self.q("SELECT 1 FROM events WHERE event_id=?", (event_id,)))

    def record_event(self, event_id: str, event_type: str, source: str, via: str,
                     payload: dict, result: dict, status: str) -> None:
        self.q("INSERT INTO events VALUES (?,?,?,?,?,?,?,?)",
               (event_id, event_type, source, via, now_iso(), json.dumps(payload, default=str),
                json.dumps(result, default=str), status))

    def events(self, limit: int = 50) -> list[dict]:
        rows = self.q("SELECT * FROM events ORDER BY received_at DESC, rowid DESC LIMIT ?", (limit,))
        return [{**dict(r), "payload": json.loads(r["payload"]), "result": json.loads(r["result"])} for r in rows]

    # -- pending (integration inbox polled by n8n) ---------------------------
    def queue_pending(self, event_id: str, payload: dict) -> bool:
        if self.q("SELECT 1 FROM pending_events WHERE event_id=?", (event_id,)):
            return False
        self.q("INSERT INTO pending_events VALUES (?,?,?,NULL)", (event_id, json.dumps(payload, default=str), now_iso()))
        return True

    def pending(self) -> list[dict]:
        rows = self.q("SELECT * FROM pending_events WHERE delivered_at IS NULL ORDER BY created_at")
        return [json.loads(r["payload"]) for r in rows]

    def mark_delivered(self, event_id: str) -> None:
        self.q("UPDATE pending_events SET delivered_at=? WHERE event_id=?", (now_iso(), event_id))

    # -- alerts ---------------------------------------------------------------
    def add_alert(self, signature: str, level: str, title: str, body: str, via: str) -> Optional[int]:
        if self.q("SELECT 1 FROM alerts WHERE signature=?", (signature,)):
            return None
        self.q("INSERT INTO alerts (signature, level, title, body, created_at, via) VALUES (?,?,?,?,?,?)",
               (signature, level, title, body, now_iso(), via))
        return self.q("SELECT id FROM alerts WHERE signature=?", (signature,))[0]["id"]

    def alerts(self) -> list[dict]:
        return [dict(r) | {"read": bool(r["read"])} for r in self.q("SELECT * FROM alerts ORDER BY id DESC")]

    def set_alert_read(self, alert_id: int, read: bool) -> bool:
        if not self.q("SELECT 1 FROM alerts WHERE id=?", (alert_id,)):
            return False
        self.q("UPDATE alerts SET read=? WHERE id=?", (int(read), alert_id))
        return True

    # -- action status --------------------------------------------------------
    def action_statuses(self) -> dict[str, str]:
        return {r["id"]: r["status"] for r in self.q("SELECT * FROM actions")}

    def set_action_status(self, action_id: str, status: str) -> None:
        self.q("INSERT OR REPLACE INTO actions VALUES (?,?)", (action_id, status))

    # -- monitoring runs --------------------------------------------------------
    def log_run(self, via: str, result: dict) -> None:
        self.q("INSERT INTO monitoring_runs (ran_at, via, result) VALUES (?,?,?)",
               (now_iso(), via, json.dumps(result, default=str)))

    def runs(self, limit: int = 20) -> list[dict]:
        rows = self.q("SELECT * FROM monitoring_runs ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(r) | {"result": json.loads(r["result"])} for r in rows]


def db_path_from_env() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./bridge.db")
    return url.replace("sqlite:///", "", 1) if url.startswith("sqlite:///") else url
