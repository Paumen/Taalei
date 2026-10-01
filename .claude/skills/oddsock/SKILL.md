---
name: oddsock
description: Review a few random catalogue kinds for style coherence by looking at them — pick 3 kinds, render contact sheets, suggest 2–5 improvements per kind with options, and let the PO choose what gets implemented. Use when asked to review random kinds, suggest style improvements for a kind, or run a kind review or oddsock.
---

# Oddsock

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

First read what the PO tends to pick:

    node tools/renders/kind-pick.mjs --stats

Lead with categories the PO picks often and with the kinds of faults the PO
raised themselves (`by po`). Keep a category the PO keeps declining to the
clearest cases, and put options shaped like the ones picked before first.
Never drop a real fault because its category is picked rarely.

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

Measure what each option acts on before offering it, so the PO can answer
without asking back. Name the parts it changes, from `recolour.mjs --list` or
`render.mjs --isolate`. For a colour option, give the band and where each part
sits in it now and after: 0 is lightest, 1 darkest, and a part's midpoint is
the mean over its vertices. A palette that loses its only band in a part needs
a tag change, so check that before offering a recolour.

## 4. Let the PO choose

Ask with AskUserQuestion: one question per suggestion, its options as answers,
up to 4 questions per call. A skipped question stays open; ask again or leave
it, never pick for the PO. Do nothing on a suggestion that was not chosen.

Record every suggestion and the answer in the log, including faults the PO
raised during the review (`by: "po"`) and their own wording when they answer
outside the options:

    node tools/renders/kind-pick.mjs --record <scratch>/record.json

The file holds `{ kind, suggestions: [ { by, category, models, text, options,
picked } ] }` per kind; `--help` lists the categories. `picked` is the chosen
options, `[]` when declined, `null` while unanswered. Record again when an open
suggestion gets an answer later; a record replaces that kind's suggestions.

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

For the models that changed, render before and after side by side in one
sheet, each before next to its after, with the source when it was checked:

    git show <commit before the change>:kits/workfiles/<kit>/<name>.glb > <scratch>/cmp/<name>-before.glb
    cp kits/workfiles/<kit>/<name>.glb <scratch>/cmp/<name>-after.glb
    node tools/renders/render.mjs [<source file>] <scratch>/cmp/<name>-before.glb <scratch>/cmp/<name>-after.glb [...] --modes pbr --views iso --sheet-only --sheet-cols <2 or 3> --out <scratch>/cmp/out

`<scratch>/cmp` needs `Textures/colormap.png`. Look at all of them, then send
the side-by-side sheet to the PO with what changed and what was left.
