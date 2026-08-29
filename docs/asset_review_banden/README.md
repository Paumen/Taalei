# Colour bands vs material tags — render sheets

Renders of every model flagged in `docs/catalog_bands_vs_materials.md`, one sheet
per finding group. Each model is shown from three viewpoints — a front three-quarter,
the opposite three-quarter, and straight down the axis — because a single camera
hides exactly the kind of fault these sheets are meant to settle: which band covers
how much surface, and whether a band that looks wrong in the colour list actually
reads wrong on the model.

```
node tools/vergelijk-groottes/render-banden.mjs tools/vergelijk-groottes/groepen-banden.json /tmp/banden
montage /tmp/banden/band-5-rock--*.png -tile 2x -geometry +6+6 -pointsize 20 \
  -background '#e8e4da' -fill '#333' docs/asset_review_banden/band-5-rock.png
```

The script writes one three-view strip per model; `montage` tiles a group's strips
into the sheet (one column for the small groups, two for the long ones).

The model list lives in `tools/vergelijk-groottes/groepen-banden.json`, the three-view
page in `tools/vergelijk-groottes/banden-close.html`. Unlike the size sheets in
`asset_review_props`, these are not to scale: every model is framed to fill its tile,
since the question here is colour, not size.

| Sheet | Finding |
| --- | --- |
| `band-1-precious-metal.png` | precious-metal tag on wood and leather bands |
| `band-2-metal-on-stone-bands.png` | metal tag on taupe 14,3 and blue-grey-dark 6,1 |
| `band-3-metal-on-silver.png` | metal on silver 3,2 outside jewellery |
| `band-4-stone-on-silver.png` | `resources/stone-*` on silver 3,2 |
| `band-5-rock.png` | rock tag off the rock bands |
| `band-6-bark-lane.png` | bark lane without a bark tag or a leather reading |
| `band-7-tag-gaps.png` | wood and cloth bands with no matching material tag |
| `band-8-exceptions.png` | birch bark, the glass white, copper on terracotta |
| `after-recolour.png` | the eighteen models after the recolours below |

The sheets show the state **before** the changes; `after-recolour.png` shows the
result. What changed, and what deliberately did not, is in
`docs/catalog_bands_vs_materials.md`.
