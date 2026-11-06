# Traslado de piezas al cambiar su fecha de publicación

Solicitud de Rodny, 6 de noviembre de 2026. Incremento en `codex/pieza-cambio-periodo-local`, sobre `b2040351`. Validación local completada; Rodny autorizó fusionarlo junto con los ajustes de cabecera del mismo día.

## Ajustes de cabecera solicitados antes de fusionar

El período, estado, compartir y añadir contenido usan 44 px de alto y 12 px de radio, conservando sus colores. Se retira el rótulo visible del período, manteniendo su nombre accesible. Compartir usa solo el icono tradicional de tres nodos y conserva la creación/copia del enlace nativo. El selector de cliente se elimina de esa fila; el cliente sigue identificado en la ruta de navegación. El responsable conserva su selector y muestra `TeamAvatar` con foto o iniciales.

La revisión de navegador verificó las medidas reales, cambio de responsable, avatar, copia del enlace y ausencia de desbordamiento en móvil; capturas claras, oscuras y móviles en `output/content-period-transfer/screenshots/04-cabecera-clara.png`, `05-cabecera-oscura.png` y `06-cabecera-movil.png`. Tras el ajuste pasan 38 contratos de traslado/esquema/navegación/revisión publicada y el recorrido completo de traslado en navegador.

## Comportamiento

Cambiar la fecha a otro mes o año cambia la parrilla de la misma pieza, para el mismo cliente. Se conserva `ContentItem.id`; no se duplica la pieza, sus tareas ni sus archivos. Si existe una parrilla activa de destino se reutiliza; si falta se crea. Dos traslados simultáneos al mismo período usan un único destino. Si hay varias parrillas activas legadas para ese período se rechaza el traslado y se pide resolver la ambigüedad.

Al regresar o trasladar la última pieza a otro mes, la parrilla automática vacía se retira de las vistas mediante `deletedAt`. Puede reutilizarse después sin resucitar piezas en papelera. Una parrilla manual no se retira automáticamente. Editar expresamente una parrilla automática la convierte en manual; compartirla o añadir notas/objetivos también impide retirarla. No se destruyen su identidad ni sus registros históricos.

Las tareas conservan sus IDs, responsables, colaboradores, estados personales, relojes, sesiones y ciclos. La relación nativa con la pieza proporciona el nuevo mes a Kanban. Las fechas de tareas pendientes siguen la reciprocidad existente y conservan su distancia respecto a la publicación; las fechas de tareas terminadas no se reescriben. Modificar la fecha de una tarea de publicación usa el mismo traslado. Una tarea de producción conserva su fecha interna como tal.

Los entregables vigentes aparecen en `Entregables → cliente → año → mes → Parrillas → pieza` del Drive de la plataforma. Se recalculan carpeta y nombre de presentación desde la relación actual, conservando el nombre original. No se copian ni renombran los objetos del bucket: sus claves, área de almacenamiento, IDs y bytes permanecen. Los enlaces a archivos externos de Google Drive tampoco se mueven físicamente. Las cargas autorizadas antes del traslado pueden terminar después y siguen perteneciendo a la misma pieza.

La pantalla sigue a la pieza y conserva vista y procedencia. Un enlace antiguo a una pieza o a su carpeta individual de entregables resuelve la ubicación vigente, con permisos revalidados antes de mostrarla. El regreso desde edición conserva la búsqueda de Drive. Un enlace a una carpeta general de mes no se convierte arbitrariamente en otro mes.

La programación pendiente en redes cambia junto con la fecha y hora en la misma transacción. Si la nueva hora ya pasó o falta, se cancela la programación y se conserva la explicación nativa; no se publica de inmediato. Una publicación que ya esté ejecutándose bloquea la modificación de fecha/hora. El trabajador comprueba que la fecha que leyó siga vigente antes de reclamar una publicación. Mover una pieza publicada no vuelve a publicarla. Deshacer una publicación manual después de moverla reabre su mes actual sin copiar el estado anterior de otra parrilla.

Se registra autor, fecha, pieza, parrillas y períodos anterior/nuevo en `ContentItemPeriodChange`. Es historial inmutable, sin dependencia de borrado del recurso. Las revisiones de Bria de ambos meses quedan pendientes de recalcular; el traslado por sí solo no concede un logro de finalización. Los permisos nativos, suspensiones y restricciones de parrillas externas siguen aplicándose.

## Implementación y protección

- `contentPeriodTransferService` centraliza traslado y cola de publicación dentro de la transacción serializable nativa. Creación/edición/eliminación de parrillas y creación de piezas comparten la serialización.
- `expectedPlanId` permite rechazar una pantalla cuyo mes ya cambió; la interfaz lo envía. No se admite cambiar `planId` directamente mediante la edición de una pieza.
- La fecha se valida como día calendario real, sin desplazar el primero de mes por conversión horaria a Bogotá. La hora de publicación mantiene su interpretación nativa en Bogotá.
- `ensure-content-period-transfer-schema.js` añade el marcador y el historial sin modificar piezas anteriores. Se ejecuta antes de instalar la protección de auditoría al arrancar. No se usó `db push` ni una migración destructiva.
- La descripción de la operación en `platformCatalog` explica el efecto a Bria. No se añadieron instrucciones generales ni frases disparadoras.

## Evidencia local

Base exclusiva `shared_tasks_demo`, usuario `shared_tasks_test`, puerto 55451; API de prueba con cuentas ficticias, almacenamiento simulado y sin trabajos de publicación externos. La prueba del historial usa un esquema temporal propio y confirma que UPDATE, DELETE y TRUNCATE se rechazan. Nunca instala sus disparadores sobre tablas de la prueba compartida.

`tests/contentPeriodTransferApi.integration.mjs` cubre 13 casos reales HTTP/PostgreSQL:

1. Identidad, tareas, tiempos, archivos, descarga, Drive, permisos y regreso al origen.
2. Dos traslados simultáneos al mismo mes; retiro solo después de salir la última pieza.
3. Reprogramación, bloqueo al publicar y cancelación al pasar a una fecha vencida.
4. Cambio desde tarea de publicación, permisos y rechazo de fecha imposible.
5. Creación con fecha de otro mes, atribución al autor y fecha inválida.
6. Reutilización de parrilla manual; conservación del estado publicado y sus tareas.
7. Fecha dentro del mismo mes, fecha inválida y rechazo de cambio directo de parrilla.
8. Entrega iniciada antes del traslado y completada después.
9. Suspensión financiera y parrilla externa: rechazo sin creación parcial.
10. Edición desde una pantalla con la parrilla anterior: rechazo sin sobrescritura.
11. Permisos de carga del editor anteriores al movimiento, sin aceptar claves de otra pieza.
12. Deshacer publicación manual después del traslado.
13. Mes automático con piezas en papelera: retiro y reutilización sin restaurarlas.

`tests/contentPeriodTransferSchema.integration.mjs` verifica esquema aditivo, ejecución repetida y auditoría inmutable. Los 14 casos HTTP/esquema pasan. `contentPeriodTransfer.test.js` cubre límites de calendario y reclamación con fecha obsoleta. También se verifican reciprocidad, navegación, aprobación, publicaciones, suspensiones, catálogo, entregas y Drive con las pruebas existentes.

`tests/browser/contentPeriodTransfer.mjs` recorre la aplicación real: octubre → enero de otro año → carpeta de Drive → enlace anterior → regreso a octubre en móvil oscuro. Comprueba identidad, entrega, metadatos de Kanban, URL, búsqueda, retiro de parrilla, errores JavaScript y desbordamiento horizontal. Las tres capturas se revisaron visualmente. Las seis pruebas de interfaz de Drive también pasan. Esto no acredita todas las rutas de la plataforma ni envíos reales a Meta o cambios físicos en Google Drive.

Evidencias ignoradas por Git en `output/task-piece-delivery/period-transfer-*.log` y `output/content-period-transfer/screenshots/`. La prueba de auditoría antigua que requiere otra base local (55448) queda omitida; el historial nuevo sí se verifica en PostgreSQL 55451.

Verificación final: 14/14 casos HTTP/esquema; 119 pruebas de unidad/regresión aprobadas y una omitida por la base anterior; 1/1 recorrido de navegador sobre el preview reiniciado con el código final. `npm run build`, ESLint de los archivos del incremento, `npm run audit:dead-code` y `git diff --check` pasan. La compilación conserva el aviso de tamaño de paquetes de la aplicación.

## Repetir la prueba

Con la base aislada preparada, exportar explícitamente `NODE_ENV=test` y su `DATABASE_URL`. Para el aislamiento adicional de esta sesión se usa `NODE_OPTIONS=--import=file:///C:/Proyectos/intelligence/output/task-piece-delivery/local-network-only.mjs`. Ese archivo de trabajo no es parte del producto.

```powershell
node --test --test-concurrency=1 tests/contentPeriodTransferApi.integration.mjs tests/contentPeriodTransferSchema.integration.mjs
node scripts/preview-content-period-transfer.mjs
# En otra terminal, con la misma configuración local:
node --test tests/browser/contentPeriodTransfer.mjs
```

El preview sirve `http://127.0.0.1:3183`, API 8092, y guarda sus credenciales ficticias en `output/content-period-transfer/access.json`. Se evita cargar variables del frontend productivo. Las pruebas HTTP que comparten el orden de tareas se ejecutan secuencialmente.
