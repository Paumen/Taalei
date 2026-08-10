# Aansluitregels modulair terrein

Afgeleid uit `data/combinatieoordelen_13.json`: 1685 oordelen over voegen in
21 proefbouwsels met de modulair-terrein-kit, uitgesproken in de
terreinbouwer. Elke voeg draagt ook mee wat `aansluitingen.mjs` erover mat;
het oordeel gaat voor de meting. `tools/leid-aansluitregels-af.mjs` vat de
oordelen samen per combinatie en schrijft
`data/aansluitregels_modulair-terrein.json` — 82 zij-regels, 12
stapelregels en 37 randregels, elk met steun, meting en de bouwsels waar ze
vandaan komen. Dit document duidt ze.

## Hoe de oordelen in elkaar zitten

Drie soorten voegen:

- **zij** (1416 oordelen) — twee stukken naast elkaar. De sleutel is het
  paar randprofielen (codes als `r131`) van de twee zijden die elkaar raken.
- **stapel** (57) — het ene stuk boven op het andere. Hier zijn geen
  randprofielen; de sleutel is het modelpaar onder>boven.
- **rand** (212) — de open zijkant van een stapeling: sluiten de
  zijprofielen van onderstuk en bovenstuk netjes op elkaar aan? Geordend
  paar onder>boven; hier valt niets te meten (`meting: null`).

Een profielcode staat voor een randvorm, niet voor een model: `r131` is de
vlakke grasrand en zit op de grasvloer én op de voet van de heuvelzijden;
`∅` is een zijde zonder profiel (bergen, keien, props). Het regelbestand
bevat als naslag per model@slag de waargenomen code per zijde
(`profielen`).

## De regels

### Stapelen: vertrouw de meting

Bij alle 57 stapelvoegen valt het oordeel samen met de meting — goed én
fout. Wat past: binnen een wandfamilie stapelt base → mid → top, ook met de
hoekstukken ertussen, en steeds met dezelfde slag voor beide stukken. Wat
niet past: een vloertegel (gras, water) boven op een afstapstuk. Voor
stapelen is geen regelbestand nodig naast `aansluitingen.mjs`.

### Naast elkaar (zij): meting alleen is niet genoeg

Meting en oordeel lopen hier flink uiteen (goedgekeurd terwijl de meting
"past niet" zei: 415 van de 1416; afgekeurd terwijl ze "past" zei: 26). De
patronen erachter:

1. **Zelfde vloerprofiel tegen zichzelf past.** Gras↔gras (`r131|r131`):
   723× goed. Zand↔zand (`r009|r009`): 13× goed.
2. **…behalve water.** Water↔water (`r146|r146`) is 12× afgekeurd, ook al
   past het volgens de meting — óók in de goedgekeurde herbouw van de beek.
   De watertegel is kennelijk een op zichzelf staande bak, geen tegel om
   uit te leggen tot een vlak.
3. **Wandstukken passen in serie.** Linker- en rechterprofiel van hetzelfde
   wandtype en dezelfde laag zijn complementair en steeds goed: klif
   base/mid/top (`r053|r054`, `r055|r056`, `r045|r046`), steilrand idem
   (`r083|r084`, `r087|r088`), inclusief de hoekstukken die dezelfde
   profielen dragen. De meting bevestigt dit overal.
4. **Organische stukken staan vrij.** Bergen, keien en props hebben zijden
   zonder profiel (`∅`) of met een grillige contourcode; de meting zegt
   daar stelselmatig "past niet" en dat mag je negeren: `∅|r131` 272× goed,
   `r008|r131` 76× goed, plus tientallen losse contourcodes tegen gras of
   tegen elkaar. Vrije plaatsing tegen vloeren en tegen elkaar is de norm.
5. **Verschillende vloermaterialen sluiten niet direct aan.** Zandvloer
   tegen grasvloer (`r009|r131` in het bouwsel Strand): 3× afgekeurd. Hoe
   zand wél aan gras moet komen laten deze oordelen nog niet zien.
6. **De halve-laag-afstap kent maar één goede buur op vloerhoogte.** De
   afstap (`escarpment-terrain-side-falloff-center`) heeft vier
   verschillende zijden: de kant op vloerhoogte (`r008`), de verlaagde
   kant (`r111`) en twee schuine flanken (`r109`, `r110`). Gras ernaast is
   alleen goed tegen de kant op vloerhoogte; tegen de flanken (16× elk) en
   tegen de verlaagde kant (18×) is het afgekeurd.
7. **Afstappen in een rij: wel schakelen, niet spiegelen.** Naast elkaar in
   dezelfde oriëntatie (`r109|r110`) is goed; met de flanken gespiegeld
   tegenover elkaar (`r109|r109`, `r110|r110`, @0 tegenover @180) is 12×
   afgekeurd.
8. **De boomstambrug is nog niet opgelost.** Staméinde tegen stammidden:
   in beide beekbouwsels afgekeurd (4×). Stammidden naast gras: 4×
   afgekeurd. Staméinde naast gras: eerste beek goed, tweede beek fout.
   Alleen de lange zijden van de stam liggen probleemloos tegen het gras.

### Open rand van een stapeling (rand)

1. **Binnen een wandfamilie sluit elke opeenvolging netjes.** Base onder
   mid, mid onder top, base onder top, en alle combinaties met hoekstukken:
   60 voegen, allemaal goed.
2. **Een vloer hoort op een topstuk.** Grasvloer boven op een top geeft een
   nette open rand: `r057>r131` 28×, `r115>r131` 11×, hoektoppen idem.
3. **Niet op een midstuk.** Grasvloer direct op een mid (top overgeslagen):
   afgekeurd (`r068>r131`, `r114>r131`).
4. **Niet vloer op vloer.** Gras gestapeld op gras geeft een dubbele rand:
   10× afgekeurd.
5. **Water hoort alleen onder de verlaagde kant van een afstap.** Water
   onder `r111`: 14× goed. Water onder gras aan de open rand: 28×
   afgekeurd; onder de afstapflanken: 24× afgekeurd; onder de brugstukken:
   8× afgekeurd.

## Tegenstrijdigheden: eerste en tweede poging

17 van de 82 zij-regels zijn omstreden — dezelfde profielcombinatie goed-
én afgekeurd. Op twee na volgen ze allemaal hetzelfde patroon: de
afkeuringen komen uit een eerder bouwsel, de goedkeuringen uit een latere
herbouw van hetzelfde idee. "Beek met een boomstam erover" tegenover
"Beek, tweede poging"; "Bergrug van drie" tegenover "Twee bergen met gras
eronder" (en het eerdere "Berg op de vlakte"). Zelfde randparen, andere
opstelling: het oordeel ging daar over de opstelling, niet over het paar.
Wie de regels toepast kan de latere bouwsels als leidend nemen; het
regelbestand laat beide contexten staan.

De twee echte uitzonderingen:

- `r009|r131` — code `r009` zit op de zandvloer én op bergwanden. Zandvloer
  naast gras is afgekeurd (regel 5), berg naast gras goedgekeurd (regel 4).
  Eén codepaar, twee situaties: hier schiet een regel per codepaar tekort
  en moet je naar het stuk kijken.
- `r118|r131` — staméinde naast gras, in de tweede poging juist afgekeurd.
  Onderdeel van de onopgeloste brug (regel 8).

## Wat een codepaar niet vangt

Profielcodes worden gedeeld tussen modellen (`r008` op de afstap én op
bergen en keien; `r009` op zandvloer én bergen; `r131` op grasvloer én
heuvelvoeten). Meestal is dat juist de kracht — de regel geldt voor de
vorm, welk model hem ook draagt — maar bij `r009|r131` mengt het twee
situaties met een tegengesteld oordeel. Regels op codeniveau hebben dus
een kleine restcategorie waar het model zelf de doorslag geeft.

## Volgende ronde

`tools/terreinbouwer/bouwsels.json` bevat naast de eenentwintig bouwsels
van de eerste dertien rondes negen nieuwe proefbouwsels die de open
kwesties hierboven en de nooit beoordeelde stukfamilies (76 van de 116
kitstukken) aan de beurt laten komen: een vijver die helemaal door
falloffs wordt ingesloten, een beek met bocht (water-curve) en een met
verval (water-slope), een derde brugpoging met de paal- en
leuningstukken, het zandterras van de strandfamilie, de meercellige
klif- en steilrandhoeken, het heuvelplateau met hoekstukken, en de
waterval. Per bouwsel staat erbij welke vraag het oordeel moet
beantwoorden.

## Reproduceren

```
node tools/leid-aansluitregels-af.mjs
```

Leest `data/combinatieoordelen_13.json`, schrijft
`data/aansluitregels_modulair-terrein.json`. Een ander oordelenbestand kan
als eerste argument mee.
