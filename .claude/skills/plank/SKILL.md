---
name: plank
description: Give each board or log of wooden catalogue models its own tone, so planks read as separate pieces of wood. Use when asked to tone, recolour or vary planks, boards or logs, or when wood on a model looks like one flat slab.
---

# Plank tones

`node tools/import/plank-tone.mjs <workfile.glb>` (see `--help`). Work on a
scratch copy, render it, and copy it into `kits/workfiles` only once it
passes the self-check.

## 1. Pick models

- Only models with wood in the tan, camel or chestnut band whose planks,
  boards, panels or logs can be told apart by eye, however the mesh is
  built.
- Batch similar models (signs, walls, houses, props) so one method fits.

## 2. Tone

- Default: `plank-tone.mjs <file>`.
- Tones are shuffled at random. Never pick or change a tone because of
  the boards next to it.
- Sibling boards in mixed bands: put them in one band. Use
  `--band <from>:<to>` when the boards are told apart by shape, and
  `--band-after <from>:<to>` when they are told apart only by their band.
  Move single boards by hand after toning.
  Pillars against planks, or upright against flat boards, may keep their
  own bands. End grain on post tops and board ends keeps its lighter band:
  tone only the boards' band with `--only`.
- A board built from several strips, or a curved board, gets cut face by
  face: use `--whole` when each piece is one board.
- Staves of a round piece built as one: `--facets` with `--flat` just
  under the angle between staves.
- Staircase built as one piece: `--steps --flat 8`.
- Boards cut in two by a door, window or post: `--join`.
- Boards that look skipped or smudged are almost always boards fused into
  one or one board cut in two, not the tones. Check the board map first:
  copy the tool, write each board in its own bright colormap cell instead
  of its tone, and render it.

## 3. Self-check, every time, before the review

Render every model in albedo mode, at least 600 px, front and back, next to
its original. Look at each board and fix these before showing anything:

- **Skipped boards:** a board with the same tone as before, or whole runs
  of boards in one tone. Usual causes: boards fused into one piece, or
  tones capped at the light or dark end of the band.
- **Streaks:** stripes along a board instead of one tone per board.
- **Blended faces:** a board's top and side in one shade, so its edge is
  lost.
- **Split boards:** one board with two tones, cut diagonally, by a door or
  window, or face by face (top, sides, ends).
- **Mixed bands:** boards of one wall or floor in different wood bands.
- **Wrong parts:** roofs, plaster, metal or trims recoloured.

Run `node lint/golden.mjs` and
`node lint/glb-lint.mjs <dir> --only-problems` on the changed files.

## 4. Review

End with a review (`.claude/skills/review`). Retries go back through 2 and 3.
