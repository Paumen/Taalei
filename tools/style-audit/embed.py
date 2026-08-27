"""Embed elk render-blad (8 tegels van 224px) met DINOv3, of DINOv2 zonder HF-token.

Gebruik: python3 tools/style-audit/embed.py <rendersdir> <uit.npz>

Per asset en per view twee vingerafdrukken:
- cls: de globale CLS-embedding (inhoud en verschijning vermengd)
- pmean/pstd: gemiddelde en spreiding van de patch-tokens over alléén
  voorgrond-patches — stijl als lokale statistiek, met de ruimtelijke
  indeling (en daarmee veel objectidentiteit) weggegooid. Witte
  achtergrondpatches tellen niet mee, anders overheersen ze.
Views zijn pose-uitgelijnd, dus per-view genormaliseerd vergelijken =
gemiddelde cosinus over gelijke standpunten.
"""
import os, sys, glob
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

renders, uit = sys.argv[1], sys.argv[2]
TEGEL, VIEWS = 224, 8
ACHTERGROND = 245   # min. luminantie waaronder een patch voorgrond bevat

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

# Patchraster uit het model halen, niet aannemen: DINOv2-base is /14 zonder
# registertokens, DINOv3-vitb16 is /16 met er vier. Een vast raster zou op de
# ander stilzwijgend onzin-patchkenmerken opleveren.
proefpixels = proc(images=[Image.new("RGB", (TEGEL, TEGEL), "white")], return_tensors="pt")["pixel_values"]
RASTER = proefpixels.shape[-1] // model.config.patch_size
N_EXTRA = 1 + getattr(model.config, "num_register_tokens", 0)
print(f"backbone: {naam} (patch {model.config.patch_size}, raster {RASTER}x{RASTER}, "
      f"{N_EXTRA} niet-patch tokens)", flush=True)

paden = sorted(glob.glob(os.path.join(renders, "*", "*.png")))
N = len(paden)
D = model.config.hidden_size
ids = []
cls = np.zeros((N, VIEWS, D), np.float32)
pmean = np.zeros((N, VIEWS, D), np.float32)
pstd = np.zeros((N, VIEWS, D), np.float32)

BATCH = 16
tegels, maskers, herkomst = [], [], []

def voorgrond_masker(tile):
    # per patch: bevat hij iets donkerder dan de witte achtergrond? Min-pool,
    # geen gemiddelde: een dunne steel (cactus, sleutel) moet een patch al
    # voorgrond maken. adaptive pooling verdraagt een raster dat niet
    # precies op de tegelmaat deelt.
    g = torch.from_numpy(np.asarray(tile.convert("L"), np.float32))[None, None]
    donkerste = -F.adaptive_max_pool2d(-g, (RASTER, RASTER))
    return (donkerste.flatten().numpy() < ACHTERGROND)

def spoel():
    global tegels, maskers, herkomst
    if not tegels:
        return
    with torch.no_grad():
        inp = proc(images=tegels, return_tensors="pt")
        hidden = model(**inp).last_hidden_state.numpy()
    if hidden.shape[1] != N_EXTRA + RASTER * RASTER:
        sys.exit(f"tokenaantal {hidden.shape[1]} past niet bij raster {RASTER} + {N_EXTRA}")
    for (a, v), h, m in zip(herkomst, hidden, maskers):
        cls[a, v] = h[0]
        patches = h[N_EXTRA:]
        fg = patches[m] if m.any() else patches
        pmean[a, v] = fg.mean(axis=0)
        pstd[a, v] = fg.std(axis=0)
    tegels, maskers, herkomst = [], [], []

for p in paden:
    blad = Image.open(p).convert("RGB")
    setnaam = os.path.basename(os.path.dirname(p))
    ids.append(f"{setnaam}/{os.path.splitext(os.path.basename(p))[0]}")
    a = len(ids) - 1
    for v in range(VIEWS):
        x, y = (v % 4) * TEGEL, (v // 4) * TEGEL
        tile = blad.crop((x, y, x + TEGEL, y + TEGEL))
        tegels.append(tile)
        maskers.append(voorgrond_masker(tile))
        herkomst.append((a, v))
        if len(tegels) >= BATCH:
            spoel()
    if len(ids) % 100 == 0:
        print(len(ids), flush=True)
spoel()
np.savez_compressed(uit, ids=np.array(ids), cls=cls, pmean=pmean, pstd=pstd, backbone=naam)
print("klaar", cls.shape)
