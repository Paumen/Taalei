"""Embed elk render-blad (8 tegels van 224px) met DINOv3, of DINOv2 zonder HF-token.

Gebruik: python3 tools/style-audit/embed.py <rendersdir> <uit.npz>
Per asset acht per-view CLS-embeddings; views zijn pose-uitgelijnd, dus
per-view genormaliseerd vergelijken = gemiddelde cosinus over gelijke standpunten.
"""
import os, sys, glob
import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

renders, uit = sys.argv[1], sys.argv[2]
TEGEL, VIEWS = 224, 8

kandidaten = ["facebook/dinov3-vitb16-pretrain-lvd1689m", "facebook/dinov2-base"]
model = proc = naam = None
for repo in kandidaten:
    try:
        proc = AutoImageProcessor.from_pretrained(repo)
        model = AutoModel.from_pretrained(repo)
        naam = repo
        break
    except Exception as e:
        print(f"niet beschikbaar: {repo} ({type(e).__name__})", file=sys.stderr)
if model is None:
    sys.exit("geen backbone beschikbaar")
model.eval()
torch.set_num_threads(os.cpu_count() or 4)
print("backbone:", naam)

paden = sorted(glob.glob(os.path.join(renders, "*", "*.png")))
ids, embs = [], []
BATCH = 32
tegels, herkomst = [], []

def spoel():
    global tegels, herkomst
    if not tegels:
        return
    with torch.no_grad():
        inp = proc(images=tegels, return_tensors="pt")
        out = model(**inp).last_hidden_state[:, 0]  # CLS
    for h, e in zip(herkomst, out.numpy()):
        embs[h[0]][h[1]] = e
    tegels, herkomst = [], []

for p in paden:
    blad = Image.open(p).convert("RGB")
    setnaam = os.path.basename(os.path.dirname(p))
    ids.append(f"{setnaam}/{os.path.splitext(os.path.basename(p))[0]}")
    embs.append([None] * VIEWS)
    for i in range(VIEWS):
        x, y = (i % 4) * TEGEL, (i // 4) * TEGEL
        tegels.append(blad.crop((x, y, x + TEGEL, y + TEGEL)))
        herkomst.append((len(embs) - 1, i))
        if len(tegels) >= BATCH:
            spoel()
    if len(ids) % 100 == 0:
        print(len(ids), flush=True)
spoel()
E = np.stack([np.stack(v) for v in embs])  # (N, 8, D)
np.savez_compressed(uit, ids=np.array(ids), emb=E.astype(np.float32), backbone=naam)
print("klaar", E.shape)
