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
