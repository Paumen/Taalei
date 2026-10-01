---
name: kind-review
description: Review a few random catalogue kinds for style coherence by looking at them — pick 3 kinds, render contact sheets, suggest 2–5 improvements per kind with options, and let the PO choose what gets implemented. Use when asked to review random kinds, suggest style improvements for a kind, or run a kind review.
---

# Kind review

Find what makes a kind look like several hands made it, propose fixes, and
implement only what the PO picks. Suggestions come from looking at renders,
not from lint findings; lint is worked in another flow. Read the rules only to
check a suggestion is allowed.

## 1. Pick and render

    node tools/renders/kind-pick.mjs --render <scratch>/kind-review

- Picks 3 random kinds with 4–24 models from at least 2 kits, skipping every
  kind in `tools/renders/kind-review-log.json`, and adds the picks to that log.
- Renders each kind with `kind-sheet.mjs`, pbr from iso at locked scale:
  `<kind>/pbr/sheet.png`, plus `c01` and `c02` halves of at most 12 models when
  the kind has more than 12.
- `--kind <id,…>` reviews named kinds instead; `--dry` picks without logging.
- Commit the log with the work, so the next session skips these kinds.

Show the sheets to the PO before suggesting anything.

## 2. Look closer where it helps

`<kind>/dossier.json` names each tile's kit, bands with their names and
spreads, size and triangle ratios to the kind median. Use it to name what you
see, not to find what to see.

Follow-up renders, with `tools/renders/render.mjs` on a workfile or on the
gathered copies in `<kind>/src` (a copy needs `Textures/colormap.png` beside it):

| to see | render |
|---|---|
| facet density, part thickness, bevels | `--modes claywire` |
| smooth vs flat shading, flipped faces | `--modes normal,faceorient` |
| band colours without light, smearing | `--modes albedo` |
| hidden or inner parts | `--modes xray` |
| parts apart, part by part | `--isolate [--parts n]` |
| one band only | `--band col,row` |
| other angles | `--views front,top,iso-back,205/30,30/-20` |
| close detail | `--views 20/10 --fit 0.45` |
| size against peers | `--compare` |
| every model close | `kind-sheet.mjs --each` |

When a model looks off, render its original beside it. Clone
`../lp-sources` (see `catalog-assets` §1), find the zip in
`catalog/tools/bronkits.mjs` by `kit`, unzip to scratch and render the
matching file. That tells an import fault (bands smeared, faces recoloured)
from the source's own style.

## 3. Suggest

Per kind, 2–5 suggestions, each about making the kind read as one family.
Look at:

- colour use: which bands, how many, one band per part, gradient direction;
- colouring artefacts: smearing across faces, light and dark triangles side by
  side, jagged band edges, a part in the wrong band;
- shape style: thickness of parts and sub-parts, bevels, facet count, smooth
  vs flat, level of detail;
- proportions and scale against peers;
- placement: grounded, centred, facing;
- overall look and feel: which kit's style the kind should lean to.

Each suggestion names the models it touches and the render that shows it, and
gives 2–4 options to resolve it. Before giving it, check that each option fits
`docs/asset_style_guide.md` and `lint/kinds.json` / `lint/materials.json`
(band palettes, band budget), and say when an option would need a tag or
material change to pass.

## 4. Let the PO choose

Ask with AskUserQuestion: one question per suggestion, its options as answers,
up to 4 questions per call. A skipped question stays open; ask again or leave
it, never pick for the PO. Do nothing on a suggestion that was not chosen.

## 5. Implement

- Workfile edits follow `catalog-assets` and `catalog-extract`.
- Recolouring is moving UVs to another band cell: keep each vertex's
  position within its band (the gradient), split a vertex shared by triangles
  that get different bands, and drop vertices no triangle uses. Check that no
  triangle ends with vertices in two bands.
- After the change, rebuild as `CLAUDE.md` says, and compare the error
  counts of all six lints with the counts from before.

## 6. Show before and after

    node tools/renders/kind-sheet.mjs --kind <kind> --out <scratch>/before --modes pbr --ref <commit before the change>
    node tools/renders/kind-sheet.mjs --kind <kind> --out <scratch>/after --modes pbr

Look at both, then send them to the PO with what changed and what was left.
