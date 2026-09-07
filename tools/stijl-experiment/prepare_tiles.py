#!/usr/bin/env python3
"""Crop every reference sheet into per-angle tiles.

Writes tiles/<item>/{b|g}{0..7}.png  (b = afwijkende stijl, g = goede stijl)
and tiles/manifest.json. Safe to re-run; it verifies the burned-in labels are
at the expected rows before cropping so a layout change fails loudly instead
of producing silently wrong tiles.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stijllib as lib


def main():
    items = lib.list_items()
    if not items:
        raise SystemExit(f"no sheets found in {lib.SHEETS_DIR}")
    os.makedirs(lib.TILES_DIR, exist_ok=True)
    for item in items:
        lib.verify_sheet_labels(item)
        d = os.path.join(lib.TILES_DIR, item["id"])
        os.makedirs(d, exist_ok=True)
        for kind, angle, tile in lib.crop_tiles(item):
            tile.save(os.path.join(d, f"{kind}{angle}.png"))
    manifest = [{"id": it["id"], "category": it["category"]} for it in items]
    with open(lib.MANIFEST, "w") as f:
        json.dump(manifest, f, indent=1)
    counts = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(f"cropped {len(items)} items x 16 tiles -> {lib.TILES_DIR}  {counts}")


if __name__ == "__main__":
    main()
