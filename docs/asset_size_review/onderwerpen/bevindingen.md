# Bevindingen bij de vergelijking per onderwerp

Handgeschreven notities bij de stroken in deze map en de cijfers in
[afwijkingen.md](afwijkingen.md). De cijfers komen uit `catalog.json` (hoogte in
units, driehoeken per unit); de oordelen komen van het bekijken van de renders.
Dit bestand wordt niet gegenereerd — vul het aan als je iets anders ziet.

## Twee schalen door elkaar

`rocks` en `modular-cave-kit` zijn op landschapsschaal gemaakt, de rest op
gebouwschaal. In [arch.png](arch.png) staat `rocks/rockform-arch` 9.28 units hoog
naast wandbogen van 1.00; in [wall.png](wall.png) is `rocks/rockform-wall-long`
7.88 tegenover muurdelen van 0.83–1.00. Gemiddeld over alle onderwerpen zit
`rocks` op factor 2.80 en `modular-cave-kit` op 1.99.

Dat is geen fout in die kits, maar ze horen niet in dezelfde strook als een muur
van een huis: het zijn decorstukken voor de achtergrond. Bij plaatsing is het
handig ze apart te houden, of één schaalfactor voor de hele kit af te spreken.

## Gras is de grootste stijlbreuk in de natuurkits

In [grass.png](grass.png) staat `quaternius-nature` met pollen van 1.01–1.20 units
naast `forest` (0.27–0.29), `mini-forest` (0.17) en `pirate-kit` (0.10). Dat is
vier tot tien keer zo hoog: bij Quaternius reikt het gras tot je knie of heup, bij
de andere kits ligt het als een matje op de grond. Naast elkaar in één scène valt
dat direct op. Zelfde patroon bij `flower`, `log` en `stump`: `quaternius-nature`
staat over alle onderwerpen op factor 1.86.

## Hekken vallen in twee groepen

[fence.png](fence.png): `fantasy-town-kit` (0.38), `modulair-terrein` (0.38) en
`platformer-kit` (0.40) maken heuphoge hekjes; `pirate-kit` (0.88) en
`survival-kit` (0.93) maken hekken waar je niet overheen stapt. Beide maten zijn
bruikbaar, maar ze sluiten niet op elkaar aan — een hoek van het ene hek past
nooit tegen een recht stuk van het andere.

## Kisten en kratten hebben geen huismaat

[crate.png](crate.png) loopt van 0.28 (`restaurant`) via 0.50 (`platformer-kit`)
en 0.60 (`village-kit`) naar 0.87–0.93 (`fantasy-props`), zonder cluster
onderweg: een spreiding van 3.21×. Vaten idem, 0.30 (`village-kit`) tot 0.90
(`fantasy-props`), spreiding 2.99×.

Opvallende tegenhanger: schatkisten zitten wél dicht bij elkaar, 0.37–0.46 over
vijf kits. Voor kratten en vaten valt dus een huismaat te kiezen — 0.60 ligt in het
midden en wordt al door `props` en `dungeon` gebruikt.

## Wat wél consistent is

Tafels staan in vier kits op precies 0.35 (`dungeon`, `furniture`, `restaurant`,
en `props` net iets hoger op 0.48), stoelen op 0.42–0.43, borden op 0.04–0.06.
Alle 1054 modellen delen dezelfde colormap, dus kleurverschillen tussen kits komen
uit de keuze van banen, niet uit een eigen palet.

## Detail per unit verschilt sterker dan de vorm

Bij hetzelfde onderwerp zit de meshdichtheid ver uit elkaar: vaten lopen van 428
driehoeken per unit (`props`) via 561 (`dungeon`) naar 704 (`tropical`) en 824
(`fantasy-props`), terwijl de rotskits op 60–110 zitten. `fantasy-props` en
`dungeon` staan in [afwijkingen.md](afwijkingen.md) meermaals als "veel dichter
mesh" gemarkeerd. Voor het budget van 1000 driehoeken per unit blijft alles binnen
de marge, maar een `fantasy-props`-vat naast een `props`-vat oogt gladder.

## Vals alarm: het onderwerp komt uit de naam

De indeling neemt het laatste zelfstandige woord uit de modelnaam. Dat gaat meestal
goed, maar niet altijd:

- `graveyard-kit/shovel-dirt` (een schep in een hoop aarde) staat bij *dirt* en
  verklaart daar in zijn eentje de spreiding van 10×.
- `pirate-kit/mast-ropes` (een hele mast) staat bij *rope* naast touwrollen van
  0.09.
- `halloween/floor-dirt-small` is een dikke grondtegel van 0.27 naast dungeon-tegels
  van 0.07 — zelfde woord, andere functie.

Een grote spreiding is dus een aanwijzing, geen conclusie: kijk eerst naar het
plaatje voordat je een kit gaat schalen.
