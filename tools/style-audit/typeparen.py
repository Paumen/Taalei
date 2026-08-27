"""Zet per objecttype een afgekeurd asset naast een geaccepteerd asset.

Gebruik: python3 tools/style-audit/typeparen.py <sets.json> <rendersdir> <uitdir> [N]

Het objecttype constant houden is de enige eerlijke manier om naar stijl te
kijken: zolang je een sleutel met een vat vergelijkt, zie je vooral dat het
andere dingen zijn. Paren met dezelfde kernnaam in beide sets; paren waar
de geaccepteerde versie uit de herwerkte kit komt en de afgekeurde uit de
bronkit staan bovenaan, want daar is het object identiek en is het verschil
per definitie stijl.
"""
import json, os, re, sys, collections
from PIL import Image, ImageDraw

setsjson, renders, uitdir = sys.argv[1], sys.argv[2], sys.argv[3]
N = int(sys.argv[4]) if len(sys.argv) > 4 else 20
sets = json.load(open(setsjson))
os.makedirs(uitdir, exist_ok=True)

MODIFIERS = ["-large", "-small", "-medium", "-open", "-closed", "-detailed", "-simple",
             "-broken", "-half", "-narrow", "-tall", "-low", "-high", "-wide",
             "-upgraded", "-decorated", "-empty", "-full", "-new", "-old",
             "-a", "-b", "-c", "-d", "-e"]

def kern(naam):
    n = re.sub(r"[_\s]+", "-", naam.lower())
    for m in MODIFIERS:
        n = n.replace(m, "")
    return re.sub(r"\d+", "", n).strip("-")

acc, rej = collections.defaultdict(list), collections.defaultdict(list)
for it in sets["set1"]:
    acc[kern(it["name"])].append(it)
for it in sets["set2"]:
    rej[kern(it["name"])].append(it)

def zelfde_lijn(a, r):
    # 'survival-kit' geaccepteerd tegenover 'kenney_survival-kit' afgekeurd:
    # hetzelfde object, herwerkt versus bron.
    return a["kit"].lower().replace("-", "") in r["kit"].lower().replace("-", "").replace("_", "")

paren = []
for k in sorted(set(acc) & set(rej)):
    a, r = acc[k][0], rej[k][0]
    for kandidaat in acc[k]:
        for kr in rej[k]:
            if zelfde_lijn(kandidaat, kr):
                a, r = kandidaat, kr
    paren.append({"type": k, "geaccepteerd": a, "afgekeurd": r, "zelfde_lijn": zelfde_lijn(a, r)})
paren.sort(key=lambda p: (not p["zelfde_lijn"], p["type"]))
paren = paren[:N]

def blad(setnaam, it):
    p = os.path.join(renders, setnaam,
                     f"{it['kit'].replace('/', '_')}__{it['name'].replace('/', '_')}.png")
    return Image.open(p)

KOP = 30
for i, p in enumerate(paren, 1):
    a, r = blad("set1", p["geaccepteerd"]), blad("set2", p["afgekeurd"])
    W, H = a.width, a.height
    img = Image.new("RGB", (W, 2 * (H + KOP) + 10), "white")
    dr = ImageDraw.Draw(img)
    merk = "  [zelfde object, herwerkt vs bron]" if p["zelfde_lijn"] else ""
    dr.text((8, 7), f"{p['type'].upper()}{merk}", fill="black")
    dr.text((8, KOP - 12), f"CATALOGUS: {p['geaccepteerd']['kit']}/{p['geaccepteerd']['name']}", fill="black")
    img.paste(a, (0, KOP))
    y = H + KOP + 10
    dr.text((8, y + 7), f"AFGEKEURD (stijl): {p['afgekeurd']['kit']}/{p['afgekeurd']['name']}", fill="black")
    img.paste(r, (0, y + KOP))
    img.save(os.path.join(uitdir, f"{i:02d}_{p['type']}.png"))

md = ["# Typeparen: afgekeurd naast catalogus\n",
      "Zelfde objecttype boven elkaar, acht views elk. Bovenste rij is de "
      "catalogus, onderste is stijl-afgekeurd. Alleen zo is het verschil dat "
      "je ziet ook echt stijl en niet objecttype.\n",
      "| # | type | catalogus | afgekeurd | zelfde object |",
      "|--:|------|-----------|-----------|---------------|"]
for i, p in enumerate(paren, 1):
    md.append(f"| {i} | {p['type']} | {p['geaccepteerd']['kit']}/{p['geaccepteerd']['name']} | "
              f"{p['afgekeurd']['kit']}/{p['afgekeurd']['name']} | {'ja' if p['zelfde_lijn'] else ''} |")
open(os.path.join(uitdir, "README.md"), "w").write("\n".join(md) + "\n")
print(f"{len(paren)} paren geschreven naar {uitdir}")
