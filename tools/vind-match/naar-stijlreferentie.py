# Zet vergelijkingsbladen uit docs/missing_matches om naar stijlreferenties.
#
#   python3 tools/vind-match/naar-stijlreferentie.py [missingdir] [refdir]
#
# Een blad uit missing_matches heeft dezelfde opmaak als een stijlreferentie —
# label, blad van acht views, label, blad van acht views — alleen de labels
# verschillen. Het ontbrekende model komt uit een vreemde kit en is dus de
# afwijkende stijl; de dichtstbijzijnde catalogustreffer staat in onze eigen
# stijl. Omzetten is daarom alleen de twee labels vervangen:
#
#   MISSING — ...                  ->  AFWIJKENDE STIJL
#   CLOSEST CATALOG MATCH — ...    ->  GOEDE STIJL
#
# De naam van het model en de DINOv3-score verdwijnen: een stijlreferentie laat
# zien wat goed en fout is, niet welk model het is.
#
# De afwijkende stijl staat overal bovenaan en de goede stijl overal onderaan,
# zodat je bij het doorbladeren niet steeds hoeft te zoeken welke helft welke
# is. Elk blad in refdir krijgt zijn labels opnieuw, in die volgorde; bladen die
# andersom stonden draait het script om.
#
# Wat is omgezet komt in <refdir>/index.md te staan. Bronnen die daar al in
# staan slaat het script over, zodat opnieuw draaien niets verdubbelt.
#
# Een referentie die na het nakijken is weggehaald hoort niet terug te komen bij
# de volgende run. Alleen het weggehaalde bestand zegt dat niet: het script ziet
# een bron zonder referentie en zet hem gewoon opnieuw om. Daarom staat onder
# 'Rejected' in index.md welke bronnen zijn afgewezen; die slaat het script over
# zolang die regel blijft staan. Een bron alsnog toelaten is dus zijn regel daar
# weghalen.
import sys, os, re
from PIL import Image, ImageDraw, ImageFont

BREED, HOOG = 896, 956
BLAD_Y = (22, 504)          # bovenkant van beide bladen, als in bladen.py
BLAD_H = 452                # hoogte van een blad van acht views
TEKST_Y = (9, 491)          # bovenkant van de kapitaalhoogte van beide labels
WIS = ((0, 22), (478, 504))  # labelstroken; de rest van die banden is toch wit
LINKS = 8
FONT = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 18)
INKT = (3, 3, 3)
AFWIJKEND, GOED = 'AFWIJKENDE STIJL', 'GOEDE STIJL'

# Van deze modellen staat al een blad in de stijlreferentie; nog een keer
# toevoegen levert twee bladen van hetzelfde model op.
AL_AANWEZIG = {
    'FantasyProps_glTF_1k__Anvil': 'ref11',
    'KayKit_Furniture_Bits_1.0_FREE__shelf_A_big': 'ref18',
    'Ultimate_Nature_Pack_by_Quaternius_OBJ__Cactus_1': 'ref10',
    'kenney_graveyardkit_5.0__shovel': 'ref07',
    'kenney_mini-dungeon__key': 'ref03',
    'kenney_platformer-kit__tree': 'ref19',
    # Met de hand gekozen en toegevoegd, zie docs/stijlreferentie/categorieen.md.
    'KayKit_Forest_Nature_Pack_1.0_FREE__Bush_1_E_Color1': 'n30',
    'KayKit_Forest_Nature_Pack_1.0_FREE__Bush_2_D_Color1': 'n31',
    'KayKit_Restaurant_Bits_1.0_FREE__kitchencounter_straight_A_backsplash': 's22',
    'KayKit_Restaurant_Bits_1.0_FREE__wall_orderwindow': 's18',
    'LowPolyNaturePackLite__fence': 's32',
    'PropsLite_FBX__Fence_01': 's33',
    'TropicalIslandLite_FBX__Rock_01': 'n22',
    'Ultimate_Nature_Pack_by_Quaternius_OBJ__PalmTree_2': 'n26',
    'Ultimate_Nature_Pack_by_Quaternius_OBJ__PalmTree_4': 'n27',
    'Ultimate_Nature_Pack_by_Quaternius_OBJ__PineTree_4': 'n25',
    'kenney_castlekit__tree-log': 'n29',
    'kenney_fantasy-town-kit_2.0__pillar-stone': 's23',
    'kenney_graveyardkit_5.0__brick-wall': 's26',
    'kenney_graveyardkit_5.0__crypt-large-door': 's27',
    'kenney_graveyardkit_5.0__detail-plate': 'o43',
    'kenney_graveyardkit_5.0__trunk': 'n28',
    'kenney_holidaykit__cabin-window-a': 's24',
    'kenney_holidaykit__cabin-window-large': 's25',
    'kenney_mini-forest_1.0__building-platform': 's34',
    'kenney_pirate-kit__palm-bend': 'n33',
    'kenney_platformer-kit__block-grass-low-large': 'n23',
    'kenney_platformer-kit__block-moving': 's21',
    'kenney_platformer-kit__flowers-tall': 'n24',
    'kenney_prototypekit__door-rotate': 's19',
    'kenney_prototypekit__ladder': 's20',
    'kenney_survival-kit__metal-panel-screws-half': 's28',
    'kenney_survival-kit__patch-grass': 'n32',
    'kenney_survival-kit__structure-metal-floor': 's29',
    'kenney_survival-kit__structure-metal-roof': 's30',
    'kenney_survival-kit__structure-metal-wall': 's31',
}

# Een omgezet blad heet refNN tot iemand het indeelt; daarna draagt het zijn
# categorie in de naam: o<n> object, n<n> natuur, s<n> structuur. Zie
# docs/stijlreferentie/categorieen.md. Nieuwe bladen krijgen weer een
# ref-nummer: welke categorie erbij hoort weet dit script niet, dat is een
# leesbeslissing. Beide namen tellen mee bij het opnieuw labelen hieronder;
# alleen het nummeren van nieuwe bladen gaat op ref-namen.
REF = re.compile(r'ref(\d+)\.png')
BLADNAAM = re.compile(r'(?:ref\d+|[ons]\d+)\.png')
RIJ = re.compile(r'^\| `(ref\d+)\.png` \| `(.+?)\.png` \|$', re.M)
AFGEWEZEN_RIJ = re.compile(r'^\| `(.+?)\.png` \|$', re.M)

KOP = """# Converted sheets

These references were converted from the comparison sheets in `%s` by
`tools/vind-match/naar-stijlreferentie.py`. The missing model — from an outside
kit — is the deviant style; its closest catalog match is the good style. Only
the two labels change.

Throughout the reference set the deviant style is the top half and the good
style the bottom half, so the two never have to be told apart by reading.

| ref | source sheet |
|-----|--------------|
"""

AFGEWEZEN_KOP = """
## Rejected

Converted once and taken out again after review. The script leaves these alone;
drop a row to let its sheet be converted again.

| source sheet |
|--------------|
"""

STAART = """
## Not converted

Left out, because the same model already has a sheet in the reference set:

| source sheet | already present as |
|--------------|--------------------|
"""

mdir = sys.argv[1] if len(sys.argv) > 1 else 'docs/missing_matches'
refdir = sys.argv[2] if len(sys.argv) > 2 else 'docs/stijlreferentie'
os.makedirs(refdir, exist_ok=True)
index = os.path.join(refdir, 'index.md')


def label(d, y, tekst):
    # getbbox geeft de top van de kapitaalhoogte; daarmee zet de tekst even
    # hoog als in de stijlreferentie, ongeacht de bovenruimte van het font.
    d.text((LINKS, y - FONT.getbbox(tekst)[1]), tekst, font=FONT, fill=INKT)


def zet(boven, onder):
    # Twee bladen van acht views onder elkaar, met de vaste labels erboven.
    vel = Image.new('RGB', (BREED, HOOG), 'white')
    vel.paste(boven, (0, BLAD_Y[0]))
    vel.paste(onder, (0, BLAD_Y[1]))
    for y0, y1 in WIS:
        vel.paste('white', (0, y0, BREED, y1))   # oude labels weg
    d = ImageDraw.Draw(vel)
    label(d, TEKST_Y[0], AFWIJKEND)
    label(d, TEKST_Y[1], GOED)
    return vel


def bladen(vel):
    return [vel.crop((0, y, BREED, y + BLAD_H)) for y in BLAD_Y]


def breedte(vel, i):
    # Hoe ver het label in strook i doorloopt; verder staat er niets in die band.
    strook = vel.convert('L').crop((0, WIS[i][0], BREED, WIS[i][1]))
    doos = strook.point(lambda p: 255 if p < 250 else 0).getbbox()
    return doos[2] if doos else 0


def afwijkend_boven(vel):
    # 'AFWIJKENDE STIJL' is altijd langer dan 'GOEDE STIJL'. De twee labels met
    # elkaar vergelijken werkt bij elke tekengrootte; een vaste grens niet.
    return breedte(vel, 0) > breedte(vel, 1)


# --- bestaande bladen gelijkzetten -------------------------------------------
# Elk blad krijgt zijn labels opnieuw, zodat een gewijzigde tekengrootte overal
# doorwerkt; de bladen zelf gaan onveranderd mee.
gedraaid = []
for naam in sorted(os.listdir(refdir)):
    if not BLADNAAM.fullmatch(naam):
        continue
    pad = os.path.join(refdir, naam)
    vel = Image.open(pad).convert('RGB')
    boven, onder = bladen(vel)
    if not afwijkend_boven(vel):
        boven, onder = onder, boven          # stond andersom
        gedraaid.append(naam[:-4])
    zet(boven, onder).save(pad)

# --- nieuwe bronnen omzetten -------------------------------------------------
tekst = open(index).read() if os.path.exists(index) else ''
eerder = RIJ.findall(tekst)
afgewezen = AFGEWEZEN_RIJ.findall(tekst.partition(AFGEWEZEN_KOP)[2].partition('\n##')[0])
gedaan = {naam for _, naam in eerder} | set(afgewezen)
nummer = max((int(REF.fullmatch(f)[1]) for f in os.listdir(refdir)
              if REF.fullmatch(f)), default=0)

nieuw = []
for naam in sorted(f[:-4] for f in os.listdir(mdir) if f.endswith('.png')):
    if naam in AL_AANWEZIG or naam in gedaan:
        continue
    boven, onder = bladen(Image.open(os.path.join(mdir, naam + '.png')).convert('RGB'))
    nummer += 1                              # missing boven, catalogustreffer onder
    ref = 'ref%02d' % nummer
    zet(boven, onder).save(os.path.join(refdir, ref + '.png'))
    nieuw.append((ref, naam))

with open(index, 'w') as f:
    f.write(KOP % mdir)
    for ref, naam in eerder + nieuw:
        f.write('| `%s.png` | `%s.png` |\n' % (ref, naam))
    if afgewezen:
        f.write(AFGEWEZEN_KOP)
        for naam in sorted(afgewezen):
            f.write('| `%s.png` |\n' % naam)
    f.write(STAART)
    for naam, ref in sorted(AL_AANWEZIG.items()):
        f.write('| `%s.png` | `%s.png` |\n' % (naam, ref))

print('omgedraaid:', ' '.join(gedraaid) or '-')
for ref, naam in nieuw:
    print(ref, naam, sep='\t')
print('klaar:', len(nieuw), 'referenties')
