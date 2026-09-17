---
name: catalog-assets
description: Add 3D assets to the Taalei catalogue — a whole source pack or a handful of models out of one. Covers source zips, kit slugs, the pack scale factor, recolouring onto the shared colormap, tags, variants, and the rebuilds. Use when asked to add, import or adopt models, kits or asset packs, or to fill gaps from the missing tab.
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

    node catalog/tools/build-missing.mjs

Then open the missing tab (`catalog/missing.html`) and look. The previews
colour themselves from the source texture, or from an average when the material
carries no map — half-blank, black or grey models mean the pack's materials did
not resolve. Fix that first, by hand colours in `catalog/missing-colors.json`
keyed by pack and then by material or texture name. An import built on previews
you have not looked at goes wrong quietly.

## 3. Does the kit already exist?

`kits/workfiles/<slug>/` holds the adopted models of a kit. Exists → step 5.

## 4. New kit

Slug by artist: `ken-` (Kenney), `kay-` (KayKit), `isa-` (Tiny Treats),
`quat-` (Quaternius); anything else takes the kit's own word. Two words at
most: `kay-food`, `ken-holiday`, `medieval-town`. Add the kit's row to
`catalog/manifest.js` (slug, name, url, note, licence label).

## 5. Scale factor

One factor for the whole pack (P08). The target factors live in
`tools/importeer/schaal.mjs` (`DOEL`, plus the `ken-` and `kay-` defaults) —
use the pack's factor from there, and keep it in step with that table rather
than copying a number that was right last month.

For a pack with no factor yet, pick it by comparison, not by arithmetic: import
a handful at a guess and render them beside catalogue models of the same kind.

    node tools/renders/render.mjs <dir> --out <out> --views iso --sheet --sheet-only --lock-scale

`--lock-scale` is what makes the sizes comparable. Check the result against the
§2 size rows for the kinds involved before settling.

## 6. Recolour onto the shared colormap

Every asset colours itself from `kits/colormap.png` (I06): 16 × 4 cells, one
band per cell, each band a vertical gradient. Baked shading is kept (I07) — the
spread across the gradient carries over, it is not flattened to one colour.

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

When the kit already holds models from this pack, take the band mapping from
them: recolour each source colour or cell the way its siblings were recoloured,
so a new crate lands on the crate's band. §5 of the bible decides the rest.
Geometry is scaled by the pack factor, grounded at Y = 0, pivoted on the
footprint centre (G04), welded, and written as one draw call (I09).

## 7. Tags

Set in `catalog/tags.json`, per model, as `<kit>/<name>`:

- **kind** — mandatory, exactly one, the deepest leaf that fits (T04). Resolve
  the noun against the Appendix glossary; add a noun to a leaf when it clearly
  belongs there. `assy` is a kind, not a tag: several distinct things in one
  model.
- **material** — what it is made of; the subtype, never the parent on top.
- **use** — zero or more of the eight `use:` tags.
- **theme** — only when obvious. Existing sets: `pirate`, `halloween`,
  `robin-hood`, `asia`, `graveyard`, `sailing`. A new theme is worth opening
  only if dozens of assets will carry it; a large kit is not a reason to sweep
  every model into one.
- **flags** — `plural` (several instances of one thing), `ngons` (round cross
  section), `decorated` (food finished on top), `pickup` (a lone coin, key,
  ring, potion or token sized to be collected, not to stand in the world).

`hero` and material `special` are the PO's to assign (P01–P03): propose, never
set. Artist tags (`kay`, `ken`, `qua`, …) are derived by `build-catalog.mjs`
from the kit — do not write them by hand. `size` is measured, never set (T09).

## 8. Variants

Group what reads as one thing, following §7 of the bible. Clusters live in
`catalog/asset_variants.json`: `members`, `main`, `type`. Name and triangle
count propose a group; shape and a render confirm it before you write it down.
`type` takes one of the values the file already uses — `detail-variant`,
`color-variant`, `maatvariant` — so the tab keeps grouping them as it does now.

## 9. Rebuild, look, check

    node catalog/tools/build-catalog.mjs
    node lint/size.mjs
    node lint/measures.mjs
    node catalog/tools/build-missing.mjs
    node catalog/tools/build-thumbs.mjs --jobs 3

Then render the new models and look at them (P05) — on their own, and beside at
least two catalogue models of the same group at locked scale (P06). Reading the
numbers is not looking.

Before committing, check the batch against the bible and report what does not
fit rather than bending it silently: band count against materials (G07, G08),
the band ceiling (G09), the §2 size rows for each kind, draw calls (I09). Where
a pack-wide scale puts a model outside its size row, P08 wins and the deviation
goes in the PR.
