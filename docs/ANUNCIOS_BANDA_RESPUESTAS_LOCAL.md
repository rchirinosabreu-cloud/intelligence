# Bloque 6 · Anuncios del Dashboard y respuestas personales

8 de noviembre de 2026. Implementación y muestra validadas en local. Rodny aprobó la muestra y autorizó publicarlo («ok suéltalo»). El esquema es aditivo; no se reenvían anuncios históricos ni se modifican sus decisiones. La aprobación de Railway, si se solicita, conserva su recorrido habitual.

## Decisión de producto

Cada anuncio general nuevo avisa al equipo activo en la banda existente. El autor no recibe su propio aviso. Se conservan la tarjeta blanca, halo y botones coral aprobados. Un aviso a la vez, con el intervalo nativo de cinco minutos entre decisiones y el sondeo existente de un minuto. No se añade una segunda campana, push, tarea o seguimiento. Los anuncios personales conservan su recorrido actual.

- **Ver anuncio:** abre una ventana sobre la pantalla actual, sin navegación. Se registra OPENED después de montar el contenido. No afirma lectura completa, aceptación ni cumplimiento. La ventana permanece aunque la banda se retire; X, Esc o clic exterior cierran la ventana y conservan el borrador de la pantalla inferior.
- **Cerrar:** guarda DISMISSED y retira solo el aviso de esa persona. No registra apertura. La decisión sobrevive a recargas y otras pestañas. Abrir después desde el Dashboard conserva ambas evidencias.
- **Dashboard:** conserva texto completo, semana de Bogotá y altura compartida. El historial general ya no se limita a cincuenta registros. Cada anuncio ofrece la misma vista previa; los gestores pueden consultar las respuestas. Los anuncios anteriores no adquieren aperturas ni avisos retroactivos.
- **Corregir:** conserva la versión anterior y autor, exige revisión vigente y actualiza avisos pendientes. No reemite avisos atendidos. El registro de apertura identifica la versión que se abrió.
- **Archivar:** sustituye el borrado de anuncios generales, retira avisos pendientes de todos y conserva contenido y respuestas en el historial. No se ha incorporado una acción de restauración/reenvío.

## Origen y acceso

`GlobalAnnouncement` sigue siendo el origen. Sus campos aditivos son `revision`, `requestId` y `archivedAt`. `AnnouncementDelivery` tiene una única fila por anuncio/persona; `AnnouncementEvent` conserva publicación, versión anterior, apertura, cierre y archivo. El historial es inmutable, sin borrado en cascada, incorporado al catálogo nativo de auditoría. Administradores y PM conservan la gestión y consulta de respuestas; la auditoría detallada se entrega solo a administradores. La consulta de contenido general exige pertenencia vigente al equipo.

`announcementDeliveryService` relee la persona y su rol desde Equipo/User. La publicación, distribución, corrección, archivo y respuestas comparten transacciones serializables, con reintentos acotados. Una publicación repetida con el mismo identificador no duplica anuncio, destinatarios ni avisos. Un error al guardar el historial revierte toda la operación. La revisión rechaza respuestas basadas en contenido sustituido o archivado. No se confía en identidades enviadas en el cuerpo.

El tipo `ANUNCIO_GENERAL` declara su protocolo en `alertResponsePolicy`. Las otras familias conservan sus respuestas; Cerrar no se añade a las alertas comerciales, financieras u operativas. `currentImportantNotice` revalida el anuncio antes de presentarlo. Una fuente inaccesible no produce una decisión inferida.

La ruta antigua de anuncios generales comparte el servicio nativo: ya no borra el más antiguo al llegar a cinco, ni crea campanas adicionales por menciones. Las campanas anteriores se conservan con su estado histórico. No se recrean para anuncios nuevos.

## Esquema y límites

`scripts/ensure-announcement-delivery-schema.js` es aditivo e idempotente, encadenado antes de la protección de auditoría en el arranque. Solo se ejecutó sobre esquemas temporales locales; no se importaron ni modificaron registros productivos. Los legados conservan autor y contenido y reciben únicamente los valores de esquema por defecto, sin inventar eventos históricos. El contenido largo anterior sigue siendo consultable. Los nuevos anuncios admiten hasta 30.000 caracteres.

La entrega se calcula para los miembros activos con cuenta en el momento de publicar. Una persona incorporada después puede consultar el historial, sin recibir toda la cola anterior. Las correcciones no fuerzan un nuevo acuse. No se puede asegurar que alguien leyó o comprendió un anuncio; se registran exclusivamente las acciones comprobables.

## Validación local

- 112 pruebas aprobadas: recorrido de anuncios con PostgreSQL aislado, permisos actuales, fuentes cambiadas, archivo, ausencia de campanas nuevas, esquema repetido sobre legado, inmutabilidad, error de historial con reversión, concurrencia e idempotencia; regresiones de Dashboard, banda, política global y visibilidad de campana.
- Dos recorridos de navegador aprobados: apertura y cierre con recarga, borrador y URL conservados, fallo de guardado, móvil/oscuro, respuestas desde historial, corrección y archivo; regresión de la tarjeta operativa y Recordarme.
- Compilación aprobada; revisión estática sin errores, con 23 advertencias preexistentes. Auditoría de código sin uso aprobada. Se conserva el aviso de tamaño de paquetes del compilador.
- Capturas: `output/announcement-band.png`, `output/announcement-preview.png`, `output/announcement-responses.png`, `output/announcement-archived.png`, `output/announcement-dark.png`, `output/announcement-mobile.png`.
- Evidencia: `output/announcement-final-tests.log`, `output/announcement-final-browser.log`, `output/announcement-final-build.log`, `output/announcement-final-lint.log`, `output/announcement-dead-code.log`.

Muestra con datos ficticios: `node scripts/preview-announcement-delivery.mjs`, puerto 3851. Usa componentes reales y servicios nativos sobre un esquema aislado de PostgreSQL local; las acciones de la muestra no salen a producción. «Ver como emisor» permite consultar respuestas y editar/archivar desde el historial; «Nuevo ejemplo» permite repetir el recorrido y adelanta únicamente el reloj ficticio de esa muestra.
