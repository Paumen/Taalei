---
name: kit-import
description: Import a source pack from kits/sources into the catalogue as a new kit, or add models to an existing one. Use whenever a task is "add kit X", "import pack Y", "add the missing models of Z", or anything that writes new .glb files into kits/workfiles. Covers the run order, how to pick the scale, and how to tag.
---

# Importing a kit

The style guide (`docs/asset_style_guide.md`) is authoritative and must be read
first. This file is only the procedure.

## Run order

Nothing here works until `catalog/tools/bronkits.mjs` names a kit slug for the
pack — `kit: null` means `aanvullen.mjs` refuses to run.

1. Set `kit:` on the pack's row in `bronkits.mjs`.
2. `node tools/importeer/aanvullen.mjs <pack map> --schaal <n> src=name src=name …`
   Names are kebab: underscores to hyphens, camelCase split, lowercased
   (`bow_A_withString` → `bow-a-with-string`). `--schaal` is only for a kit that
   is still empty; an existing kit reads its scale back out of the `.glb` extras.
3. Kind and use in `catalog/tags.json` — exactly one kind per model, resolved
   against the Appendix B glossary (K8), and zero or more of the eight uses as
   `use:<value>`. A model without a kind shows up under "No kind" in the
   catalogue's Kind filter and is unfinished work. The model panel in
   `index.html` sets both and downloads the diff to merge in.
4. Kit entry in `catalog/manifest.js`, and the slug into `SOURCES` in
   `build-catalog.mjs` if the maker has a source filter.
5. Materials and open tags in `catalog/tags.json` — see below.
6. `node catalog/tools/build-catalog.mjs` then
   `node catalog/tools/build-missing.mjs`, in that order.
7. `LICENSE.txt` in the kit's workfiles dir. Copy the shape of an existing one
   (`kits/workfiles/restaurant/LICENSE.txt`): Dutch, pack and CC0 header, then
   naming, scale reasoning, and the colour remapping with its worst Oklab jumps.
   `tools/importeer/worst-kleursprong.mjs <pack map> <scale>` prints those jumps;
   the importer itself only prints the distance, not which band moved where.
8. `node tools/catalog-lint.mjs --kit <slug>` must show 0 errors.

## Scale

One factor per pack (§4). Pick it by matching a model against a named reference
already in the catalogue, and say which one in the LICENSE.txt — never round to
something that looks tidy.

    weapons 0.2625  sword-a 0.47 = adventurers/sword-one-handed 0.47
    clay-items 0.65 plate 0.20 = restaurant/plate = dungeon/plate

KayKit packs in the catalogue sit at 0.175 (dungeon), 0.245 (resources,
restaurant), 0.2625 (adventurers, skeletons — the figures' own scale, so
anything a figure holds belongs here), 0.28 (rpgtools), 0.3 (forest).

## Tagging

Never tag from a model's colour list. It says a model uses taupe and wood light;
it does not say which part is which, and that is the whole question. A sword
whose blade sits on a wood band is a wooden sword, and tagging it `metal-iron`
because swords are usually metal is the mistake this section exists to prevent.

1. Print how comparable models in a neighbouring kit are already tagged, and
   follow that. `adventurers` and `rpgtools` are the reference for tools and
   weapons — that is where conventions like "a wrapped grip on taupe is
   `textile`" live.
2. Isolate each band you are unsure of and look at it:
   `node tools/renders/render.mjs kits/workfiles/<slug> --band 14,3 --views iso
   --sheet --sheet-only --out /tmp/x` greys out everything not carrying that
   cell.
3. Name the materials the object genuinely has, then check each against its M
   rule, check every band has an owner under C, and count under N.
4. Where a band deviates from the subtype's own band, take the parent tag: a bow
   whose limb landed on taupe carries `wood`, not `wood-beam`, because M42 ties
   `wood-beam` to 2,0.
5. A band with no material behind it is fine where a C rule allows an accent
   (blue, dark red) — do not invent a material to cover it. `special` is the
   PO's to assign, never yours.

Taupe, off-white and terracotta have no C rule constraining them; light grey,
blue-grey, light blue-grey, blue, yellow, dark red, dark green, light green, the
three wood bands and bark do.

## Before you report

- Baseline the lint before touching anything and report the delta. `main` is not
  lint-clean, so an absolute count says nothing.
- Diff `catalog.json` semantically, not textually: models are sorted one key per
  line, so a handful of additions look like a rewrite. Confirm no existing model
  changed.
- Render every new model and look at it. §6 asks for at least two reference
  assets of the same kind beside the new ones at the same scale
  (`render.mjs … --compare`).

## Traps

- `catalog/manifest.js` is hand-formatted JSON. Edit it as text; a round trip
  through a JSON serialiser reformats unrelated hand-wrapped arrays.
- `build-missing.mjs` deletes files under `kits/missing/` for a pack that is now
  imported. That is correct, not a mistake to undo.
- A rule in the style guide is the PO's: show the exact words and wait. Under
  140 characters.
