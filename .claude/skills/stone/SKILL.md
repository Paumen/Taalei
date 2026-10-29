---
name: stone
description: Give each brick or stone of masonry catalogue models its own tone, so walls, floors, pillars and paths read as separate stones. Use when asked to tone, recolour or vary bricks, stones, blocks, cobbles or flagstones.
---

# Stone tones

`node tools/import/stone-tone.mjs <workfile.glb>` (see `--help`). It finds the
stones itself; there are no specs. Work on a scratch copy with the workfile's
own name, since tones are seeded by file name.

1. Red brick in `terracotta`: add `--band terracotta:taupe`.
2. Check the stone map with `--debug`: one colour per stone, none across two.
3. Tone, render albedo at 600 px or more next to the original, and check for
   stones that look skipped, merged or split.
4. Copy into `kits/workfiles`, run `node lint/golden.mjs` and
   `node lint/glb-lint.mjs <file> --only-problems`.
5. End with a review (`.claude/skills/review`).
