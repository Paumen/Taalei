# Bedt elk blad van acht views in met DINOv3 (ViT-B/16, lvd1689m).
# Gebruik: HF_TOKEN=... python3 tools/vind-match/inbedden.py <viewsdir> <uit.npz>
#
# Elke tegel van 224x224 is precies de invoermaat van het model, dus de acht
# views gaan ongeschaald door het net. Per blad blijft een matrix van acht
# genormaliseerde CLS-vectoren over; match.py vergelijkt view tegen view.
import os
import sys

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

MODEL = 'facebook/dinov3-vitb16-pretrain-lvd1689m'
TEGEL = 224

torch.set_num_threads(os.cpu_count() or 4)
proc = AutoImageProcessor.from_pretrained(MODEL)
model = AutoModel.from_pretrained(MODEL).eval()


def tegels(pad):
    im = Image.open(pad).convert('RGB')
    return [
        im.crop(((i % 4) * TEGEL, (i // 4) * TEGEL, (i % 4) * TEGEL + TEGEL, (i // 4) * TEGEL + TEGEL))
        for i in range(8)
    ]


@torch.no_grad()
def bed_in(pad):
    uit = model(**proc(images=tegels(pad), return_tensors='pt'))
    v = uit.pooler_output if getattr(uit, 'pooler_output', None) is not None else uit.last_hidden_state[:, 0]
    return torch.nn.functional.normalize(v, dim=-1).numpy().astype('float32')


def run(viewsdir, uitpad):
    namen = sorted(f for f in os.listdir(viewsdir) if f.endswith('.png'))
    # Een half afgemaakt bestand van een eerdere run telt als tussenstand.
    klaar = {}
    if os.path.exists(uitpad):
        z = np.load(uitpad, allow_pickle=True)
        klaar = {str(n): e for n, e in zip(z['names'], z['emb'])}
    embs = []
    for i, n in enumerate(namen):
        embs.append(klaar.get(n) if n in klaar else bed_in(os.path.join(viewsdir, n)))
        if i % 25 == 0:
            print(i, len(namen), n, flush=True)
            np.savez(uitpad, names=np.array(namen[: i + 1]), emb=np.array(embs))
    np.savez(uitpad, names=np.array(namen), emb=np.array(embs))
    print('klaar', uitpad, len(namen))


run(sys.argv[1], sys.argv[2])
