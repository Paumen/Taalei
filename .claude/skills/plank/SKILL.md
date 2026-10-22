---
name: plank
description: Give each board or log of wooden catalogue models its own tone, so planks read as separate pieces of wood. Use when asked to tone, recolour or vary planks, boards or logs, or when wood on a model looks like one flat slab.
---

# Plank tones

`node tools/import/plank-tone.mjs <workfile.glb>` (see `--help`). Work on a
scratch copy, render it, and copy it into `kits/workfiles` only once it
passes the self-check.

## 1. Pick models

- Only models with wood in the tan, camel or chestnut band, built as
  separate boards or logs. Skip smooth roofs, plaster and slabs with only
  drawn lines.
- Batch similar models (signs, walls, houses, props) so one method fits.

## 2. Tone

- Default: `plank-tone.mjs --across 0.3 --flat 8 --big 0.02 --join <file>`.
  The gradient across each board's width keeps boards apart even when two
  draw the same tone.
- Boards of one wall or floor in mixed bands: put them in one band first,
  with `--band <from>:<to>` for a whole band, or by moving only those
  boards.
- A board built from several strips gets cut into strips: use `--whole`
  when each piece is one board.
- Strong baked gradients drown the tones: lower `--gradient` (0.5).
- Tones stay random. No rule for neighbours.

## 3. Self-check, every time, before the review

Render every model in albedo mode, at least 600 px, front and back, next to
its original. Look at each board and fix these before showing anything:

- **Skipped boards:** a board with the same tone as before, or whole runs
  of boards in one tone. Usual causes: boards fused into one piece, or
  tones capped at the light or dark end of the band.
- **Streaks:** stripes along a board instead of one tone per board.
- **Split boards:** one board with two tones, cut diagonally, by a door or
  window, or face by face (top, sides, ends).
- **Mixed bands:** boards of one wall or floor in different wood bands.
- **Wrong parts:** roofs, plaster, metal or trims recoloured.

Run `node lint/golden.mjs` and
`node lint/glb-lint.mjs <dir> --only-problems` on the changed files.

## 4. Review

End with a review (`.claude/skills/review`). Retries go back through 2 and 3.
