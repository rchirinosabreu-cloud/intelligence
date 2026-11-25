# Revisa saltos de cuadro: compara cada cuadro con el anterior y avisa donde el cambio se dispara frente a sus vecinos.
import sys, glob, numpy as np
from PIL import Image
fs = sorted(glob.glob(sys.argv[1] + '/f*.png'))
prev = None; d = []
for f in fs:
    a = np.asarray(Image.open(f).convert('RGBA').resize((180, 225)), dtype=np.float32)
    if prev is not None: d.append(np.abs(a - prev).mean())
    prev = a
d = np.array(d); bad = []
for i in range(len(d)):
    lo, hi = max(0, i - 4), min(len(d), i + 5)
    nb = np.median(np.concatenate([d[lo:i], d[i + 1:hi]])) if hi - lo > 1 else d[i]
    if d[i] > 0.4 and d[i] > 2.2 * max(nb, 0.05): bad.append((i + 2, round(float(d[i]), 2), round(float(nb), 2)))
print('saltos:', bad if bad else 'ninguno')
