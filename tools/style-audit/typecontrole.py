"""Hoeveel van de score is stijl, en hoeveel alleen 'bestaat dit objecttype al'?

Gebruik: python3 tools/style-audit/typecontrole.py <scores.json> [uit.json]

De score meet afstand tot de dichtstbijzijnde geaccepteerde assets. Een asset
zonder soortgenoten in de catalogus scoort daardoor hoog ongeacht zijn stijl.
Deze controle houdt het objecttype constant: binnen elke groep gelijksoortige
objecten (eerste naamdeel, bv. alle barrel-*) wordt opnieuw gemeten of de score
geaccepteerd van stijl-afgekeurd scheidt. Blijft de AUC daar bij toeval hangen,
dan meet de score objecttype-beschikbaarheid en geen stijl.

Weging op n_geaccepteerd * n_afgekeurd: het aantal vergelijkbare paren. Pooling
zonder die weging laat verschillen tússen groepen meetellen en overschat het
resultaat (Simpson).
"""
import collections, json, re, sys
import numpy as np
from sklearn.metrics import roc_auc_score

scores = sys.argv[1]
uit = sys.argv[2] if len(sys.argv) > 2 else None
MIN = 3  # minimaal per groep, anders is de AUC betekenisloos

def objecttype(naam):
    return re.sub(r"\d+$", "", re.split(r"[-_]", naam.lower())[0])

groep = collections.defaultdict(lambda: {"set1": [], "set2": []})
for x in json.load(open(scores))["ranking"]:
    if x["set"] in ("set1", "set2"):
        groep[objecttype(x["name"])][x["set"]].append(x["score"])
bruikbaar = {k: v for k, v in groep.items() if len(v["set1"]) >= MIN and len(v["set2"]) >= MIN}
if not bruikbaar:
    sys.exit("geen objecttype met genoeg geaccepteerde en afgekeurde assets")

rijen = []
for k, v in bruikbaar.items():
    y = np.r_[np.ones(len(v["set2"])), np.zeros(len(v["set1"]))]
    rijen.append({"type": k, "n_geaccepteerd": len(v["set1"]), "n_afgekeurd": len(v["set2"]),
                  "auc": float(roc_auc_score(y, np.r_[v["set2"], v["set1"]])),
                  "paren": len(v["set1"]) * len(v["set2"])})
binnen = sum(r["auc"] * r["paren"] for r in rijen) / sum(r["paren"] for r in rijen)
omgekeerd = sorted((r for r in rijen if r["auc"] < 0.45), key=lambda r: r["auc"])

print(f"binnen-type AUC (gewogen naar vergelijkbare paren): {binnen:.3f}   (toeval = 0.500)")
print(f"types: {len(rijen)}, waarvan omgekeerd (<0.45): {len(omgekeerd)}\n")
for r in sorted(rijen, key=lambda r: r["auc"]):
    vlag = "  <- omgekeerd" if r["auc"] < 0.45 else ""
    print(f"  {r['type']:12s} AUC {r['auc']:.3f}  ({r['n_geaccepteerd']} geaccepteerd, "
          f"{r['n_afgekeurd']} afgekeurd){vlag}")
if uit:
    json.dump({"binnen_type_auc": binnen, "per_type": sorted(rijen, key=lambda r: r["auc"])},
              open(uit, "w"), indent=1)
    print("\ngeschreven:", uit)
