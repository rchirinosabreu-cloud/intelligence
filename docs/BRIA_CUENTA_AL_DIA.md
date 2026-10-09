# Bria: cuenta al día y despachos a producción

9 de octubre de 2026. Segunda fase de la Bria que pidió Rodny: que pueda decir cómo va una cuenta frente a lo contratado, qué pidió el cliente y qué falta, y que deje la producción organizada sin que nadie tenga que reconstruirlo a mano.

## Qué puede leer ahora
- **`operacion_de_cliente`:** además del semáforo y el avance, trae el contrato operativo **por formato** (`entregablesPorFormato`), las historias por semana, las jornadas por mes, las notas del contrato y las cinco observaciones más recientes del equipo. Registrar un contrato en la plataforma no prueba que esté firmado: la certeza del acuerdo la da la memoria de la agencia.
- **`parrilla_de_cliente`:** por pieza, lo último que **el cliente pidió cambiar** (`pedidoDelCliente`). El portal lo escribe en `ContentItem.comments` como «[Cliente - fecha]: …» y lo lee `lastClientRequest`. También dice si la pieza **ya está en producción** y con quién (su tarea abierta, la fecha de entrega y si está vencida) y cuántas referencias tiene. El resumen cuenta las piezas por formato, las devueltas y las que están en producción.
- **`leer_piezas_de_parrilla`:** suma los comentarios del cliente y los enlaces de referencia de cada pieza.
- **`cartera_de_operacion`** (nueva, solo administradores y project managers): todas las cuentas activas en una sola llamada (`listOperations`), con las rojas primero, sus motivos, el PM, el CM, la agencia, el avance del mes y las tareas vencidas. Se puede filtrar por semáforo, agencia o responsable. Antes hacía falta una llamada por cuenta, y con seis rondas por respuesta no alcanzaba.
- **`criterios_y_hallazgos`** (nueva, permiso de Parrillas): los criterios editoriales **aprobados** del cliente y los propios de la parrilla, más los hallazgos abiertos de su revisión automática. Bria revisa contra esos criterios, no contra uno propio. Las propuestas sin aprobar no aparecen.

## Despachar a producción conversando
- **`preparar_despacho`** arma un lote de piezas de **una** parrilla, hasta 20, cada una con responsable, fecha de entrega (por defecto la de publicación, igual que el botón de la parrilla) y prioridad normal o alta. **No escribe nada.** El responsable se busca entre las personas activas del equipo; con dos coincidencias no elige, pregunta. Se dejan fuera, con el motivo, las piezas que no están en esa parrilla, las ya publicadas, las que ya tienen una tarea de producción abierta y las de clientes archivados.
- **El servidor despacha solo cuando la persona escribe «Despachar a producción»** sobre el resumen guardado (`isDispatchConfirmation`, una frase corta y completa: dentro de un texto más largo no cuenta). Ocurre dentro de `append`, con la conversación bloqueada y su revisión comprobada, igual que los pendientes. «Cancelar despacho» lo descarta.
- **Cada pieza pasa por `sendItemToKanban`**, la vía del botón «Despachar a Kanban»: crea la tarea `[Producción] formato: objetivo` ligada a la pieza y la pasa a EN_PRODUCCION.
- **Reintentar no duplica.** Si la pieza ya tiene una tarea abierta creada por esa persona, se recupera; si la creó otra persona, se informa.
- **Una pieza que falla no frena a las demás**, y su motivo se dice con palabras.
- **Permisos:** despachar exige Bria, Gestión y Parrillas (`canDispatch`), y se vuelven a comprobar antes de cada pieza.

## Verificación
- Pruebas: `tests/briaAccountTools.test.js` (lecturas nuevas), `tests/briaDispatch.test.js` (intención, confirmación, preparación, despacho idempotente, falla parcial y flujo en la conversación) y `tests/briaAssistantTools.test.js` (actualizado).
- Las suites de Bria, parrillas, operación de clientes y tareas fallan exactamente igual en `main` y en esta rama con el mismo entorno local: las 43 fallas son suites de PostgreSQL que necesitan el esquema completo. Ninguna sale de este cambio.
