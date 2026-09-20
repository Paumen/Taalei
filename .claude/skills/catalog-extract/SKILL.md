---
name: catalog-extract
description: Read a catalogue extract — the JSON the browser stages with tag edits, colour marks and free-text notes per model. Covers reading a mark, finding the part of the geometry it means, applying the tag edits, and reporting back what a colour mark would take. Use when handed a taalei-extract-*.json, or asked what a marked colour, wrong band or note on a catalogue model refers to.
---

# Working through a catalogue extract

`docs/asset_style_guide.md` decides materials, colours and sizes. Read it
before deciding anything. This skill is about finding the geometry a mark
refers to, which the bible does not cover.

`CLAUDE.md` binds every step: never look at earlier commits or PRs, and never
leave assumptions or commentary in a code file.

A tag edit is applied. A colour mark is diagnosed and reported: nothing in the
repo rewrites a workfile's bands, so a model whose colour is wrong is replaced
or dropped, and the report says which parts carry the marked band.

## 1. A band is not a part

This is the whole job. A mark names a band; a note names a part. One band
spans unrelated parts — a drum's chestnut is the barrel *and* the stand, a
shield's camel is the long bands *and* the pegs *and* the plank cut faces.

So the order is always: **find the part, then talk about the band.** Never
describe a band as if it were one part. Check what else that band carries
first.

## 2. Read the extract

- `tags` — `add`/`remove` per tag, applied to `catalog/data/tags.json`.
- `colours` — per model, keyed by the hex the panel shows: `wrong`, `partial`,
  `add`. `partial` means part of that band is wrong, so the band as a whole is
  never the answer.
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

    node tools/renders/render.mjs <file>.glb --out <out> --isolate --parts 8 --sheet-only

One tile per part, each fitted to its own bounds, so a model that names no
parts is split by welding its shells on shared vertex positions. Add
`--lock-scale` to keep the tiles size-comparable.

Parts can also live in their own mesh node. Check before assuming a model is
one mesh:

    node -e 'import("./catalog/tools/glb.mjs").then(({readGlb})=>{
      const g=readGlb("kits/workfiles/<kit>/<model>.glb");
      console.log(g.json.meshes.map(m=>m.name));})'

## 4. Report what the mark costs

Say which parts carry the marked band and which of them should keep their
colour. A band that carries only the marked part is a clean swap; a band that
also carries something that reads correctly cannot move as a whole, and the
model is a replace-or-drop, not a recolour.

`P11`–`P14` in the bible: a pack's source colours have to survive the import.
Two source colours on one band is a bug, not a style choice, so say so rather
than proposing a band that hides it.

## 5. Ask with a picture

When a note names a part in a few words, do not guess and do not offer a
multiple-choice of colours. Render the band and the view the note was written
from, and ask which group is meant. This costs two minutes and settles in one
round what guessing does not settle in three.

Do not ask at all when the bible already decides — `B40` gives a wrapped grip
taupe, `M33` gives bells copper.

## 6. Small batches, then verdicts

Work ten or so models, push, and ask for a fresh extract with a verdict per
model. Judging forty at once buries a wrong assumption under thirty more.

When something fails, the cause is almost always the part, not the colour.

## 7. Tags follow the geometry

After a tag edit, run the lints and let them name what no longer fits:

    node lint/palette.mjs        # a material whose band is not on the model
    node lint/mat.mjs            # a kind that demands a subtype

A tag an extract adds can leave a finding with no geometry to satisfy it — a
`rope` tag on a bag with no tie is a modelling request. Report it rather than
bending the tag.

Widening a palette in `lint/materials.json` is catalogue-wide. Count what else
it clears before proposing it, and say so.

## 8. Check before pushing

    node catalog/tools/build-catalog.mjs
    node catalog/tools/build-lists.mjs
    node catalog/tools/build-thumbs.mjs --jobs 3
    node lint/size.mjs && node lint/measures.mjs && node lint/mat.mjs
    node lint/palette.mjs && node lint/bands.mjs

Compare every count against the branch point, not against zero — the
catalogue carries findings that are not yours. Then render the changed models
and look, and put at least one beside catalogue siblings at locked scale:

    node tools/renders/render.mjs <dir> --out <out> --views iso --lock-scale --sheet --sheet-only

## Gotchas

- Magenta in a render is geometry, not UVs: coincident coplanar faces
  z-fighting, or a backface. Confirm with `--modes faceorient`.
- `#ffffff` is not a band. `kits/colormap.png` has no white cell; the white in
  the palette panel comes from untextured material base colours. A mark on it
  cannot be read as a band — ask what was meant.
- `grad` is recorded per model but no rule reads it, so nothing stops a
  flattening that removes a model's baked shading. Judge it by eye.
- A view angle matters. `--views 205/45` — from behind, off to one side and
  looking down — shows horizontal beams and top faces that iso and front both
  hide.
