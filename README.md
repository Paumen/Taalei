# Taalei

Assets voor [Taaleiland](https://github.com/Paumen/Taaleiland) — de 3D-bouwdozen en het
oorspronkelijke ontwerpdocument, hier apart gehouden zodat de app-repo licht blijft.

## `kits/`

Zeven **CC0**-bouwdozen van [kenney.nl](https://kenney.nl/assets), samen 307 `.glb`-modellen:

| Kit | Zone in de app |
|---|---|
| `fantasy-town-kit` | dorp / bruggen |
| `mini-dungeon` | grot |
| `mini-forest` | bos |
| `modular-cave-kit` | grot / vulkaan |
| `pirate-kit` | strand, zee, schip |
| `platformer-kit` | berg / klimrots |
| `survival-kit` | startkamp |

Alleen de map `Models/GLB format` uit de officiële downloads is meegenomen. De geometrie is
ongewijzigd op twee bewerkingen na, uitgevoerd met de scripts in `tools/` van de Taaleiland-repo:

- **Genormaliseerde schaal** — objecten die in meerdere kits voorkomen zijn onderling
  op maat gebracht (`normaliseer-modellen.mjs`).
- **Eén gedeeld palet** — de zeven losse `colormap.png`'s zijn samengevoegd tot
  `kits/colormap.png`; elke kit heeft er een kopie van in `Textures/`, en de originele
  kaart staat ernaast bewaard als `colormap-origineel.png` (`consolideer-palet.mjs`).

Naast de modellen:

- `kits/manifest.js` — modellijst per kit, zet `window.KENNEY_KITS` (bevat geen paden, dus
  bruikbaar vanaf elke locatie).
- `kits/palet.json` — welke paletcel uit welke kit-cel komt en welke modellen hem gebruiken.
- `kits/colormap.png` — het gedeelde palet (512×512, cellen van 32×128).
- `kits/<kit>/LICENSE.txt` — de licentietekst per kit.

### Gebruik

De preview-pagina's in Taaleiland laden deze bestanden via jsDelivr:

```
https://cdn.jsdelivr.net/gh/Paumen/Taalei@main/kits/
```

Wil je de `tools/*.mjs`-scripts uit Taaleiland opnieuw draaien, zet deze `kits/`-map dan op
`preview/kits/` in die repo — daar verwachten ze de modellen.

## `draft.md`

Het eerste ontwerpdocument van Taaleiland: doelgroep, doel, mechanismen, narratief,
invarianten (privacy) en de asset-bronnen waar de kits hierboven vandaan komen.

## Licentie

De kits zijn CC0 — vrij te gebruiken, ook commercieel; naamsvermelding wordt gewaardeerd
maar is niet verplicht. Zie `kits/<kit>/LICENSE.txt`.
