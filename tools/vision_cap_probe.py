"""Measures the vision pipeline's long-edge cap by rendering probe images.

Text probes draw identical content at absolute pixel font sizes in images that
differ only in pixel dimensions; whichever row stops being legible fixes the
effective downscale factor. Shape probes cover tall, square and just-over-cap
aspect ratios. Answers are written separately so the reader can be graded
without seeing them first.

Result on this harness (2026-09): images are downscaled so the LONG edge is at
most 2000 px, aspect preserved, short edge scaled by the same factor. No
smaller megapixel budget applies below 4 MP (3000x3000 -> 2000x2000).
"""
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
SIZES = [10, 14, 20, 28, 40, 56, 80]
ALPHA = "ACEFHJKLMNPRTVWXY34679"


def code(rng, n=5):
    return "".join(rng.choice(ALPHA) for _ in range(n))


def probe(L, seed, path):
    W, H = L, L // 2
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    rng = random.Random(seed)
    d.rectangle([0, 0, W - 1, H - 1], outline="black", width=max(1, L // 500))
    d.text((L // 40, L // 60), f"LONG EDGE {L}px",
           font=ImageFont.truetype(FONT, max(24, L // 20)), fill="black")
    answers = []
    y = L // 8
    for s in SIZES:
        f = ImageFont.truetype(FONT, s)
        c = code(rng)
        d.text((L // 40, y), f"{s:>3}px", font=f, fill="#888888")
        d.text((L // 40 + 8 * s, y), c, font=f, fill="black")
        answers.append((s, c))
        y += int(s * 1.6) + L // 40
    img.save(path)
    return answers


def shape(w, h, path):
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline="black", width=3)
    d.text((10, 10), f"{w}x{h}",
           font=ImageFont.truetype(FONT, min(w, h) // 8), fill="black")
    img.save(path)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    os.makedirs(out, exist_ok=True)
    seed = int.from_bytes(os.urandom(2), "big")
    with open(os.path.join(out, "answers.txt"), "w") as fh:
        for L in (1000, 1600, 2400, 4000):
            fh.write(f"{L} {probe(L, seed + L, f'{out}/probe_{L}.png')}\n")
    for w, h in ((1000, 4000), (3000, 3000), (2001, 300)):
        shape(w, h, f"{out}/shape_{w}x{h}.png")
