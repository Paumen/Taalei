# Stijl-experiment: what makes Claude pick the right model style?

Measures how presentation factors affect Claude's accuracy when it must pick
which of two 3D models matches the catalog's target style, given labelled
good/bad reference examples.

## Data

`docs/stijlreferentie/` holds 105 sheets (n1-n29 natuur, o1-o43 object,
s1-s33 structuur). Each sheet is one *item*: the same object in two styles,
8 angles each - top block labelled AFWIJKENDE STIJL, bottom block GOEDE STIJL.
Sheets double as labelled references (used whole) and as test stimuli
(cropped into unlabelled per-angle tiles by `prepare_tiles.py`).

Angle indices: 0-3 rotations (row 1), 4-5 more rotations, 6 tilted
three-quarter, 7 top-down.

## Design

- **One fixed test set for every condition** (default 20 items, stratified
  over n/o/s, seeded). Conditions are compared *paired on the same items*
  (McNemar), which is far more sensitive than comparing independent samples -
  item difficulty varies a lot, and pairing cancels it out. This is also why
  a single run per (condition, item) cell is enough at this stage: variance
  between items dwarfs variance between repeated runs of the same item.
- **Reference set is disjoint from the test set** and fixed within a
  condition, so a test item never appears as a reference and every trial in a
  condition sees identical references.
- **A/B position is exactly balanced** (alternating over the sorted test set)
  and fixed across conditions, so position bias cancels in comparisons and is
  itself measured (accuracy split by good=A vs good=B in the report).
- Each trial is a fresh `claude -p` call with images injected as base64
  blocks (stream-json), no tools, replaced system prompt - the model sees
  exactly the stimulus, nothing else. Because images are message content
  rather than file paths, every reference is decoded into the model's
  input unconditionally - there is no "open" step it could skip (verified:
  recorded input tokens grow by ~1133/sheet across the refs ladder,
  matching the API's per-image cost). This differs from agent workflows,
  where references are read via tools and skipping is possible. Answer format is strict JSON:
  {"choice": "A" or "B"}. (Phases 1-2 also asked for a confidence number;
  it turned out barely calibrated and was dropped - prompt v2. Prompt v3,
  phase 5, names the models as low poly and directs judgement at
  within-spectrum nuances instead of generic low-poly typicality.)

## Factors

| factor | phase 1 levels | notes |
|---|---|---|
| references shown | 0 (+guide), 2, 6, 12 | labelled full sheets |
| angles per model | 1, 2, 4, 8 | subsets of the 8 tiles |
| resolution | scale 1.0 / 0.5 / 0.25 | applied to refs and candidates |
| style-guide text | off / on | condensed §0/§2/§3 of the asset style guide |
| model | sonnet-5 (later factor) | `model` key per condition |
| effort | medium (later factor) | `effort` key per condition |

Phase 1 is a one-factor-at-a-time sweep around the baseline
(6 refs, 4 angles, scale 1.0, no guide text): 10 conditions x 20 items =
200 trials, roughly $5-8 and ~30-60 min at concurrency 4.

**Phase 2** (after phase 1 results): take the 1-2 factors that moved accuracy,
test their interaction (2x2) and finer levels; sweep *which* angles at the
best angle count (e.g. tilted-only [6] vs front-only [0] vs top [7]); then the
model x effort grid on the surviving presentation format. Other candidate
factors, if phase 1 saturates: unlabelled good-only references, both
candidates combined into one image vs separate images, colour vs greyscale
renders (needs new sheets).

Ceiling warning: if baseline accuracy is ~19-20/20 nothing will separate the
conditions - make the task harder first (fewer angles / smaller scale across
the board, or a harder test set from the per-item matrix) before drawing
conclusions.

## Phase 1 findings (2026-08-29, sonnet-5 medium, 20 items, $5.33)

Full numbers in `results/report.md`. None of the individual contrasts reach
p<0.05 at n=20 (expected); the trends below are consistent and interpretable.

- **Angles are the strongest factor.** 1 angle = 50% (coin flip!), 2 = 70%,
  4 = 75%, 8 = 75%. A single view is worthless; 4 views saturate.
- **Visual references beat text, and 6 is enough.** Style-guide text only
  (0 refs) = 55%; 2 refs = 60%; 6 refs = 75%; 12 refs = 70% (no gain, 2x
  cost). Guide text *on top of* 6 refs = 80%, the best cell.
- **Half resolution is free.** scale 0.5 = 75% at ~1/3 the cost of full
  res; scale 0.25 = 60% (too far).
- **s5 and s13 are consistently missed.** Initially flagged here as
  suspect sheets, but their labels are confirmed correct - so these are
  genuine model failures on hard pairs (s5 plank piles, s13 house vs roof
  segment), both in the structuur category.
- Confidence is barely calibrated (0.72 when right vs 0.69 when wrong) -
  don't use it as a filter signal.
- Mild B-position bias (accuracy good=B > good=A in most conditions);
  balanced design cancels it in comparisons, but worth remembering for
  production prompts: don't always put the candidate last.

**Recommended phase 2:** re-screen the angle factor with power on a bigger item set (1 vs 4 angles,
~40 items, scale 0.5); test *which* angles at count 2-4 (e.g. tilted [6]
vs rotations); then the model x effort grid on the winning format
(6 refs + guide, 4 angles, scale 0.5).

## Phase 2 findings (2026-08-29, refs ladder + category runs, $12.79)

- **Reference count is flat.** On the same 20 items the ladder reads
  2 refs 60%, 4 70%, 6 75%, 8 70%, 12 70%, 16 60%, 20 70%, 24 75%,
  28 85%. Everything from 4 to 24 bounces inside single-cell noise
  (each cell moves +-2-3 items), while cost grows linearly
  ($0.02 -> $0.13/trial). The 28-refs spike (17/20, p=0.625 vs base) is
  one unreplicated cell - do not buy 28 refs on this evidence.
- **Reference *relevance* is the real lever.** Single-category runs, each
  paired with a control on identical items but mixed refs: same-category
  references win in all three categories - natuur 15/15 vs 10/15,
  object 9/15 vs 7/15, structuur 8/15 vs 6/15. Pooled over the 45 paired
  items: 71% vs 51%, McNemar b=2 c=11, **p=0.022** - the first
  significant effect in the whole experiment. Six well-chosen sheets beat
  28 generic ones (and cost 5x less).
- **Category difficulty differs a lot.** With mixed refs: natuur 67%,
  object 47%, structuur 40%. The consistently-missed s5/s13 (labels
  confirmed correct) sit in structuur - a genuine weak spot, not label
  noise. Notably n21, wrong in ~12 mixed conditions, is right with
  nature-only refs.

## Set B replication (2026-08-29, fresh 20-item test set, seed 7, $14.67)

Same conditions re-run on a second test set sharing no item with the
first (`phase2b-*.json`, `*_b` conditions).

- **The flat reference-count curve replicates; the 28-refs spike does
  not.** Set B ladder: 4 refs 55%, 6 40%, 8 65%, 12 50%, 16 50%, 20 60%,
  24 55%, 28 55%. No trend with count in either set; set A's refs28=85%
  was noise, as suspected.
- **The same-category-references effect replicates.** Set B: natuur 14/15
  vs 11/15, object 8/15 vs 4/15, structuur 11/15 vs 7/15 - again all
  three in the same direction; pooled McNemar p=0.019. Combined over both
  sets: same-cat 65/90 (72%) vs mixed 45/90 (50%), b=6 c=26,
  **p=0.0005**. This is now a solid effect, not a one-off.
- **Item difficulty varies hugely between draws.** Set B is much harder
  than set A (ladder means ~54% vs ~70%) - with mixed refs the hard set
  sits barely above chance, while same-category refs lift it to 72%.
  This validates the paired design and warns against comparing absolute
  accuracies across different item sets.
- Structuur recovers with matched refs: 11/15 on set B with s5/s13
  serving as (correctly labelled) reference sheets.

## Cross-refs check (2026-08-29, set B items x set A references, $5.00)

`phase2c-xrefs.json`: the 14 set-B items not present in set A's refs28,
judged with set A's exact reference sets at counts 4/8/12/20/28, each
paired against the same-count set-B condition on the same items.

- **Set A's references are not better.** Pooled: set A refs 39/70 (56%)
  vs set B refs 45/70 (64%), b=14 c=8, p=0.29 - no significant
  difference, direction slightly favouring set B's own draw. Per-count
  cells bounce both ways (setA-refs wins at 20, loses at 8), i.e. the
  usual single-cell noise.
- Conclusion: set A's higher phase-2 scores came from its easier test
  items, not from a luckier reference draw. Which *generic mixed*
  reference sheets you use barely matters - consistent with count being
  flat and category-match being the one reference property that does
  matter.

## Phase 3: Opus 5 on the set-B ladder (2026-08-29, $17.62)

`phase3-opus.json`: Opus 5 medium on set B at counts 4/8/12/20/28,
stimuli identical to the sonnet `refs*_b` cells (note: prompt v2 vs the
sonnet cells' v1 - minor confound).

- **Opus is ahead but not decisively: 66/100 vs 57/100 pooled** on
  identical trials (b=15 c=24, p=0.20). It leads at 4 of 5 counts, ties
  at 8 refs. The count curve stays flat for Opus too (60-70%).
- **Different error profile, not a strict upgrade.** Opus solves o36
  (5/5, sonnet's stubborn miss) but goes 0/5 on n16, n27 and s17 where
  sonnet was sometimes right. s12 resists both models (1/10 combined).
- Cost ~2.7x sonnet ($0.176 vs ~$0.065/trial), similar latency. For
  comparison: category-matched references bought +22pp for free;
  switching to Opus buys ~+9pp at 2.7x cost. Reference relevance remains
  the better lever.

**Recommended phase 3:** the presentation question is settled enough -
category-matched (or nearest-kind) reference selection is the lever;
count, beyond ~4-6, and extra resolution are not. Next: same-cat refs x
guide text, then the model x effort grid on that format.

## Cached mode (primed sessions)

Conditions with `"cached": true` send the references once per condition
(a prime turn the model answers "OK"), then every trial forks that session
(`--resume --fork-session`) with only the test case. The conversation
prefix (system + references turn) is byte-identical across trials, so the
CLI's automatic prompt caching serves it at the 90% cache-read discount.
Verified on the first cached runs: prime writes 9.5k tokens once, every
trial reads exactly those tokens back (`cache_read` is logged per trial),
$0.007/trial vs ~$0.045 uncached at the same size. Forking is isolation:
each trial's transcript is the prime plus its own question only. The
remote harness pins child sessions to the parent's session id via
CLAUDE_CODE_SESSION_ID / CLAUDE_CODE_REMOTE_SESSION_ID; the runner strips
both so priming and forking work.

Caveat: cached mode is a slightly different stimulus (references arrive in
a prior turn with an "OK" between) - don't compare cached and single-
message conditions as if identical; `cached` is part of the condition
fingerprint.

## Phase 4 (2026-08-29, cached mode, new default config, $0.25)

New default for this phase onward: sonnet medium, **8 angles, 8 refs,
12 test items**, full res, seed 5 (`phase4-cached.json`).

- mix_8a8r (items + refs across all categories): **8/12 (67%)** -
  wrong: n6, o16, s33, s5.
- obj_8a8r (items + refs objects-only): **9/12 (75%)** - wrong: o12,
  o24, o27.
- Direction matches the category-match effect again, but these two runs
  use different test sets (only 5 shared object items), so this is not a
  paired comparison - treat as a calibration of the new format, not a
  new measurement of the effect.

Effort x refs 2x2 around the default (`phase4-effort.json`, same 12
mixed items, all cached, $0.52):

| | 8 refs | 16 refs |
|---|---|---|
| effort medium | 8/12 | 6/12 |
| effort high | 8/12 | 6/12 |

- **High effort buys nothing here** (8/12 vs 8/12, p=1.0 - it fixes n6
  and breaks s27), and barely costs more: thinking output on this visual
  task stays tiny at both levels.
- **16 refs trends worse than 8 at both effort levels** (b=2 c=0 and
  b=3 c=1 vs baseline) - consistent with the count finding, here even
  mildly negative.
- s5 and s33 are wrong in all four cells; o16 in three - the stable hard
  core of this 12-item set.

The same 2x2 rerun on the **objects-only default** (now the working
default: test items and refs both category o - `phase4-effort-obj.json`,
same 12 object items as obj_8a8r, $0.52):

| | 8 refs | 16 refs |
|---|---|---|
| effort medium | 9/12 | 9/12 |
| effort high | 9/12 | 9/12 |

- **Effort is completely inert here**: at 8 refs, high effort gave
  answers *identical per item* to medium (b=0 c=0); at 16 refs the two
  effort levels also miss the exact same items.
- **16 refs is neutral** (swaps o12 for o32, one item each way).
- o24 and o27 are wrong in all four cells - the hard core of the object
  set. With category-matched refs the format is remarkably stable at
  9/12 across all four cells, vs 6-8/12 for the mixed-ref 2x2 above.

## Phase 5: prompt v3 + reference order (2026-08-29, cached mode, $0.30)

Motivated by the rationale run: the model's misses all over-applied a
"chunky and smooth beats thin and detailed" heuristic - i.e. it judged
generic low-poly typicality instead of this catalog's spot on the spectrum.
Prompt v3 targets that directly. The intro now opens:

> Task: two low poly 3D models of the same kind of object follow below. One
> matches our catalog's target style, the other deviates from it. Decide
> which one matches. Since all models are low poly, focus on the nuances the
> target style has within the spectrum, not on which model has the most
> classic or typical low poly characteristics.

Run on the objects-only default at 8 and 16 refs (paired against the
v2-prompt cells with the same refs), plus one cell with the same 8 refs
injected in reverse order (`reverse_refs`, paired against forward order).

| condition | prompt | refs | order | acc | misses |
|---|---|---|---|---|---|
| obj_8a8r (control) | v2 | 8 | fwd | 9/12 | o12 o24 o27 |
| obj_nuance | v3 | 8 | fwd | 9/12 | o24 o27 o32 |
| obj_16r (control) | v2 | 16 | fwd | 9/12 | o24 o27 o32 |
| obj_nuance16 | v3 | 16 | fwd | 9/12 | o23 o27 o32 |
| obj_nuance_rev | v3 | 8 | **rev** | **10/12** | o27 o32 |

- **The wording change nets zero at both ref counts** (b=1 c=1 in both
  paired comparisons). At 8 refs it reproduces exactly the trade that
  doubling the references had produced under v2: o12 fixed, o32 broken.
- **v3 + 16 refs got o24 right for the first time in any condition** - but
  broke o23, which had never been missed anywhere before.
- **Reversing the injection order of the same 8 sheets** gave the best
  object cell so far, 10/12: o24 correct again, nothing newly broken
  (b=0 c=1 vs forward order - not significant, n=12).
- Reading across phase 4+5: o27 and o32-adjacent items are traded around by
  every lever (more refs, wording, order) while total accuracy sits fixed at
  9-10/12. The boundary items are decided by presentation-order-level noise,
  not by any factor tested; o27 is missed in every cell except the
  rationale run, and o24/o32/o12/o23 swap in and out. For this item set,
  75-83% is sonnet's stable operating point with matched references, and
  single-cell differences of one item should not be read as effects.

## Phase 6: system prompt, reference packing - and the noise floor (2026-08-29, $1.05)

Two more manipulations on the objects-only default, then the check that
reinterprets them. Prompt v4 drops "low-poly" from the system prompt's
catalog description (the intro still names the models as low poly);
`refs_per_image` packs the 8 reference sheets into 2 composite images
(2x2 grids, black gutters, scaled to the API's 1568px cap, ~6.2k vs ~9.1k
image tokens).

| condition | change | acc | misses |
|---|---|---|---|
| obj_nuance | v3 system prompt (control) | 9/12 | o24 o27 o32 |
| obj_nolp | v4: no "low-poly" in system prompt | 7/12 | o12 o24 o27 o32 o37 |
| obj_nolp_2img | v4 + 8 sheets in 2 images | 10/12 | o24 o32 |
| obj_nolp_2img_r2 | same, rerun | 10/12 | o23 o24 |

Read alone, that says the system prompt cost 2 items and packing won 3 back.
It says nothing of the kind. **`obj_nolp` was rerun five more times with a
byte-identical prompt** (`obj_nolp_r2..r6`, same stimulus, same system
prompt, same refs, same order):

| run | r1 | r2 | r3 | r4 | r5 | r6 |
|---|---|---|---|---|---|---|
| score | 7/12 | 10/12 | 8/12 | 10/12 | 9/12 | 8/12 |

**Spread 7-10/12 on one unchanged condition; mean 8.7, sd 1.21 items.**
Per item over those six runs: **7 always right, 1 always wrong (o32),
4 coin-flips** (o24 1/6, o12 2/6, o27 3/6, o37 4/6). A single 12-item run
is therefore `7 + Binomial(4, ~0.4)` - it measures the sampling of four
unstable items, and nothing else.

Consequences, and they are retroactive:

- **Every single-run cell in phases 4-6 lands inside 7-10/12.** Effort,
  16 refs, rationale, prompt v3 wording, reference order, the system-prompt
  change, and 2-image packing are all indistinguishable from rerunning the
  same condition twice. None of them is evidence of an effect.
- The phase-4 "high effort reproduces medium answer-for-answer (b=0 c=0)"
  was luck, not determinism: identical reruns differ on 2-4 items.
- The one result that clears the band remains the category effect
  (72% vs 50%, ~50 trials per arm, paired, replicated on two disjoint item
  sets, p=0.0005) - it is 4x the noise sd and was never a single-cell call.
- Detecting a true 1-item effect at this sd needs roughly a dozen runs per
  arm. Cheaper: **enlarge the test set instead of replicating**. 7 of 12
  items are decided identically every time and carry no information; a
  40-60 item set puts more discriminating items in play per dollar.
- o32 is the only object item missed in all six runs (o24 in 5 of 6) - the
  genuinely hard core, and the only sensible target for a style-rule fix.

Practical note for future phases: **do not read a single 12-item cell.**
Either replicate it or compare only differences of 4+ items.

## Rendering the sheets (resolution ceiling)

The sheets are not photographs but three.js renders of real geometry
(`tools/renders/index.html`: orthographic camera, flat shading, 8 fixed
viewpoints, `TEGEL = 224` px per view, drawn 4x2 into an 896x448 canvas;
`tools/vind-match/bladen.py` stacks two of those into the 896x956 sheet).
The tile size is 224 because that is DINOv3's native input size for the
matching pipeline (`inbedden.py`) - it was never chosen for visual review.

So higher-resolution stimuli need no better source images, just a
re-render with a larger `TEGEL`; upscaling the existing PNGs would add
interpolation, not detail. Ceiling: the API downsamples anything past
1568px on the long edge, which allows ~1.6x for a full reference sheet
(224 -> ~367 px/view) and ~1.7x for a 4-per-row candidate panel, or ~3.4x
if a panel carries 2 views per row. Re-rendering *these* sheets also needs
the sheet -> source-model mapping, which is not in the working tree
(`docs/missing_matches` and its matches.json are gone); without it a
re-render produces a new item set, not a higher-resolution version of this
one. Prior expectation is low anyway: phase 1 found half resolution free
and quarter harmful, so 1.0x already sits on the flat part of the curve.

## Running

```bash
cd tools/stijl-experiment
python3 prepare_tiles.py                          # once, regenerates tiles/
python3 run_experiment.py conditions/phase1.json --dry-run   # cost preview
python3 run_experiment.py conditions/phase1.json --only base --limit 3  # smoke
python3 run_experiment.py conditions/phase1.json  # full run (resumable)
python3 analyze.py                                # -> results/report.md
```

Results append to `results/results.jsonl`; finished (condition, item) pairs
are skipped on re-run, so interrupting is harmless. A condition's settings are
fingerprinted (`condition_key`), so editing a condition's parameters while
keeping its id causes its trials to re-run rather than being wrongly skipped.

Uses the `claude` CLI's managed auth - no API key needed. Model/effort are
per-condition keys, so the later model x effort sweep is just another
conditions file.
