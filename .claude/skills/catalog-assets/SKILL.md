---
name: catalog-assets
description: Add 3D assets to the Taalei catalogue — a whole source pack or a handful of models out of one. Covers source zips, kit slugs, the pack scale factor, recolouring onto the shared colormap, tags, variants, and the rebuilds. Use when asked to add, import or adopt models, kits or asset packs, or to fill gaps from the TBD tab.
---

# Adding assets to the catalogue

`docs/asset_style_guide.md` is the bible: it decides materials, colours, sizes
and variants. Read it before deciding anything; this skill only says in what
order to do the work and which tool does each part.

Two rules from `CLAUDE.md` bind every step: never look at earlier commits or
PRs, and never leave assumptions, rules or commentary as comments in a code
file — put them here, in the bible, or in the PR.

## 1. Is the source pack already in the repo?

`catalog/tools/bronkits.mjs` (`BRONKITS`) lists every adopted pack; the zips sit
in `kits/sources/<pack>/`. Present → step 3. Absent → step 2.

## 2. Add the source pack

Put the zip in `kits/sources/<pack>/` and add a `BRONKITS` row: `map` (the
folder), `naam` (human name), `kit` (slug, `null` until adopted), `formaat`
(`glb`, `gltf`, `obj`, `fbx`), plus `extraFormaten`, `submap`, `alleMappen` or
`splitsPerMesh` where the pack needs them.

    node catalog/tools/build-lists.mjs

Then open the TBD tab (`catalog/tbd.html`) and look. The previews
colour themselves from the source texture, or from an average when the material
carries no map — half-blank, black or grey models mean the pack's materials did
not resolve. Fix that first, by hand colours in `catalog/preview-colors.json`
keyed by pack and then by material or texture name. An import built on previews
you have not looked at goes wrong quietly.

## 3. Read the source before writing the spec

Two probes, both cheap, both worth doing before a single line of the import
spec. They decide the scale, the kinds, the band mapping and the variants.

**Measure every model.**

    node tools/importeer/inspect-source.mjs <pack|kit> [model…] [--raster 8x4]

Triangle count, extents at the pack's factor, primitives, and — for an atlas
pack — the source cells with a triangle count and sampled colour each. The
counts are what matter: they say which cell is the body and which is a
two-triangle detail you can fold away. A name that does not resolve prints
`MISSING`, so run it against the exact list you were asked for before anything
else: it tells you how many models the list really holds rather than how many
you thought it held.

**Read the kit's own answer.**

    node tools/importeer/learn-bands.mjs <pack|kit> [model…] [--raster 8x4]

For a kit that already holds models from this pack, this prints what its
adopted workfiles did with each source cell or colour. Start from that rather
than from a sampled colour or an older spec file. `--per-model` gives one line
per model, which is how you find the sibling closest to what you are importing.
`docs/pack_notes.md` holds what the tables do not say.

**Look at what each cell is.** Sampled colour alone is misleading, because each
atlas cell is a gradient and one cell often serves several parts. Instead build
a debug atlas: copy the source texture, paint every used cell a distinct
saturated colour and darken the rest, write it beside a copy of the source
`.glb`s under the source texture's file name — the pack's glTF references it by
URI, so it is picked up — and render:

    node tools/renders/render.mjs <dir>/*.glb --out <out> --views iso --modes albedo --sheet --sheet-only

One sheet then names every part. Expect surprises that no colour sample gives
you: the light grey cell is plaster walls rather than steel, another grey is the
window recesses, a third is the rock face of the mine, an orange-brown is sawn
logs. Guessing here is what makes an import need redoing.

## 4. Does the kit already exist?

`kits/workfiles/<slug>/` holds the adopted models of a kit. Exists → step 6.

## 5. New kit

Slug by artist: `ken-` (Kenney), `kay-` (KayKit), `isa-` (Isa),
`quat-` (Quaternius); anything else takes the kit's own word. Two words at
most: `kay-food`, `ken-holiday`, `quat-medieval`. Add the kit's row to
`catalog/manifest.js` (slug, name, url, note, licence label) with an empty
`"models": []` — `zetManifest` fills the list but will not create the row.

## 6. Scale factor

One factor for the whole pack, as the bible's process rules say. The target factors live in
`tools/importeer/scale-factors.mjs` (`SCALE_TARGETS`, plus the `ken-` and
`kay-` defaults), which `tools/importeer/schaal.mjs` reads — use the pack's
factor from there, and keep it in step with that table rather than copying a
number that was right last month. The table is alphabetical; keep it so.

An import spec does not carry a factor of its own: every importer sets
`pakket.schaal = scaleTarget(pakket.kit)` in its driver, so re-running one bakes
the table's current number and `scale-check` stays true. A kit with no row in
that table throws; add the row rather than hardcoding a number in the spec.

`node tools/importeer/scale-check.mjs [kit…]` compares each workfile against
the model it was imported from and reports the ones that are not the source
size times the pack's factor. It reads the source model from
`asset.extras.taaleiland.bronmodel`, which every import spec sets;
`node tools/importeer/source-link.mjs [kit…] [--report]` fills that field in
for a workfile that lacks it, matching on name and on the shape of the mesh.

For a pack with no factor yet, start from the pack the same artist already has
adopted in the same idiom — a second KayKit hex-strategy pack takes the first
one's factor — and confirm it by comparison, not by arithmetic:

    node tools/renders/render.mjs <dir> --out <out> --views iso --sheet --sheet-only --lock-scale

`--lock-scale` is what makes the sizes comparable. A pack built around a tile
unit gives two defensible anchors, its buildings and its wall pieces; the
sibling pack settles which. Check the result with `node lint/size.mjs` for the
kinds involved before settling.

## 7. Recolour onto the shared colormap

Every asset colours itself from `kits/colormap.png`: 16 × 4 cells, one
band per cell, each band a vertical gradient. Baked shading is kept — the
spread across the gradient carries over, it is not flattened to one colour;
`node lint/measures.mjs` flags a model with no spread.

`tools/importeer/aanvullen.mjs` is the working example and handles both source
shapes:

- **Atlas source** (KayKit, Kenney, Tiny Treats): the source texture is itself
  a band grid. Map each source cell to a target band cell and keep the
  within-cell fraction, inset by half a texel. Derive the source grid from the
  pack's own UVs — KayKit is 8 × 4, Kenney 16 × 4.
- **Flat-colour source** (Quaternius OBJ and most FBX): one colour per
  material. Smooth the normals, put `u` at the band centre, and set `v` to the
  band position whose colormap luminance matches the source colour, shaded
  along normal Y.

The mapping is per model, so one source cell may land on different bands in
different models — a grey that is stone on a wall is a steel hoop on a barrel.
Use that instead of forcing one global answer.

When the kit already holds models from this pack, take the band mapping from
them with `learn-bands.mjs`: recolour each source colour or cell the way its
siblings were recoloured, so a new crate lands on the crate's band.
A name you give a workfile that matches a *different* source model marks that
source model adopted while it is still TBD, so check new names against the
pack's own names; `build-lists.mjs` warns when one slips through. The bible's colour section and
`node lint/palette.mjs` and `node lint/bands.mjs` decide the rest.
Geometry is scaled by the pack factor, grounded at Y = 0, pivoted on the
footprint centre, welded, and written as one draw call. `ontdubbel()` drops
coincident duplicate faces first, which some packs ship on every face and which
otherwise z-fight; `node lint/measures.mjs`
checks all three.

### What the palettes will and will not take

Read `lint/materials.json` and `lint/kinds.json` before choosing, not after
`palette.mjs` complains:

- Most materials force the band: `wood-planks` is tan, `wood-beam` chestnut,
  `metal-iron-steel` nickel, `metal-iron-cast` slate, `metal-gold` amber. Pick
  the material by the band you want, not the other way round.
- `azure` is admitted only by `liquid`, `gemstone` and bare `metal`. A blue
  cloth or a blue roof has no legal home.
- `str` sets `mat.metal-iron: metal-iron-cast`, so iron on any structure is
  cast and slate, never steel. `obj-container-*` sets `mat.metal: metal-iron`,
  so hoops and bands on a barrel, bucket or crate take an iron subtype rather
  than bare `metal`.
- A material with no `bands` of its own (`foliage`, `food`, `vegetation`,
  `emissive`, bare `metal`) is unconstrained by §5.1.
- The §5.1 check is coverage-based: it passes when at least one of the model's
  bands is in the material's list. That is weak enough to let a wrong band
  through, so do not lean on it as proof.

Where one source colour sits on many models and no palette admits it — a
faction colour across a pack's blue, green, red and yellow sets is the usual
case — settle it with the PO before writing the spec. Dropping it to a band the
palette does take (the roof tile and cloth the artist's other adopted pack
uses) is the answer that keeps the kit beside its siblings.

### Band budget

Work it out from the cell counts while writing the spec. `lint/measures.json`
caps bands at `nmat × 2` (G11), at 5 for most models and 6 for `size:l` (G13,
G15), and size is measured on the longest extent against `lint/variables.json`
(`s` ≤ 0.5, `m` ≤ 1.5, `l` above). A big building routinely uses eight or nine
source cells and has to come down to six bands: fold the smallest-count cells
into a band the model already carries. `tag:plural` and `kind:assy` are exempt.

### Moving a model already in the catalogue

A model on the wrong band is moved, not re-imported:
`node tools/importeer/reband.mjs <kit>/<model> <from>:<to>` shifts
every vertex of one band onto another and keeps its place within the cell.
Rebuild the catalogue and the kit's thumbs afterwards.

A model that kept the place it held in the scene it was exported from is moved
back onto the origin: `node tools/importeer/reorigin.mjs <kit>/<model>` puts its
lowest vertex on y=0 and its footprint centre on x=0, z=0. It leaves the mesh
alone, so a part whose origin is its joint — a rotor on its axle, a gate on its
hinge — is not a case for it.

A model facing a different way from the rest of its kind is turned:
`node tools/importeer/reorient.mjs <kit>/<model> <turns>`, where `<turns>` is
one or more axis-angle steps around the world axes, comma separated and applied
left to right: `x90`, `y-90`, `z180`, `x90,y90`. The thumbnail camera is the
same for every model, so the turn is the only way to line a model up with its
kind. It puts the model back where it stood afterwards. Rebuild the catalogue,
the lists and the kit's thumbs, since the turn changes `wdh`.

A model with more than one draw call is folded only where the extra primitives
sit in the same mesh on one material: `node tools/importeer/merge-prims.mjs
<kit>/<model>`. A part on its own node (a wheel, a paddle, a gate, a blade of a
pair of scissors) stays apart, so it can still be animated later.

## 8. Tags

Set in `catalog/tags.json`, per model, as `<kit>/<name>`:

- **kind** — mandatory, exactly one, the deepest leaf that fits. Resolve
  the noun against the Appendix glossary; add a noun to a leaf when it clearly
  belongs there. `assy` is a kind, not a tag: several distinct things in one
  model.
- **material** — what it is made of; the subtype, never the parent on top.
- **use** — zero or more of the eight `use:` tags.
- **theme** — only when obvious. Existing sets: `pirate`, `halloween`,
  `robin-hood`, `asia`, `grave`, `sailing`. A new theme is worth opening
  only if dozens of assets will carry it; a large kit is not a reason to sweep
  every model into one.
- **flags** — `plural` (several instances of one thing), `pickup` (a lone coin,
  key, ring, potion or token sized to be collected, not to stand in the world).

`hero` and material `special` are the PO's to assign, per the bible's process
rules: propose, never set. Artist tags (`kay`, `ken`, `qua`, …) are derived by
`build-catalog.mjs` from the kit — do not write them by hand. `size` is
measured, never set.

A source name is not a kind: a pack's "stage" is a construction site, its
"tent" may be a market canopy. The debug render of step 3 settles it. Where two
or three models still resolve badly against the glossary, put them to the PO in
one question rather than guessing each.

`zetTags` throws on any kind, material or flag id that is not already a row in
`catalog/tags.json`. Check the whole set of ids the spec uses against that file
before the first run.

## 9. Variants

Group what reads as one thing, following the bible's variants section. Clusters live in
`catalog/asset_variants.json`: `members`, `main`, `type`. Name and triangle
count propose a group; shape and a render confirm it before you write it down.
`type` takes one of the values the file already uses — `detail-variant`,
`color-variant`, `maatvariant` — so the tab keeps grouping them as it does now.

The file also carries measured fields from the clustering tool, but
`build-catalog.mjs` reads only `members`, `main` and `type`. Append new clusters
with those plus `kits` and `types: ["manual"]`, and leave the existing entries
untouched so the diff stays additive.

## 10. Rebuild, look, check

    node catalog/tools/build-catalog.mjs
    node lint/size.mjs
    node lint/measures.mjs
    node catalog/tools/build-lists.mjs
    node catalog/tools/build-thumbs.mjs --jobs 3

Then render the new models and look at them, as the bible's process rules ask —
on their own, and beside at least two catalogue models of the same group at
locked scale. Reading the numbers is not looking.

Reading the catalogue back: in `catalog/catalog.json` a model's `bands` and
`mat` are counts, not lists — the bands themselves are the keys of `spread`,
as `"column,row"` — and `wdh` is width, depth, height with height last.

Before committing, run every lint (`size`, `measures`, `mat`, `palette`,
`bands`) and report what does not fit rather than bending it silently. Take the
error counts of all five before the import as well, so "no new errors" is a
comparison rather than a claim. Where a pack-wide scale puts a model outside
its size limits, the one pack factor wins and the deviation goes in the PR.

`build-lists.mjs` regenerates `kits/tbd/`, so adopting models deletes them
there, and the catalogue pages get a fresh build stamp. A kit-sized import is
therefore a few hundred changed files. Check that the set deleted from
`kits/tbd/` is exactly the set imported, and that nothing else was touched.
