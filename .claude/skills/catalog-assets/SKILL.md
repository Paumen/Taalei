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

Slug by artist: `ken-` (Kenney), `kay-` (KayKit), `isa-` (Isa),
`quat-` (Quaternius); anything else takes the kit's own word. Two words at
most: `kay-food`, `ken-holiday`, `medieval-town`. Add the kit's row to
`catalog/manifest.js` (slug, name, url, note, licence label).

## 5. Scale factor

One factor for the whole pack, as the bible's process rules say. The target factors live in
`tools/importeer/scale-factors.mjs` (`SCALE_TARGETS`, plus the `ken-` and
`kay-` defaults), which `tools/importeer/schaal.mjs` reads — use the pack's
factor from there, and keep it in step with that table rather than copying a
number that was right last month.

`node tools/importeer/scale-check.mjs [kit…]` compares each workfile against
the model it was imported from and reports the ones that are not the source
size times the pack's factor. It reads the source model from
`asset.extras.taaleiland.bronmodel`, which every import spec sets;
`node tools/importeer/source-link.mjs [kit…] [--report]` fills that field in
for a workfile that lacks it, matching on name and on the shape of the mesh.

For a pack with no factor yet, pick it by comparison, not by arithmetic: import
a handful at a guess and render them beside catalogue models of the same kind.

    node tools/renders/render.mjs <dir> --out <out> --views iso --sheet --sheet-only --lock-scale

`--lock-scale` is what makes the sizes comparable. Check the result with
`node lint/size.mjs` for the kinds involved before settling.

## 6. Recolour onto the shared colormap

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

When the kit already holds models from this pack, take the band mapping from
them: recolour each source colour or cell the way its siblings were recoloured,
so a new crate lands on the crate's band. The bible's colour section and
`node lint/palette.mjs` and `node lint/bands.mjs` decide the rest.
Geometry is scaled by the pack factor, grounded at Y = 0, pivoted on the
footprint centre, welded, and written as one draw call; `node lint/measures.mjs`
checks all three.

A model already in `kits/workfiles` that sits on the wrong band is moved, not
re-imported: `node tools/importeer/reband.mjs <kit>/<model> <from>:<to>` shifts
every vertex of one band onto another and keeps its place within the cell.
Rebuild the catalogue and the kit's thumbs afterwards.

A model that kept the place it held in the scene it was exported from is moved
back onto the origin: `node tools/importeer/reorigin.mjs <kit>/<model>` puts its
lowest vertex on y=0 and its footprint centre on x=0, z=0. It leaves the mesh
alone, so a part whose origin is its joint — a rotor on its axle, a gate on its
hinge — is not a case for it.

A model with more than one draw call is folded only where the extra primitives
sit in the same mesh on one material: `node tools/importeer/merge-prims.mjs
<kit>/<model>`. A part on its own node (a wheel, a paddle, a gate, a blade of a
pair of scissors) stays apart, so it can still be animated later.

## 7. Tags

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

## 8. Variants

Group what reads as one thing, following the bible's variants section. Clusters live in
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

Then render the new models and look at them, as the bible's process rules ask —
on their own, and beside at least two catalogue models of the same group at
locked scale. Reading the numbers is not looking.

Before committing, run every lint (`size`, `measures`, `mat`, `palette`,
`bands`) and report what does not fit rather than bending it silently. Where
a pack-wide scale puts a model outside its size limits, the one pack factor
wins and the deviation goes in the PR.
