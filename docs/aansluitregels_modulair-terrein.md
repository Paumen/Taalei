# Aansluitregels modulair terrein

Afgeleid uit `data/combinatieoordelen_16.json`: 1957 oordelen over voegen
in 23 proefbouwsels met de modulair-terrein-kit, uitgesproken in de
terreinbouwer. Ronde zestien bevat ronde dertien volledig en ongewijzigd
(geen enkel oordeel omgedraaid) plus 272 nieuwe voegen; de dertiende
ronde staat als `data/combinatieoordelen_13.json` ernaast. Elke voeg
draagt ook mee wat `aansluitingen.mjs` erover mat; het oordeel gaat voor
de meting. `tools/leid-aansluitregels-af.mjs` vat de oordelen samen per
combinatie en schrijft `data/aansluitregels_modulair-terrein.json` — 86
zij-regels, 14 stapelregels en 39 randregels, elk met steun, meting en de
bouwsels waar ze vandaan komen. Dit document duidt ze.

## Hoe de oordelen in elkaar zitten

Drie soorten voegen:

- **zij** (1660 oordelen) — twee stukken naast elkaar. De sleutel is het
  paar randprofielen (codes als `r131`) van de twee zijden die elkaar raken.
- **stapel** (67) — het ene stuk boven op het andere. Hier zijn geen
  randprofielen; de sleutel is het modelpaar onder>boven.
- **rand** (230) — de open zijkant van een stapeling: sluiten de
  zijprofielen van onderstuk en bovenstuk netjes op elkaar aan? Geordend
  paar onder>boven; hier valt niets te meten (`meting: null`).

Een profielcode staat voor een randvorm, niet voor een model: `r131` is de
vlakke grasrand en zit op de grasvloer én op de voet van de heuvelzijden;
`∅` is een zijde zonder profiel (bergen, keien, props). Het regelbestand
bevat als naslag per model@slag de waargenomen code per zijde
(`profielen`).

## De regels

### Stapelen: vertrouw de meting

Bij alle 67 stapelvoegen valt het oordeel samen met de meting — goed én
fout. Wat past: binnen een wandfamilie stapelt base → mid → top, ook met de
hoekstukken ertussen (inclusief de 3x3-binnenhoek), en steeds met dezelfde
slag voor beide stukken. Wat
niet past: een vloertegel (gras, water) boven op een afstapstuk. Voor
stapelen is geen regelbestand nodig naast `aansluitingen.mjs`.

### Naast elkaar (zij): meting alleen is niet genoeg

Meting en oordeel lopen hier flink uiteen (goedgekeurd terwijl de meting
"past niet" zei: 505 van de 1660; afgekeurd terwijl ze "past" zei: 26). De
patronen erachter:

1. **Zelfde vloerprofiel tegen zichzelf past.** Gras↔gras (`r131|r131`):
   781× goed. Zand↔zand (`r009|r009`): 13× goed. En sinds ronde zestien
   ook water↔water: in de Poel in het gras 40× goed, en water↔gras
   (`r131|r146`) daar 64× goed.
2. **…behalve water in de verdiepte beeksleuf.** Dezelfde
   water↔water-voeg is in beide beekbouwsels 12× afgekeurd, ook al past
   hij volgens de meting. Met de poel ernaast is de regel dus niet "nooit
   water naast water" — zoals dit document tot ronde zestien stelde —
   maar: op vloerniveau, breed uitgelegd als poel, is water naast water
   en naast gras gewoon goed; in de smalle sleuf een laag dieper werd
   precies dezelfde voeg afgekeurd.
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

## Ronde zestien: de poel en de 3x3-hoek

De 272 nieuwe voegen komen uit twee bouwsels, en allebei verschuiven ze
iets:

- **Poel in het gras** (214 voegen, alles goed) — grasvloer, watertegels
  en steile heuvelzijden op vloerniveau. Dit bouwsel keurt in één klap
  goed wat de beekbouwsels leken te verbieden: water naast water (40×),
  water naast gras (64×) en water tegen de heuvelzijden (16×). De
  waterregel is daarmee herschreven (regel 1 en 2 hierboven): niet de
  watertegel was het probleem, de smalle verdiepte sleuf was het.
- **Steilrand binnenhoek 3x3** (58 voegen) — de drie lagen van de hoek
  stapelen foutloos en vrijwel alle randen zijn goed, maar precies de
  vier open randvoegen waar het grasplateau zonder wand eronder ophoudt
  zijn afgekeurd. Dat bevestigt wat de goedgekeurde referenties al lieten
  zien: een plateaurand hoort op wand te rusten. Het maakt ook
  `r008>r131` omstreden — hetzelfde codepaar was in "Van steil naar
  flauw" wél goed, met wand eronder.

## Tegenstrijdigheden: eerste en tweede poging

18 van de 86 zij-regels zijn omstreden — dezelfde profielcombinatie goed-
én afgekeurd. Op drie na volgen ze allemaal hetzelfde patroon: de
afkeuringen komen uit een eerder bouwsel, de goedkeuringen uit een latere
herbouw van hetzelfde idee. "Beek met een boomstam erover" tegenover
"Beek, tweede poging"; "Bergrug van drie" tegenover "Twee bergen met gras
eronder" (en het eerdere "Berg op de vlakte"). Zelfde randparen, andere
opstelling: het oordeel ging daar over de opstelling, niet over het paar.
Wie de regels toepast kan de latere bouwsels als leidend nemen; het
regelbestand laat beide contexten staan.

De drie echte uitzonderingen:

- `r009|r131` — code `r009` zit op de zandvloer én op bergwanden. Zandvloer
  naast gras is afgekeurd (regel 5), berg naast gras goedgekeurd (regel 4).
  Eén codepaar, twee situaties: hier schiet een regel per codepaar tekort
  en moet je naar het stuk kijken.
- `r118|r131` — staméinde naast gras, in de tweede poging juist afgekeurd.
  Onderdeel van de onopgeloste brug (regel 8).
- `r146|r146` — water naast water: fout in de verdiepte beeksleuf, goed
  in de poel op vloerniveau (regel 2). Ook hier beslist de omgeving, niet
  het paar.

## Wat een codepaar niet vangt

Profielcodes worden gedeeld tussen modellen (`r008` op de afstap én op
bergen en keien; `r009` op zandvloer én bergen; `r131` op grasvloer én
heuvelvoeten). Meestal is dat juist de kracht — de regel geldt voor de
vorm, welk model hem ook draagt — maar bij `r009|r131` mengt het twee
situaties met een tegengesteld oordeel. Regels op codeniveau hebben dus
een kleine restcategorie waar het model zelf de doorslag geeft.

## Volgende ronde

`tools/terreinbouwer/bouwsels.json` bevat naast de bouwsels van de eerste
dertien rondes negen nieuw voorgestelde proefbouwsels. Die zijn door de
beoordelaar grotendeels afgekeurd als opstelling: alleen Klifhoek 2x2
stond goed, en Steilrand binnenhoek 3x3 is daarna tegen meting en
referentie herbouwd en in ronde zestien beoordeeld. De overige zeven
staan er nog zoals ze waren en zijn niet als voorbeeld te vertrouwen. De
watervraag die drie ervan moesten beantwoorden is intussen ingehaald
door "Poel in het gras" van de beoordelaar zelf.

## Reproduceren

```
node tools/leid-aansluitregels-af.mjs
```

Leest `data/combinatieoordelen_16.json`, schrijft
`data/aansluitregels_modulair-terrein.json`. Een ander oordelenbestand kan
als eerste argument mee.
