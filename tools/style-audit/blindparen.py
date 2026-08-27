"""Hernummer de typeparen en zet er een blinde versie naast.

Gebruik: python3 tools/style-audit/blindparen.py <typeparendir> <rendersdir> <blinddir> <sleutel.json>

De gelabelde bladen zeggen bovenaan welke van de twee uit de catalogus komt.
Dat stuurt het oordeel. De blinde versie geeft per paar twee losse beelden,
zonder tekst, met a en b in willekeurige volgorde: je ziet dat het een paar is
en verder niets. De sleutel gaat naar een apart bestand buiten de blinde map,
zodat je er niet per ongeluk overheen kijkt.

Werkt op de bladen die er staan, niet op een nieuwe selectie: de map is met de
hand uitgedund en dat blijft leidend.
"""
import json, os, random, re, shutil, sys
from PIL import Image

parendir, renders, blinddir, sleutelpad = sys.argv[1:5]
SEED = 20260827

# Wat er nog staat, in de volgorde van de tabel.
tabel = {}
for regel in open(os.path.join(parendir, "README.md")):
    m = re.match(r"\| (\d+) \| (\S+) \| (\S+) \| (\S+) \|", regel)
    if m:
        tabel[m.group(1)] = {"type": m.group(2), "geaccepteerd": m.group(3), "afgekeurd": m.group(4)}
aanwezig = sorted((f for f in os.listdir(parendir) if f.endswith(".png")),
                  key=lambda f: int(re.match(r"(\d+)_", f).group(1)))

paren = []
for f in aanwezig:
    nr = re.match(r"(\d+)_", f).group(1).lstrip("0")
    if nr in tabel:
        paren.append({"blad": f, **tabel[nr]})
if not paren:
    sys.exit("geen paren gevonden; staat de README-tabel nog gelijk aan de bladen?")

# Hernummeren: aaneengesloten 1..n, gaten uit het verwijderen weg.
tijdelijk = {}
for i, p in enumerate(paren, 1):
    nieuw = f"{i:02d}_{p['type']}.png"
    tijdelijk[p["blad"]] = nieuw
    p["nummer"] = i
for oud, nieuw in tijdelijk.items():
    if oud != nieuw:
        os.rename(os.path.join(parendir, oud), os.path.join(parendir, oud + ".tmp"))
for oud, nieuw in tijdelijk.items():
    bron = os.path.join(parendir, oud + ".tmp")
    os.rename(bron if os.path.exists(bron) else os.path.join(parendir, oud),
              os.path.join(parendir, nieuw))

def blad(setnaam, verwijzing):
    kit, naam = verwijzing.split("/", 1)
    return Image.open(os.path.join(renders, setnaam,
                                   f"{kit.replace('/', '_')}__{naam.replace('/', '_')}.png"))

os.makedirs(blinddir, exist_ok=True)
for f in os.listdir(blinddir):
    if f.endswith(".png"):
        os.remove(os.path.join(blinddir, f))

rng = random.Random(SEED)
sleutel = []
for p in paren:
    kanten = [("catalogus", blad("set1", p["geaccepteerd"]), p["geaccepteerd"]),
              ("afgekeurd", blad("set2", p["afgekeurd"]), p["afgekeurd"])]
    rng.shuffle(kanten)
    regel = {"paar": p["nummer"]}
    for letter, (herkomst, beeld, verwijzing) in zip("ab", kanten):
        beeld.save(os.path.join(blinddir, f"{p['nummer']:02d}{letter}.png"))
        regel[letter] = {"herkomst": herkomst, "asset": verwijzing}
    sleutel.append(regel)

json.dump({"seed": SEED, "sleutel": sleutel}, open(sleutelpad, "w"), indent=1)
open(os.path.join(blinddir, "README.md"), "w").write(
    "# Typeparen, blind\n\n"
    f"{len(paren)} paren. Elk paar staat als `NNa.png` en `NNb.png`: hetzelfde "
    "objecttype, twee uitvoeringen. Geen tekst op de beelden, geen namen in de "
    "bestandsnaam, en a of b is per paar geloot — welke uit de catalogus komt "
    "staat er dus niet bij, en het is per paar een andere kant.\n\n"
    "Acht views per beeld, dezelfde acht standpunten en dezelfde neutrale "
    "weergave voor beide, zodat alleen de vorm verschilt.\n\n"
    f"De oplossing staat buiten deze map, in `{os.path.basename(sleutelpad)}`.\n")
print(f"{len(paren)} paren hernummerd en blind weggeschreven naar {blinddir}")
print(f"sleutel: {sleutelpad}")
