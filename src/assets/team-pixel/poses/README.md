# Poses de la liga

Generadas el 3 de noviembre de 2026 con la herramienta integrada de generación de imágenes, usando como referencia cada PNG hermano en `team-pixel/`. Son 13 hojas con tres poses: reposo, saludo y celebración. Los originales generados se copiaron sin editar y conservan su canal alfa.

Cada hoja tiene 1536 × 1024 píxeles y tres columnas de 512 píxeles. `frames.json` describe el encuadre vertical de cada personaje para mostrarlo a la misma altura; la interfaz recorta la hoja al dibujarla, sin crear imágenes nuevas. La pose se conserva al cambiar de pestaña y cambia por una de las otras dos al reabrir el panel.

## Prompt usado para cada personaje

Use case: identity-preserve. Create a PNG sprite sheet for attached pixel avatar (edit target). Preserve exact character, clothes, hair, skin palette and coarse crisp square-pixel style. ONE character THREE times left to right: resting arms down; friendly waving one hand; celebrating both hands raised. Horizontal 1536x1024 canvas split into three equal 512x1024 transparent cells. Centers x=256,768,1280, feet aligned y=900, head top near y=190. Identical scale, full body, all hands safely inside own cell. No redesign, props, labels, lines, ground or shadow, no blur. App crops exact equal thirds. Real transparent alpha background.

La primera hoja, Rodny, usó esta formulación equivalente:

Use case: identity-preserve. Create a production PNG sprite sheet for the attached pixel avatar (reference and edit target). Preserve exactly the recognizable character, clothes, hair, skin palette and coarse crisp square-pixel art style. ONE character shown THREE times, left to right: resting arms down; friendly waving one hand; celebrating with both hands raised. Horizontal canvas 1536x1024, divided into three equal 512x1024 transparent cells. Each character centered at x=256,768,1280 and feet aligned at y=900; full character with head top near y=190, equal scale, ample empty margin inside each cell even around raised hands. Match source proportions, no redesign, no added objects, no labels or lines, no floor shadow, no antialias blur. The sheet will be cropped into exact equal thirds by the web app. Real transparent alpha background.

Sara se regeneró desde su avatar original añadiendo:

Critical clothing lock: Sara wears a completely WHITE T-shirt, including the entire front torso and sleeves. No black vest or black shirt. Olive-green pants, white shoes. Long brown curls.
