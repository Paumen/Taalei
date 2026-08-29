# Resolutie tegen stijloordeel

Meet hoe de lange zijde van een render het vermogen van het model beïnvloedt om
de visuele stijl van een 3D-asset te benoemen en te beschrijven. Eén
onafhankelijke variabele: resolutie. Al het andere ligt vast.

## Opzet

| onderdeel | keuze |
| --- | --- |
| stimuli | 15 assets, 3 stijlgroepen van 5, uit de kits in `kits/missing/` |
| bron | PNG, 2576×2576, orthografisch driekwartsaanzicht |
| ladder | 2576, 1568, 1092, 768, 512, 384, 256, 192 px |
| herhalingen | 3 per (asset × sport), volgorde geschud uit seed 20260829 |
| prompt | `tools/resolutie-stijl/prompt.txt`, beeldblok vóór tekst |
| model | via de Claude Agent SDK, extended thinking uit |

De resolutie wordt nergens in de prompt genoemd.

### Stijlgroepen

De opzet vroeg om zes stijlassen. De kits in deze repo dekken er drie; voor
painterly-texture, hard-surface realistic en organic sculpt is hier geen
bronmateriaal. De drie ontbrekende labels blijven wel in de antwoordlijst staan
en werken zo als afleider: er is geen enkel juist antwoord dat ze gebruikt.

| groep | bron | wat het beeld toont |
| --- | --- | --- |
| low-poly flat-shaded | Kenney, Quaternius, Modular Village, ocean | vlakke kleurvlakken, zichtbare facetten, geen textuurdetail |
| stylised PBR | KayKit (Dungeon, Furniture, Restaurant) | gladde schaduwverlopen, verzadigde kleurblokken, geen korrel |
| painterly-texture | FantasyProps 1k, nature_kit | geschilderde houtnerf en stofweefsel, ingebakken schaduw in de textuur |

Elke groep valt grotendeels samen met één leverancier. Dat is de eerlijke
beperking van deze stimuli: stijl en herkomst zijn hier niet los te trekken.

Voor `stylised PBR` staat ook `toon-cel` als aanvaardbaar tweede label in de
grondwaarheid; de samenvatting rapporteert daarom naast de strikte accuratesse
ook een soepele. De strikte telt.

De grondwaarheid — label plus vijf attribuuttags per asset — staat in
`tools/resolutie-stijl/stimuli.json` en is met de hand geschreven op basis van
de 2576px renders, vóór de eerste modelaanroep.

## Draaien

```sh
npm install -g @anthropic-ai/claude-agent-sdk   # eenmalig, naast three en playwright
node tools/resolutie-stijl/render.mjs           # 15 bronrenders op 2576 px
node tools/resolutie-stijl/ladder.mjs           # één Lanczos-pass per sport
NODE_PATH=$(npm root -g) node tools/resolutie-stijl/run.mjs --model=claude-opus-5
python3 tools/resolutie-stijl/score.py
```

`run.mjs` schrijft één JSON-regel per aanroep naar
`docs/resolutie-stijl/runs/<model>.jsonl` en slaat bij herstart over wat al
gelogd is. `score.py` maakt `resultaten/aanroepen.csv`,
`resultaten/samenvatting.csv` en twee figuren.

## Maten

1. **Accuratesse** — aandeel juiste labels per sport, tegen de handlabels.
2. **Drift** — Jaccard-overlap van de attribuutwoorden met de antwoorden van
   hetzelfde asset op 2576 px, gemiddeld over alle 3×3 paren.
3. **Herhaalspreiding** — binnen één sport: hoe vaak alle drie de herhalingen
   hetzelfde label geven, en hoeveel attribuutoverlap ze onderling hebben.
4. **Kalibratie** — gemiddelde `confidence` tegen werkelijke accuratesse. Een
   confidence die vlak blijft terwijl de accuratesse zakt, is het gevaarlijke
   geval.
5. **Tokens** — beeldtokens per aanroep tegen accuratesse. De ijkaanroep (een
   1×1 beeld met dezelfde prompt) geeft de vaste overhead van de SDK; het
   verschil is wat het beeld zelf kost.

## Wat er niet vastligt

- De Agent SDK stelt geen temperature beschikbaar. De drie herhalingen meten
  daarom de spreiding die het model uit zichzelf heeft; dat is precies wat maat
  3 wil weten, maar het is geen temperature 0.
- De vaste promptoverhead van de SDK (~25k tokens) staat los van het beeld en
  is in de tokenmaat afgetrokken.
