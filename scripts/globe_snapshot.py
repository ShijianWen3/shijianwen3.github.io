"""Snapshot the visitor-globe MQTT retained cells into assets/globe/visitors.json.

The globe publishes one retained MQTT message per ~1 degree cell to a public
EMQX broker. Retained messages are convenient but not durable, so this script
runs on a schedule, reads every retained cell, merges it with the snapshot that
is committed to the repository, and writes the result back.

Only coarse cell counters are stored: no IPs, no timestamps, no raw coordinates.
"""

from __future__ import annotations

import json
import os
import random
import re
import ssl
import string
import sys
import threading
import time
from pathlib import Path

import paho.mqtt.client as mqtt

BROKER = "broker.emqx.io"
PORT = 8084
PREFIX = os.environ.get("SJBOOK_GEO_PREFIX", "sjbook/geo/v1/")
DEFAULT_SNAPSHOT = Path(__file__).resolve().parent.parent / "assets" / "globe" / "visitors.json"
SNAPSHOT = Path(os.environ.get("SJBOOK_GEO_SNAPSHOT", str(DEFAULT_SNAPSHOT)))
KEY_RE = re.compile(r"^(\d{1,3})-(\d{1,3})$")
MAX_COUNT = 1_000_000


def load_existing() -> dict:
    try:
        data = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
        cells = data.get("cells", {})
        return cells if isinstance(cells, dict) else {}
    except (OSError, ValueError):
        return {}


def valid_key(key: str) -> bool:
    match = KEY_RE.match(key)
    if not match:
        return False
    lat_idx, lon_idx = int(match.group(1)), int(match.group(2))
    return 0 <= lat_idx <= 180 and 0 <= lon_idx <= 360


def main() -> int:
    existing = load_existing()
    cells: dict[str, int] = {}

    for key, value in existing.items():
        if valid_key(key):
            try:
                count = int(value)
            except (TypeError, ValueError):
                continue
            if 0 < count <= MAX_COUNT:
                cells[key] = count

    received: dict[str, int] = {}
    subscribed = threading.Event()

    client_id = "sjbook-snapshot-" + "".join(
        random.choice(string.ascii_lowercase + string.digits) for _ in range(8)
    )

    def on_connect(client, userdata, flags, reason_code, properties):
        client.subscribe(PREFIX + "#", qos=0)

    def on_subscribe(client, userdata, mid, reason_codes, properties):
        subscribed.set()

    def on_message(client, userdata, message):
        topic = message.topic
        if not topic.startswith(PREFIX):
            return
        key = topic[len(PREFIX):]
        if not valid_key(key):
            return
        try:
            count = int(message.payload.decode("utf-8").strip())
        except (UnicodeDecodeError, ValueError):
            return
        if 0 < count <= MAX_COUNT:
            received[key] = max(received.get(key, 0), count)

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id,
        transport="websockets",
    )
    client.ws_set_options(path="/mqtt")
    client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
    client.on_connect = on_connect
    client.on_subscribe = on_subscribe
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=8)

    try:
        client.connect(BROKER, PORT, keepalive=45)
        client.loop_start()
        if not subscribed.wait(timeout=15):
            print("warning: no SUBACK, using snapshot only", file=sys.stderr)
        # Retained messages are flushed right after SUBACK; give them a moment.
        time.sleep(8)
    except Exception as exc:  # noqa: BLE001 - the snapshot must never block a build
        print(f"warning: broker unreachable: {exc}", file=sys.stderr)
    finally:
        try:
            client.loop_stop()
            client.disconnect()
        except Exception:  # noqa: BLE001
            pass

    changed = False
    for key, count in received.items():
        if count > cells.get(key, 0):
            cells[key] = count
            changed = True

    total_visits = sum(cells.values())
    print(f"retained cells: {len(received)}, snapshot cells: {len(cells)}, visits: {total_visits}")
    if not changed:
        print("no changes")
        return 0

    payload = {
        "v": 1,
        "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cells": cells,
    }
    SNAPSHOT.write_text(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {SNAPSHOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
