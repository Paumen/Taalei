# Style references by category

Each sheet is one model in two styles: the deviant style on top, the good style
below. The file name says which category the model belongs to and nothing more —
the sheets stay anonymous on purpose, a reference shows what is right and wrong,
not which model it is.

| prefix | category | what belongs to it | sheets |
|--------|----------|--------------------|--------|
| `o` | Object | Props, tools, furniture, containers, lighting and other loose things you place. | 44 |
| `n` | Nature | Plants, trees, rock and other things that grow or lie in the landscape. | 25 |
| `s` | Structure | Building pieces that click together: walls, roofs, floors, doors, fences. | 11 |

Total: 80 sheets.


## Object (`o`) — 44

| sheet | subject | was |
|-------|---------|-----|
| `o1.png` | potion flask | `ref01.png` |
| `o2.png` | key | `ref02.png` |
| `o3.png` | chest | `ref03.png` |
| `o4.png` | table | `ref04.png` |
| `o5.png` | chair | `ref05.png` |
| `o6.png` | shovel | `ref06.png` |
| `o7.png` | bucket | `ref07.png` |
| `o8.png` | anvil | `ref10.png` |
| `o9.png` | hanging lantern | `ref12.png` |
| `o10.png` | closed crate | `ref13.png` |
| `o11.png` | axe | `ref14.png` |
| `o12.png` | handsaw | `ref15.png` |
| `o13.png` | chest | `ref18.png` |
| `o14.png` | pickaxe | `ref19.png` |
| `o15.png` | grindstone | `ref20.png` |
| `o16.png` | book stack | `ref21.png` |
| `o17.png` | stool | `ref22.png` |
| `o18.png` | meat leg | `ref31.png` |
| `o19.png` | signpost | `ref32.png` |
| `o20.png` | open crate | `ref33.png` |
| `o21.png` | slatted table | `ref34.png` |
| `o22.png` | table | `ref37.png` |
| `o23.png` | loose planks | `ref38.png` |
| `o24.png` | hanging lantern | `ref40.png` |
| `o25.png` | bench | `ref41.png` |
| `o26.png` | A-frame sign | `ref43.png` |
| `o27.png` | closed crate | `ref44.png` |
| `o28.png` | key | `ref46.png` |
| `o29.png` | chest | `ref50.png` |
| `o30.png` | coin stacks | `ref54.png` |
| `o31.png` | standing lantern | `ref59.png` |
| `o32.png` | banner | `ref65.png` |
| `o33.png` | flag on post | `ref66.png` |
| `o34.png` | barrel | `ref67.png` |
| `o35.png` | axe | `ref68.png` |
| `o36.png` | hammer | `ref69.png` |
| `o37.png` | A-frame sign | `ref70.png` |
| `o38.png` | rope coil | `ref72.png` |
| `o39.png` | lamp post | `ref73.png` |
| `o40.png` | rope coil | `ref74.png` |
| `o41.png` | rope loop | `ref75.png` |
| `o42.png` | knife | `ref76.png` |
| `o43.png` | loose boards | `ref77.png` |
| `o44.png` | pennant | `ref78.png` |

## Nature (`n`) — 25

| sheet | subject | was |
|-------|---------|-----|
| `n1.png` | skull | `ref08.png` |
| `n2.png` | cactus | `ref09.png` |
| `n3.png` | pine tree | `ref16.png` |
| `n4.png` | log | `ref17.png` |
| `n5.png` | flower | `ref24.png` |
| `n6.png` | grass blades | `ref25.png` |
| `n7.png` | mushroom | `ref26.png` |
| `n8.png` | mushroom | `ref27.png` |
| `n9.png` | pine tree | `ref28.png` |
| `n10.png` | log | `ref29.png` |
| `n11.png` | grass tuft | `ref35.png` |
| `n12.png` | palm tree | `ref36.png` |
| `n13.png` | rock formation | `ref42.png` |
| `n14.png` | pine tree | `ref47.png` |
| `n15.png` | rock cluster | `ref48.png` |
| `n16.png` | tree stump | `ref49.png` |
| `n17.png` | tree | `ref51.png` |
| `n18.png` | tree | `ref52.png` |
| `n19.png` | flat rock | `ref53.png` |
| `n20.png` | boulder | `ref55.png` |
| `n21.png` | pine tree | `ref56.png` |
| `n22.png` | tree stump | `ref60.png` |
| `n23.png` | tree | `ref71.png` |
| `n24.png` | pine tree | `ref79.png` |
| `n25.png` | fallen log | `ref80.png` |

## Structure (`s`) — 11

| sheet | subject | was |
|-------|---------|-----|
| `s1.png` | door | `ref11.png` |
| `s2.png` | fence | `ref23.png` |
| `s3.png` | rail fence | `ref30.png` |
| `s4.png` | fence | `ref39.png` |
| `s5.png` | curved fence | `ref45.png` |
| `s6.png` | roof slope | `ref57.png` |
| `s7.png` | roof cap | `ref58.png` |
| `s8.png` | roof slope | `ref61.png` |
| `s9.png` | roof | `ref62.png` |
| `s10.png` | wall with window | `ref63.png` |
| `s11.png` | floor tile | `ref64.png` |

## Borderline cases

Three calls decide where a handful of sheets sit; they are written down here so
the next person can move them on purpose rather than by accident.

- `n1` is a skull. It is organic, so it sits with nature; as a placed prop it
  would just as well be an object.
- `o19`, `o26`, `o37` and `o39` are signposts, A-frame boards and a lamp post.
  They are counted as objects you set down, not as built environment.
- `n4`, `n10`, `n22` and `n25` are notched logs and stumps. They are read as
  felled wood, matching the `natuur/log-*` and `natuur/stump-*` groups in
  `catalog/tags.json`, not as worked timber; `o23` and `o43` are sawn boards
  and do sit with the objects.

Sheets keep their category name once given. A new sheet arrives as `refNN` from
`tools/vind-match/naar-stijlreferentie.py`, which cannot know a category; giving
it one is a reading decision and a rename.
