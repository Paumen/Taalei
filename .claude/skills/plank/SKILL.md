---
name: plank
description: Give each board or log of wooden catalogue models its own tone, so planks read as separate pieces of wood. Use when asked to tone, recolour or vary planks, boards or logs, or when wood on a model looks like one flat slab.
---

# Plank tones

`node tools/import/plank-tone.mjs <workfile.glb>` (see `--help`). Work on a
scratch copy, render it, and copy it into `kits/workfiles` only once it
passes the self-check. Tones are seeded by file name, so give the scratch
copy the workfile's own name.

## 1. Pick models

- Only models with wood in the tan, camel or chestnut band whose planks,
  boards, panels or logs can be told apart by eye, however the mesh is
  built.
- A model with no boards in its mesh (a plain slab door, a box cabinet) gets
  its parts toned instead: each door leaf, each drawer front, each leg.
- Batch similar models (signs, walls, houses, props) so one method fits.

## 2. Board map first

Before any tone, write the boards in bright colours and look:
`plank-tone.mjs <file> --debug` (add `--spec` once there is one). Every
board must be one colour, and no colour may run over two boards. Fix the
map until it is right; only then tone.

## 3. Tone

Default: `plank-tone.mjs <file>`. When its board map is wrong, map the
boards by hand (below). Tones are shuffled at random. Never pick or change a
tone because of the boards next to it.

Flags for the default run:

- Sibling boards in mixed bands: put them in one band. Use
  `--band <from>:<to>` when the boards are told apart by shape, and
  `--band-after <from>:<to>` when they are told apart only by their band.
  Pillars against planks, or upright against flat boards, may keep their
  own bands. End grain on post tops and board ends keeps its lighter band:
  tone only the boards' band with `--only`.
- A board built from several strips, or a curved board, gets cut face by
  face: use `--whole` when each piece is one board.
- Staves of a round piece built as one: `--facets` with `--flat` just
  under the angle between staves.
- Staircase built as one piece: `--steps --flat 8`.
- Boards cut in two by a door, window or post: `--join`.

### Boards by hand

1. Measure. `plank-tone.mjs <file> --pieces x` (or `y`, `z`) lists each
   piece per band with its bounds and the vertex coordinates on that axis.
   Board seams are where coordinates cluster or repeat at a steady step
   (logs every 0.0525 up, stakes every 0.1165 across). Render clay+wire
   to see which pieces are boards, battens, posts or trim.
2. Write a spec, one per model, in the scratchpad:

   ```js
   const SEAMS = [-0.124, -0.039, 0.047, 0.132];
   export const cut = ({ band, comp }) => band === 'chestnut' && comp === 1 ? SEAMS.map((x) => [[1, 0, 0], x]) : [];
   export default ({ c, band, comp }) => {
     if (band !== 'chestnut') return null;
     if (comp === 1) return `board${SEAMS.filter((x) => c[0] > x).length}`;
     return comp === 4 || comp === 6 ? `batten${comp}` : null;
   };
   export const axis = { batten4: [1, 0, 0], batten6: [1, 0, 0] };
   ```

   - `default` names the board of each wood triangle from its centre `c`,
     normal `n`, `band`, piece number `comp`, `area` and old lightness
     `light`; `null` leaves it as it is. One key across a door or window
     keeps both halves in one tone.
   - `cut` splits triangles along seam planes first. Use it whenever
     boards are fused into one piece or one triangle spans two boards; no
     recolour can part them otherwise. Cut every face of the piece, not just
     the front, so no seam is left open.
   - `axis` sets a board's length, or `[length, width]`. Set the width
     whenever a board is deeper than it is wide (logs in a wall, thick
     planks): the tool otherwise takes the depth for the width and the face
     comes out flat.
   - `band` moves single boards into another wood band (one roof of mixed
     slats into one band, without touching the frame).
   - `detail` keeps light carved details (chips, cuts): `{ from, min, band }`.
     A kept detail must still stand out against its board's new tone, not
     just keep its old value; when the band's light end no longer contrasts,
     move it to a lighter band.
3. Run `plank-tone.mjs <file> --spec <spec.mjs> --debug`, check the map,
   then the same without `--debug`. Always start from a fresh copy: the cut
   runs on every run.

Boards that look skipped or smudged are almost always boards fused into
one or one board cut in two, not the tones. Check the board map.

## 4. Self-check, every time, before the review

Render every model in albedo mode, at least 600 px, front, back and both
isos, next to its original. Look at each board and fix these before showing
anything:

- **Skipped boards:** a board with the same tone as before, or whole runs
  of boards in one tone. Usual causes: boards fused into one piece, or
  tones capped at the light or dark end of the band.
- **Flat boards:** a board in one shade with no gradient; usually its width
  axis runs into the depth.
- **Streaks:** stripes along a board instead of one tone per board.
- **Blended faces:** a board's top and side in one shade, so its edge is
  lost.
- **Split boards:** one board with two tones, cut diagonally, by a door or
  window, or face by face (top, sides, ends).
- **Mixed bands:** boards of one wall or floor in different wood bands.
- **Wrong parts:** roofs, plaster, metal or trims recoloured.
- **Lost details:** chips, knots or cuts that faded into the new tone.

Run `node lint/golden.mjs` and
`node lint/glb-lint.mjs <dir> --only-problems` on the changed files. Cuts add
triangles: check `node lint/tpu.mjs` after `build-catalog.mjs`.

## 5. Review

End with a review (`.claude/skills/review`). Put models with no boards,
band moves and kept details in as high doubt. Retries go back through 2 to 4.
