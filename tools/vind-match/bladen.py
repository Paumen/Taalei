# Zet per ontbrekend model een vergelijkingsblad in de opmaak van
# docs/stijlreferentie: label, blad van acht views, label, blad van acht views.
# Gebruik: python3 blad.py <matches.json> <views-missing-dir> <views-catalogus-dir> <uitdir>
#
# Achter de catalogustreffer komt te staan waar die vandaan komt: 'DINOV3 0.812'
# bij een treffer van match.py, en anders het veld 'methode' — bij een met het
# oog gekozen treffer staat er dus 'HANDMATIG' en geen score die er niet is.
import sys, os, json
from PIL import Image, ImageDraw, ImageFont

BREED, HOOG = 896, 956
BLAD_Y = (22, 504)          # bovenkant van beide bladen
TEKST_Y = (9, 491)          # bovenkant van de kapitaalhoogte van beide labels
LINKS = 8
FONT = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 10)
INKT = (3, 3, 3)

matches, mdir, cdir, uitdir = sys.argv[1:5]
os.makedirs(uitdir, exist_ok=True)

def label(d, y, tekst):
    # getbbox geeft de top van de kapitaalhoogte; daarmee zet de tekst even
    # hoog als in de stijlreferentie, ongeacht de bovenruimte van het font.
    d.text((LINKS, y - FONT.getbbox(tekst)[1]), tekst, font=FONT, fill=INKT)

for m in json.load(open(matches)):
    vel = Image.new('RGB', (BREED, HOOG), 'white')
    d = ImageDraw.Draw(vel)
    label(d, TEKST_Y[0], f"MISSING — {m['missing'].replace('__', ' / ')}".upper())
    bron = f"DINOV3 {m['score']:.3f}" if 'score' in m else m.get('methode', '')
    onder = f"CLOSEST CATALOG MATCH — {m['match'].replace('__', ' / ')}" + (f" — {bron}" if bron else '')
    label(d, TEKST_Y[1], onder.upper())
    vel.paste(Image.open(os.path.join(mdir, m['missing'] + '.png')).convert('RGB'), (0, BLAD_Y[0]))
    vel.paste(Image.open(os.path.join(cdir, m['match'] + '.png')).convert('RGB'), (0, BLAD_Y[1]))
    vel.save(os.path.join(uitdir, m['missing'] + '.png'))
print('klaar')
