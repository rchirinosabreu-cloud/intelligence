# Avatares animados de la liga

Generados el 21 de noviembre de 2026 (Rodny: «trabajemos con las opciones 2D animadas, me gustan»). Reemplazan las hojas
de tres poses fijas de `team-pixel/poses`, que pesaban entre 1 y 1,4 MB cada una; estas pesan entre 9 y 15 KB.

Cada hoja mide 704 × 110 píxeles: ocho cuadros de 88 × 110 en fila.

| Cuadro | Qué es |
| --- | --- |
| 0 | Reposo |
| 1 | Saludo: el brazo a medio subir |
| 2 y 3 | Saludo: la mano arriba, a un lado y al otro |
| 4 | Celebración: toma impulso |
| 5 y 6 | Celebración: el salto |
| 7 | Celebración: cae con el puño arriba |

`frames.json` guarda el tamaño del cuadro y, por persona, dónde empieza (`top`) y cuánto mide de pie (`height`) en el
cuadro 0, para mostrar a todos a la misma altura. Las secuencias y los tiempos viven en `src/index.css`
(`league-sprite-wave`, `league-sprite-celebrate`) y las medidas, en `spriteLayout` de `src/lib/leaguePose.js`.

## Cómo se hicieron

1. Cada hoja de tres poses anterior fue la referencia de una generación con GPT Image 2.6 (calidad alta, 2K, fondo
   transparente), pidiendo una cuadrícula de 4 × 2 con el mismo personaje.
2. Cada personaje se recortó de la cuadrícula, se alineó por los pies y por el suelo de su fila (así el salto conserva
   su altura), se redujo a un séptimo con alfa dura y se guardó con una paleta de 48 colores.

## Prompt usado

Use case: identity-preserve. The attached image shows one pixel-art avatar in three poses (reference and edit target).
Create a production PNG animation sprite sheet of that SAME character. Preserve exactly the recognizable character: same
face, same hair style and hair color, same skin palette, same clothes and clothing colors, same shoes, same accessories,
same proportions, and the same coarse crisp square-pixel art style with black outline. Do not change the clothing
colors. The SAME character drawn 8 times in a grid of 4 columns and 2 rows, every cell the same size, character at
identical scale and identical position in every cell, feet on the same baseline, full body with empty margin inside each
cell even around raised hands. Row 1, left to right, a friendly WAVE animation: (1) standing at rest arms down, (2) one
arm raised halfway, (3) that hand up waving tilted to the left with a small smile, (4) that hand up waving tilted to the
right with a small smile. Row 2, left to right, a CELEBRATION animation: (1) knees slightly bent, fists near chest,
anticipating, (2) jumping off the ground with both arms raised and open happy mouth, (3) at the top of the jump, arms
fully raised, eyes closed happy, (4) landing with one fist raised, big smile. Only the arms, legs, mouth and eyes change
between frames; head, hair, clothes and proportions stay identical. No redesign, no props, no labels, no numbers, no grid
lines, no ground, no shadow, no glow, no blur, no antialiasing. Real transparent alpha background.

Para una persona nueva: generar su hoja con ese prompt a partir de su avatar de `team-pixel/`, recortarla igual, añadir
su PNG aquí, su entrada en `frames.json` y su import en `src/components/league/pixelPoseSheets.js`.
