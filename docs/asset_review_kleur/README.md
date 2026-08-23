# Kleurassets — renderoverzicht

Renders bij `docs/color_conventions.md`: per kleurfamilie een rij modellen uit
verschillende kits naast elkaar, zodat je de afwijkingen ziet die de conventies
benoemen. Zelfde meetlat en ruitjespapier als de andere reviews.

```
node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/kleur.json docs/asset_review_kleur
```

De indeling staat in `tools/vergelijk-groottes/kleur.json`. Nieuw asset beoordelen?
Voeg het toe aan de passende groep en render opnieuw.

## De families

| Render | Laat zien |
| --- | --- |
| `kleur-bomen.png` | Kronen zijn overal pine-green, maar de stammen splitsen: terracotta (fantasy-town, mini-forest, survival, pirate-palm) tegenover khaki/bruin (natuur, modulair-terrein). |
| `kleur-hout.png` | De twee houtfamilies — warm (terracotta/bruin) en verweerd (khaki) — en de hoepels die wisselen tussen periwinkle en charcoal. |
| `kleur-offwhite.png` | De off-white-familie (kaars, schedel, bot) is al consequent; tentzeil en aardewerk wijken af. |
| `kleur-steen.png` | Natuur-rotsen zijn taupe waar alle andere rotsen slate zijn; dungeonmuur ink-blue, dorpssteen taupe. |
