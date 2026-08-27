"""Stijlscore per asset: afstand tot de dichtstbijzijnde geaccepteerde buren,
met de eigen bronkit uitgesloten zodat kit-vingerafdrukken niet meetellen.

Gebruik: python3 tools/style-audit/score.py <emb.npz> <sets.json> <uitdir>

- Representatie: acht per-view-genormaliseerde embeddings aaneengeschakeld;
  cosinus daarop = gemiddelde per-view cosinus over gelijke camerastandpunten.
- Score = gemiddelde cosinusafstand tot de K dichtstbijzijnde set1-assets
  buiten de eigen bronkit (voor set1 ook zonder zichzelf). kNN in plaats van
  een centroid: "afgekeurd" heeft geen midden, geaccepteerd is multimodaal.
- Validatie: AUC set1 vs set2 (stijl-afgekeurd); set3 (thema-afgekeurd,
  stijl niet beoordeeld) als controle die tussenin of laag hoort te liggen.
"""
import json, os, sys, collections
import numpy as np

npz, setsjson, uitdir = sys.argv[1], sys.argv[2], sys.argv[3]
K = 5
d = np.load(npz, allow_pickle=True)
ids, E = list(d["ids"]), d["emb"]
sets = json.load(open(setsjson))
os.makedirs(uitdir, exist_ok=True)

# Zelfde bronkit herkennen over naamvarianten heen (catalogus-slug vs bronmap).
KIT_ALIAS = {
    "dungeon": "kaykit_dungeon_pack_1.1_free", "fantasy-props": "fantasyprops_gltf_1k",
    "fantasy-town-kit": "kenney_fantasy-town-kit_2.0", "forest": "kaykit_forest_nature_pack_1.0_free",
    "halloween": "kaykit_halloweenbits_1.0_free", "mini-forest": "kenney_mini-forest_1.0",
    "modulair-terrein": "modular_terrain_collection", "modular-cave-kit": "kenney_modular-cave-kit_1.0",
    "quaternius-nature": "ultimate_nature_pack_by_quaternius_obj", "resources": "kaykit_resourcebits_1.0_free",
    "restaurant": "kaykit_restaurant_bits_1.0_free", "rocks": "rocks", "rpgtools": "kaykit_rpgtoolsbits_1.0_free",
    "survival-kit": "kenney_survival-kit", "pirate-kit": "kenney_pirate-kit",
    "platformer-kit": "kenney_platformer-kit", "prototype-kit": "kenney_prototypekit",
    "village-kit": "modular village", "props": "propslite_fbx", "natuur": "nature_kit",
}
def kanoniek(kit):
    k = kit.lower()
    return KIT_ALIAS.get(k, k)

meta = {}
for setnaam, items in sets.items():
    for it in items:
        meta[f"{setnaam}/{it['kit'].replace('/', '_')}__{it['name'].replace('/', '_')}"] = (setnaam, kanoniek(it["kit"]), it["kit"], it["name"])
rows = [meta[i] for i in ids]

# per view normaliseren, aaneenschakelen
En = E / (np.linalg.norm(E, axis=2, keepdims=True) + 1e-9)
X = En.reshape(len(ids), -1) / np.sqrt(E.shape[1])
sim = X @ X.T  # gemiddelde per-view cosinus

is1 = np.array([r[0] == "set1" for r in rows])
kits = np.array([r[1] for r in rows])
idx1 = np.where(is1)[0]

def knn_score(i, ref_mask):
    s = sim[i, ref_mask]
    top = np.sort(s)[-K:]
    return float(1 - top.mean()), s

scores, buren, viewdev = [], [], []
for i in range(len(ids)):
    ref = is1.copy()
    ref[i] = False
    ref &= kits != kits[i]
    if ref.sum() < K:
        ref = is1.copy(); ref[i] = False
    sc, s = knn_score(i, ref)
    refidx = np.where(ref)[0]
    orde = refidx[np.argsort(sim[i, refidx])[::-1][:3]]
    # welke view wijkt het meest af t.o.v. de beste buur
    beste = orde[0]
    per_view = 1 - (En[i] * En[beste]).sum(axis=1)
    scores.append(sc); buren.append([ids[j] for j in orde]); viewdev.append(int(per_view.argmax()))

scores = np.array(scores)

def auc(pos, neg):
    from sklearn.metrics import roc_auc_score
    y = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
    return roc_auc_score(y, np.r_[pos, neg])

s1, s2, s3 = (scores[[r[0] == s for r in rows]] for s in ("set1", "set2", "set3"))
stats = {
    "backbone": str(d["backbone"]),
    "n": {"set1": len(s1), "set2": len(s2), "set3": len(s3)},
    "auc_set2_vs_set1": auc(s2, s1),
    "auc_set3_vs_set1": auc(s3, s1),
    "mean": {"set1": float(s1.mean()), "set2": float(s2.mean()), "set3": float(s3.mean())},
}
print(json.dumps(stats, indent=1))

VIEWNAAM = ["az30-el30", "az120-el30", "az210-el30", "az300-el30", "az75-el5", "az255-el5", "az165-el55", "boven"]
uit = []
for i in np.argsort(scores)[::-1]:
    setnaam, _, kit, naam = rows[i]
    uit.append({"set": setnaam, "kit": kit, "name": naam, "score": round(float(scores[i]), 4),
                "afwijkendste_view": VIEWNAAM[viewdev[i]], "dichtstbijzijnde_geaccepteerd": buren[i]})
json.dump({"stats": stats, "ranking": uit}, open(os.path.join(uitdir, "scores.json"), "w"), indent=1)
print("geschreven:", os.path.join(uitdir, "scores.json"))
