"""Splits de typeparen in een referentieset en een blinde toets.

Gebruik: python3 tools/style-audit/stijltoets.py <typeparendir> <rendersdir> <uitdir> [n_ref] [n_toets]

Referentie: per paar één blad met beide uitvoeringen, waarbij erbij staat welke
de goede stijl is. Met --toets-in-referentie komen de toetsparen er ook in; de
toets meet dan geen generalisatie meer maar of je het antwoord terugvindt. Zonder kit- of assetnaam: 'kenney' staat altijd aan de
afgekeurde kant, dus met namen erbij leer je de bron herkennen in plaats van de
stijl. De goede kant staat per paar geloot boven of onder, zodat de positie ook
geen aanwijzing is.

Toets: losse beelden per paar, a en b geloot, niets erbij. De sleutel gaat naar
een apart bestand buiten de toetsmap.

De twee sets zijn disjunct: wat in de referentie zit, komt niet in de toets.
"""
import json, os, random, re, sys
from PIL import Image, ImageDraw

parendir, renders, uitdir = sys.argv[1:4]
N_REF = int(sys.argv[4]) if len(sys.argv) > 4 else 16
N_TOETS = int(sys.argv[5]) if len(sys.argv) > 5 else 8
# De toetsparen ook in de referentie zetten. Dan staat het antwoord van elk
# toetspaar in de referentie en meet de toets herkennen in plaats van
# generaliseren; alleen zinvol als je de referentie als volledig overzicht wilt.
TOETS_IN_REF = "--toets-in-referentie" in sys.argv
SEED = 20260828

tabel = {}
for regel in open(os.path.join(parendir, "README.md")):
    m = re.match(r"\| (\d+) \| (\S+) \| (\S+) \| (\S+) \|", regel)
    if m:
        tabel[int(m.group(1))] = {"type": m.group(2), "catalogus": m.group(3), "afgekeurd": m.group(4)}
paren = [{"nummer": n, **v} for n, v in sorted(tabel.items())]
if len(paren) < N_REF + N_TOETS:
    sys.exit(f"{len(paren)} paren beschikbaar, {N_REF}+{N_TOETS} gevraagd")

rng = random.Random(SEED)
door = paren[:]
rng.shuffle(door)
ref, toets = door[:N_REF], door[N_REF:N_REF + N_TOETS]
toets.sort(key=lambda p: p["nummer"])
if TOETS_IN_REF:
    ref = ref + toets
ref.sort(key=lambda p: p["nummer"])

def blad(setnaam, verwijzing):
    kit, naam = verwijzing.split("/", 1)
    return Image.open(os.path.join(renders, setnaam,
                                   f"{kit.replace('/', '_')}__{naam.replace('/', '_')}.png"))

refdir, toetsdir = os.path.join(uitdir, "referentie"), os.path.join(uitdir, "toets")
for d in (refdir, toetsdir):
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        if f.endswith(".png"):
            os.remove(os.path.join(d, f))

KOP = 26
for i, p in enumerate(ref, 1):
    kanten = [("GOEDE STIJL", blad("set1", p["catalogus"])),
              ("AFWIJKENDE STIJL", blad("set2", p["afgekeurd"]))]
    rng.shuffle(kanten)
    W, H = kanten[0][1].width, kanten[0][1].height
    img = Image.new("RGB", (W, 2 * (H + KOP) + 8), "white")
    dr = ImageDraw.Draw(img)
    for n, (etiket, beeld) in enumerate(kanten):
        y = n * (H + KOP + 8)
        dr.text((8, y + 7), etiket, fill="black")
        img.paste(beeld, (0, y + KOP))
    img.save(os.path.join(refdir, f"ref{i:02d}.png"))

# Precies de helft met de catalogus op a: bij vrij loten kwam het op zes om
# twee uit, en dan scoort 'altijd a' al 75%. Nu levert een vast antwoord 50%.
volgorde = [True] * (N_TOETS // 2) + [False] * (N_TOETS - N_TOETS // 2)
# Niet elke gebalanceerde trekking is bruikbaar: de eerste kwam er als
# ababababab uit, en dat ziet iemand meteen. Blijf trekken tot er geen
# strikte afwisseling en geen twee gelijke helften in zitten.
def bruikbaar(v):
    afwisselend = all(v[i] != v[i + 1] for i in range(len(v) - 1))
    helften = v[:len(v) // 2] == v[len(v) // 2:]
    return not afwisselend and not helften
for _ in range(100):
    rng.shuffle(volgorde)
    if bruikbaar(volgorde):
        break

sleutel = []
for i, (p, cat_eerst) in enumerate(zip(toets, volgorde), 1):
    kanten = [("catalogus", blad("set1", p["catalogus"]), p["catalogus"]),
              ("afgekeurd", blad("set2", p["afgekeurd"]), p["afgekeurd"])]
    if not cat_eerst:
        kanten.reverse()
    regel = {"paar": i}
    for letter, (herkomst, beeld, verwijzing) in zip("ab", kanten):
        beeld.save(os.path.join(toetsdir, f"{i:02d}{letter}.png"))
        regel[letter] = {"herkomst": herkomst, "asset": verwijzing}
    sleutel.append(regel)

json.dump({"seed": SEED, "toets_in_referentie": TOETS_IN_REF,
           "referentie": [{"nr": i, "type": p["type"], "catalogus": p["catalogus"],
                           "afgekeurd": p["afgekeurd"]} for i, p in enumerate(ref, 1)],
           "toets": sleutel},
          open(os.path.join(uitdir, "stijltoets_sleutel.json"), "w"), indent=1)

# Geen uitleg-bestand in de boom: referentie/ en toets/ geef je aan de
# beoordelaar, en zelfs een OPZET.md een map hoger verklapt de opzet — onder
# meer dat de catalogus de helft van de keren op a staat, wat je zonder kijken
# al kunt uitbuiten. Alleen beelden en de sleutel; de opzet staat in de
# docstring hierboven.

print(f"referentie: {len(ref)} paren -> {refdir}")
print(f"toets: {len(toets)} paren -> {toetsdir}")
print("ongebruikt:", [p["type"] for p in paren if p not in ref and p not in toets])
