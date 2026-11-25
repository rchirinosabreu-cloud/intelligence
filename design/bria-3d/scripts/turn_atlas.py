import os
BRIA_DIR = os.environ.get('BRIA_DIR') or os.path.dirname(os.path.abspath(__file__))
# Arma la imagen del giro: una fila por ángulo, una columna por cuadro del ciclo (1, 3, …, 119), con el mismo
# recorte cuadrado que reposo.webp para que el ángulo 0 sea exactamente el reposo de siempre.
import sys, os
from PIL import Image
SRC = os.environ.get('BRIA_TURN_FRAMES', 'turn'); OUT = sys.argv[1]
ANGLES = [0, 6, 12, 18, 24, 30]; FRAMES = list(range(1, 121, 2)); CELL = 160
k = 0.40   # el render va al 40 % de 720×900
x0, y0, side = 116.04 * k, 294.53 * k, 462.33 * k
atlas = Image.new('RGBA', (CELL * len(FRAMES), CELL * len(ANGLES)), (0, 0, 0, 0))
for r, ang in enumerate(ANGLES):
    for c, f in enumerate(FRAMES):
        im = Image.open(f'{SRC}/a{ang:02d}/f{f:04d}.png').convert('RGBA')
        cell = im.transform((CELL, CELL), Image.EXTENT, (x0, y0, x0 + side, y0 + side), Image.BICUBIC)
        atlas.paste(cell, (c * CELL, r * CELL))
atlas.save(OUT, 'WEBP', quality=72, method=6)
print(atlas.size, os.path.getsize(OUT) // 1024, 'KB')
