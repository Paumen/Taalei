# Tagging — proposal for the style guide

Status: **proposal, nothing merged into `asset_style_guide.md`**. Every rule below is
exact wording for PO approval; each K-rule is under 140 chars.

## 1. Four fields, four jobs

| field | job | set | who sets it |
|---|---|---|---|
| `material` | what the thing is **made of** | closed, 33 tags, parented | Claude, linted |
| `kind` | what the thing **is** | closed, hierarchical, one per model | Claude, PO glances |
| `size` | rough bbox: `s` `m` `l` | measured | automated |
| `tag` | everything else: kit/artist, theme, flags, cross-references | open | mixed |

`kind` is not only a filter. It is the **cohort key**: the set a model's `tris`, `tpu`,
`grad`, `anglePct` and band count are judged against. Comparing a tree to a ship says
nothing; comparing a barrel to twelve barrels says a lot. That is what earns the tree.

## 2. Rules — proposed Appendix A block K

- **K1.** Every model carries exactly one kind tag, or the `assembly` flag — never both, never neither.
- **K2.** A kind tag is at least two levels deep. Tag the deepest level that fits.
- **K3.** A kind implies its parents. Never tag a parent beside its own child.
- **K4.** Kind is what a thing is, material is what it is made of. Neither decides the other.
- **K5.** A new sub-kind needs more than 5 models, variants included. An existing one is never retired for dropping below.
- **K6.** The set is closed. A model fitting no leaf takes its branch's catch-all, never a new tag.
- **K7.** A second reading — an axe is also a weapon — goes in the open tag field, never in kind.
- **K8.** A ship has a mast, a boat has none.
- **K9.** Terrain is the surface walked on; a plant standing on it is flora.
- **K10.** Raw stock takes an `object-resource` kind plus the material it is made of.
- **K11.** Style metrics judge a model against its own kind and size, not the catalogue.
- **K12.** `special` and `hero` are the PO's alone. Claude proposes `hero` when adding to the catalogue.
- **K13.** Claude asks for `special` only after legal recolouring and a kind or material change have both failed.

## 3. The kind set

Counts are from the current 1560 models (`≈` = keyword estimate, needs a data pass).
**bold** = not in the brain dump.

```
object
  object-container      barrel 16 · chest 22 · crate 18 · bucket ≈8 · box ≈5 · bag 15 · bottle 26 · jug ≈15
  object-cookware       pot · pan · cauldron · kettle · lid                        ≈34  (was object-container-pan)
  object-tableware      plate · bowl · cup · mug · cutlery                         ≈37
  object-food           meat 10 · vegetable · baked · grain 13                       43
  object-furniture      table 23 · seating 18 · other (bed, rug, shelf, cabinet)     52
  object-tool           hand · long · supplies                                       47
  object-weapon         sword 15 · dagger 6 · axe 12 · hammer 6 · bow 17 · crossbow 8 · arrow 8 · quiver 6 · staff 9
  object-wearable       shield 15 · helmet · armour · cape · ring · necklace       ≈18
  object-lighting       candle 15 · lantern 8 · torch 6 · fire 8 · lamp 2            28
  object-transport      boat 9 · ship 15 · cart 14 · other (anchor, wheel, cannon)   36
  object-lore           book 36 · scroll ≈5                                          33
  object-valuables      coin 14 · jewellery ≈15                                      22
  object-mechanism      key · lock · lever · spring · button · handle                11
  object-bone           bone · skull · ribcage                                       19
  object-resource       metal ≈37 · timber 22 · plank ≈11 · stone ≈15 · rope/textile ≈13
  object-decor          **catch-all: props that decorate and nothing else (cobweb, star, heart)**

nature
  nature-flora-tree     conifer 17 · palm 14 · branch 49 · bare 53 · leafed 38
  nature-flora-plant    flower 21 · cactus 8 · other 44
  nature-flora-grass    21
  nature-fungi          8
  nature-fauna          fish 18 · other                                              23
  nature-terrain-rock   boulder · pebble · formation · cliff · mountain 7           136
  nature-terrain-ground **patch (dirt, sand, grass) 6 · path 16**                    17
  nature-terrain-water  ≈11

structure
  structure-building    wall 151 · floor 62 · roof 31 · door 27 · window 22 · **pillar/arch ≈36** · access (stairs 25 + ladder 6)
  structure-**grave**   **gravestone · crypt · coffin · grave marker                 ≈24**
  structure-**deck**    **scaffold · platform · dock · bridge                        ≈51**
  structure-fence       42
  structure-sign        sign 4 · banner/flag 10 · target/mannequin 5                 21

character  15
```

Flags stay in the open tag field, split by who decides:

- **measured** (never hand-set): `ngons` 240, `animation` 41, and `size`.
- **judged**: `assembly` 46, `stacks` 54, `hero` 53 (PO).

## 4. The three open items, resolved

**tbd1 — can a model take two kinds? Recommend: no, one kind, ever.**
Once kind is the cohort key, a model in two cohorts pollutes both averages and makes
"compare against your peers" ambiguous. The findability you actually want costs nothing
in the open tag field: the axe is `object-weapon-axe` + tag `tool`. Closed set stays
clean and linted; the loose reading stays loose and unlinted (K7).
Tiebreak when two kinds genuinely fit: **what it is built as beats what it is used for.**

**tbd2 — bone, rope, rock, gold, planks are both a material and a kind. Recommend:
the two axes never see each other.** Every model answers both questions independently.
A plank stack is kind `object-resource` + material `wood-planks`; a plank floor is kind
`structure-building` + the same material. The word repeating is not a duplicate, it is
two facts that happen to share a noun (K4, K10).

**tbd3 — is `assembly` in the closed kind set? Recommend: no, it stays a flag, and it
blocks the kind field.** It is not a "what is it" answer. But it *is* a cohort — assemblies
sit at tpu p50 2875 against a 2000 budget, 63% over — so the cohort key is read as
`kind ?? assembly`. K1 makes that exactly one value per model either way.

## 5. Evidence — does the tree earn its keep?

Catalogue-wide, `tpu` spans **26×** between the 10th and 90th percentile. Within a kind:

| tightens well (2–5×) | still too coarse (>13×) |
|---|---|
| bottle 2.3 · shield 2.3 · character 2.2 · window 2.8 · food 3.3 · axe 3.3 · flower 3.7 · cacti 3.9 · pot 4.1 · roof 4.2 | object-resource **39** · crate **33** · transport **22** · grass **18** · sign **16** · wall **14** · branch **13** |

So the payoff is real — 26× down to 2–5× on most leaves — but it is **leaf-level only**.
Two consequences:

1. `object-resource` at 39× is the worst cohort in the catalogue and must be split by
   material family (metal / timber / stone / textile), not left flat.
2. **Size does not rescue a coarse kind.** Walls go 31× → 28× once split s/m/l; resources
   don't move at all. Where a cohort is loose, the kind is wrong, not the bucket (K11).

## 6. Feedback you didn't ask for

1. **The three biggest holes in the tree are things you never listed:** ~51 scaffolds,
   platforms, docks and bridges; ~36 pillars, columns and arches; ~24 gravestones, crypts
   and coffins. Each is larger than most leaves you did list.
2. **Drop the `melee`/`range` middle level.** It buys no cohort value — a sword's spread is
   5.2 and a bow's 15.2, so the mid-level averages nothing useful — and everyone already
   knows which is which. `object-weapon-sword` is one level shorter and says the same.
   Also: a staff is not ranged, and a quiver is a container for arrows, not a weapon.
3. **`object-wearables` is nearly empty** — 1 clothing, 2 armour. Under K5 it does not
   earn three levels. One flat `object-wearable` holding shields (15) and the rest.
4. **`nature-terrain-grass` and `nature-flora-grass` collide,** as do beach and sand. K9
   settles it, but the tree should not list both names.
5. **Cobweb is not flora** — it is animal-made. It and `star`/`heart` are why `object-decor`
   exists: a closed set needs a catch-all under *every* top level, and `object` had none.
6. **Artist tags are kit properties, not model properties.** `kay` 657, `own` 386, `ken` 253,
   `qua` 218 are all derivable from the `kit` field already on every model. Deriving them
   deletes ~1500 stored tags and makes them impossible to get wrong.
7. **`ngons` should be measured, not flagged.** It already correlates with kind almost
   perfectly — bottle 100%, jug 100%, conifer 94%, barrel 85%, pot 82% — which is evidence
   it is a property of how a kit was built, not a judgement call.
8. **Your boat/ship parenthetical is duplicated and doesn't discriminate** any model in the
   catalogue. K8 ("a ship has a mast") does, and is testable.
9. Typos to fix before this becomes a closed set: `object-cintainer`, `object-weaoon`,
   `structure-buildimg`, `object-food-vetgitable`, `object-tablewear`, `latern`.
10. `nature-flora (eg cobweb, shelves)` — I could not read "shelves" here. Shells?
