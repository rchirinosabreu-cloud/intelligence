# CRM: respuestas en el aviso y frases frecuentes

Solicitud de Rodny y Francys, 9 de noviembre de 2026. Implementación validada en local; Rodny autorizó fusionarla junto con el visor de entregables. El despliegue conserva su aprobación habitual.

## Recorrido

- **Descartar**, ajustado por Rodny el 9 de noviembre, guarda directamente `DESCARTADO` con un clic, sin formulario de motivo ni segunda confirmación; conserva revisión, autor e historial y resuelve los avisos equivalentes. También actúa directamente al elegir Descartada dentro de Resolver oportunidad. Un fallo conserva la tarjeta y permite reintentar. No sustituye Archivar.
- **Cliente no aprobó**, según la aclaración explícita de Rodny, es el nuevo nombre de `PERDIDO`. No hay estado adicional: las oportunidades, motivos, métricas e historiales existentes conservan su identidad. Se actualizan selector de etapa, Resolver oportunidad, confirmación, detalle, indicadores y textos de trazabilidad. Descartado sigue siendo una opción diferente. El cursor de espera solo aparece durante un guardado real, no por tener un campo requerido vacío.
- **Próximo seguimiento** permite escribir acción y fecha dentro de la banda, con el calendario compartido. Requiere un día posterior al actual en Bogotá. Guarda `CrmLead.nextAction` y `nextFollowUpAt`, y una actividad nativa `NOTA` con autor, fecha y solicitud idempotente. No cambia etapa, última gestión, contacto inicial, propuesta ni antigüedad sin respuesta.
- El mismo aviso pasa a `CRM_NEXT_FOLLOW_UP` y vuelve desde las 08:00 de Bogotá del día elegido. La pausa viene de los campos actuales de la oportunidad; modificar la fecha en la ficha adelanta o aplaza su retorno. `Recordarme` sigue siendo una pausa personal. No se crean tareas, otra agenda, otra campana ni tablas nuevas.
- La planificación compartida afecta los avisos abiertos del mismo asunto sin atribuir a otros su autoría. El reloj de silencio respeta el plan pendiente. Una gestión posterior o el cierre nativo retira los avisos; una gestión antigua registrada después no acredita el cumplimiento del plan.
- **Qué se hizo** sugiere frases guardadas previamente por el propio autor. Empieza con tres caracteres; reconoce mayúsculas y acentos, conserva las palabras originales, prioriza frecuencia y permite clic, Tab o flechas + Enter. Esc descarta la sugerencia. Aceptar texto no guarda una gestión y se puede editar libremente.
- Las sugerencias consultan hasta 500 gestiones de contacto recientes del autor en oportunidades no archivadas, con un máximo de 100 frases distintas y cuatro coincidencias visibles. Excluyen textos automáticos de la banda y notas de planificación. No usan IA ni almacenamiento del navegador y no comparten frases de otros usuarios. Un fallo de sugerencias permite seguir escribiendo.

## Integridad y permisos

Programar exige propiedad del aviso, usuario/equipo activos, permiso CRM y responsabilidad comercial vigentes, origen todavía pendiente, revisión y confirmación. La oportunidad, la nota y el cambio de avisos comparten transacción serializable; una colisión devuelve 409. La solicitud repetida conserva una sola actividad y rechaza otro contenido con la misma identidad. Las sugerencias releen permiso CRM y devuelven únicamente textos del autor autenticado, sin identificadores ni datos de otras personas.

El nuevo evento `IMPORTANT_NOTICE_SCHEDULED` pertenece al catálogo de trazabilidad existente y tiene frase e icono propios. La lectura del aviso programado deriva su fecha y texto del origen; no copia la planificación a otra tabla. No cambia la fecha original de creación del aviso.

## Prueba local y evidencia

Iniciar `node scripts/preview-operational-notices.mjs --crm`; muestra en `http://127.0.0.1:3853`. Usa datos ficticios y los componentes/servicios reales con una base en memoria; no acredita datos productivos.

1. Pulsar Descartar; comprobar el cierre directo y el registro de la decisión, sin pedir ni inventar un motivo. Reiniciar.
2. Programar una llamada para una fecha futura; revisar acción, fecha y autor. Pulsar **Avanzar al seguimiento** para ver el retorno del aviso.
3. Escribir `Se contacto` en **Qué se hizo** y pulsar Tab o seleccionar la frase. Editar y registrar. Probar el prefijo de la nueva frase guardada.

Contratos:

- 114 pruebas de CRM, alertas, servicios, rutas, calendario de avisos, trazabilidad, presentación y compilación de componentes: `output/crm-mejoras-local/unit-tests.log`.
- PostgreSQL real y HTTP en esquema temporal dentro del clúster local aislado, eliminado al finalizar: `tests/crmNoticePlanningApi.integration.mjs`. Cubre autor, persistencia, reintentos, conflictos simultáneos, permisos revocados, propiedad, fuente modificada/cerrada, fechas inválidas, reversión ante error de escritura, retorno, cambios desde ficha, recordatorio personal, descarte y aislamiento de frases.
- Navegador Chrome: `tests/browser/crmImprovements.mjs`, `alertResponses.mjs` y `noticeAccessibility.mjs`; recorridos reales de interfaz con base ficticia, errores recuperables, teclado, selección en el portal del calendario, móvil, claro y oscuro. Capturas en `output/crm-mejoras-local/`.
- El caso adicional de gestiones retroactivas pasa en memoria y PostgreSQL; resultado de 22 pruebas focalizadas en `output/crm-mejoras-local/final-backend.log`.
- Vite compila la aplicación. El comando compuesto `npm run build` pasó sus comprobaciones iniciales pero la regeneración de Prisma encontró el motor DLL ocupado por procesos locales (EPERM). No se detuvieron procesos ajenos; `vite build` se verificó por separado con el cliente disponible. Registro: `output/crm-mejoras-local/vite-build.log`.

El cambio de nombre no modifica el esquema. Se retiró la ampliación del CHECK preparada antes de la aclaración; `ensure-crm-schema.js` conserva su versión original. PostgreSQL se prueba con el catálogo original, una oportunidad legada sin cambios y el rechazo del valor adicional descartado. No se reclasifican filas ni se modifican datos productivos. La muestra no envía mensajes a Francys, Pacho ni clientes. El horario de las 08:00 corresponde a la reaparición de la banda, no a una llamada ejecutada ni a una cita con hora.

Validación de la aclaración: 145 pruebas de reglas, importaciones, servicios, rutas, esquema, relaciones comerciales y HTTP/PostgreSQL pasan (`rename-tests.log`); navegador de banda y respuestas globales (`rename-browser.log`). El selector real se prueba con una oportunidad legada en `PERDIDO`, sin duplicar opciones y conservando su motivo tras recargar (`tests/browser/crm.mjs`, caso «cliente no aprobó»). La muestra general de la ficha se puede iniciar con `CRM_PREVIEW_PORT=3854 node scripts/preview-crm.js`, usando datos ficticios. La banda, los formularios y las frases continúan en el puerto 3853.
