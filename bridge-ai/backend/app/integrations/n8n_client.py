"""Adapter for sending events through the n8n 'financial events' workflow.

Status is reported honestly: we only claim 'connected' after n8n actually
delivered a request back to Bridge with the shared secret.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

import httpx

STATE: dict = {"last_ok": None, "last_error": None, "last_attempt": None, "last_inbound": None}


def webhook_url() -> str | None:
    return os.getenv("N8N_WEBHOOK_URL") or None


def shared_secret() -> str:
    s = os.getenv("N8N_SHARED_SECRET")
    if s:
        return s
    if os.getenv("DEMO_MODE", "true").lower() == "true":
        return "bridge-demo-secret"  # documented demo default; set your own for anything public
    raise RuntimeError("N8N_SHARED_SECRET must be set when DEMO_MODE is false")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def send_event(payload: dict) -> dict:
    """POST an event to the n8n webhook and return n8n's JSON response.

    Raises RuntimeError if n8n is not configured or the call fails."""
    url = webhook_url()
    if not url:
        raise RuntimeError("N8N_WEBHOOK_URL is not set")
    STATE["last_attempt"] = _now()
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(url, json=payload, headers={"X-Bridge-Secret": shared_secret()})
    except httpx.HTTPError as e:
        STATE["last_error"] = f"{_now()} — could not reach n8n ({e.__class__.__name__})"
        raise RuntimeError(STATE["last_error"]) from e
    if r.status_code >= 400:
        STATE["last_error"] = f"{_now()} — n8n returned HTTP {r.status_code}"
        raise RuntimeError(STATE["last_error"])
    try:
        body = r.json()
    except ValueError:
        body = {"raw": r.text[:300]}
    STATE["last_ok"] = _now()
    return body


def note_inbound() -> None:
    STATE["last_inbound"] = _now()
