"""Rapport: rangschikking + contactbladen voor de grootste stijl-uitschieters.

Gebruik: python3 tools/style-audit/report.py <scores.json> <rendersdir> <uitdir> [N]
Per uitschieter (set1, de huidige catalogus) een blad: eigen acht views boven,
de dichtstbijzijnde geaccepteerde buur eronder — het "waarom" is de vergelijking.
"""
import json, os, sys
from PIL import Image, ImageDraw

scores, renders, uitdir = sys.argv[1], sys.argv[2], sys.argv[3]
N = int(sys.argv[4]) if len(sys.argv) > 4 else 30
d = json.load(open(scores))
os.makedirs(os.path.join(uitdir, "sheets"), exist_ok=True)

def blad(assetid):
    return Image.open(os.path.join(renders, assetid.split("/")[0], assetid.split("/", 1)[1] + ".png"))

rows = [r for r in d["ranking"] if r["set"] == "set1"][:N]
for rk, r in enumerate(rows, 1):
    eigen = f"set1/{r['kit'].replace('/', '_')}__{r['name'].replace('/', '_')}"
    buur = r["dichtstbijzijnde_geaccepteerd"][0]
    a, b = blad(eigen), blad(buur)
    W, H, KOP = a.width, a.height, 28
    img = Image.new("RGB", (W, 2 * (H + KOP)), "white")
    dr = ImageDraw.Draw(img)
    dr.text((8, 6), f"#{rk}  {r['kit']}/{r['name']}  score={r['score']}  afwijkendste view: {r['afwijkendste_view']}", fill="black")
    img.paste(a, (0, KOP))
    dr.text((8, H + KOP + 6), f"dichtstbijzijnde geaccepteerd: {buur.split('/', 1)[1]}", fill="black")
    img.paste(b, (0, H + 2 * KOP))
    img.save(os.path.join(uitdir, "sheets", f"{rk:02d}_{r['kit'].replace('/', '_')}__{r['name'].replace('/', '_')}.png"))

s = d["stats"]
md = [
    "# Stijl-audit: uitschieters in de catalogus\n",
    f"Backbone: `{s['backbone']}` — pipeline: `tools/style-audit/` "
    "(acht neutrale views per asset, per-view DINO-embeddings, afstand tot de "
    "K=5 dichtstbijzijnde geaccepteerde assets buiten de eigen bronkit).\n",
    "## Validatie\n",
    f"- AUC stijl-afgekeurd (set2) vs geaccepteerd (set1): **{s['auc_set2_vs_set1']:.3f}**",
    f"- AUC thema-afgekeurd (set3, stijl niet beoordeeld) vs set1: {s['auc_set3_vs_set1']:.3f} (controle)",
    f"- Gemiddelde score: set1 {s['mean']['set1']:.4f} · set2 {s['mean']['set2']:.4f} · set3 {s['mean']['set3']:.4f}\n",
    f"## Top {N} minst passende catalogus-assets\n",
    "Contactbladen in `sheets/`: eigen views boven, dichtstbijzijnde geaccepteerde buur eronder.\n",
    "| # | kit | asset | score | afwijkendste view | dichtstbijzijnde buren |",
    "|--:|-----|-------|------:|-------------------|------------------------|",
]
for rk, r in enumerate(rows, 1):
    buren = ", ".join(b.split("/", 1)[1] for b in r["dichtstbijzijnde_geaccepteerd"])
    md.append(f"| {rk} | {r['kit']} | {r['name']} | {r['score']} | {r['afwijkendste_view']} | {buren} |")
open(os.path.join(uitdir, "README.md"), "w").write("\n".join(md) + "\n")
print("rapport geschreven:", uitdir)
