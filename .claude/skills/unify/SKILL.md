---
name: unify
description: Autonomous review of catalogue kinds — agents look at each kind's models and change what makes the kind look like several hands made it (shape, colour use, placement, tags, kind, material), then the PO judges the doubtful calls on the swipe page. Use when asked to unify kinds, run a kind review, or make kinds read as one family.
---

# Unify

Make each kind read as one family. Agents look, judge each model by hand and
apply what they judge right; the PO checks the doubtful calls afterwards.

In scope: reshape, thicken, decimate, bevels, facets, smooth vs flat, level of
detail, proportions within a model, colour use, placement, and tag, kind and
material changes. Out of scope: scale, and back faces that were already there
(fix any back face a change creates).

- Every change is judged per model. Never make a change a script could run
  over the whole catalogue, such as spreading colour by height or evening
  gradients.
- Shading ignores the source. Change it only when a model stands out from its
  peers in the kind, as a deliberate fix for that model.
- A kit's own style is no reason to leave a model that makes its kind look
  like several hands made it. Lean the kind to the style most of it shares.
- No quota. A kind may get no change; never offer an idea just to fill it.
- Lints are not a goal. A lint finding only puts a change on the doubt list.

## 1. Pick (lead)

    node tools/renders/kind-pick.mjs --count <n> --render <scratch>/unify

Picks random kinds with 4–48 models from at least 2 kits, skipping kinds in
`tools/renders/kind-review-log.json`, logs them and renders each into
`<scratch>/unify/<kind>/`: `pbr/sheet.png`, chunks `c01`, … for kinds over 16
models, `dossier.json` (kit, bands, size and triangle ratios per tile) and
`src/` copies with `Textures/colormap.png`. `--kind <id,…>` takes named kinds.
Commit the log with the work.

## 2. Split (lead)

Give each agent 2–4 kinds and this skill. Add nothing else: no hints, no
reading of the sheets. Only the PO's own verdicts (`kind-pick.mjs --stats`,
"autonomous calls") count as earlier decisions; a call an agent made and the
PO never judged is not one.

## 3. Look (agent)

Look at the sheets first. Then look closer where it helps, with
`tools/renders/render.mjs` on a workfile or a `src/` copy:

| to see | render |
|---|---|
| facet density, part thickness, bevels | `--modes claywire` |
| smooth vs flat, back faces a change made | `--modes normal,faceorient` |
| band colours without light | `--modes albedo` |
| hidden or inner parts | `--modes xray` |
| parts one by one | `--isolate [--parts n]` |
| other angles | `--views front,top,iso-back,205/30` |
| close detail | `--views 20/10 --fit 0.45` |

Render the source beside a model only to spot an import fault: parts or
colours merged, parts lost, glass made opaque. `../lp-sources` holds the zips
(`catalog/tools/bronkits.mjs` names them by kit;
`asset.extras.taaleiland.bronmodel` names the file).

## 4. Change (agent)

- Edit only models of your kinds: their workfiles and their entries in
  `catalog/data/tags.json`.
- Workfile edits follow `catalog-assets` and `catalog-extract`. Recolouring
  moves UVs to another band cell, keeps each vertex's place in its band,
  splits vertices shared by triangles of different bands and leaves no
  triangle across two bands.
- `tags.json`: read it right before each write, change only your own models.
  Never assign a tag marked `po: true`; report it instead. Keep
  `build-catalog.mjs` able to run: no material with its own parent, only ids
  from `lint/kinds.json` and `lint/materials.json`, a storeys tag on every
  building.
- Render before (`git show HEAD:<path>`) and after side by side with two
  peers, and look. Undo a change that does not clearly read better.
- Run `node lint/glb-lint.mjs <file>` once on each changed workfile.

Report to the lead:

- `record`: `[{ kind, suggestions: [{ by: "claude", category, models, text,
  options, picked: ["auto: <option>"] }] }]`, real suggestions only; `--help`
  of `kind-pick.mjs` lists the categories;
- `doubt`: `[{ id, kind, category, note }]`, applied but unsure;
- `sure`: `[{ id, kind, category, change }]`;
- `changed`: workfiles and tag entries;
- `sheet`: one before/after sheet of every changed model.

A note is at most 10 words: category, what changed, the trade-off.

## 5. Gather (lead)

- `kind-pick.mjs --record <file>` with the records and `--check <file>` with
  every applied change, `doubt: true` for the doubtful ones and `verdict:
  null`.
- Add the doubtful changes to `catalog/data/lists/oddsock-applied.json` as
  `{ "id", "note" }`, sorted by category, then kind, then id. The PO swipes
  them at `catalog/app/swipe.html?list=oddsock-applied` (→ keep, ← revert).
- Rebuild once as `CLAUDE.md` says. Do not rerun lints the agents ran.
- Render every changed model before and after in one sheet, look at it and
  send it to the PO with what changed.

## 6. Verdicts (lead)

Log what the PO says with `kind-pick.mjs --check` (`ok`, `nok`), revert what
they mark bad, rebuild, and take it off the list. Read `--stats` before the
next run.

What the PO tends to keep: a source colour or part the import merged, put
back; a model turned to face or stand like its kind; a kind move to what the
model clearly is; a wrong material tag fixed.

What the PO tends to reject: shading spread by height or to the kind mid;
a loud source accent put back; a part recoloured only to fit a band rule;
stands and pedestals moved out of the kind they serve; an open hole filled.
