# Auditoría técnica del piloto Bria

Alcance: `BriaClientCriteria`, `BriaScoreDetails` y regresión de `BriaContentPlanReview`. No es una certificación WCAG de toda la plataforma.

La guía `audit` se aplicó con el contexto visual aprobado del repositorio: su dependencia `frontend-design` no está disponible. No se instalaron skills ni se introdujeron layouts ajenos al producto. Se mantuvieron mascota pequeña sobre blanco, degradado de marca, diálogos centrados y lista de una columna.

## Resultado visual

Sin rejillas de cards, tarjetas anidadas, banners negros, efectos decorativos nuevos ni sombras adicionales. El degradado de los diálogos se centralizó en `brain-ai-header`; se profundizaron los mismos tonos verde/cian para mejorar contraste. No se recolorearon los banners anteriores de la plataforma.

| Área | Puntuación orientativa / 4 | Evidencia y límites |
| --- | --- | --- |
| Accesibilidad | 3 | Etiquetas, diálogos Radix, ESC/exterior, estados server-first, contraste de encabezado 5,23–5,42:1 y acción destructiva comprobados. No se hizo auditoría manual con lector de pantalla. |
| Rendimiento | 3 | Carga de criterios solo al abrir; refresco cada 15 s y al recuperar foco, suspendido mientras se edita/guarda; respuestas antiguas se descartan. Falta perfilado con historiales grandes. |
| Responsive | 4 | 320×568, 390×844, 768×1024, 1366×1000, 844×390; texto al 200%; sin desborde horizontal del diálogo. Acciones táctiles de al menos 44 px. |
| Temas | 4 | Claro/oscuro, tokens destructivos, cuerpos neutros, encabezado legible en ambos. Capturas guardadas. |
| Consistencia | 4 | Componentes compartidos, lista vertical, sin relleno de alerta en cards ni patrón de navegación nuevo. |
| **Total** | **18/20** | Buena base para validación local; no sustituye la aceptación del usuario. |

## Hallazgos y correcciones verificadas

- Desborde real al aumentar texto al 200%: el grid implícito del diálogo crecía según su contenido. Se corrigió con flujo de bloque, cabecera adaptable, mascota de tamaño estable y textos que pueden partirse.
- Etiquetas destructivas sobre el cuerpo oscuro: 4,24:1, insuficiente para texto pequeño. Inicialmente se usó una superficie destructiva; por petición del usuario, ahora las acciones son texto sin relleno ni borde. `brain-destructive-text` deriva el color oscuro del mismo token y las pruebas miden contraste mínimo 4,5:1 en ambos temas. Los errores conservan borde destructivo y texto legible en oscuro.
- El refresco inicial del formulario podía borrar un error de guardado. Se separó el refresco por apertura del estado de edición; tras un 500 la explicación se conserva y no se simula éxito.
- La vista local heredaba la API habitual de Vite. El piloto fija explícitamente su API al puerto elegido (3002 o 3003), aísla la recarga HMR por puerto y rechaza rutas ajenas a su cliente de ejemplo.

## Pendientes no bloqueantes del piloto

- **P2 — Historial largo sin paginación.** `src/services/briaClientCriterionService.js`, método `list`: devuelve el historial completo del cliente. Hay límite de criterios activos, pero los rechazados/revocados pueden crecer. Antes de un uso intensivo, añadir paginación y medir con historial representativo. Sugerencia: `/optimize`.
- **P3 — Etiquetas técnicas del desglose.** `BriaScoreDetails` muestra `ruleKey` y versión para trazabilidad. Después de validar el diseño, se pueden reemplazar en la vista principal por nombres editoriales y dejar los IDs en el detalle. Sugerencia: `/polish`.

No se observaron bloqueos funcionales en los recorridos probados. La **calibración editorial del puntaje sigue siendo una puerta de salida independiente**: el candidato no está activado en producción.

Pruebas: suites de navegador `briaClientCriteria.mjs`, `briaScoreDetails.mjs`, `briaPilot.mjs` y `briaReviewVerification.mjs`. Las dos primeras usan API simulada; el piloto usa HTTP y PostgreSQL locales reales. Capturas bajo `output/bria-*`.

Tras la validación visual del usuario, priorizar paginación si el volumen lo requiere y terminar con `/polish`; repetir `/audit` después de esos cambios. Estas mejoras pueden abordarse juntas o por separado.

## Revisión de acciones y eliminación · 6 de septiembre de 2026

Se mantiene 18/20 con los mismos límites de alcance y pendientes. Sin nuevos P0/P1 observados en los recorridos probados. La jerarquía ahora coloca «Proponer criterio» debajo de la explicación y alinea la lista y las acciones a la izquierda. Las acciones no tienen superficie, borde ni sombra visible; mantienen semántica de botón, foco de teclado y área mínima de 44×44 px.

`briaCriteriaActions.mjs` verifica seis vistas (incluido oscuro), colores semánticos y contraste de las acciones, texto al 200%, separación vertical, menú secundario accesible, cierre por ESC/exterior, cancelación sin petición, confirmación explícita y conservación del estado ante 500/espera del servidor. `briaClientCriteria.mjs` conserva la regresión completa de propuestas/decisiones/historial. `briaPilot.mjs` comprueba HTTP/PostgreSQL reales: propietario sin borrar, admin con borrado y desaparición persistente después de recargar. Solo borra una fila ficticia creada por ese test.

### Simplificación posterior aprobada

Aprobar usa turquesa; rechazar, texto neutro. El rojo queda para revocar/eliminar dentro de «⋯», junto con ajustar cuando corresponde. «Ver detalle» concentra las fuentes y después un historial plegable. No se eliminan datos ni permisos por esta simplificación visual. La prueba de descubrimiento cubre evidencia visible, orden de fuentes/historial y ajuste desde el menú.

Capturas: `output/bria-criteria-actions-*`, `output/bria-criteria-delete-*` y `output/bria-criteria-admin-live.png`. No se ha ejecutado eliminación sobre criterios reales del usuario.
