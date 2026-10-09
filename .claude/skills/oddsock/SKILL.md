---
name: oddsock
description: Review a few random catalogue kinds for style coherence by looking at them — pick 3 kinds, render contact sheets, suggest 2–5 improvements per kind with options, and let the PO choose what gets implemented. Use when asked to review random kinds, suggest style improvements for a kind, or run a kind review or oddsock.
---

# Oddsock

Find what makes a kind look like several hands made it, propose fixes, and
implement only what the PO picks. Size is out of scope: never suggest a scale
change. Shape stays in: thickness of parts, bevels, facets, proportions within
a model. Suggestions come from looking at renders,
not from lint findings; lint is worked in another flow. Read the rules only to
check a suggestion is allowed.

## 1. Pick and render

    node tools/renders/kind-pick.mjs --render <scratch>/kind-review

- Picks 3 random kinds with 4–48 models from at least 2 kits, skipping every
  kind in `tools/renders/kind-review-log.json`, and adds the picks to that log.
- Renders each kind with `kind-sheet.mjs --free-scale`, pbr from iso, each
  tile fitted to its own model:
  `<kind>/pbr/sheet.png`, plus even sheets `c01`, `c02`, … of at most 16 models
  when the kind has more than 16.
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
| every model close | `kind-sheet.mjs --each` |

Before suggesting anything for a model, render its original beside it, in
one sheet. Clone `../lp-sources` (see `catalog-assets` §1), find the zip in
`catalog/tools/bronkits.mjs` by `kit`, unzip to scratch and render the
matching file; `asset.extras.taaleiland.bronmodel` in the workfile names it.
That tells an import fault (bands smeared or split, faces recoloured or
doubled, glass made opaque, parts merged) from the source's own style, and
the fault is then the suggestion.

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
- proportions within a model;
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
  counts of all seven lints with the counts from before.

## 6. Show before and after

    node tools/renders/kind-sheet.mjs --kind <kind> --out <scratch>/before --modes pbr --free-scale --ref <commit before the change>
    node tools/renders/kind-sheet.mjs --kind <kind> --out <scratch>/after --modes pbr --free-scale

For the models that changed, render before and after side by side in one
sheet, each before next to its after, with the source when it was checked:

    git show <commit before the change>:kits/workfiles/<kit>/<name>.glb > <scratch>/cmp/<name>-before.glb
    cp kits/workfiles/<kit>/<name>.glb <scratch>/cmp/<name>-after.glb
    node tools/renders/render.mjs [<source file>] <scratch>/cmp/<name>-before.glb <scratch>/cmp/<name>-after.glb [...] --modes pbr --views iso --sheet-only --sheet-cols <2 or 3> --out <scratch>/cmp/out

`<scratch>/cmp` needs `Textures/colormap.png`. Look at all of them, then send
the side-by-side sheet to the PO with what changed and what was left.

## 7. Autonomous run

When asked to let agents decide instead of the PO, the agents apply what they
judge right and list what is doubtful; the PO checks the doubtful calls on the
swipe page afterwards.

- Each agent takes a few kinds and edits only workfiles of those kinds. Tag,
  kind, material and reject changes go to the lead, who applies them, rebuilds
  once and runs the lints. A model whose change fails a lint goes back to its
  version before the run and onto the open list.
- Record suggestions with `picked: ["auto: <option>"]`.
- Doubtful changes go in `catalog/data/lists/oddsock-applied.json` (applied:
  → keep, ← revert) and `oddsock-open.json` (left: → do it, ← leave), each
  entry `{ "id", "note" }`. The note says what changed or would change and the
  trade-off; the swipe card shows it. Open them with
  `catalog/app/swipe.html?list=oddsock-applied`.
- Log the PO's verdicts with `kind-pick.mjs --check`, and read the
  "autonomous calls" table of `--stats` before deciding what is doubtful.

Earlier verdicts, counted per independent call (a group of models settled by
one card counts once). They lean a choice; they are not rules. A pattern with
fewer than 5 calls is a hint only, and `--stats` has the current numbers.

- Applied and kept: colour spread by height with the mid kept (many); a second
  source colour restored where the import merged it (1); laying, standing or
  turning a model to match its kind (2); a kind move to what the model clearly
  is: cobweb, lava tile, set, trophy head, giant skull, case (5); a material tag
  fixed with no colour change (1).
- Applied and reverted: moving stands, pedestals, plinths, a column or a flat
  variant out of the kind they serve (2, against 0 kept); a face fix that fills
  an open hole (1).
- Split, so decide per model: a colour moved away from the source or the
  kit's own look to match other kits, kept 4 (weapon rack, flume brace, water
  wheel, raw steak) and reverted 4 (coconut shells, worktops, tower door piece,
  cave entrance beams); a glass dome made clear like the source, kept on a
  cream dome, reverted on a green one.
- Left and rightly so: thickening or decimating (3), a kit's own accent colour
  (3), reshaping cloth or staves by hand (2), a reject (1), a kind move past a
  size limit (1).
- Left but wanted: a model much lighter than its kind, darkened to the kind's
  mid against the source (1); a dark source part the palette lacks, retagged to
  a material that has it (1); a plainly wrong material with nothing fitting,
  made `special` by the PO (1).
