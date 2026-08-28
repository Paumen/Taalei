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
# is. Bladen in refdir die andersom staan draait het script om.
#
# Wat is omgezet komt in <refdir>/index.md te staan. Bronnen die daar al in
# staan slaat het script over, zodat opnieuw draaien niets verdubbelt.
import sys, os, re
from PIL import Image, ImageDraw, ImageFont

BREED, HOOG = 896, 956
BLAD_Y = (22, 504)          # bovenkant van beide bladen, als in bladen.py
BLAD_H = 452                # hoogte van een blad van acht views
TEKST_Y = (9, 491)          # bovenkant van de kapitaalhoogte van beide labels
WIS = ((0, 22), (478, 504))  # labelstroken; de rest van die banden is toch wit
LINKS = 8
FONT = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 10)
INKT = (3, 3, 3)
AFWIJKEND, GOED = 'AFWIJKENDE STIJL', 'GOEDE STIJL'
GRENS = 85                  # 'AFWIJKENDE STIJL' loopt door tot x=100, 'GOEDE STIJL' tot x=69

# Van deze modellen staat al een blad in de stijlreferentie; nog een keer
# toevoegen levert twee bladen van hetzelfde model op.
AL_AANWEZIG = {
    'FantasyProps_glTF_1k__Anvil': 'ref11',
    'KayKit_Furniture_Bits_1.0_FREE__shelf_A_big': 'ref18',
    'Ultimate_Nature_Pack_by_Quaternius_OBJ__Cactus_1': 'ref10',
    'kenney_graveyardkit_5.0__shovel': 'ref07',
    'kenney_mini-dungeon__key': 'ref03',
    'kenney_platformer-kit__tree': 'ref19',
}

REF = re.compile(r'ref(\d+)\.png')
RIJ = re.compile(r'^\| `(ref\d+)\.png` \| `(.+?)\.png` \|$', re.M)

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


def afwijkend_boven(vel):
    # Het bovenste label herkennen aan zijn breedte: 'AFWIJKENDE STIJL' is een
    # stuk langer dan 'GOEDE STIJL', en verder staat er niets in die strook.
    strook = vel.convert('L').crop((0, WIS[0][0], BREED, WIS[0][1]))
    doos = strook.point(lambda p: 255 if p < 250 else 0).getbbox()
    return doos is not None and doos[2] > GRENS


# --- bestaande bladen gelijkzetten -------------------------------------------
gedraaid = []
for naam in sorted(os.listdir(refdir)):
    if not REF.fullmatch(naam):
        continue
    pad = os.path.join(refdir, naam)
    vel = Image.open(pad).convert('RGB')
    if afwijkend_boven(vel):
        continue
    onder, boven = bladen(vel)               # stond andersom
    zet(boven, onder).save(pad)
    gedraaid.append(naam[:-4])

# --- nieuwe bronnen omzetten -------------------------------------------------
eerder = RIJ.findall(open(index).read()) if os.path.exists(index) else []
gedaan = {naam for _, naam in eerder}
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
    f.write(STAART)
    for naam, ref in sorted(AL_AANWEZIG.items()):
        f.write('| `%s.png` | `%s.png` |\n' % (naam, ref))

print('omgedraaid:', ' '.join(gedraaid) or '-')
for ref, naam in nieuw:
    print(ref, naam, sep='\t')
print('klaar:', len(nieuw), 'referenties')
