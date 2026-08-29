"""Shared code for the style-pick experiment.

Data model
----------
Each sheet in docs/stijlreferentie is one *item*: the same object rendered in
two styles, 8 angles each. Top block = AFWIJKENDE STIJL (bad), bottom block =
GOEDE STIJL (good). Labels are burned in at fixed rows, so the sheets can be
used directly as labelled references, and cropped into unlabelled tiles for
test stimuli.

Angle indices (row-major over the 4x2 grid of each block):
  0-3  rotations around the vertical axis (row 1)
  4,5  two more rotations (row 2, columns 1-2)
  6    tilted three-quarter view (row 2, column 3)
  7    top-down view (row 2, column 4)
"""

import base64
import hashlib
import io
import json
import os
import random
import re
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SHEETS_DIR = os.path.join(REPO, "docs", "stijlreferentie")
TILES_DIR = os.path.join(HERE, "tiles")
MANIFEST = os.path.join(TILES_DIR, "manifest.json")

SHEET_W, SHEET_H = 896, 956
COL_W = 224
# Label text rows sit at y 9-20 and y 491-502 on every sheet (verified by scan).
BAD_ROWS = [(24, 256), (256, 488)]
GOOD_ROWS = [(506, 731), (731, 956)]

CATEGORIES = {"n": "natuur", "o": "object", "s": "structuur"}


def list_items():
    items = []
    for name in sorted(os.listdir(SHEETS_DIR)):
        m = re.fullmatch(r"([nos])(\d+)\.png", name)
        if m:
            items.append({"id": m.group(1) + m.group(2), "category": m.group(1),
                          "sheet": os.path.join(SHEETS_DIR, name)})
    items.sort(key=lambda it: (it["category"], int(it["id"][1:])))
    return items


def tile_path(item_id, kind, angle):
    return os.path.join(TILES_DIR, item_id, f"{kind}{angle}.png")


def crop_tiles(item):
    """Crop one sheet into 8 bad + 8 good tiles. Returns list of (kind, angle, Image)."""
    im = Image.open(item["sheet"]).convert("RGB")
    if im.size != (SHEET_W, SHEET_H):
        raise ValueError(f"{item['id']}: unexpected sheet size {im.size}")
    out = []
    for kind, rows in (("b", BAD_ROWS), ("g", GOOD_ROWS)):
        angle = 0
        for y0, y1 in rows:
            for col in range(4):
                x0 = col * COL_W
                out.append((kind, angle, im.crop((x0, y0, x0 + COL_W, y1))))
                angle += 1
    return out


def verify_sheet_labels(item):
    """Assert the two label rows are where we expect them, so crops are safe."""
    import numpy as np
    im = np.array(Image.open(item["sheet"]).convert("L"))
    for y0, y1, what in ((9, 21, "AFWIJKENDE STIJL"), (491, 503, "GOEDE STIJL")):
        if (im[y0:y1, :250] < 100).sum() < 20:
            raise ValueError(f"{item['id']}: expected label '{what}' at rows {y0}-{y1}")


def compose_panel(item_id, kind, angles, scale):
    """One unlabelled candidate panel: the chosen angle tiles side by side
    (max 4 per row), scaled. Returns PNG bytes."""
    tiles = [Image.open(tile_path(item_id, kind, a)) for a in angles]
    if scale != 1.0:
        tiles = [t.resize((max(1, round(t.width * scale)),
                           max(1, round(t.height * scale))), Image.LANCZOS) for t in tiles]
    pad = max(2, round(8 * scale))
    per_row = min(4, len(tiles))
    rows = [tiles[i:i + per_row] for i in range(0, len(tiles), per_row)]
    w = max(sum(t.width for t in r) + pad * (len(r) + 1) for r in rows)
    h = sum(max(t.height for t in r) for r in rows) + pad * (len(rows) + 1)
    panel = Image.new("RGB", (w, h), "white")
    y = pad
    for r in rows:
        x = pad
        rh = max(t.height for t in r)
        for t in r:
            panel.paste(t, (x, y + (rh - t.height) // 2))
            x += t.width + pad
        y += rh + pad
    buf = io.BytesIO()
    panel.save(buf, format="PNG")
    return buf.getvalue()


def sheet_png(item, scale):
    """Full labelled reference sheet, scaled. Returns PNG bytes."""
    im = Image.open(item["sheet"]).convert("RGB")
    if scale != 1.0:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def image_block(png_bytes):
    return {"type": "image",
            "source": {"type": "base64", "media_type": "image/png",
                       "data": base64.b64encode(png_bytes).decode()}}


# ---------------------------------------------------------------------------
# Trial construction
# ---------------------------------------------------------------------------

def shuffled_orders(items, seed):
    """Per-category shuffled orders. One rng shuffles the sorted category
    pools in sorted-category sequence - byte-identical to what
    stratified_pick has always done, so existing picks are unchanged."""
    rng = random.Random(seed)
    by_cat = {}
    for it in items:
        by_cat.setdefault(it["category"], []).append(it)
    orders = {}
    for c in sorted(by_cat):
        pool = sorted(by_cat[c], key=lambda it: it["id"])
        rng.shuffle(pool)
        orders[c] = pool
    return orders


def stratified_pick(items, count, seed):
    """Pick `count` items spread proportionally over the n/o/s categories,
    deterministically for a given seed. Quotas grow monotonically with
    `count`, so picks for a smaller count nest inside those for a larger."""
    orders = shuffled_orders(items, seed)
    cats = sorted(orders)
    total = len(items)
    quota = {c: round(count * len(orders[c]) / total) for c in cats}
    while sum(quota.values()) > count:
        quota[max(cats, key=lambda c: quota[c])] -= 1
    while sum(quota.values()) < count:
        quota[min(cats, key=lambda c: quota[c])] += 1
    picked = []
    for c in cats:
        picked.extend(orders[c][:quota[c]])
    return sorted(picked, key=lambda it: it["id"])


def build_test_and_ref_sets(n_test, n_refs, seed, test_category=None,
                            ref_category=None, exclude_items=None,
                            test_items=None, ref_items=None):
    """Fixed, disjoint test set and reference set.

    The test set is identical across conditions (paired design); the reference
    set is drawn from the remaining items so a test item never appears as a
    reference, and is fixed for every trial within a condition.

    With `test_category`, the test set is the first `n_test` of that
    category's shuffled order over the full item list - a superset of the
    mixed test set's items of that category (same seed), so paired
    comparisons against mixed-set conditions stay possible. With
    `ref_category`, references come only from that category (always
    excluding the test set).

    `exclude_items` (a list of item ids) keeps those items out of the TEST
    set only - used for replication runs on a fresh, non-overlapping item
    draw. Excluded items may still serve as references (they are valid
    labelled sheets).

    `test_items` / `ref_items` (lists of item ids) override the seeded
    derivation entirely with explicit sets - used to cross item sets and
    reference sets from different draws. They must be disjoint: a labelled
    reference sheet of an item that is also the unlabelled test pair would
    give the answer away.
    """
    all_items = list_items()
    if test_items or ref_items:
        by_id = {it["id"]: it for it in all_items}
        unknown = [i for i in (test_items or []) + (ref_items or [])
                   if i not in by_id]
        if unknown:
            raise ValueError(f"unknown item ids: {unknown}")
        leak = set(test_items or []) & set(ref_items or [])
        if leak:
            raise ValueError(f"items in both test and refs: {sorted(leak)}")
        if not test_items:
            raise ValueError("ref_items requires explicit test_items")
        test = sorted((by_id[i] for i in test_items), key=lambda it: it["id"])
        refs = sorted((by_id[i] for i in ref_items or []),
                      key=lambda it: it["id"])
        return test, refs
    excluded = set(exclude_items or [])
    items = [it for it in all_items if it["id"] not in excluded]
    if test_category:
        order = shuffled_orders(items, seed)[test_category]
        if n_test > len(order):
            raise ValueError(f"n_test={n_test} > {len(order)} items in "
                             f"category {test_category}")
        test = sorted(order[:n_test], key=lambda it: it["id"])
    else:
        test = stratified_pick(items, n_test, seed)
    test_ids = {it["id"] for it in test}
    pool = [it for it in all_items if it["id"] not in test_ids]
    if not n_refs:
        return test, []
    if ref_category:
        ref_order = shuffled_orders(pool, seed + 1)[ref_category]
        if n_refs > len(ref_order):
            raise ValueError(f"n_refs={n_refs} > {len(ref_order)} remaining "
                             f"items in category {ref_category}")
        refs = sorted(ref_order[:n_refs], key=lambda it: it["id"])
    else:
        refs = stratified_pick(pool, n_refs, seed + 1)
    return test, refs


def good_is_a_map(test_items):
    """Exactly balanced, fixed across conditions: alternate over the sorted set."""
    return {it["id"]: (i % 2 == 0) for i, it in enumerate(sorted(
        test_items, key=lambda it: it["id"]))}


STYLE_GUIDE_TEXT = """\
Target style, in words (colours are out of scope here; renders are greyscale):
- Toy-like and iconic: chunky, slightly caricatured - not thin or spindly, but
  not overshot into too primitive either.
- Clean deliberate facets, chamfered edges - rounded-soft, not noisy.
- Few details, except for organic objects.
- Flat-piece construction. Max 16 flat pieces per full circle equivalent,
  typically 8-12.
- Avoid outlines unless they are a distinctive core feature of the object.
- Objects with brown/timber materials usually show visible planks/trunks and
  don't look too smoothed or polished."""

SYSTEM_PROMPT = """\
You are a 3D art style reviewer for a low-poly game asset catalog. You judge \
whether a model matches the catalog's target style. Answer strictly in the \
requested JSON format, nothing else."""


def build_trial_message(item, refs, cfg, good_is_a):
    """Assemble the content blocks for one trial. Returns (content, meta)."""
    scale = cfg.get("scale", 1.0)
    angles = cfg.get("angles", [0, 2, 4, 6])
    content = []
    intro = ["Task: two 3D models of the same kind of object follow below. "
             "One matches our catalog's target style, the other deviates from it. "
             "Decide which one matches."]
    if cfg.get("style_guide"):
        intro.append(STYLE_GUIDE_TEXT)
    if refs:
        intro.append(
            f"First, {len(refs)} labelled reference sheets. On each sheet the top "
            "block (AFWIJKENDE STIJL) shows a model that deviates from the target "
            "style and the bottom block (GOEDE STIJL) shows a model in the target "
            "style, each from several angles.")
    content.append({"type": "text", "text": "\n\n".join(intro)})
    for i, ref in enumerate(refs, 1):
        content.append({"type": "text", "text": f"Reference sheet {i}:"})
        content.append(image_block(sheet_png(ref, scale)))
    a_kind, b_kind = ("g", "b") if good_is_a else ("b", "g")
    content.append({"type": "text", "text":
                    "Now the test case. Model A, shown from "
                    f"{len(angles)} angle(s):"})
    content.append(image_block(compose_panel(item["id"], a_kind, angles, scale)))
    content.append({"type": "text", "text": f"Model B, shown from {len(angles)} angle(s):"})
    content.append(image_block(compose_panel(item["id"], b_kind, angles, scale)))
    content.append({"type": "text", "text":
                    'Which model matches the target style? Reply with exactly one '
                    'JSON object and nothing else: {"choice": "A" or "B"}'})
    meta = {"angles": angles, "scale": scale, "n_refs": len(refs),
            "ref_ids": [r["id"] for r in refs]}
    return content, meta


def parse_answer(text):
    """Extract {"choice": ..., "confidence": ...} from the model's reply."""
    if not text:
        return None
    for m in re.finditer(r"\{[^{}]*\}", text, re.S):
        try:
            d = json.loads(m.group(0))
        except json.JSONDecodeError:
            continue
        ch = str(d.get("choice", "")).strip().upper()
        if ch in ("A", "B"):
            conf = d.get("confidence")
            try:
                conf = float(conf)
            except (TypeError, ValueError):
                conf = None
            return {"choice": ch, "confidence": conf}
    m = re.search(r"\b([AB])\b", text.strip().upper())
    if m:
        return {"choice": m.group(1), "confidence": None}
    return None


# Bumped when the trial prompt wording changes, so results produced under
# different prompts never silently mix under one condition fingerprint.
# v2: dropped the confidence field from the answer format.
PROMPT_VERSION = 2


def condition_key(cfg):
    """Stable short fingerprint of everything that defines a condition."""
    keys = {k: cfg[k] for k in sorted(cfg) if k != "id"}
    keys["_prompt_version"] = PROMPT_VERSION
    return hashlib.sha1(json.dumps(keys, sort_keys=True).encode()).hexdigest()[:10]
