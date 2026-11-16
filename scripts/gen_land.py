"""Regenerate the land-dot layer embedded in assets/globe/globe.js.

Downloads Natural Earth 110m land (via jsDelivr), rasterizes it, samples points
with roughly even spacing on the sphere, packs them as int16 lat/lon pairs and
replaces the block between LAND_DATA_START / LAND_DATA_END.

Requirements: Pillow  (pip install pillow)
Usage:        python scripts/gen_land.py
"""

from __future__ import annotations

import base64
import json
import math
import struct
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "assets" / "globe" / "globe.js"
GEOJSON_URL = (
    "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/"
    "ne_110m_land.geojson"
)
START = "/* LAND_DATA_START */"
END = "/* LAND_DATA_END */"
MASK_W, MASK_H = 1440, 720
STEP_DEG = 2.5
LAT_MIN, LAT_MAX = -56.0, 84.0


def load_geojson() -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "ne_110m_land.geojson"
        request = urllib.request.Request(GEOJSON_URL, headers={"User-Agent": "sjbook-globe/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
        return json.loads(path.read_text(encoding="utf-8"))


def rings(geometry: dict):
    if geometry["type"] == "Polygon":
        yield from geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            yield from polygon


def sample_points(geojson: dict) -> list[tuple[float, float]]:
    mask = Image.new("1", (MASK_W, MASK_H), 0)
    draw = ImageDraw.Draw(mask)
    for feature in geojson["features"]:
        for ring in rings(feature["geometry"]):
            points = [
                ((lon + 180.0) / 360.0 * MASK_W, (90.0 - lat) / 180.0 * MASK_H)
                for lon, lat in ring
            ]
            if len(points) >= 3:
                draw.polygon(points, fill=1)

    def is_land(lon: float, lat: float) -> bool:
        x = min(max(int((lon + 180.0) / 360.0 * MASK_W), 0), MASK_W - 1)
        y = min(max(int((90.0 - lat) / 180.0 * MASK_H), 0), MASK_H - 1)
        return mask.getpixel((x, y)) == 1

    points: list[tuple[float, float]] = []
    lat = LAT_MIN
    row = 0
    while lat <= LAT_MAX:
        lon_step = STEP_DEG / max(math.cos(math.radians(lat)), 0.25)
        phase = 0.0 if row % 2 == 0 else lon_step / 2.0
        lon = -180.0 + phase
        while lon < 180.0:
            if is_land(lon, lat):
                points.append((lat, lon))
            lon += lon_step
        lat += STEP_DEG
        row += 1
    return points


def main() -> int:
    points = sample_points(load_geojson())
    payload = bytearray()
    for lat, lon in points:
        payload += struct.pack(
            "<hh",
            int(round(lat * 2)) + 180,
            int(round(lon * 2)) + 360,
        )
    encoded = base64.b64encode(payload).decode("ascii")

    source = TARGET.read_text(encoding="utf-8")
    start_index = source.index(START)
    line_start = source.rfind("\n", 0, start_index) + 1
    end_index = source.index(END) + len(END)
    block = (
        "    " + START + "\n"
        '    var LAND_B64 = "' + encoded + '";\n'
        "    " + END
    )
    TARGET.write_text(source[:line_start] + block + source[end_index:], encoding="utf-8")
    print(f"points: {len(points)}, bytes: {len(payload)}, base64: {len(encoded)}")
    print(f"updated {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
