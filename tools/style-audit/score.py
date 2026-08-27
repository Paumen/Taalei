"""Stijlscore per asset: afstand tot de dichtstbijzijnde geaccepteerde buren.

Gebruik: python3 tools/style-audit/score.py <emb.npz> <sets.json> <uitdir>

Twee vingerafdrukken maal twee buurregels, elk gevalideerd op de eigen
keurgeschiedenis (AUC stijl-afgekeurd set2 vs geaccepteerd set1):
- cls: globale CLS-embedding — verschijning én inhoud vermengd
- patch: voorgrond-patchstatistiek (gemiddelde+spreiding) — stijl als
  lokale statistiek, objectidentiteit grotendeels weggegooid
- zonder-kit: eigen bronkit uitgesloten als buur (geen kit-vingerafdruk)
- met-kit: alleen het asset zelf uitgesloten
De rangschikking volgt de vingerafdruk met de beste AUC, zonder-kit.
Het verschil zonder-kit minus met-kit per kit is de diagnose "kit-
vingerafdruk of echt eigen stijl"; set3 (thema-afgekeurd, stijl niet
beoordeeld) hoort als verdeling tussen set1 en set2 te liggen.
kNN in plaats van een centroid: "afgekeurd" heeft geen midden en
geaccepteerd is multimodaal.
"""
import json, os, sys, collections
import numpy as np

npz, setsjson, uitdir = sys.argv[1], sys.argv[2], sys.argv[3]
K = 5
d = np.load(npz, allow_pickle=True)
ids = list(d["ids"])
sets = json.load(open(setsjson))
os.makedirs(uitdir, exist_ok=True)

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
    return KIT_ALIAS.get(kit.lower(), kit.lower())

meta = {}
for setnaam, items in sets.items():
    for it in items:
        sleutel = f"{setnaam}/{it['kit'].replace('/', '_')}__{it['name'].replace('/', '_')}"
        if sleutel in meta:
            sys.exit(f"dubbel asset-id {sleutel}: hernoem een van beide in sets.json")
        meta[sleutel] = (setnaam, kanoniek(it["kit"]), it["kit"], it["name"])
rows = [meta[i] for i in ids]
is1 = np.array([r[0] == "set1" for r in rows])
kits = np.array([r[1] for r in rows])

def per_view_norm(E):
    return E / (np.linalg.norm(E, axis=2, keepdims=True) + 1e-9)

def plat(E):  # per view normaliseren en aaneenschakelen: cos = gem. per-view cos
    En = per_view_norm(E)
    return En.reshape(len(ids), -1) / np.sqrt(E.shape[1])

REPS = {
    "cls": plat(d["cls"]),
    "patch": np.concatenate([plat(d["pmean"]), plat(d["pstd"])], axis=1) / np.sqrt(2),
}

def auc(pos, neg):
    from sklearn.metrics import roc_auc_score
    return float(roc_auc_score(np.r_[np.ones(len(pos)), np.zeros(len(neg))], np.r_[pos, neg]))

def scoor(X, zonder_kit):
    sim = X @ X.T
    sc = np.zeros(len(ids))
    buren = [None] * len(ids)
    for i in range(len(ids)):
        ref = is1.copy(); ref[i] = False
        if zonder_kit:
            ref &= kits != kits[i]
        if ref.sum() == 0:
            sys.exit(f"geen geaccepteerde buren voor {ids[i]}")
        refidx = np.where(ref)[0]
        s = sim[i, refidx]
        orde = np.argsort(s)[::-1]
        sc[i] = 1 - s[orde[:min(K, len(s))]].mean()
        buren[i] = [ids[refidx[j]] for j in orde[:3]]
    return sc, buren

resultaat, stats = {}, {"backbone": str(d["backbone"]), "K": K,
                        "n": dict(collections.Counter(r[0] for r in rows))}
for rep, X in REPS.items():
    for beleid in ("zonder-kit", "met-kit"):
        sc, buren = scoor(X, beleid == "zonder-kit")
        s1, s2, s3 = (sc[[r[0] == s for r in rows]] for s in ("set1", "set2", "set3"))
        stats[f"{rep}/{beleid}"] = {
            "auc_set2_vs_set1": auc(s2, s1), "auc_set3_vs_set1": auc(s3, s1),
            "mean": {"set1": float(s1.mean()), "set2": float(s2.mean()), "set3": float(s3.mean())},
            "set3_percentielen_in_set1": {p: float((s1 < np.percentile(s3, p)).mean()) for p in (25, 50, 75)},
        }
        resultaat[(rep, beleid)] = (sc, buren)

beste = max(REPS, key=lambda r: stats[f"{r}/zonder-kit"]["auc_set2_vs_set1"])
stats["gekozen"] = f"{beste}/zonder-kit"
print(json.dumps(stats, indent=1))

sc, buren = resultaat[(beste, "zonder-kit")]
sc_met, _ = resultaat[(beste, "met-kit")]

# per-view afwijking t.o.v. beste buur, voor het "waarom"
VIEWNAAM = ["az30-el30", "az120-el30", "az210-el30", "az300-el30", "az75-el5", "az255-el5", "az165-el55", "boven"]
En = per_view_norm(d["cls"] if beste == "cls" else d["pmean"])
pos = {v: k for k, v in enumerate(ids)}
ranking = []
for i in np.argsort(sc)[::-1]:
    setnaam, _, kit, naam = rows[i]
    j = pos[buren[i][0]]
    per_view = 1 - (En[i] * En[j]).sum(axis=1)
    ranking.append({"set": setnaam, "kit": kit, "name": naam,
                    "score": round(float(sc[i]), 4), "score_met_kit": round(float(sc_met[i]), 4),
                    "afwijkendste_view": VIEWNAAM[int(per_view.argmax())],
                    "dichtstbijzijnde_geaccepteerd": buren[i]})

# kit-diagnose: verschil zonder-kit minus met-kit per kit, alleen set1
delta = collections.defaultdict(list)
for i in range(len(ids)):
    if is1[i]:
        delta[rows[i][2]].append(sc[i] - sc_met[i])
kitdiag = sorted(({"kit": k, "n": len(v), "gem_delta": round(float(np.mean(v)), 4)}
                  for k, v in delta.items()), key=lambda r: -r["gem_delta"])

json.dump({"stats": stats, "ranking": ranking, "kit_diagnose": kitdiag},
          open(os.path.join(uitdir, "scores.json"), "w"), indent=1)
print("geschreven:", os.path.join(uitdir, "scores.json"))
