---
name: lod
description: Bring catalogue models to the catalogue's level of detail, not too detailed and not too coarse, so each still reads as the thing it represents. Use when asked to fix level of detail, thin parts, fiddly, dense, too chunky or too simplified models.
---

# Level of detail

## Goal

Every model sits at the catalogue's level of detail: not finer, not coarser,
and it still reads as the thing it represents. Too fine breaks the chunky
style (I01): hairline strands, paper-thin walls, dense repeats, tiny hardware.
Too coarse loses what the thing is: blunt blocks, lost points, closed openings.

A broom with dozens of hairline bristles is wrong. A broom that is a stick
with a blunt block at the bottom is wrong too.

## Reads as itself

Common sense throughout the task: the model must read at once as the thing it
represents. A pen reads as a pen, not as a pencil or a pointy stick. It
doesn't have to stay as it was; sometimes changing it is the point.

For some models to read right, it can matter that:

- **Points stay points**: arrowhead, spear and blade tips stay sharp and
  straight.
- **Round stays round**: not wobbly, bumpy, pointy or oval.
- **Openings stay open**: muzzles, bores, holes, slots, chain links, gaps
  between teeth or arms.
- **Parts stay apart**: a grown part doesn't poke through or cover its
  neighbour.
- **Character stays**: comb teeth stay pins, not blocks. A knife still looks
  sharp, for the style. A string, cord or wire still reads as one next to the
  rest of the model and the catalogue, not as a tube or a solid piece.
- **Type stays**: what makes the type within the kind (inlaid gems,
  dartboard numbers, a twisted candle, a glowing bulb, the band round a frag
  grenade). Losing it is wrong even when the kind still reads.

## Problems and indicators

Level of detail is never a number: it is only how the model looks and reads.
Problems are seen by eye. A model can have any one or any combination, and
fixing one can cause another.

Every problem can be flagged by a render, a PO comment or peers in the kit;
the table lists the other indicators.

| Problem | Example | Other indicators |
| --- | --- | --- |
| **Too detailed** | | |
| Fiddly bits | hairline bristles, wire hands, paper flags | G27, tpu high |
| Unnecessary bits | screws, decals, back knobs, tiny feet | many small parts, tpu high |
| Too many repeats | 20 comb teeth, a spiral binding | tpu high, G27 |
| Too complex shapes | finely threaded screw, many-sided small knob | tpu high |
| Paper-thin sheets | one-sheet card, open shell | G27 |
| **Too coarse** | | |
| Too thick | swollen flower stems, pan walls, table legs; pen clip grown into a marker | thick next to peers, an earlier stylize or thicken round |
| Too simplified | broom as a stick with a block, comb teeth as blocks, thread as plain rings | tpu low for its kind |
| Too chunky | pencil reads as a crayon, dart needle as a cone | an earlier stylize round |
| Lost points, openings or type | blunt arrowhead, closed muzzle, pen reads as pencil | past verdicts |

## Approach

Effort follows need. Most models settle in a quick tool pass; only those that
fail it get the careful work. The goal is the same for both: the model reads
as itself at the catalogue's level of detail. Thickness is an indicator, never
the goal.

### Setup (main session, once per round)

1. **Pick models**: the ones the PO names, or candidates from Finding them.
2. **Brief**: read past verdicts (Review and learn) and the style examples
   once: the [LoD example set](https://claude.ai/artifact/QG6bTDZxYCKLpXp5tM8yTG),
   with glbs in `examples/` next to this file; `examples/LIST.txt` gives each
   card's tag, why, and which version is right. Keep the quotes that matter
   per model.
3. **Triage** (`node tools/thin/triage.mjs [ids] [--kit k] --out
   triage.json`, no renders): per model the target wall (the kind's
   `thin.min`, at least 0.006), how much of the thin area is hidden inside,
   what the thin part is, and the route: hidden, tool or careful. The route
   table and its first-choice modes live in the script.

### Quick pass (scripted, all hidden and tool models)

`node tools/thin/quickpass.mjs triage.json --out <dir>` tries the fixes in the
triage order and stops at the first that passes every gate. Hidden walls are
dropped first (`tools/thin/hidden.mjs`); thicken modes come by what the thin
part is (flat: `--flat`, bent sheet: `--sheet`, shell: `--inward`, small
spot: `--local`), each aimed at 0.006 with up to three passes (`--aim kind`
first aims at the kind's `thin.min`, which in a test made plates and hands
too heavy); a model thin all over may end with a small whole-model
scale-up. Every result goes back on its floor with fresh normals
(`tools/thin/tidy.mjs`).

A try fails when it is still under the aim, leaves or adds a G27 error, grows
the outline more than the aim needs, changes the shape of the main face,
closes an opening, adds glb-lint findings or back faces, or, for a hidden
drop, changes more than a few pixels on 8 views. A failed try is dropped and the next one
runs. Nothing touches `kits/workfiles` yet.

The fresh checker (Checks) judges the sheets listed in `<dir>/checker.md` in
one go. `ok` and same or better: `quickpass.mjs apply <dir>/report.json
<ids>` puts it in place. Anything else goes to the careful pass with the
checker's words. Hidden drops change nothing visible and need no checker.

Triage sends these straight to the careful pass, since the tool modes are
known to fail there: a sharp blade, point or edge; lettering, numbers,
strings, threads or anything else that makes the type; a model whose latest
PO verdict is not keep. Models the quick pass could not settle follow, with
the list of what was tried and why it failed.

### Careful pass (only what the quick pass did not settle)

One small, fresh sub agent per one or two models, run on the API key, not
this session: write its brief to a file and run `node tools/agents/run.mjs
<brief.md>` (in the background for several at once). It prints the agent's
answer and its cost in USD. Its brief: the model, its problem, the checker's
or PO's words, what the quick pass tried, and the verdict quotes that matter,
and that it follows `.claude/skills/lod/SKILL.md`. It works as the rest of
this skill says: look (peers when size or chunkiness changes), name the
problem from the table, pick from Fixes, render, and ends its answer with
what it changed and the paths of its before and after glbs. The main session
runs the fresh checker and passes its verdict back.

### Retries

A retry answers the comment: it names what was wrong and changes the
approach, not a setting. The same tool with a slightly different number is
not a retry. Retries go to a fresh sub agent (`tools/agents/run.mjs`) with
only that model. After two
failed approaches the model goes back to how it was and onto the review page,
with the tries and a proposal (Edge cases).

### End of round

1. **Lints**: rebuild the catalogue and run the lints and `golden` once; fix
   new findings. A clean lint is never a visual check.
2. **Review**: models that need a look go on a `LoD: …` page
   (`tools/review/review.mjs`), each with what changed, how, and what was
   tried. Apply the verdicts.

## Finding them

Indicators point at candidates; the render decides.

**Too detailed**

- **Thin parts**: `node lint/measures.mjs G27`. Map the thin faces with
  `tools/thin/thinmap.mjs` + `thinmap.py`, so the fix targets the part G27
  means.
- **Dense overall**: sort `catalog/build/catalog.json` on `tpu` or `tris`, or
  `node lint/tpu.mjs` for models over budget.
- **Dense for their kind**: in kinds of one shape (apple, book, cleaver,
  skull, axe; not mixed kinds like ships, toys, instruments), compare `tpu`
  with the kind median. Leave out the `char` and `set` kinds, and models
  tagged `plural` or `comp`.
- **Detailed but not dense**: many small parts at an average `tpu`.

**Too coarse**

- **Thick or chunky next to peers**: render the kind's line-up.
- **Low `tpu` for the kind**: a blunt block where peers have shape.
- **Earlier rounds**: models changed by a stylize, thicken or slim round
  (past review pages, git history after asking the PO, C12).
- **Past verdicts**: comments like blunt, chunky, swollen, deformed or lost
  detail.

**Both**

- **Clusters**: outliers often share a kit (styloo, m3-base, quat): one
  modelling habit, one treatment.
- **Hidden on purpose**: gold in a chest, food in a fridge. Render `xray`;
  leave it alone.

## Fixes

Claude fixes the model; tools help where they fit. A tool that misbehaves is
noted as a tool finding, and the fix is made another way. When you reuse a
tool, say which and why it suits this case. Fixes combine, and one fix can
cause another problem.

Every fix keeps: small colour accents (steel hubs, amber bulbs); each part's
light-to-dark shading; handles graspable; open loops (buckles, tabs, rings)
open and rounded; round parts with enough sides to stay round, no more than
peers use.

**Too detailed**

- **Thicken**: only the thin part grows, toward the kind's `thin.min`. Fall
  back to a lower wall (never under 0.006) only when the target can't be
  reached while the model still reads as itself; its review card carries an
  unmistakable fallback warning. Every mode is blind to a tip, opening or
  neighbour within 3 mm: `--sheet` bent tips (17 of 46 sent back), `--flat`
  lost outlines (7 of 11), `--inward` filled hollows (2 of 3), the default
  and `--local` grow into openings. Near such a spot: grow only the faces that
  need it (`--parts`, `--local`), grow one side only (`--away`, `--inward`),
  keep slots open (`--open <w>`), keep a part set into another from poking
  out (`--hidden`), or rebuild the part. Try `--back` first: many thin walls
  are a plate, pip or label sunk into a body, or a hidden inner copy of a
  surface, and moving only the hidden side fixes them with nothing visible
  changing (kept: dice, abc-block, boombox, desk phones, ken-cave gate).
  Tool: `tools/thin/thicken.mjs`.
- **Fewer repeats**: fewer buttons, wheels, vents, bars, rings, tines,
  matches; the rest get thicker. The count matters as much as the look: does
  it still read as "covered in sprinkles" or "a spiral binding"? Kept:
  matchbox 11 → 6. Sent back: comb 20 → 10, teeth became blocks. Tool:
  `tools/detail/slim.mjs`: `parts <glb>` lists part ids, and
  `edit <glb> '<ops>' --out <glb>` applies the ops `drop`, `replace`,
  `lathe`, `net` and `add` named below (no arguments prints help).
- **Drop part**: screws, rivets, bolts, small feet, lettering, decals, knobs
  on the back, clips. Never a part that makes the type. A dropped part leaves
  no hole (lighter-01). Tool: `slim.mjs` op `drop`.
- **Swap shape**: a dense tube, sphere or cone becomes a plain one; it keeps
  colour, size, placement and shading, and never goes thinner than the
  original's thinnest tube. A fine net gets bigger holes, same regular
  pattern. A turned part tight inside an untouched round neighbour: lathe
  both or neither. Tools: `slim.mjs` ops `replace`, `lathe` (fewer sides only), `net`.
- **Rebuild part**: a clean closed solid on the part's own outline, when
  patching keeps failing. Kept: paper-tidy label frame (★), wall-rack sheets
  as boards (★), bullet casing capped (`tools/thin/cap.mjs`). Sent back:
  screw threads as plain rings, c4 wires 4× too thick.
- **Scale up**: only when the whole model is thin, not one part. Kept:
  stapler at 1.6×. Tool: `tools/import/scale.mjs`.

**Too coarse**

- **Thin out**: shrink a swollen part back toward its peers, around its
  middle or from one side. By hand, or a new tool (`thicken.mjs` only grows).
- **Undo**: an earlier tool made a part thinner or thicker than needed; take
  that part from the source or the version before that round (git, after
  asking the PO, C12).
- **Restore detail**: bring back a lost point, opening, groove or repeat;
  more sides on a round part that turned faceted. Tools: the source model,
  `slim.mjs` op `add`, by hand (`lathe` only cuts sides).
- **Rebuild from source**: a part simplified into a block is rebuilt from the
  source shape at catalogue thickness.
- **Size, not shape**: a whole model that reads too chunky because of its
  size goes to `stylize`'s size step, not here.

**Any**

- **New or changed tool**: when that helps.
- **Anything else**: any other creative attempt, as long as it aims at the
  goal.

## Where a result goes

By how it looks, not by a number.

- **Clearly wrong** (broken, ridiculous, the opposite of the style): try
  another approach (Retries). When that fails too, investigate why and
  propose options: a better method or tool, a change to this skill, or a
  decision for the PO. Each option says what it fixes and what it costs.
- **Unsure or stuck**: no long effort loops. When a model isn't clearly
  better after a couple of quick tries, or Claude is unsure, it goes to the
  review page early, with what was tried. Catch serious issues first, polish
  later. A few extra models for the PO cost far less than a long effort that
  still ends in a reject.
- **Grey area** (a style call that could go either way): take the risk and
  send it to the review page. That is what the review page is for.
- **Clean, looks fine**: no review card. While calibrating, a sample goes on
  the review page as low doubt, to learn which fixes can pass unreviewed.
  Every round still ends with a review page, even if it holds only that
  sample.

## Checks

Numbers and the visual check are separate checks for different things. A
number flag means look again and fix if needed, and may point the fixer to a
spot; the checker never gets numbers.

Visual check: look at the whole model, and adapt to the case. Look more and
closer at complex models (many shapes, meshes, joints), at changes on or near
delicate spots (joints, where meshes meet, round, pointy, sharp or particular
shapes), and at retries. Only a change too small to see on a render needs no
look, such as thickening one part from 5.9 to 6.1 mm.

**Fresh checker**: the visual check is done by the checker agent
`.claude/agents/fresh-checker.md`, with no prior context, because the agent
that fixes a model tends to miss the obvious common-sense issues. It gets
only the model name, its kind, and before and after images: not what changed
or why. Images: a sheet of both at the same scale
(`node tools/renders/render.mjs <before> <after> --lock-scale --sheet
--views front,left,top,iso`) and the close-ups of every spot that moved
(`node tools/thin/closeup.mjs <before> <after> <out.png>`). Its verdicts map
to Where a result goes: `wrong` is clearly wrong, `unsure` goes to the review
page, `ok` and better than before is clean.
`stylize` and `sheepdog` can use the same checker.

Testing the skill will refine this guidance and show which modes work best.

## Review and learn

Review pages are titled `LoD: …`. Before a round, read past verdicts from
lod, thin and detail reviews (`--review` matches any title holding the text):

    node tools/review/review.mjs brief --review lod
    node tools/review/review.mjs brief --review thin
    node tools/review/review.mjs brief --review detail

Only PO verdicts count. They calibrate style; they never decide a model:

- The PO's latest verdict and comment on a model is its task. Work toward
  what it says; never overrule it with an older verdict or a verdict on
  another model.
- A past verdict never drops a model, marks it done, or replaces looking at
  it.
- Pass verdicts on as quotes with the model they were on, never as rules.

## Edge cases: unusual outcomes and proposals

The outcomes below are unusual, but they happen, on their own or together
with other outcomes. They usually come only after other fixes have been
tried, but not always.

For example, early on it may be clear that the kind doesn't fit the model at
all: a statue in the plinth/pedestal kind fits sculpture much better (once
you've seen the actual render). Its level of detail may then differ from its
peers, but they aren't a fair comparison. Compare it with the peers in the
other kind first. If its level of detail reads similar there, propose a kind
change instead of spending effort that doesn't serve the goal. This is also
why indicators differ per kind: sculpture's thin and tpu limits are looser
than plinth's (6 vs 26 mm thin, 10,000 vs 5,000 tpu). Or fixes may still be
needed, just less drastic ones.

When it isn't obvious early on, but the fixes and retries haven't reached the
goal, that **might** be a sign to check whether one of the proposals below
makes sense.

Proposals:

- Another kind.
- The `set` kind.
- A tag such as `plural`, `scale-big`, `scale-small` or `comp`, which brings other rules
  or guidance.

Special proposals:

- A new kind (usually only when it fits several models from different kits).
- A looser rule or limit for a kind.
- A change to lint logic.

Proposals go on the review page. A proposal made without any other fix
carries an unmistakable heads-up marker.

Special proposals always go on a separate page or tab.

When you propose, also show a fix or fix attempt, even one you think failed,
unless that clearly wastes effort, because:

- What looks failed to you may be the target style. Thickened, swollen or
  moved parts that eat or hide other parts or details are usually bad, but
  the PO may decide it works here, because besides the fiddly or thin bits,
  some bits were too much detail anyway.
- When the reason isn't obvious, the failed attempt shows the PO why the
  proposal is made.
- It helps the PO decide on the proposal.
- It shows the PO whether the intention was in the right direction.

Rarely, the outcome is that the model is rejected from the catalogue. That
call is the PO's.

## Out of scope

No automatic simplification or decimation:

- These tools aim to cut triangles with little or no visual change; this
  skill usually aims for the opposite.
- Most models are already low-poly, so these tools do little or break things.
- They can also melt rounded edges, flatten thin parts, flip faces or leave
  messier meshes.
- When they're worth using, that happens in a dedicated session.

## In scope

- Other problems spotted along the way, like broken or misshapen meshes, get
  fixed too when that isn't too complicated.
- Indicators and lints sometimes flag things that don't mean the style is
  wrong. When it isn't too complicated, a fix that clears the flag is fine
  even if the look stays (mostly) the same, for example closing a thin sheet
  into a solid shape.
- When a changed model is tied to others, like variants or modular pieces
  that must still fit, those always change along with it.

Not too complicated: not far more effort than any other model in the batch
takes.
