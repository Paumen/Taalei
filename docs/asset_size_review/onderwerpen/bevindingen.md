# Bevindingen bij de vergelijking per onderwerp

Handgeschreven notities bij de stroken in deze map en de cijfers in
[afwijkingen.md](afwijkingen.md). De cijfers komen uit `catalog.json` (hoogte in
units, driehoeken per unit); de oordelen komen van het bekijken van de renders.
Dit bestand wordt niet gegenereerd — vul het aan als je iets anders ziet.

Bijgewerkt nadat de kits op maat zijn gezet: de meeste kits zijn kleiner geworden,
waardoor de verhoudingen hieronder anders liggen dan in de eerste ronde.

## Twee schalen door elkaar

`rocks` en `modular-cave-kit` zijn op landschapsschaal gemaakt, de rest op
gebouwschaal. In [arch.png](arch.png) staat `rocks/rockform-arch` 9.28 units hoog
naast wandbogen van 0.65 en 0.42; in [wall.png](wall.png) is `rocks/rockform-wall`
7.67 tegenover muurdelen van 0.60–1.00. Over alle onderwerpen zit `rocks` op factor
3.99 en `modular-cave-kit` op 2.01, en na het verkleinen van de andere kits is dat
verschil groter geworden, niet kleiner.

Dat is geen fout in die kits — het zijn decorstukken voor de achtergrond — maar ze
horen niet in dezelfde strook als een huismuur. Bij plaatsing apart houden, of één
schaalfactor voor de hele kit afspreken.

## Gras blijft de grootste stijlbreuk in de natuurkits

In [grass.png](grass.png) staat `quaternius-nature` met pollen van 0.41–0.48 units
naast `forest` (0.16–0.17), `mini-forest` (0.11) en `pirate-kit` (0.06): drie tot
acht keer zo hoog. Bij Quaternius reikt het gras tot je knie, bij de andere kits
ligt het als een matje op de grond. Naast elkaar in één scène valt dat direct op.

## Hekken vallen in twee groepen

[fence.png](fence.png): `fantasy-town-kit` (0.25), `modulair-terrein` (0.26) en
`platformer-kit` (0.26) maken lage hekjes; `pirate-kit` (0.56) en `survival-kit`
(0.67) maken hekken van ruim het dubbele. Beide maten zijn bruikbaar, maar ze
sluiten niet op elkaar aan — een hoek van het ene hek past nooit tegen een recht
stuk van het andere.

## Kisten en kratten hebben geen huismaat

[crate.png](crate.png) loopt van 0.20 (`pirate-kit`, `restaurant`) via 0.33
(`platformer-kit`) en 0.43–0.47 (`fantasy-props`) naar 0.60 (`village-kit`):
spreiding 3.06×. Vaten idem, 0.30 (`village-kit`) tot 0.60 (`props`), met binnen
`dungeon` zelf al 0.25–0.64.

Opvallende tegenhanger: schatkisten zitten wél dicht bij elkaar, 0.29–0.33 over drie
kits. Voor kratten en vaten valt dus een huismaat te kiezen; 0.45 ligt in het midden
van wat er nu staat.

## Wat wél consistent is

Stoelen staan op 0.30–0.31 (`dungeon`, `restaurant`), borden op 0.03 in `dungeon` en
`restaurant`, schatkisten op 0.29–0.33. Alle modellen delen dezelfde colormap, dus
kleurverschillen tussen kits komen uit de keuze van banen, niet uit een eigen palet.

Tafels waren eerder gelijk en zijn dat nu net niet meer: `dungeon` en `restaurant`
staan op 0.24–0.25, `props/table-a` op 0.48 — precies het dubbele. Dat is de
goedkoopste correctie in deze lijst.

## Detail per unit verschilt sterker dan de vorm

Bij hetzelfde onderwerp zit de meshdichtheid ver uit elkaar: vaten lopen van 428
driehoeken per unit (`props`) via 480 (`village-kit`) en 561 (`dungeon`) naar 824
(`fantasy-props`), terwijl de rotskits op 1–2 zitten. Sterkste geval is *key*:
`fantasy-props` gebruikt 956 driehoeken per unit voor een sleutel van 0.01 hoog,
`dungeon` 160 voor een van 0.10. Alles blijft binnen het budget van 1000 per unit,
maar een `fantasy-props`-model naast een `props`-model oogt gladder.

## Vals alarm: het onderwerp komt uit de naam

De indeling neemt het laatste zelfstandige woord uit de modelnaam. Dat gaat meestal
goed, maar niet altijd:

- `taalei-kit/balloon` (4.98) is een luchtballon; `natuur/flower-balloon-*` (0.22)
  zijn bloemen. Zelfde woord, geen vergelijking — de 22× bij *balloon* is nep.
- `rocks/rockform-column` (7.43) is een rotsformatie, `dungeon/column` (0.35) een
  pilaar in een zaal.
- `pirate-kit/mast-ropes` (een hele mast, 2.00) staat bij *rope* naast het touw van een
  hek van 0.20.
- `prototype-kit/coin` (0.18) is een spelobject op speelgoedschaal, geen muntje.

Een grote spreiding is dus een aanwijzing, geen conclusie: kijk eerst naar het
plaatje voordat je een kit gaat schalen.
