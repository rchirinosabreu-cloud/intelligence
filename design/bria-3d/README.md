# Bria en 3D

El modelo de Bria y todo lo necesario para volver a generar sus emociones y animaciones. Los WebP y PNG que usa la plataforma están en `src/assets/bria-3d/`; esta carpeta es su fuente.

## Qué hay

- `bria.blend`: el modelo aprobado, con esqueleto (Raiz, Cuerpo, Cabeza, Brazo.L/R, Pierna.L/R), luces y la cámara de las animaciones. Brazos y piernas van como piezas aparte, y ojos y cejas cuelgan de Cabeza.
- `videos/`: cada emoción y cada ciclo en MP4 (sobre fondo `#EEF8F6`) y en WebM con transparencia: celebra, feliz, sorprendida, triste, molesta, pensando, reposo, sentada y trabajando.
- `scripts/`: los scripts de Blender que hacen todo lo anterior.

## Scripts

Se ejecutan con Python y el módulo `bpy` de Blender (`pip install bpy`). El último argumento es la carpeta de salida: ahí se guardan el `.blend` y los cuadros (`frames/`).

| Script | Qué hace |
| --- | --- |
| `build.py` | Construye el modelo según la guía de marca. Lo usan todos los demás. |
| `rig.py` | Le pone el esqueleto. |
| `export_bria.py` | Genera `bria.blend` (modelo, esqueleto y cámara). Salida en `BRIA_OUT`. |
| `loops.py` | Los ciclos que se repiten: `BRIA_LOOP=reposo`, `sentada` o `trabajando`. |
| `celebrar.py` | Celebra, con el salto y la estrella. Con `BRIA_JUMP=0` sale «feliz», sin salto. |
| `expr_anim.py` | Las reacciones: `BRIA_EXPR=sorprendida`, `triste`, `molesta` o `pensando`. |
| `poses.py` | Imágenes quietas de cada pose. |
| `turn.py` y `turn_atlas.py` | El giro hacia el cursor: el reposo en seis ángulos y la imagen `reposo-giro.webp`. |
| `check_jumps.py` | Revisa los cuadros y avisa si hay saltos. Correrlo siempre después de renderizar. |
| `run_ex.sh` | Renderiza las cuatro reacciones de una vez. |
| `helpers.py` | Funciones compartidas por las animaciones (curvas suaves, bocas, cejas). |

Ejemplo, el ciclo de reposo:

```sh
cd design/bria-3d/scripts
BRIA_LOOP=reposo python3 loops.py ../salida/reposo
```

Variables útiles: `FRAMES` (cuadros concretos, por ejemplo `FRAMES=55`), `PCT` (tamaño en %), `SAMPLES` (calidad de Cycles). `BRIA_DIR` indica dónde están los scripts, por si se ejecutan desde otra carpeta.

## Reglas del personaje

- La cabeza no gira: cara y cuerpo son una sola pieza. Las emociones se hacen con las cejas, los ojos, la boca hundida en el cuerpo y el cuerpo entero.
- Siempre sobre fondo transparente, sin círculos ni cajas.
- La estrella amarilla no es parte del personaje: solo aparece al celebrar.
- Antes de entregar un render nuevo, revisar los cuadros con `check_jumps.py`: no puede haber saltos.
