---
name: catalog-swarm
description: Sweep the Taalei catalogue kind by kind with a swarm of agents that look at every model beside the peers of its kind, find what lint and the tools do not catch — a style off its peers, band artefacts, slivers, jitter, a tag that disagrees with the render — fix geometry in place, verify each fix independently, and hand tag and variant proposals to the PO. Use when asked to sweep a kind or the catalogue for inconsistencies, or to run the catalog-swarm workflow.
---

# Sweeping the catalogue by kind

The goal is a catalogue that reads as if one hand made it. Lint holds the
measurable rules; this sweep is for everything else, and it is done by
looking. `docs/asset_style_guide.md` decides what is right where it speaks;
where it is silent, the kind's own peers decide: a model is off when it does
not sit on the kind's sheet as one of the family, in detail level, colour,
build or scale. `CLAUDE.md` binds every step: never look at earlier commits or
PRs, never leave commentary in a code file.

The yardstick is `env-flora-tree-conifer`: 57 models from a dozen kits that
read as one family. One foliage band shaded tier by tier (`B59`), one trunk
band, stacked cones, a facet count in the same range, the same light. Render
it once (`kind-sheet.mjs --kind env-flora-tree-conifer`) before judging any
other kind, and ask of each kind whether it holds together as well.

`.claude/skills/catalog-assets/SKILL.md` says which tool does what to a
workfile and how the catalogue is rebuilt; `.claude/skills/catalog-extract/SKILL.md`
says how a band is told from a part and how an extract is applied. Both are
read before doing the work they cover.

## 1. The unit is a kind, seen whole

One agent chain works one selection at a time, and no two chains in a run share
a file:

- a kind: `--kind env-fungi`;
- small kinds together with their siblings, so there are peers to compare:
  `--prefix obj-food-fish`;
- a part of a big kind, per kit: `--models kit/name,kit/name,…`. `set` and
  kinds over about 60 models are split this way.

Everything a chain renders and writes goes under one scratch directory for
that selection. Nothing under `catalog/build`, `kits/.cache` or
`catalog/data` is written by an agent; agents never run the build scripts.

    node tools/renders/kind-sheet.mjs --kind <id> --out <dir>
    node tools/renders/kind-sheet.mjs --models <a>,<b>,<c> --out <dir>/after
    node tools/renders/kind-sheet.mjs --models <a>,<b>,<c> --out <dir>/before --ref HEAD

The first gathers the models with the colormap, renders a pbr and a claywire
sheet of all of them at locked scale, chunk sheets of sixteen at larger tiles
when there are more, and writes `dossier.json`: per model what the catalogue
records, its ratio to the kind median, the glb-lint findings and the tile
name on the sheets. The second and third are how a fix is shown before and
after beside its peers. `--each` adds a close-up per model, pbr and claywire
from three angles, in `<dir>/each`: a kind sheet tile is too small to show a
jagged band edge, a pinwheel of light and dark triangles, slivers or a
wobbling surface, and a close-up shows them at once. `render.mjs` does the rest — `--views 205/45`,
`--band <col,row>`, `--isolate`, `--modes faceorient` — on the copies in
`<dir>/src`, never on the workfile.

## 2. Four roles, never the same agent

**Style looker.** Looks at the selection whole, decides what does not sit with
its peers, writes it down with its evidence and the action it would take.
Changes nothing.

**Close-up looker.** One per chunk of about sixteen models. Looks at each
model alone and close, for the faults inside it: band artefacts, slivers,
jitter, shading breaks, backfaces, hairlines, a model upside down. Writes them
down as the style looker does. Changes nothing. Both lookers run at the same
time on the same selection.

**Fixer.** Applies the looker's tool actions to the workfiles, renders before
and after, records every command. Decides nothing about what is off.

**Verifier.** Judges each applied fix beside the before picture and two peers,
re-lints the file, accepts or rejects. A rejected file is put back with
`git checkout -- <file>`. Never fixes.

**Integrator** — the main session, not a subagent — rebuilds the catalogue per
catalog-assets §6, compares every lint count against the baseline taken before
the run, builds the swipe artefact for the PO and opens the PR.

## 3. What every agent may and may not do

- Geometry is fixed in place with the tools under `tools/import`. Nothing
  else is edited: not `catalog/data/tags.json`, not `asset_variants.json`,
  not `lint/*.json`, not the bible.
- Tags, variants, kind moves and rejects are proposals, written in the
  dossier for the PO. `hero` and `mat:special` are the PO's alone (`P01`).
- Source colours survive (`P11`–`P14`). A fix that drops one is wrong even
  when it looks tidier.
- A kit's own colour for a part is not a fault because another kit uses a
  different band for it: slate nori beside basalt nori is variety, not
  inconsistency. Recolour only where a colour reads wrong on the model itself.
- A model that breaks a §5.3 colour row but reads right is a question for the
  PO, action `ask`, naming the row: the answer is often to relax the row, not
  to recolour the model.
- Shading is changed only where one surface shows a fault: a crease across a
  face that should be smooth, a gradient across a corner that should be hard.
  A whole model shaded softer or harder than its peers is that kit's look.
- Measurements are hints, read after looking. A model that looks right is
  right whatever its ratio says; one that looks wrong is wrong with every
  number in range.
- Where the bible decides, it decides: `B55` makes a mushroom cap sienna or
  camel, `B40` a wrapped grip taupe. Where it is silent, the peers decide. Not
  every difference is a fault: variants are made on purpose (§7), another
  species is not a wrong colour. The question is whether a player would notice
  this model came from another hand.
- When two or three models resolve badly and no rule or peer settles it, write
  an `ask` for the PO instead of guessing.

## 4. Looker

1. Run `kind-sheet.mjs` for the selection. Open the full pbr sheet and say in
   two sentences what the kind reads as and what its common style is: how much
   detail, which colour family, how parts are built and how thick. Then the
   claywire sheet for build. Only then look at single models, on the chunk
   sheets.
2. For every model that does not sit as one of the family, render what shows
   it: iso and `205/45` close up, claywire for geometry, `--band` for a colour,
   `--isolate` for a part. One render per issue is the evidence.
3. Read the dossier last, to confirm or sharpen what was seen, and to catch a
   tag that disagrees with the render: a kind that is not what the model shows,
   a material it does not carry, a `plural` or `broken` it should carry.

Issue types, each with what it looks like:

| type | reads as |
|---|---|
| `detail` | far more or far fewer facets than its peers for the same thing |
| `colour` | a band or a colour family its peers do not use for that part, or two source colours merged into one band |
| `band-artefact` | sawtooth along a band boundary, alternating light and dark triangles on one surface, a triangle that spans two cells |
| `sliver` | long hairline triangles catching light along edges or rims |
| `jitter` | a surface that should be flat or smooth but wobbles, an uneven rim |
| `shading` | smooth where peers are faceted or the other way, a shading break inside one surface, inverted faces |
| `thickness` | a stem, stand, handle or rim that reads as a hairline beside its peers |
| `scale` | clearly larger or smaller than its peers at locked scale, with no `scale-big` or `scale-small` to say so |
| `placement` | floating, sunk, off-centre, leaning |
| `tag` | a kind, material, attribute or flag the render contradicts or lacks |
| `variant` | models that read as one thing and are not grouped, or a group that reads as two things |
| `duplicate` | the same model twice, within or across kits |
| `other` | anything else, said plainly |

Each issue carries one action: `tool` with the exact command, `tag`,
`variant`, `kind` or `reject` with the proposal in words and ids, `ask`
with the question, or `none` when it is worth recording but not acting on.
A model with nothing wrong is written down as fitting; that is a finding too.

## 5. Fixer

Only the dossier's `tool` actions, only on the selection's own files. Per
action:

1. Dry first where the tool offers it (`--dry`, `--list`), and read what it
   would touch. `recolour.mjs --parts` is tried on a copy in the scratch
   directory first, as catalog-extract §4 says.
2. Run the command on the workfile. A run that changes more than the issue
   asks is put back with `git checkout -- <file>` and recorded as not applied,
   with why.
3. Render before and after beside two peers, with `kind-sheet.mjs --models`
   and `--ref HEAD`, and `node lint/glb-lint.mjs <file>`.
4. Record the command verbatim, whether it was applied, the two sheet paths
   and one line on what changed.

Which tool for which issue, from their own help texts:

| issue | tool |
|---|---|
| wrong band, whole or on named parts | `recolour.mjs --from <band> --to <band> [--parts n]` |
| band-artefact on a flat face or a spanning triangle | `face-bands.mjs` (needs `../lp-sources`) |
| zero-area or doubled triangles, broken normals | `clean-mesh.mjs` |
| z-fighting twins | `separate-twins.mjs` |
| hidden triangles | `cull-hidden.mjs` |
| open rim | `cap-holes.mjs` |
| hairline tube or stick | `thicken.mjs [--min d]`; blades, leaves, shells `thicken-walls.mjs` |
| too much detail for its peers | `simplify.mjs [--error f \| --ratio f] [--hard deg]`, rendered before and after |
| shading off | `smooth.mjs --angle`, `facet.mjs --bands`, `restore-normals.mjs` |
| rope not twine | `twine.mjs` |

Slivers and jitter have no tool of their own: `clean-mesh.mjs` takes the
zero-area ones, `simplify.mjs` with a small `--error` can collapse the rest
and even a wobble. When neither does, the issue is recorded as not repairable
with what it would take.

## 6. Verifier

Independent of the fixer: fresh renders, own judgement. Per applied fix:

1. Before (`--ref HEAD`) and after beside the same two peers, pbr and
   claywire, plus the view the dossier's evidence used.
2. `node lint/glb-lint.mjs <file>` on the fixed file.
3. Accept only when the issue is gone, nothing else changed to the eye, the
   source colours are kept, no new glb-lint error or warning appeared and
   the baked shading spread is still there.
4. Reject otherwise: `git checkout -- <file>`, and say in one line what the
   fix cost.

## 7. Running it

    node .claude/skills/catalog-swarm/plan.mjs --out <dir>/plan.json [--done <swept.json>]
    Workflow catalog-swarm  args: { "entries": <one wave from plan.json>, "out": "<scratch dir>" }

`plan.mjs` splits the whole catalogue into selections: a kind, sibling kinds
packed together up to sixty models, or a big kind split by kit. Each
selection carries its models in chunks for the close-up lookers. Waves hold
eight selections; one workflow run takes one wave, and no two selections in a
run share a model. An entry may be a bare string (style looker only), and
`artefactOnly: true` skips the style looker. The script runs both lookers,
then fix → verify per selection, and returns every dossier, fix and verdict.

Order of waves: first the kinds whose models the PO has already marked, so the
procedure is judged on known cases; then the plan's waves in order, so
sibling kinds are seen in neighbouring chains.

Before the first run of a wave, the integrator renders the yardstick once for
every looker to read, and records the baseline:

    node tools/renders/kind-sheet.mjs --kind env-flora-tree-conifer --out <out>/yardstick --modes pbr --no-glb-lint --no-chunks

    for l in size tpu measures mat palette bands; do node lint/$l.mjs | tail -1; done
    node lint/glb-lint.mjs kits/workfiles --only-problems --json <dir>/glb-lint.json | tail -1

After the run: rebuild per catalog-assets §6 (every step except build-lists),
the same lint lines, and the diff is reported as numbers against the
baseline, never against zero.

## 8. Handing the wave to the PO

One branch and one PR per wave. The PR body lists per selection what the
looker saw, what was fixed and accepted, what was rejected and why, and every
proposal and ask; the lint diff closes it.

The proposals and the accepted fixes also go into a swipe artefact for the PO:
one card per item with its renders, swiped right to accept, left to reject, up
to discuss. Its export is a `taalei-extract` JSON — `tags` as add/remove per
tag id, `comments` per model, `swipe` with the three directions and their
paths — so catalog-extract applies the verdicts. Tag and variant changes are
applied only from that extract, after the swipe.
