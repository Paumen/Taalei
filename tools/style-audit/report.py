"""Rapport: rangschikking + contactbladen voor de grootste stijl-uitschieters.

Gebruik: python3 tools/style-audit/report.py <scores.json> <rendersdir> <uitdir> [N]
Per uitschieter (set1, de huidige catalogus) een blad: eigen acht views boven,
de dichtstbijzijnde geaccepteerde buur eronder — het "waarom" is de vergelijking.
"""
import json, os, sys
from PIL import Image, ImageDraw

scores, renders, uitdir = sys.argv[1], sys.argv[2], sys.argv[3]
N = int(sys.argv[4]) if len(sys.argv) > 4 else 30
# optioneel vijfde argument: scores.json van een andere backbone, puur om
# naast de gekozen run te zetten in de validatietabel.
vergelijk = json.load(open(sys.argv[5]))["stats"] if len(sys.argv) > 5 else None
d = json.load(open(scores))
os.makedirs(os.path.join(uitdir, "sheets"), exist_ok=True)

def blad(assetid):
    return Image.open(os.path.join(renders, assetid.split("/")[0], assetid.split("/", 1)[1] + ".png"))

rows = [r for r in d["ranking"] if r["set"] == "set1"][:N]
for rk, r in enumerate(rows, 1):
    eigen = f"set1/{r['kit'].replace('/', '_')}__{r['name'].replace('/', '_')}"
    # Alle buren tonen die in de score meetellen, niet alleen de beste: bij
    # windmill-blades is buur 1 een prima broer en zijn 2-5 ruis, en juist dat
    # verschil maakt de score. Eén buur laten zien suggereert een stijloordeel
    # waar het om isolatie gaat.
    buren = r["dichtstbijzijnde_geaccepteerd"]
    bladen = [blad(eigen)] + [blad(b) for b in buren]
    W, H, KOP = bladen[0].width, bladen[0].height, 28
    img = Image.new("RGB", (W, len(bladen) * (H + KOP)), "white")
    dr = ImageDraw.Draw(img)
    dr.text((8, 6), f"#{rk}  {r['kit']}/{r['name']}  score={r['score']} "
                    f"(beste buur alleen: {r['d1_beste_buur']}, kloof {r['kloof']})  "
                    f"afwijkendste view: {r['afwijkendste_view']}", fill="black")
    img.paste(bladen[0], (0, KOP))
    for n, (b, naam) in enumerate(zip(bladen[1:], buren), 1):
        y = n * (H + KOP)
        dr.text((8, y + 6), f"buur {n}: {naam.split('/', 1)[1]}", fill="black")
        img.paste(b, (0, y + KOP))
    img.save(os.path.join(uitdir, "sheets", f"{rk:02d}_{r['kit'].replace('/', '_')}__{r['name'].replace('/', '_')}.png"))

s = d["stats"]
md = [
    "# Stijl-audit: uitschieters in de catalogus\n",
    f"Backbone: `{s['backbone']}` — pipeline: `tools/style-audit/` "
    "(acht neutrale views per asset, per-view DINO-vingerafdrukken, afstand tot de "
    f"K={s['K']} dichtstbijzijnde geaccepteerde assets). Rangschikking volgens "
    f"**{s['gekozen']}** (beste AUC op de eigen keurgeschiedenis).\n",
    "## Validatie (AUC stijl-afgekeurd set2 vs geaccepteerd set1; set3 = thema-controle)\n",
    "AUC 0.5 = ruis, 1.0 = perfecte scheiding. De thema-controle (set3) hoort "
    "laag te blijven: stijgt hij mee, dan meet de variant vreemdheid in plaats van stijl.\n",
]
if vergelijk:
    md += [
        f"| vingerafdruk/buurregel | AUC set2 ({s['backbone'].split('/')[-1]}) | AUC set3 | "
        f"AUC set2 ({vergelijk['backbone'].split('/')[-1]}) | AUC set3 |",
        "|------------------------|---------:|---------:|---------:|---------:|",
    ]
    for cel in ("cls/zonder-kit", "cls/met-kit", "patch/zonder-kit", "patch/met-kit"):
        a, b = s[cel], vergelijk[cel]
        md.append(f"| {cel} | {a['auc_set2_vs_set1']:.3f} | {a['auc_set3_vs_set1']:.3f} | "
                  f"{b['auc_set2_vs_set1']:.3f} | {b['auc_set3_vs_set1']:.3f} |")
else:
    md += [
        "| vingerafdruk/buurregel | AUC set2 | AUC set3 | gem. set1 | gem. set2 | gem. set3 |",
        "|------------------------|---------:|---------:|----------:|----------:|----------:|",
    ]
    for cel in ("cls/zonder-kit", "cls/met-kit", "patch/zonder-kit", "patch/met-kit"):
        c = s[cel]
        md.append(f"| {cel} | {c['auc_set2_vs_set1']:.3f} | {c['auc_set3_vs_set1']:.3f} | "
                  f"{c['mean']['set1']:.4f} | {c['mean']['set2']:.4f} | {c['mean']['set3']:.4f} |")
g = s[s["gekozen"]]
md += [
    "",
    "set3 hoort als verdeling tussen set1 en set2 te liggen: de mediaan van set3 ligt op het "
    f"{100 * g['set3_percentielen_in_set1']['50']:.0f}e percentiel van set1 ({s['gekozen']}).\n",
    "## Kit-diagnose (set1, zonder-kit minus met-kit)\n",
    "Groot verschil = de kit is zijn eigen dichtstbijzijnde stijl: kit-vingerafdruk, "
    "of een eigen-maar-geaccepteerd stijl-eiland. Klein verschil = het asset heeft ook "
    "buiten de eigen kit dichte buren.\n",
    "| kit | n | gem. delta |",
    "|-----|--:|-----------:|",
]
for r in d["kit_diagnose"]:
    md.append(f"| {r['kit']} | {r['n']} | {r['gem_delta']} |")
md += ["",
    f"## Top {N} minst passende catalogus-assets\n",
    "Contactbladen in `sheets/`: eigen views boven, dichtstbijzijnde geaccepteerde buur eronder.\n",
    "`score` = gemiddelde over de K buren. `beste buur` = afstand tot alleen buur 1. "
    "Een grote `kloof` betekent: er is één echte broer en de rest is ruis — het asset "
    "is dus wél beoordeelbaar, kijk naar buur 1. Een kleine kloof betekent dat niets "
    "erop lijkt, op geen enkele rang: isolatie, geen stijloordeel.\n",
    "| # | kit | asset | score | beste buur | kloof | afwijkendste view | dichtstbijzijnde buren |",
    "|--:|-----|-------|------:|-----------:|------:|-------------------|------------------------|",
]
for rk, r in enumerate(rows, 1):
    buren = ", ".join(b.split("/", 1)[1] for b in r["dichtstbijzijnde_geaccepteerd"][:3])
    md.append(f"| {rk} | {r['kit']} | {r['name']} | {r['score']} | {r['d1_beste_buur']} | "
              f"{r['kloof']} | {r['afwijkendste_view']} | {buren} |")
open(os.path.join(uitdir, "README.md"), "w").write("\n".join(md) + "\n")
print("rapport geschreven:", uitdir)
