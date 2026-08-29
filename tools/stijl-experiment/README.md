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
  exactly the stimulus, nothing else. Answer format is strict JSON with a
  confidence number (free calibration signal: is the model less confident
  when it is wrong?).

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

**Recommended phase 3:** replicate the winner: same-category (or
nearest-kind) reference selection x guide text, on a bigger item set;
only then model x effort. For production prompts the actionable rule is
already clear: pick references of the same kind as the candidate rather
than adding more of them.

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
