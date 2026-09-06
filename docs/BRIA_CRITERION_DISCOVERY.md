# Aprendizajes editoriales propuestos por Bria

6 de septiembre de 2026. Piloto local revisado; publicación a main autorizada. La evaluación editorial con clientes reales sigue pendiente.

## Qué hace este bloque

En **Criterios del cliente → Buscar aprendizajes**, el responsable de la parrilla, PM o admin puede solicitar una extracción. Bria genera propuestas, con categoría, alcance, razón y citas. No modifica contenidos, puntaje, compromisos ni criterios aprobados. El resultado se guarda para todos los usuarios autorizados; no depende de la sesión de quien pulsó el botón.

La extracción se ejecuta al solicitarla. **No hay aún un barrido periódico ni un disparador automático con cada comentario.** Esa automatización se plantea después de validar utilidad, duplicados, coste y frecuencia con el equipo.

### Fuentes de este primer adaptador

Se leen todas las parrillas no eliminadas del mismo `clientId`, incluidas las finalizadas:

- `ContentItem.comments`: registro de feedback de la pieza. Aunque contiene marcadores históricos `[Cliente - fecha]`, no demuestra identidad del autor; no se presenta como feedback autenticado.
- `ContentPlan.internalNotes`: cada nota del listado JSON o el textarea histórico.
- `ContentItem.internalNotes`: notas internas de la pieza.
- `copyText` y `captionText` de piezas `APROBADO` o `PUBLICADO`, excluyendo piezas eliminadas.

Los estados de parrilla no incluyen `APROBADO`; por eso la selección se basa en la aprobación de **piezas**, no se inventa una aprobación del plan. Una pieza publicada tampoco prueba que todo su contenido sea correcto.

Las fuentes heredadas no tienen autor ni fecha estructurada por comentario. Se conserva la cita literal, el periodo de la parrilla y el enlace; se muestra la falta de fecha/autor en lugar de inferirlos de `updatedAt`. `generatedAt` e historial sí registran la fecha de la propuesta.

No se leen `FeedbackRecord` (feedback de desempeño), `UserNote`, datos financieros, mensajes privados ni archivos/enlaces adjuntos. Tampoco se incorporan todavía minutas, Drive ni conversaciones de tareas: requieren el contrato común de contexto y su política de acceso/vigencia. «Todo el contexto del cliente» no significa acceso indiscriminado a información personal de la agencia.

### Propuestas y validación

- `CLIENT`: regla aplicable al cliente en general.
- `PLAN`: acuerdo temporal o específico de la parrilla de origen, nunca heredado por otros meses.
- `EXPLICIT` necesita una nota o feedback citado. `PATTERN` exige al menos dos piezas aprobadas distintas en el lote; una aprobación aislada no genera por sí sola una regla. Si toda la evidencia del patrón viene de una sola parrilla, el servidor limita el alcance a `PLAN` y registra esa restricción aunque el modelo haya sugerido `CLIENT`.
- El modelo recibe criterios existentes, incluidos rechazados y revocados. Se verifican IDs, categorías, alcance, citas literales y referencias a posibles conflictos; ante un error, no se publica el lote.
- Los conflictos detectados se señalan para revisión humana, sin revocar o sustituir la regla anterior. La detección semántica no es exhaustiva ni constituye validación del equipo.
- El responsable de la **parrilla de origen**, PM o admin puede ajustar el borrador. Cada cambio exige versión/motivo y conserva antes/después. Aprobar y revocar mantienen las reglas anteriores de permisos e invalidación transaccional.
- `provenance` contiene origen Bria, versión del extractor, modelo, fecha de generación, texto original, fuentes/citas y conflictos. Las reglas manuales antiguas mantienen alcance `CLIENT`.
- La card muestra aprobar en turquesa, rechazar neutro y «Ver detalle». Las fuentes aparecen primero dentro del detalle; el historial se consulta en un desplegable secundario. Ajustar, revocar y eliminar se ubican en «⋯» según permisos; las dos últimas conservan el rojo destructivo y sus confirmaciones.

## Fiabilidad y límites

`ClientCriterionDiscovery` contiene un trabajo compartido por cliente. El hash incluye fuentes completas, versión del extractor y modelo. Una búsqueda sobre fuentes sin cambios devuelve el resultado guardado sin llamar al modelo. No basta cambiar de usuario o borrar una propuesta para generarla otra vez.

Una sola ejecución reclama el lease por cliente (120 s). La búsqueda admite 90 s en total; el proveedor recibe señal de cancelación. Si hay una caída, el estado se muestra interrumpido al vencer el lease y una nueva solicitud puede recuperarlo. No se reintenta indefinidamente en segundo plano.

Las fuentes se dividen en fragmentos de 6000 caracteres y lotes de hasta 12 fragmentos / aproximadamente 24000 caracteres serializados, sin recorte silencioso. Los lotes completados se guardan como checkpoints. Un reintento continúa solo si coinciden fuentes y criterios. No se publican propuestas parciales; se vuelven a consultar permisos, fuentes y criterios antes del commit final. Un cambio durante la extracción exige reintentar.

La agrupación limita los patrones detectables a la evidencia presente en cada lote; no se promete detectar todos los patrones históricos. Se permiten hasta tres propuestas por lote y hasta 100 propuestas/criterios activos por cliente. Historial de criterios mayor de 60000 caracteres: error explícito, no truncamiento oculto ni consumo ilimitado.

La deduplicación combina texto normalizado y huellas de categoría/alcance/evidencia. También se instruye al modelo a evitar equivalencias semánticas, pero esto no garantiza eliminar todos los sinónimos. Después de borrar un criterio se conservan **solo hashes de evidencia** en `seenKeys`, sin texto ni historial; evitan insistencia sobre la misma evidencia. Nuevas fuentes pueden justificar una propuesta nueva.

## API y datos

- `POST /api/content/plans/:planId/criteria/discover`: solicitar extracción; ignora fuentes/identidad/cliente enviados en el cuerpo.
- `GET /api/content/plans/:planId/criteria/discovery`: estado compartido y alcance del último resultado.
- `PATCH /api/content/plans/:planId/criteria/:criterionId/draft`: ajustar un borrador autorizado.
- Esquema aditivo: `scope` con default `CLIENT`, `provenance` nullable y tabla `ClientCriterionDiscovery`; no se eliminan datos ni se cambian enums existentes. Se aplica por el script de arranque existente, ensayado en PostgreSQL local.

El extractor usa el contrato de [Structured Outputs de OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs), más validación propia de procedencia y citas. Un JSON válido no prueba que una inferencia editorial sea correcta.

## Piloto y próximos pasos

Muestra nueva: `http://127.0.0.1:3004/tests/fixtures/bria-pilot.html`. Usa PostgreSQL aislado y una respuesta de IA **simulada**, identificada tanto en la página como en la propuesta. Permite comprobar permisos, guardar/recargar, ajustar y decidir; no consume modelos ni modifica producción.

No se borraron ni sustituyeron las muestras anteriores de los puertos 3002/3003. Cada arranque del script crea un fixture nuevo; su cierre normal limpia únicamente sus propios datos de prueba.

Pruebas: contrato/fuentes, PostgreSQL real, concurrencia, lease vencido, timeout, checkpoints, cambios durante análisis, ámbito PLAN/CLIENT, permisos, eliminación y deduplicación, rutas HTTP, visuales en light/dark y prueba integrada del piloto. Evaluación sintética opt-in: `node scripts/eval-bria-discovery.js --live`, cinco llamadas máximas sin importar Prisma. No equivale a aceptación editorial humana.

Ruta particular siguiente: (1) validar el flujo local; (2) adjudicar propuestas reales con responsables y medir utilidad/omisiones; (3) calibrar el puntaje trazable candidato por separado; (4) activar extracción por nuevos comentarios con cola durable, frecuencia y presupuesto acordados.

Ruta general: continuar cerrando las brechas de integridad de la auditoría; construir contexto común con memoria vigente y autorizada; consolidar el flujo parrilla → corrección → verificación; después reunión → compromiso → tarea y foco diario → bloqueo → propuesta. Medir aprobación a la primera, tiempo de revisión comparable y retrabajo; no confundir más clics/horas con productividad.

## Evaluación y verificaciones de este bloque

- 923 pruebas Node, 0 fallos, 0 omitidas, con PostgreSQL aislado. ESLint sin errores; esquema Prisma válido; Vite compiló el frontend.
- Generar el cliente Prisma en Windows informó `EPERM` al intentar sustituir la DLL utilizada por las muestras anteriores. El código del cliente sí se actualizó y se ejercitó contra las columnas/tabla nuevas en PostgreSQL. No se cerraron muestras del usuario para reemplazar una DLL de la misma versión. La compilación de frontend se comprobó con `npx vite build`, no se presenta como un `npm run build` completo exitoso.
- Regresiones de aprobación/revocación/borrado en seis resoluciones/temas; flujo nuevo en cuatro, más API/PG reales con salida IA simulada. Capturas `output/bria-discovery-*`.
- Dos series de cinco llamadas sintéticas a `gpt-5.6-luna`, diez en total. Primera serie: 5/5 contratos válidos, pero inspección manual encontró tratamiento clasificado como gramática y generalización al cliente de un patrón de un solo mes. Se aclararon categorías y se añadió el límite de alcance en código.
- Segunda serie: 5/5 contratos y expectativas de categoría/alcance/abstención cumplidos. Casos: nota temporal, feedback de nomenclatura, patrón de dos piezas, aprobación aislada e inyección de instrucciones. No hubo propuestas en los dos últimos. Informe ignorado: `output/bria-evals/discovery-f376bde3-1261-428d-99c6-377e00c9b2df.json`.
- Esta muestra pequeña **no** certifica precisión editorial general, resistencia universal a inyección ni aceptación del equipo. No se procesaron parrillas reales con IA ni se promovió el puntaje candidato.
