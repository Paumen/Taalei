---
name: sheepdog
description: Round up the strays of random catalogue kinds, or families of related kinds — sub agents render each kind on sheets, fix glitchy triangles, off colours, odd shapes and thickness against the kind's peers, and update tags, autonomously; every run ends with a review page whose verdicts revert and calibrate. Use when asked to run sheepdog, to make kinds coherent, or to apply sheepdog review verdicts.
---

# Sheepdog

One run: pick kinds, one sub agent per kind fixes its models, record, rebuild,
push, and end with a review (`.claude/skills/review`) of the run's changes. A
second, short run applies the PO's verdicts.

The tool is `tools/sheepdog/sheepdog.mjs` (`--help` lists every command). It
logs every picked kind in `tools/sheepdog/log.json`, so a random pick never
returns a kind; `--kind` picks a kind on purpose, also one logged before.

`CLAUDE.md` binds: never look at earlier commits or PRs, no comments or
assumptions in code, English only. `docs/asset_style_guide.md` decides
materials, colours and sizes; `.claude/skills/catalog-assets/SKILL.md` §3–4
say how bands and tags work. The agents get both as reading.

## 1. Fix run

1. Branch from main. `npm install` once (glb-lint). Clone the sources if
   `../lp-sources` is missing, so `face-bands.mjs` can even glitchy triangles:

       git clone --depth 1 https://github.com/Paumen/lp-sources ../lp-sources

2. Take the calibration text for the briefs:

       node tools/sheepdog/sheepdog.mjs brief

3. Pick and render. Six kinds with models from two or more kits by default,
   whatever their size; `--kind` names kinds, `--max` caps the model count.
   Sheets hold at most 12 models each, every tile fitted to its own model.

       node tools/sheepdog/sheepdog.mjs pick

   It prints the run dir (`kits/.cache/sheepdog/<run>`) and writes `run.json`
   there: per kind its dir, dossier and sheets.

4. For every kind in `run.json`, spawn one sub agent (`general-purpose`,
   inherit the model, background) with `brief.md` from this folder, the
   placeholders filled: `{{kind}}`, `{{kinds}}` (the entry's `kinds`, comma
   separated), `{{dir}}`, `{{sheets}}` (one path per line), `{{calibration}}`
   (the output of step 2). Three run at once; start
   the next when one finishes. Agents work only their own kind's workfiles and
   their own run dir, so they do not collide. Do not touch `tags.json` or run
   a rebuild while agents run.

5. When all agents are done:

       node tools/sheepdog/sheepdog.mjs record --run kits/.cache/sheepdog/<run>

   It applies the agents' tag edits, lints every changed file against its
   before-state and turns a new finding into doubt, and stores the changes in
   the log. An agent that wrote no `result.json` is reported and skipped;
   chase it before recording if its work is unfinished.

6. Rebuild per `catalog-assets` §6, every step except `build-lists`. Commit
   the workfiles, `tags.json`, the log and `catalog/build`; push; open the PR.

7. Review, per the review skill. Write the list and calibrate it:

       node tools/sheepdog/sheepdog.mjs review --out <scratchpad>/review-list.json
       node tools/review/review.mjs brief

   Doubted changes are high, the rest low; drop the low items of a type the
   brief says to send only where doubt is high. Build, publish the page as an
   artifact and link it in the PR.

8. Report to the PO: the kinds, changes made and doubted per kind, the
   agents' notes (`notes` in the log) and the review link.

## Family run

`pick --family` works groups of related kinds instead of single kinds: a
parent kind and the kinds under it, such as `obj-food-sweet` with its cane,
chocolate and icecream kinds. Groups hold at most `--max` models (48) and are
merged up from below `--min` (12) where they fit; a parent too big is split
into `<parent>~2`, `~3`, …. Families keep their own done list, so every group
is open once whatever the single-kind runs did. Everything else is the fix
run: the agents judge across the group and may move a model to another kind
of it.

## 2. Verdict run

The PO pastes the review page's verdicts. Save them to the scratchpad and:

    node tools/review/review.mjs apply <verdicts>
    node tools/sheepdog/sheepdog.mjs verdicts --file <verdicts>

Revert and retry put the model back as it was before its run, file and tags,
and log every change on it `nok`; keep, keep but, relax and other log `ok`;
later stays open. Do the work `apply` prints, then rebuild per
`catalog-assets` §6 except `build-lists`, commit and push on the same branch.

`brief` folds the verdicts into the next run's briefs: changes judged nok
tell the agents what not to do, doubted changes judged ok tell them where
less doubt is due. `stats` gives the counts.

## Gotchas

- `pick` refuses a kind with open doubts: review those first.
- Commit nothing until `record`: agents lint and revert against `HEAD`.
- A model changed by an agent but not listed in its `result.json` is logged
  as a doubted `look` change, so nothing slips past the PO unseen.
- Rendering runs Chromium: three agents at once is the ceiling on four cores.
- The run dir is under `kits/.cache`, gone with the container; the log holds
  what reverts need (the before blob is written into the git object store).
