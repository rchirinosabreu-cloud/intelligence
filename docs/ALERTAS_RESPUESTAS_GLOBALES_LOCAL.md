# Respuestas globales a alertas — revisión local del 6 de noviembre de 2026

## Mandato y alcance

Rodny pidió revisar todas las alertas y sus respuestas, conservar los registros existentes y mostrar el resultado local antes de fusionar. El ejemplo de un cliente que no renovará no limita la regla a esa cuenta. Este incremento no aplica decisiones ni cambia permisos, PM, community, saldos o contratos productivos.

La revisión comprende los 13 tipos persistentes de la banda, campana/push y los recorridos de tareas, Bria, solicitudes de acceso, foco, reconocimiento y borradores. Los tipos con respuesta de negocio usan su registro nativo; los avisos informativos conservan lectura/acuse personal. No se añadió una tabla de seguimiento, una tarea automática ni un segundo registro de cumplimiento.

## Inventario de la banda y su condición de salida

| Aviso | Respuestas y dónde quedan | Qué resuelve el asunto |
|---|---|---|
| CRM_FOLLOW_UP | Registrar gestión; resolver como perdida, descartada o ganada; archivar; abrir; posponer. `CrmLead` y `CrmActivity`. | Gestión posterior o resultado/archivo en el CRM. La decisión retira avisos equivalentes del equipo en la misma transacción. |
| CRM_REVIEW | Mismas respuestas comerciales, con confirmación del resultado y motivo para pérdida/descarte. | El estado real de la oportunidad; no se inventa «sin respuesta» como motivo. |
| CARTERA_MENSUAL | Gestión de cobro sobre todas las obligaciones mostradas; abrir Cuentas por cobrar; posponer. `CollectionActivity`. | Gestión que cubre el alcance actual o cambio del saldo/condición de vencimiento. El saldo sigue pendiente después de una gestión. |
| CARTERA_UNICO | Gestión sobre la obligación individual; abrir pago; posponer. | Gestión, pago o corrección de la obligación que elimina la condición. |
| CARTERA_SUSPENSION | Gestión sobre las obligaciones que sustentan el riesgo; revisar suspensión; posponer. | Decisión nativa de suspensión, normalización del saldo o gestión pertinente. La propuesta no suspende automáticamente. |
| PARRILLA_SIN_PUBLICAR | Abrir la parrilla correspondiente; posponer. `ContentItem`/publicación nativa. | La lectura actual ya no encuentra piezas vencidas asignadas a esa persona en ese período. Se distingue pérdida de acceso de publicación efectiva. |
| PARRILLA_RESUMEN | Abrir Parrillas; posponer. | Relectura de pendientes y asignaciones; las cuentas atendidas salen del resumen sin esperar al reloj de media hora. |
| OPERACION_INICIO | Revisar alcance en la ficha del proyecto; posponer. `ProjectOperation`. | Revisión nativa del proyecto habilitado. Abrirlo no lo marca revisado. |
| OPERACION_CONTINUIDAD | Revisar contrato/situación administrativa; confirmar que no renovará cuando corresponde; posponer. | La fuente vigente deja de justificar el riesgo o queda la decisión de no renovar. Contrato vigente y riesgo administrativo son estados diferentes. |
| OPERACION_RENOVACION | Registrar renovación en el formulario nativo, con fechas nuevas; confirmar no renovación; posponer. `ClientContract` y `ClientContractDecision`. | Nuevo contrato que cubre el siguiente período o no renovación confirmada. Se preservan publicaciones, informe, cierre y cartera pendientes. |
| OPERACION_SUSPENSION | Revisar suspensión; «Recibido»; posponer. `ClientSuspension` y acuse personal en `ImportantNotice`. | El acuse retira ese evento para esa persona; solo levantar la suspensión por su recorrido nativo reactiva la operación. |
| OPERACION_REACTIVACION | Revisar planificación; «Recibido»; posponer. | Acuse personal del levantamiento registrado. No declara trabajo realizado. |
| OPERACION_CICLO | Revisar cierre y avance; posponer. `ClientMonthlyClose`, `ClientMonthlyReport`, piezas. | Cierre/informe en sus registros y vigencia de la ventana de revisión. El cierre conserva pendientes; el aviso tiene ventana temporal y no sustituye el seguimiento operativo. |

La revisión de ciclo reúne períodos cubiertos por el aviso operativo para no pedir dos veces la misma revisión al PM. El community conserva su aviso de publicaciones con enlace a Parrillas, no a una ruta de Clientes reservada a responsables de operación.

## Las otras superficies

| Superficie | Respuesta registrada | Lo que nunca debe inferirse |
|---|---|---|
| Campana y push | `Notification.isRead/readAt`, apertura del recurso nativo. Abarca tareas/asignaciones/devoluciones, menciones, anuncios, publicaciones, CRM, cartera, contratos/proyectos, informes, accesos, incidencias y salud del servicio. | Leer no resuelve el negocio. Push es entrega de la misma notificación, no otro seguimiento. El filtro financiero se aplica antes de listar/contar/marcar y conserva filas ocultas para Kamila. |
| Tarea devuelta | Abrir Gestión; posponer una hora en `OperationalTraceEvent`; corrección/participación en la tarea. | Revisar o cerrar localmente el diálogo no marca realizada la tarea. |
| Trabajo prolongado | «Sigo trabajando» registra `TASK_EXCESSIVE_WORK_CONFIRMED` por cuatro horas; revisar abre la tarea. | La confirmación no altera tiempos, estado ni logros. Ocultar el diálogo es una interacción de presentación. |
| Bria y lecturas | Abrir una conversación o preparar una pregunta; ocultamiento personal en memoria; aprobación/denegación en solicitud nativa de acceso/permisos cuando corresponde. | Abrir, preguntar u ocultar no ejecuta una propuesta ni concede acceso. Se conserva la aprobación nativa de cada efecto. |
| Prórroga de foco | La ampliación autorizada se aplica al solicitarla con duración y motivo: comentario nativo de la tarea y `Task.focusDeadlineAt`; se avisa a quien fijó la hora. | No requiere aprobación adicional (decisión vigente del 21 de septiembre), no termina la tarea ni altera participaciones. |
| Reconocimientos | Recepción de un `RecognitionAward` ya concedido. | Verlo no concede otro logro. |
| Recuperación de borradores | Recuperar o descartar el borrador del recurso. | Recuperar no guarda/publica el documento final. |

Estos recorridos se revisaron conservando sus mecanismos existentes. No se trasladaron a una nueva bandeja ni se rediseñaron los diálogos de tareas o Bria.

## Correcciones transversales

- Catálogo explícito `src/lib/alertResponsePolicy.js`, compartido por pantalla y emisión. Rechaza nuevos tipos persistentes sin protocolo; un tipo desconocido jamás cae en CRM por descarte.
- Resultado comercial disponible desde cualquiera de sus avisos, con consecuencias, confirmación, motivo real y revisión de la oportunidad que vio la persona.
- Relectura de acceso activo y fuente actual antes de registrar gestión/resultado. Un aviso antiguo no puede perder una oportunidad ya ganada.
- Transacción serializable para decisión, actividad, retiro de avisos y campana asociada. Ante conflicto se pide releer; no se reenvía automáticamente una decisión.
- El resto del equipo queda como «ya atendido», no como autor de la decisión. Historial conservado.
- Cartera exige exactamente el conjunto mostrado y registra cada obligación; quitar una del envío o añadir una ajena falla antes de resolver el aviso. No hay fallback que cierre sin guardar la gestión.
- Parrillas relee el resumen, asignación y permiso. Si falla la fuente, no cierra el asunto ni entrega una decisión basada en datos sin comprobar. Una persona que sea PM y CM no cuenta dos veces.
- Botones y explicaciones propios de cada aviso; «Recibido» dice expresamente qué no resuelve. Renovación abre el formulario existente y exige introducir las fechas nuevas.
- Las vistas nativas se actualizan tras la respuesta, incluida la lista de gestiones de cobro.

## Regla para nuevas alertas

Antes de activarla, declarar: origen y revisión; destinatarios/permisos; cada respuesta y su efecto; registro de autor/fecha/historial; alcance compartido o personal; condición de salida/reapertura; idempotencia y tratamiento de conflictos.

Una alerta nueva de banda debe registrarse en `NOTICE_RESPONSE_POLICIES` y pasar su caso en pantalla y servidor. Las otras superficies reutilizan su protocolo nativo, documentado en `ALERT_SURFACE_PROTOCOLS`; añadir un efecto de negocio requiere su servicio autorizado y pruebas, no un «completado» genérico. Estas obligaciones quedan también en AGENTS.md.

## Muestra y verificación

`node scripts/preview-operational-notices.mjs` abre la muestra en `http://127.0.0.1:3846`. El selector Caso incluye los 13 tipos, con perfiles ficticios adecuados. Usa la banda real, las rutas de avisos y servicios nativos de CRM/continuidad con un adaptador de memoria. Las simulaciones de pago, publicación, cierre y revisión modifican únicamente la fuente ficticia. Recargar conserva el estado mientras viva el proceso; cambiar de caso reinicia la muestra. No es una conexión a producción.

Pruebas relevantes:

- `alertResponseProtocol`: tipos nuevos, fuentes cambiadas/no disponibles y reasignación.
- `alertResponsePostgres`: servicios CRM reales en PostgreSQL aislado, rollback si falla la campana, decisiones simultáneas, autor, reintentos y permiso revocado.
- `collectionActivitiesPostgres`: idempotencia, rollback, alcance exacto y rechazo de subconjuntos.
- `contractContinuityPostgres` y `notificationVisibilityPostgres`: decisión compartida, historia, permisos y filtro financiero.
- Regresiones de banda, trazas, ciclos, tareas devueltas/prolongadas, ampliación de compromisos y Bria.
- `browser/alertResponses.mjs`: los 13 tipos, confirmación CRM, persistencia tras recarga, registro nativo, gestión sin pago, publicación resuelve resumen, acuse no levanta suspensión, enlace de renovación y capturas.
- `browser/noticeAccessibility.mjs` y `browser/noticeCard.mjs`: contraste ≥4.5:1, teclado, foco, errores, reflujo y permanencia.

Resultados finales: **254 pruebas de servicio/contrato aprobadas, sin omisiones**, incluidos PostgreSQL aislado y regresiones de los recorridos conservados; **5 recorridos de navegador aprobados**, con los 13 avisos, continuidad y alcance contractual en claro/oscuro y escritorio/móvil. ESLint de todos los archivos de producto modificados y `git diff --check` sin errores. Vite compiló correctamente; conserva avisos previos de tamaño de paquetes y minificación CSS ajenos a este cambio.

La generación estándar de Prisma encontró su DLL ocupada por otro proceso local. Se generó el cliente actual en `output/global-alerts-prisma` y se actualizaron los artefactos generados sin sustituir la DLL en uso; las pruebas posteriores con PostgreSQL real pasaron. No se detuvieron procesos ajenos para liberar esa DLL.

Capturas en `output/alertas-globales-local`. La muestra del puerto 3846 se reinició con esta versión y se comprobó su respuesta. La revisión local no acredita que los datos productivos de cada cliente sean correctos ni que un despliegue esté aplicado. No se ejecutaron mensajes, cobros, publicaciones ni decisiones contra servicios externos. Rodny aprobó la revisión visual y autorizó fusionar. El despliegue conserva su aprobación habitual.

## Integración autorizada

Rodny aprobó la muestra y autorizó la fusión. Al actualizar contra main se conservó el módulo de Pautas de #1275, incluidos esquema, arranque e historial. Sus tres avisos (PAUTA_REVISION, PAUTA_CAMPANA y PAUTA_RESUMEN) se incorporan al catálogo global, que ahora tiene 16 tipos: abren el registro nativo para actualizar gasto/campaña o permiten posponer; no ofrecen seguimiento comercial ni un cierre genérico. Conservan su revalidación y resolución nativas. El selector de la muestra conserva los 13 casos originales; la integración agrega comprobación de los tres tipos de pauta en navegador y regresiones de su servicio.
