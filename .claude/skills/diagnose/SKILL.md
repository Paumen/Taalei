---
name: diagnose
description: Find what is actually wrong with catalogue models the PO flagged as looking off (glitches, slivers, deformed or wavy shapes, odd shading or gradients, wrong colour, too chunky, too coarse, missing detail) and choose a fitting fix before changing anything. Use when handed a list of flagged models or a vague complaint about how a model looks, and before any hand fix of geometry, shading or colour.
---

# Diagnose

## Goal

Turn a vague flag ("looks glitchy", "colour properly", "not round") into a
named cause on a named part, then into the smallest fix that removes that
cause. Most wasted rounds come from fixing a guessed cause, or from fixing the
whole model when one part was wrong.

Earlier fixes are examples, not recipes. A similar-looking flag can have a
different cause, and a new kind of flag can need a fix nobody has tried yet.
Scripts written for an earlier task are not proven tools (see CLAUDE.md on
reuse).

## 1. Read the flag

- Write down the PO's words exactly. Words like "colour", "shading",
  "chunky" and "coarse" each point at a different layer of the model.
- Short notes are precise. "Fix handles only, keep what's good" limits the
  scope. "See source" names where to look.
- A skipped question, or a retry verdict with no comment, is not a preference
  and not consent. If you can't name the cause from the renders, ask, with
  2–4 concrete candidate causes as options.
- Bucket each model by its likely layer, with a confidence: geometry, normals
  or shading, colour (bands and gradient), hidden or covering parts, scale and
  proportion, or level of detail.

## 2. Look properly

Render before you judge (C18), and look from more than one angle:

- **Views.** Front, back, both sides, top and bottom, plus a close-up of the
  flagged part. Many glitches only show from below, from inside an opening or
  at a grazing angle.
- **Modes.** Each mode answers a different question:
  - pbr: what the PO sees.
  - claywire: topology. It shows slivers, fan triangles, uneven rings and
    facets that pbr hides.
  - normal: shading breaks, flipped or uneven normals.
  - faceorient: back faces and holes.
  - xray: parts buried inside or covered by other parts.
  - albedo, or the uv overlay: colour on its own, without the light.
- **Comparisons.**
  - Peers of the same kind side by side, for style, side count, chunkiness
    and colour.
  - A twin variant of the same model (cracked vs whole, open vs closed,
    colour variants) shows what the clean version should look like.
  - The source model, from kits/sources, read with its materials, textures
    and mtl colours, shows the intent. Source names can mislead, so check
    that it really is the same object.
  - Git history versions (ask before reading history, C12) show whether a
    pass broke it or it was always so. Find the first version, then the
    commit that changed its look.
- **Numbers.** Data catches what the eye misses:
  - parts (connected shells) with their bands and bounds
  - radius per height ring, for round things
  - uv v per position
  - triangle and side counts
  - the catalogue facts: tpu, size, wdh, the thick measures

## 3. Find the cause

Test one hypothesis at a time with a cheap, throwaway change, and render it.
If nothing changes, the cause is elsewhere. For example: if smoothing the
normals leaves a dark patch dark, the patch is colour, not shading.

Common causes, each with a way to tell:

- **Decimation or simplification.** Rings with uneven side counts, wavy rims,
  polygonal "round" parts, long slivers. Compare the side count and ring
  radii with the source.
- **A stylize or chunky pass gone wrong.** Parts pushed into each other,
  windows or openings swallowed, squashed round parts, non-uniform scale.
  Find the commit in history.
- **Covering or hidden parts.** A slab or plate in front of real detail (a fan
  behind a panel), or two surfaces fighting at nearly the same depth. Look in
  xray, or remove the part as a test.
- **Colour assignment.** A band applied per triangle across a colour line
  gives jagged teeth. The whole model can sit in one band when the source had
  several materials. A gradient can run the wrong way, or patches can be dark
  in colour rather than in shading.
- **Shading.** Normals averaged across hard edges, flat faces where curves
  were meant, or one face lit as a curve.
- **Topology.** Duplicate or coplanar faces, fan triangles, degenerate
  slivers, open seams.
- **Proportion.** Too thick or too big next to its peers, or detail too small
  to read at catalogue size.
- **Rules.** Sometimes the look is forced by a rule, such as a material tag
  that allows only certain bands, or a side or triangle cap. Read the lint
  rules before picking a fix, and raise a rule that blocks the right fix with
  the PO.

## 4. Choose a fix direction

Prefer the smallest change that removes the cause, and keep everything that
already looks good. Directions to weigh, none of them a default:

- **Restore** an earlier or source version when a later pass broke the model.
- **Rebuild only the broken part** from clean primitives or a profile:
  revolve round parts from a measured profile, build boxes for brackets and
  posts. Keep the original part's size, position, bands and peer style.
- **Remove or reshape** a covering part so that the real detail shows.
- **Recolour from intent:** map the source materials to bands, copy bands
  from a clean twin, split faces at a colour line instead of colouring whole
  triangles, and set the gradient by facing or by height. Check the colour
  against the material tags and the palette rules, and change a tag only when
  the material really is something else.
- **Fix the shading layer only:** recompute normals with a sensible crease
  angle, or reshade the bands by facing with the repo's own shading tools
  where one fits.
- **Adjust proportion:** thin, slim or rescale a part, staying within the
  kind's size limits.
- **Leave it**, when the look comes from the source design and the PO hasn't
  asked for a change. Say so, and offer the options.

Before handing it over:

- Render the result in the same views and modes that showed the problem.
- Run the lints that touch what changed:
  - golden
  - glb-lint on copies, with the colormap next to them
  - tpu, size, palette, bands and mat, after rebuilding the catalogue
  - sides, ceramic
- Watch for side effects of the fix itself: extra triangles from splits,
  normals that are no longer unit length, faces that turned into back faces,
  new holes, grown sizes.

## 5. Hand it over

- Doubtful changes go to the PO through the review skill. With only one or
  two models, ask in chat with a before/after render instead.
- In each change line, say what changed, and name the alternatives tried and
  the rules that limited the choice.
- Check that the review card shows the change. A size-only card, or a
  far-away camera, can hide a small part.
- Apply the verdicts as they are given. Treat a retry with no comment as an
  open question, not as permission to guess again.
