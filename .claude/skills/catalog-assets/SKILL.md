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

A workfile in `kits/workfiles` is the asset itself. A model that is wrong in
its geometry or scale is replaced or dropped. A wrong band is moved in place
with `tools/import/recolour.mjs`, for the whole band or for named parts.

## 1. Is the source pack already in the repo?

`catalog/tools/bronkits.mjs` (`BRONKITS`) lists every pack; the zips sit in
`kits/sources/<pack>/`.

## 2. Add a source pack

Put the zip in `kits/sources/<pack>/` and add a `BRONKITS` row: `map` (the
folder), `naam` (human name), `kit` (slug, `null` until adopted), `formaat`
(`glb`, `gltf`, `obj`, `fbx`), plus `extraFormaten`, `submap`, `alleMappen` or
`splitsPerMesh` where the pack needs them. Two packs may share one kit slug;
`build-lists.mjs` then matches each pack only against the workfiles whose
`bron` is that pack's `naam`.

    node catalog/tools/build-lists.mjs

Then open the TBD tab (`catalog/app/tbd.html`) and look. The previews colour
themselves from the source texture, or from an average when the material
carries no map — half-blank, black or grey models mean the pack's materials did
not resolve. A pack whose only image is not the map the material asks for gets
that image anyway, so wrongly mapped colour is the same failure. Fix either by
hand in `catalog/data/preview-colors.json`, keyed by pack and then by material or
texture name; a hand colour beats every texture but an exact name match.
A map a preview carries goes in at 1024 texels at most, boxed down by a whole
factor: a card holds its texture for as long as it is on the page, so a larger
one costs the tab once per model in the pack.

A kit slug goes by artist: `ken-` (Kenney), `kay-` (KayKit), `isa-` (Isa),
`quat-` (Quaternius); anything else takes the kit's own word. Two words at
most. A kit needs its row in `catalog/data/manifest.js` (slug, name, url, note,
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
- `foliage` is moss or hunter; `emissive` is amber.
- A material with no `bands` of its own (`food`, `vegetation`, bare `metal`)
  is unconstrained by §5.1.
- The §5.1 check is coverage-based: it passes when at least one of the model's
  bands is in the material's list. That is weak enough to let a wrong band
  through, so do not lean on it as proof.

### Band budget

`lint/measures.json` caps bands at `nmat × 2` (G11; `nmat × 3` for food, fauna
and plastic, G12), at the kind's `bands.max` (5 unless the kind in
`lint/kinds.json` raises it) for most models and 6 for `size:l` (G13, G15), and size is measured on the longest extent against
`lint/variables.json` (`s` ≤ 0.5, `m` ≤ 1.5, `l` above). `tag:plural` and
`kind:set` are exempt. A model over its budget is a model to drop, not to
bend the lint around.

## 4. Tags

Set in `catalog/data/tags.json`, per model, as `<kit>/<name>`:

- **kind** — mandatory, exactly one, the deepest leaf that fits. Resolve
  the noun against the Appendix glossary; add a noun to a leaf when it clearly
  belongs there. `set` is a kind, not a tag: several distinct things in one
  model.
- **material** — what it is made of; the subtype, never the parent on top.
  `build-catalog.mjs` and `zet-catalogus.mjs` throw on a parent carried with its
  subtype; the tag editor drops the other one when either is picked.
- **attribute** — at most one value per attribute. `storeys-0-5` … `storeys-5`
  on a `kind:str-building` model whose storeys read; none when they do not.
  `scale-small` or `scale-big` only on a kind that sets `scale` in
  `lint/kinds.json`, for a clearly smaller or bigger version of it.
- **use** — zero or more of the eight `use:` tags.
- **theme** — only when obvious. Existing sets: `pirate`, `halloween`,
  `robin-hood`, `asia`, `grave`, `sailing`. A new theme is worth opening
  only if dozens of assets will carry it; a large kit is not a reason to sweep
  every model into one.
- **flags** — `plural` (several instances of one thing), `pickup` (a lone coin,
  key, ring, potion or token sized to be collected, not to stand in the world),
  `comp` (a part meant to be built into something larger, so the size rows do
  not apply), `broken` (a cracked, shattered or partial version of a thing, and
  the debris left of one), `piece` (a cut or portion of a whole thing: a slice,
  a chopped heap, a single bloom off the plant), `tba` (needs an animation made
  for it and keeps the moving parts as separate draw calls, so it is exempt
  from `I11`; the model carries none yet), `animation` (the model carries an
  animation clip, so it is exempt from `I08` and `I11`; every model with a clip
  takes it).

`hero` and material `special` are the PO's to assign, per the bible's process
rules: propose, never set. Artist tags (`kay`, `ken`, `qua`, …) are derived by
`build-catalog.mjs` from the kit — do not write them by hand. `size` is
measured, never set.

A source name is not a kind: a pack's "stage" is a construction site, its
"tent" may be a market canopy. A render settles it. Where two or three models
still resolve badly against the glossary, put them to the PO in one question
rather than guessing each.

`zetTags` throws on any kind, material or flag id that is not already a row in
`catalog/data/tags.json`. Check the whole set of ids against that file before the
first run.

## 5. Variants

Group what reads as one thing, following the bible's variants section. Clusters
live in `catalog/data/asset_variants.json`: `members`, `main`, `type`. Name and
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
    node catalog/tools/size-curves.mjs

Then render the models you touched and look at them, as the bible's process
rules ask — on their own, and beside at least two catalogue models of the same
group at locked scale:

    node tools/renders/render.mjs <dir> --out <out> --views iso --sheet --sheet-only --lock-scale

`--compare` puts several models in one scene against a grid and a ruler, which
is how to judge one kit's size against another's. Reading the numbers is not
looking.

Reading the catalogue back: in `catalog/build/catalog.json` a model's `bands` and
`mat` are counts, not lists — the bands themselves are the keys of `spread`,
as `"column,row"` — and `wdh` is width, depth, height with height last.

Before committing, run every lint (`size`, `measures`, `mat`, `palette`,
`bands`) and report what does not fit rather than bending it silently. Take the
error counts of all five before the work as well, so "no new errors" is a
comparison rather than a claim.

`build-lists.mjs` regenerates `kits/tbd/` and the catalogue pages get a fresh
build stamp, so even a small change touches a few hundred files. Check that
nothing outside the set you meant to touch was written.

It rebuilds only the packs whose source zips, workfiles, preview colours,
rejects or tooling changed; the rest come from `kits/.cache`. `--force`
rebuilds every pack.
