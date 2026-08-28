# Matcht elk ontbrekend model tegen de catalogus op DINOv3-inbeddingen.
# Gebruik: python3 match.py <emb_missing.npz> <emb_catalogus.npz> <uit.json>
import sys, json, numpy as np

mis = np.load(sys.argv[1], allow_pickle=True)
cat = np.load(sys.argv[2], allow_pickle=True)
M, C = mis['emb'], cat['emb']          # (n, 8, D) en (m, 8, D), rijen genormaliseerd
mn = [str(x)[:-4] for x in mis['names']]
cn = [str(x)[:-4] for x in cat['names']]

# Alle kruiscombinaties van views: (8, 8, n, m) cosinussen.
kruis = np.einsum('nvd,mwd->vwnm', M, C)

# De acht views van render.mjs: vier azimuts op el 30 (0-3, stappen van 90
# graden), twee op el 5 (4-5, 180 graden uit elkaar), een schuine (6) en het
# bovenaanzicht (7). Een model dat een kwartslag gedraaid staat levert dezelfde
# beelden in een andere volgorde; per kwartslag koppelen we daarom de views die
# op elkaar vallen, en de beste kwartslag telt.
PAREN = {
    0: [(0, 0), (1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 6), (7, 7)],
    1: [(0, 1), (1, 2), (2, 3), (3, 0)],
    2: [(0, 2), (1, 3), (2, 0), (3, 1), (4, 5), (5, 4)],
    3: [(0, 3), (1, 0), (2, 1), (3, 2)],
}
per_slag = np.stack([np.mean([kruis[v, w] for v, w in p], axis=0) for p in PAREN.values()])
score = per_slag.max(axis=0)           # beste kwartslag
slag = per_slag.argmax(axis=0)
vast = per_slag[0]                     # zonder draaiing, alle acht views

uit = []
for i, naam in enumerate(mn):
    orde = np.argsort(-score[i])[:5]
    j = orde[0]
    uit.append({
        'missing': naam,
        'match': cn[j],
        'score': round(float(score[i, j]), 4),
        'score_zonder_draaiing': round(float(vast[i, j]), 4),
        'kwartslag': int(slag[i, j]),
        'top5': [{'catalog': cn[k], 'score': round(float(score[i, k]), 4)} for k in orde],
    })
json.dump(uit, open(sys.argv[3], 'w'), indent=1)
print(len(uit), 'matches ->', sys.argv[3])
