"""Scoort het resolutie-experiment: CSV van alle aanroepen plus de vijf maten.

Gebruik: python3 tools/resolutie-stijl/score.py [logboek.jsonl] [uitdir]
"""
import csv
import json
import os
import statistics
import sys
from collections import defaultdict
from itertools import combinations, product

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HIER = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HIER))
LOG = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "docs/resolutie-stijl/runs/claude-opus-5.jsonl")
UIT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "docs/resolutie-stijl/resultaten")
SPORTEN = [2576, 1568, 1092, 768, 512, 384, 256, 192]
TOP = SPORTEN[0]
STOP = {"a", "the", "and", "of", "with", "very", "look", "style"}

os.makedirs(UIT, exist_ok=True)
stim = json.load(open(os.path.join(HIER, "stimuli.json")))
META = {s["id"]: s for s in stim["stimuli"]}


def woorden(tags):
    """Attribuuttags naar een woordenzak: formulering varieert, inhoud niet."""
    uit = set()
    for t in tags or []:
        for w in str(t).lower().replace("-", " ").replace("_", " ").replace("/", " ").split():
            w = w.strip(".,()")
            if w and w not in STOP:
                uit.add(w)
    return uit


def gem(waarden):
    """Gemiddelde die nan teruggeeft in plaats van te struikelen over lege reeksen."""
    schoon = [w for w in waarden if w == w]
    return statistics.mean(schoon) if schoon else float("nan")


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


regels, ijk = [], []
for r in (json.loads(x) for x in open(LOG) if x.strip()):
    (ijk if r.get("soort") == "ijk" else regels).append(r)

# Vaste promptoverhead uit de ijkaanroep; het verschil is wat het beeld kost.
def totaal_tokens(u):
    return sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))


basis = statistics.median([totaal_tokens(r["usage"]) for r in ijk]) if ijk else 0

rijen = []
for r in regels:
    a = r.get("antwoord") or {}
    m = META.get(r["asset"], {})
    tags = a.get("attributes") or []
    tok = totaal_tokens(r.get("usage") or {})
    rijen.append({
        "asset": r["asset"], "kit": m.get("kit", ""), "waar_label": m.get("style", ""),
        "alt_label": m.get("alt_style") or "", "sport": r["sport"], "repeat": r["repeat"],
        "ok": int(bool(r.get("ok"))), "model": r.get("model", ""),
        "label": a.get("style_label", ""), "confidence": a.get("confidence", ""),
        "attributes": " | ".join(str(t) for t in tags),
        "polycount_impression": a.get("polycount_impression", ""),
        "surface_finish": a.get("surface_finish", ""),
        "latency_ms": r.get("latency_ms", ""), "prompt_tokens": tok,
        "beeld_tokens": max(tok - basis, 0), "output_tokens": (r.get("usage") or {}).get("output_tokens", ""),
        "ruw": (r.get("ruw") or r.get("fout") or "").replace("\n", " ")[:1500],
    })

with open(os.path.join(UIT, "aanroepen.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rijen[0].keys()))
    w.writeheader()
    w.writerows(rijen)

goed = [r for r in rijen if r["ok"] and r["label"]]
per_cel = defaultdict(list)          # (asset, sport) -> rijen
for r in goed:
    per_cel[(r["asset"], r["sport"])].append(r)

tags_van = {(r["asset"], r["sport"], r["repeat"]): woorden(r["attributes"].split(" | ")) for r in goed}


def drift(asset, sport):
    """Gemiddelde Jaccard van elke herhaling op deze sport tegen elke 2576-herhaling."""
    hier = [tags_van[(asset, sport, r["repeat"])] for r in per_cel[(asset, sport)]]
    top = [tags_van[(asset, TOP, r["repeat"])] for r in per_cel[(asset, TOP)]]
    # Op de topsport zou elk antwoord ook met zichzelf vergeleken worden; daar is
    # de referentie de overlap tussen de herhalingen onderling.
    paren = [jaccard(x, y) for x, y in (combinations(top, 2) if sport == TOP else product(hier, top)) if x and y]
    return gem(paren)


def stabiliteit(asset, sport):
    """Binnen één sport: labelovereenstemming en attribuutoverlap tussen herhalingen."""
    cel = per_cel[(asset, sport)]
    labels = [r["label"] for r in cel]
    eens = 1.0 if len(set(labels)) == 1 and len(labels) > 1 else 0.0
    paren = [jaccard(tags_van[(asset, sport, a["repeat"])], tags_van[(asset, sport, b["repeat"])])
             for a, b in combinations(cel, 2)]
    conf = [float(r["confidence"]) for r in cel if r["confidence"] != ""]
    return eens, gem(paren), (statistics.pstdev(conf) if len(conf) > 1 else 0.0)


def blok(rows, sport, stijl=None):
    sel = [r for r in rows if r["sport"] == sport and (stijl is None or r["waar_label"] == stijl)]
    if not sel:
        return None
    assets = sorted({r["asset"] for r in sel})
    juist = [1.0 if r["label"] == r["waar_label"] else 0.0 for r in sel]
    soepel = [1.0 if r["label"] in (r["waar_label"], r["alt_label"]) else 0.0 for r in sel]
    conf = [float(r["confidence"]) for r in sel if r["confidence"] != ""]
    eens, overlap, spreiding = zip(*[stabiliteit(a, sport) for a in assets])
    return {
        "sport": sport, "stijl": stijl or "alle", "n": len(sel),
        "accuratesse": gem(juist), "accuratesse_soepel": gem(soepel),
        "drift_vs_2576": gem([drift(a, sport) for a in assets]),
        "label_eensgezind": gem(eens),
        "herhaal_overlap": gem(overlap),
        "confidence": gem(conf),
        "confidence_spreiding": gem(spreiding),
        "kalibratiekloof": gem(conf) - gem(juist),
        "prompt_tokens": gem([r["prompt_tokens"] for r in sel]),
        "beeld_tokens": gem([r["beeld_tokens"] for r in sel]),
        "latency_ms": gem([float(r["latency_ms"]) for r in sel if r["latency_ms"] != ""]),
    }


stijlen = sorted({r["waar_label"] for r in goed})
samen = [b for sport in SPORTEN for b in [blok(goed, sport)] if b]
samen += [b for stijl in stijlen for sport in SPORTEN for b in [blok(goed, sport, stijl)] if b]
with open(os.path.join(UIT, "samenvatting.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(samen[0].keys()))
    w.writeheader()
    w.writerows(samen)

# --- figuur: accuratesse en drift tegen resolutie, één lijn per stijl ---
kleur = dict(zip(stijlen, ["#1f77b4", "#d62728", "#2ca02c", "#9467bd", "#ff7f0e", "#8c564b"]))
fig, ax = plt.subplots(1, 3, figsize=(16, 5))
for stijl in stijlen:
    rij = [b for b in samen if b["stijl"] == stijl]
    x = [b["sport"] for b in rij]
    ax[0].plot(x, [b["accuratesse"] for b in rij], "o-", color=kleur[stijl], label=stijl)
    ax[1].plot(x, [b["drift_vs_2576"] for b in rij], "o-", color=kleur[stijl], label=stijl)
alle = [b for b in samen if b["stijl"] == "alle"]
ax[0].plot([b["sport"] for b in alle], [b["accuratesse"] for b in alle], "k--", label="alle")
ax[1].plot([b["sport"] for b in alle], [b["drift_vs_2576"] for b in alle], "k--", label="alle")
for a, titel, ylab in ((ax[0], "Labelaccuratesse", "aandeel juist"),
                       (ax[1], "Attribuutdrift t.o.v. 2576 px", "Jaccard-overlap")):
    a.set_xscale("log"); a.set_xticks(SPORTEN); a.set_xticklabels(SPORTEN, rotation=45)
    a.set_xlabel("lange zijde (px)"); a.set_ylabel(ylab); a.set_title(titel)
    a.set_ylim(0, 1.05); a.grid(alpha=0.3); a.invert_xaxis()
ax[0].legend(fontsize=8)
ax[2].plot([b["beeld_tokens"] for b in alle], [b["accuratesse"] for b in alle], "o-", color="k")
for b in alle:
    ax[2].annotate(str(b["sport"]), (b["beeld_tokens"], b["accuratesse"]), fontsize=8,
                   xytext=(4, 4), textcoords="offset points")
ax[2].set_xlabel("beeldtokens per aanroep"); ax[2].set_ylabel("aandeel juist")
ax[2].set_title("Kosten tegen accuratesse"); ax[2].grid(alpha=0.3); ax[2].set_ylim(0, 1.05)
fig.tight_layout()
fig.savefig(os.path.join(UIT, "resolutie-stijl.png"), dpi=140)

# --- figuur: stabiliteit en kalibratie ---
fig2, ax2 = plt.subplots(1, 2, figsize=(11, 4.5))
x = [b["sport"] for b in alle]
ax2[0].plot(x, [b["label_eensgezind"] for b in alle], "o-", label="alle 3 herhalingen zelfde label")
ax2[0].plot(x, [b["herhaal_overlap"] for b in alle], "s-", label="attribuutoverlap tussen herhalingen")
ax2[0].set_title("Stabiliteit binnen een sport")
ax2[1].plot(x, [b["confidence"] for b in alle], "o-", label="gemiddelde confidence")
ax2[1].plot(x, [b["accuratesse"] for b in alle], "s-", label="accuratesse")
ax2[1].plot(x, [b["kalibratiekloof"] for b in alle], "^--", label="kloof (confidence - accuratesse)")
ax2[1].set_title("Kalibratie")
for a in ax2:
    a.set_xscale("log"); a.set_xticks(SPORTEN); a.set_xticklabels(SPORTEN, rotation=45)
    a.set_xlabel("lange zijde (px)"); a.grid(alpha=0.3); a.legend(fontsize=8); a.invert_xaxis()
fig2.tight_layout()
fig2.savefig(os.path.join(UIT, "stabiliteit-kalibratie.png"), dpi=140)

print(f"aanroepen: {len(rijen)} ({len(goed)} bruikbaar), ijkoverhead {basis:.0f} tokens")
for b in alle:
    print(f"{b['sport']:>5} px  acc {b['accuratesse']:.2f}  soepel {b['accuratesse_soepel']:.2f}  "
          f"drift {b['drift_vs_2576']:.2f}  eens {b['label_eensgezind']:.2f}  "
          f"conf {b['confidence']:.2f}  kloof {b['kalibratiekloof']:+.2f}  beeldtokens {b['beeld_tokens']:.0f}")
