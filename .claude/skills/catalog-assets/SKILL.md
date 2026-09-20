---
name: catalog-assets
description: Work on the Taalei catalogue — add a source pack so its models show on the TBD tab, set tags and variants on models already in the catalogue, and run the rebuilds and lints. Use when asked to add a source pack, to tag or group catalogue models, or to rebuild the catalogue pages and thumbnails.
---

# Working on the catalogue

`docs/asset_style_guide.md` is the bible: it decides materials, colours, sizes
and variants. Read it before deciding anything; this skill only says in what
order to do the work and which tool does each part.

Two rules from `CLAUDE.md` bind every step: never look at earlier commits or
PRs, and never leave assumptions, rules or commentary as comments in a code
file — put them here, in the bible, or in the PR.

A workfile in `kits/workfiles` is the asset itself. Nothing in the repo
rewrites one in place, so a model that is wrong in its geometry, scale or
bands is replaced or dropped, never patched by a tool.

## 1. Is the source pack already in the repo?

`catalog/tools/bronkits.mjs` (`BRONKITS`) lists every pack; the zips sit in
`kits/sources/<pack>/`.

## 2. Add a source pack

Put the zip in `kits/sources/<pack>/` and add a `BRONKITS` row: `map` (the
folder), `naam` (human name), `kit` (slug, `null` until adopted), `formaat`
(`glb`, `gltf`, `obj`, `fbx`), plus `extraFormaten`, `submap`, `alleMappen` or
`splitsPerMesh` where the pack needs them.

    node catalog/tools/build-lists.mjs

Then open the TBD tab (`catalog/tbd.html`) and look. The previews colour
themselves from the source texture, or from an average when the material
carries no map — half-blank, black or grey models mean the pack's materials did
not resolve. Fix that by hand in `catalog/preview-colors.json`, keyed by pack
and then by material or texture name.

A kit slug goes by artist: `ken-` (Kenney), `kay-` (KayKit), `isa-` (Isa),
`quat-` (Quaternius); anything else takes the kit's own word. Two words at
most. A kit needs its row in `catalog/manifest.js` (slug, name, url, note,
licence label); `zetManifest` fills the model list but will not create the row.

## 3. Colour and bands

Every asset colours itself from `kits/colormap.png`: 16 × 4 cells, one band
per cell, each band a vertical gradient. Baked shading is kept — the spread
across the gradient carries over, it is not flattened to one colour;
`node lint/measures.mjs` flags a model with no spread.

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

### Band budget

`lint/measures.json` caps bands at `nmat × 2` (G11), at 5 for most models and 6
for `size:l` (G13, G15), and size is measured on the longest extent against
`lint/variables.json` (`s` ≤ 0.5, `m` ≤ 1.5, `l` above). `tag:plural` and
`kind:assy` are exempt. A model over its budget is a model to drop, not to
bend the lint around.

## 4. Tags

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
"tent" may be a market canopy. A render settles it. Where two or three models
still resolve badly against the glossary, put them to the PO in one question
rather than guessing each.

`zetTags` throws on any kind, material or flag id that is not already a row in
`catalog/tags.json`. Check the whole set of ids against that file before the
first run.

## 5. Variants

Group what reads as one thing, following the bible's variants section. Clusters
live in `catalog/asset_variants.json`: `members`, `main`, `type`. Name and
triangle count propose a group; shape and a render confirm it before you write
it down. `type` takes one of the values the file already uses —
`detail-variant`, `color-variant`, `maatvariant` — so the tab keeps grouping
them as it does now.

The file also carries measured fields from the clustering tool, but
`build-catalog.mjs` reads only `members`, `main` and `type`. Append new clusters
with those plus `kits` and `types: ["manual"]`, and leave the existing entries
untouched so the diff stays additive.

## 6. Rebuild, look, check

    node catalog/tools/build-catalog.mjs
    node lint/size.mjs
    node lint/measures.mjs
    node catalog/tools/build-lists.mjs
    node catalog/tools/build-thumbs.mjs --jobs 3

Then render the models you touched and look at them, as the bible's process
rules ask — on their own, and beside at least two catalogue models of the same
group at locked scale:

    node tools/renders/render.mjs <dir> --out <out> --views iso --sheet --sheet-only --lock-scale

`--compare` puts several models in one scene against a grid and a ruler, which
is how to judge one kit's size against another's. Reading the numbers is not
looking.

Reading the catalogue back: in `catalog/catalog.json` a model's `bands` and
`mat` are counts, not lists — the bands themselves are the keys of `spread`,
as `"column,row"` — and `wdh` is width, depth, height with height last.

Before committing, run every lint (`size`, `measures`, `mat`, `palette`,
`bands`) and report what does not fit rather than bending it silently. Take the
error counts of all five before the work as well, so "no new errors" is a
comparison rather than a claim.

`build-lists.mjs` regenerates `kits/tbd/` and the catalogue pages get a fresh
build stamp, so even a small change touches a few hundred files. Check that
nothing outside the set you meant to touch was written.
