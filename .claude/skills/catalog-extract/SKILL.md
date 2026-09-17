---
name: catalog-extract
description: Work through a catalogue extract — the JSON the browser stages with tag edits, colour marks and free-text notes per model. Covers reading a mark, finding the part it means, moving part of a band, and getting verdicts back. Use when handed a taalei-extract-*.json, or asked to fix marked colours, wrong bands or notes on models already in the catalogue.
---

# Working through a catalogue extract

`docs/asset_style_guide.md` decides materials, colours and sizes. Read it
before deciding anything. This skill is about finding the geometry a mark
refers to, which the bible does not cover.

`CLAUDE.md` binds every step: never look at earlier commits or PRs, and never
leave assumptions or commentary in a code file.

## 1. A band is not a part

This is the whole job. A mark names a band; a note names a part. One band
spans unrelated parts — a drum's chestnut is the barrel *and* the stand, a
shield's camel is the long bands *and* the pegs *and* the plank cut faces.

So the order is always: **find the part, then choose the band.** Never move a
whole band because the mark names it. Check what else that band carries first.

A whole-band move is only safe once you have seen that the band carries
nothing that should keep its colour.

## 2. Read the extract

- `tags` — `add`/`remove` per tag, applied to `catalog/tags.json`.
- `colours` — per model, keyed by the hex the panel shows: `wrong`, `partial`,
  `add`. `partial` means part of that band is wrong, so it can never be a
  whole-band move.
- `comments` — one note per model. These carry the real instruction; the marks
  only say where to look.
- `views` — per commented model, the angle the panel was showing when the note
  was written, taken from the last camera the reader drove rather than wherever
  the panel's auto-rotate had spun to. `view` and `fov` go straight to
  `render.mjs --views` and `--fov`. Render a note's own view before reading the
  note: it is the angle the problem was visible from, and iso often hides it.

  `zoom` is against the framing the panel chose, so above about 1.3 the note is
  about a detail rather than the whole model. It is not `--fit`: the panel
  frames the bounding sphere and render.mjs frames the silhouette, and the gap
  between the two depends on the model and the angle — on a snowman seen from
  above it is nearly a third. Set `--fit` by eye from the first render.

Notes are terse and often typo'd. `iso` is "in plaats van" — *instead of*.
Map the hexes to band names from the lane table in `lint/materials.json`.

## 3. Find the part

    node tools/renders/render.mjs <dir> --out <out> --band <col,row> --views iso,back --sheet --sheet-only

Keeps one cell coloured and greys every other. This is the fastest way to see
what a band actually covers. Do it for every marked band before deciding
anything.

    node tools/importeer/reband.mjs <kit>/<model> --list

Numbers the shells with their bands, vertices and extents. A shell is one
connected run of triangles. Flat shading splits vertices, so a part is usually
dozens of shells, not one — group them by extent, position or a size
signature rather than expecting one shell per part.

Coordinates in `--list` are the primitive's own, before the node transform, so
they are unscaled and do not match what you see on screen. Compare them to
each other, not to the catalogue's measurements.

Parts can also live in their own mesh node. Check before assuming a model is
one mesh:

    node -e 'import("./catalog/tools/glb.mjs").then(({readGlb})=>{
      const g=readGlb("kits/workfiles/<kit>/<model>.glb");
      console.log(g.json.meshes.map(m=>m.name));})'

## 4. Move it

    reband.mjs <kit>/<model> <from>:<to> [--shells a,b] [--mesh name] [--y a:b] [--at 0..1]

- `--shells` when the part is whole shells. Always safe.
- `--mesh` when the part is its own node.
- `--x --y --z` per-vertex ranges. Only where the boundary falls between
  faces, never through one.
- `--at` sets the place within the cell instead of keeping it, for parts that
  read as several shades of one band.

The tool refuses a move that would leave a triangle spanning two atlas cells —
it would sample the unfilled space between them and render black. No
catalogue model has one, so that error means the range cut through a face.
Use shells instead.

## 5. When the mark says "wrong colour", check the source

The import may have collapsed two source colours into one, or it may be
faithful and the source itself reads badly. Those need opposite fixes, so
find out which. Unzip the pack from `kits/sources/`, then:

    node tools/importeer/bronkleur.mjs <kit>/<model> <source .gltf or .glb>

Per shell: the band it carries now, the colour it carried in the source, and
the band nearest that colour. A source colour far from every band — the cherry
filling is 72 away from the closest — is one the palette cannot hold, so the
import had to round it somewhere.

`P11`–`P14` in the bible: a pack's source colours have to survive the import.
Two source colours collapsed onto one band is a bug, not a style choice.

## 6. Ask with a picture

When a note names a part in a few words, do not guess and do not offer a
multiple-choice of colours. Paint the candidates and ask which group is meant:

    node tools/renders/render.mjs <file>.glb --out <out> --views back \
      --mark 12,13,14 --mark 40,41 --sheet --sheet-only

Each `--mark` group takes its own loud colour. Shell numbers are the ones
`reband --list` prints, the original file is untouched, and the marked copy is
cleaned up on exit. This costs two minutes and settles in one round what
guessing does not settle in three.

Do not ask at all when the bible already decides — `B40` gives a wrapped grip
taupe, `M33` gives bells copper.

## 7. Small batches, then verdicts

Work ten or so models, push, and ask for a fresh extract with a verdict per
model. Judging forty at once buries a wrong assumption under thirty more.

When something fails, the cause is almost always the part, not the colour.

## 8. Tags follow the geometry

After a recolour, run the lints and let them name the tag changes:

    node lint/palette.mjs        # a material whose band left the model
    node lint/mat.mjs            # a kind that demands a subtype

A tag an extract adds can leave a finding with no geometry to satisfy it — a
`rope` tag on a bag with no tie is a modelling request, not a recolour.
Report it rather than bending the band.

Widening a palette in `lint/materials.json` is catalogue-wide. Count what else
it clears before proposing it, and say so.

## 9. Check before pushing

    node catalog/tools/build-catalog.mjs
    node catalog/tools/build-missing.mjs
    node catalog/tools/build-thumbs.mjs --jobs 3
    node lint/size.mjs && node lint/measures.mjs && node lint/mat.mjs
    node lint/palette.mjs && node lint/bands.mjs

Compare every count against the branch point, not against zero — the
catalogue carries findings that are not yours. Then render the changed models
and look, and put at least one beside catalogue siblings at locked scale:

    node tools/renders/render.mjs <dir> --out <out> --views iso --lock-scale --sheet --sheet-only

Reverting a model to as-shipped is better than leaving it half-targeted.

## Gotchas

- `reband` keeps the place within the cell, so moving a band does not level
  the shade. Two parts on one band still read as two colours. `--at` is what
  levels them.
- Magenta in a render is geometry, not UVs: coincident coplanar faces
  z-fighting, or a backface. Confirm with `--modes faceorient`. Moving UVs
  will not fix it.
- `#ffffff` is not a band. `kits/colormap.png` has no white cell; the white in
  the palette panel comes from untextured material base colours. A mark on it
  cannot be honoured as a reband — ask what was meant.
- `grad` is recorded per model but no rule reads it, so nothing stops a
  flattening that removes a model's baked shading. Decide it by eye.
- A view angle matters. `--views 205/45` — from behind, off to one side and
  looking down — shows horizontal beams and top faces that iso and front both
  hide.
