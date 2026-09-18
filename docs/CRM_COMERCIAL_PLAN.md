# CRM comercial / bitácora SDR — comprensión y plan de construcción

Fecha: 18 de septiembre de 2026. Fuente: `CRM_Brain_Studio.xlsx` (6 hojas, 171 leads) y el protocolo «Ruta de gestión del cliente Brain Studio». Este documento es una propuesta de trabajo; no autoriza cambios de esquema ni despliegues por sí mismo.

## 1. Qué hay hoy en el Excel

| Hoja | Contenido | Qué se conserva |
|---|---|---|
| Dashboard | 8 números grandes (total, LinkedIn, Brain Studio, verde, amarillo, rojo, ganados, abiertos) y una tabla de «prioridades inmediatas» | La pantalla inicial del módulo replica exactamente esta lectura de 10 segundos |
| CRM Maestro | 171 filas × 27 columnas. 37 de LinkedIn (`LNK-`), 134 propias (`BRN-`) | Es la entidad `CrmLead`. Todas las columnas tienen campo equivalente |
| Prospectos LinkedIn / Prospectos Brain | Copias filtradas del maestro | Desaparecen: son filtros por origen |
| Bitácora gestiones | 21 gestiones de 10 empresas con fecha, tipo, resultado, próxima acción, responsable | Es la entidad `CrmActivity` |
| Guía y catálogos | Definición de cada fecha y regla del semáforo | Se convierte en reglas de código con pruebas |

Lo que el Excel revela sobre la operación real, medido en el archivo:

- **Tres columnas cargan todo el valor y hoy están vacías o casi vacías.** «Fecha ingreso al CRM» está vacía en las 171 filas, «Fecha primer contacto» en 170 y «Fecha próximo seguimiento» en 163. Sin ellas no se puede medir velocidad de respuesta ni saber qué toca hoy. El sistema debe llenar la primera sola y exigir la tercera en cada gestión.
- **La próxima acción es genérica.** 148 de 171 leads tienen una de tres frases plantilla («Hacer seguimiento y buscar una fecha de decisión», «Validar datos y realizar primer contacto», «Formalizar contrato…»). Solo las 8 oportunidades del dashboard tienen una acción concreta. El módulo debe pedir acción y fecha tras cada gestión, con la plantilla como sugerencia y no como valor.
- **El historial vive en un texto libre.** 28 leads tienen observaciones con fechas incrustadas («09-Jul-2026: propuesta enviada. 24-Aug-2026: …»). Eso es exactamente la bitácora, pero no se puede consultar ni contar. En la importación se parte por fecha y se convierte en gestiones.
- **«Aprobada» y «Ganado» son etapas distintas.** 39 aprobadas frente a 4 ganadas. El protocolo del Word lo explica: aprobar la propuesta no es lo mismo que formalizar contrato, datos de facturación y accesos. El módulo mantiene esa distinción y el dashboard muestra «aprobadas pendientes de formalizar» como un número propio.
- **El semáforo es casi todo amarillo** (113 de 171). Se asignó a mano y por etapa, no por comportamiento. La regla automática propuesta abajo lo calcula con fechas y respuestas reales, y se puede corregir a mano cuando el contexto lo pida.
- **Responsable no identifica a una persona.** 169 filas dicen «Comercial». Cada lead tendrá un responsable del roster de Equipo.

## 2. Decisiones de diseño

**Un lead es una oportunidad.** Se mantiene una sola entidad, como en el Excel, con datos de contacto embebidos. No se separan empresa, contacto y oportunidad en tres tablas: el 78% de las filas no tiene persona de contacto y la operación es de una sola persona. Cuando haga falta (varias oportunidades para una misma empresa) se agrega un `companyKey` normalizado para agruparlas sin migrar nada. Si un lead se gana, se vincula al `Client` existente del módulo Clientes; si se cotiza, se vincula a la `Quotation` existente. No se duplica ninguna de esas dos entidades.

**Etapas cerradas, resultado derivado.** El Excel tiene 12 valores de etapa con variantes ad hoc («Esperando RFP», «Pendiente aprobación ajuste»). Se fija la lista que pidió Rodny y el «resultado» (abierto, aprobado, ganado, perdido, descartado) se calcula desde la etapa en lugar de guardarse aparte, para que no se contradigan.

| Etapa (`CrmStage`) | Grupo | Etiqueta |
|---|---|---|
| `POR_GESTIONAR` | abierto | Por gestionar |
| `CONTACTADO` | abierto | Contactado |
| `CITA_SOLICITADA` | abierto | Cita solicitada |
| `CITA_REALIZADA` | abierto | Cita realizada |
| `PROPUESTA_ENVIADA` | abierto | Propuesta enviada |
| `NEGOCIACION` | abierto | Negociación |
| `ESPERANDO_CLIENTE` | abierto | Esperando cliente |
| `SIN_RESPUESTA` | abierto (en riesgo) | Sin respuesta |
| `APROBADA` | aprobado | Aprobada, pendiente de formalizar |
| `GANADO` | ganado | Ganado / contratado |
| `PERDIDO` | cerrado | Perdido |
| `DESCARTADO` | cerrado | Descartado |

**Origen como catálogo único.** El Excel tiene «Fuente» (LinkedIn / Brain Studio) y «Origen / canal» (texto). Se unifica en `origin` con valores `LINKEDIN, CONTACTO_DIRECTO, REFERIDO, CLIENTE_ANTERIOR, FORMULARIO, WHATSAPP, CONVOCATORIA, ALIADO, OTRO` más `originDetail` libre. Los números «LinkedIn» y «Brain Studio» del dashboard se derivan: LinkedIn = origen LINKEDIN, Brain Studio = el resto.

**Semáforo automático con corrección manual.** El servidor calcula el color en cada lectura con reglas puras y probadas (`src/lib/crmRules.js`). El usuario puede fijar un color manual con motivo; se muestra con una marca «manual» y vuelve a automático cuando él lo suelte.

| Color | Regla automática (primera que aplique) |
|---|---|
| Rojo | etapa `PERDIDO`, `DESCARTADO` o `SIN_RESPUESTA`; o seguimiento vencido hace más de 7 días; o lead abierto sin gestión en 21 días; o tres gestiones seguidas sin respuesta del cliente |
| Verde | etapa `APROBADA` o `GANADO`; o hubo respuesta del cliente, reunión o cita en los últimos 7 días |
| Amarillo | cualquier otro lead abierto |

Los umbrales (7, 21, 3) viven en una sola constante para ajustarlos después sin tocar la lógica.

**Fechas de hito se rellenan solas desde la bitácora.** Registrar una gestión actualiza `lastActivityAt`, `nextAction` y `nextFollowUpAt`. La primera gestión de contacto fija `firstContactAt`; una gestión «Propuesta enviada» fija `proposalSentAt` y pasa la etapa; ganar fija `closedAt`. Cada cambio de etapa se guarda como gestión del tipo `CAMBIO_ETAPA`, así el embudo cuenta «llegó a propuesta» aunque el lead ya esté en negociación.

**Todo en hora de Bogotá.** «Hoy», «vencido» y «esta semana» se calculan con `America/Bogota`, igual que reconocimientos y anuncios.

**Nada se borra.** Las gestiones no se eliminan; el autor puede corregirlas y queda `editedAt`. Los leads se archivan, no se borran.

## 3. Modelo de datos

Dos modelos nuevos en `prisma/schema.prisma` y un inicializador aditivo `scripts/ensure-crm-schema.js` encadenado en `start` antes de `node server.js`, con el mismo patrón que `ensure-team-chat-schema.js` (transacción, `lock_timeout`, `pg_advisory_xact_lock`, solo `CREATE … IF NOT EXISTS`).

`CrmLead`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | |
| `consecutive` / `code` | autoincrement / `CRM-0001` | `legacyCode` guarda `LNK-001` / `BRN-001` del Excel |
| `origin`, `originDetail` | enum, texto | |
| `enteredAt` | timestamptz | por defecto ahora; la importación marca `enteredAtEstimated` |
| `contactName`, `company`, `jobTitle`, `phone`, `email`, `linkedinUrl` | texto | `companyKey` normalizado para agrupar |
| `serviceInterest`, `language`, `allowedContact` | texto | |
| `priority` | enum `ALTA, MEDIA, BAJA` | |
| `publishedAt`, `callDeadlineAt` | date | oportunidad externa / cierre de convocatoria |
| `firstContactAt`, `proposalSentAt`, `lastActivityAt`, `closedAt` | timestamptz | los llena la bitácora |
| `stage` | enum `CrmStage` | |
| `trafficLightOverride`, `trafficLightReason` | enum nullable, texto | null = automático |
| `nextAction`, `nextFollowUpAt` | texto, date | |
| `ownerId` | → `TeamMember` | responsable |
| `quotedValue`, `currency` | Decimal, `COP` por defecto | |
| `lostReason` | texto | obligatorio al pasar a `PERDIDO` |
| `clientId`, `quotationId` | → `Client`, → `Quotation` | opcionales |
| `notes` | texto | observaciones libres |
| `createdById`, `createdAt`, `updatedAt`, `archivedAt` | | |

`CrmActivity`

| Campo | Tipo | Nota |
|---|---|---|
| `id`, `leadId` | | |
| `type` | enum `LLAMADA, CORREO, WHATSAPP, MENSAJE_LINKEDIN, REUNION, PROPUESTA_ENVIADA, RESPUESTA_CLIENTE, NOTA, CAMBIO_ETAPA` | |
| `occurredAt` | timestamptz | |
| `note`, `result` | texto | qué se hizo, qué pasó |
| `nextAction`, `nextFollowUpAt` | texto, date | se copian al lead |
| `fromStage`, `toStage` | enum nullable | solo en `CAMBIO_ETAPA` |
| `authorId` | → `User` | |
| `requestId` | texto | evita duplicar la misma gestión por doble toque |
| `createdAt`, `editedAt` | | |

Índices: `(stage, archivedAt)`, `(ownerId, nextFollowUpAt)`, `(leadId, occurredAt)`, `(origin)`, `(companyKey)`.

Permiso: nueva clave `crm` en el JSON por defecto de `User.modulePermissions`, en los tres presets y las etiquetas de `Team.jsx`, y en `Sidebar.jsx`. `ADMIN` y `PROJECT_MANAGER` lo reciben por preset; a Franci se le activa la casilla desde Equipo.

## 4. API

Router `src/routes/api/crm.js` montado como `router.use('/crm', requireModulePermission('crm'), crmRouter)` bajo la autenticación global. Controlador `crmController.js`, servicio `crmService.js`, reglas puras en `src/lib/crmRules.js`.

| Método y ruta | Uso |
|---|---|
| `GET /api/crm/leads` | lista con filtros `stage, origin, priority, ownerId, trafficLight, search, from, to`, orden y paginación; cada fila trae el semáforo calculado |
| `POST /api/crm/leads` | crear; `enteredAt` por defecto ahora |
| `GET /api/crm/leads/:id` | ficha completa con gestiones ordenadas |
| `PATCH /api/crm/leads/:id` | editar datos; la etapa no se cambia por aquí |
| `POST /api/crm/leads/:id/stage` | cambiar etapa; exige `lostReason` al perder; crea la gestión `CAMBIO_ETAPA` en la misma transacción |
| `POST /api/crm/leads/:id/activities` | registrar gestión; actualiza hitos del lead en la misma transacción; idempotente por `requestId` |
| `PATCH /api/crm/leads/:id/activities/:activityId` | corregir texto de una gestión propia |
| `POST /api/crm/leads/:id/traffic-light` | fijar o soltar el color manual |
| `POST /api/crm/leads/:id/archive` | archivar |
| `GET /api/crm/followups?bucket=` | `VENCIDOS`, `HOY`, `SEMANA`, `SIN_FECHA` en hora Bogotá |
| `GET /api/crm/metrics` | números del dashboard y embudo con los mismos filtros de fecha, responsable, origen, prioridad, estado y etapa |
| `GET /api/crm/catalogs` | enums con etiquetas para que el frontend no los duplique |

Métricas que devuelve `/metrics`: total, por origen (LinkedIn / Brain Studio y desglose), por semáforo, abiertos, aprobadas pendientes, ganados, perdidos; embudo entrados → contactados → reunión → propuesta → ganados con porcentaje entre pasos; valor cotizado abierto y valor ganado; promedio de días ingreso→primer contacto e ingreso→ganado; conteos por etapa, prioridad y responsable; seguimientos vencidos y de hoy.

## 5. Pantallas

Carpeta `src/components/modules/Crm/`. Rutas en `App.jsx`: `/crm` (layout con pestañas) y `/crm/oportunidades/:id` (ficha). Entrada en la barra lateral: «CRM», ícono `Target`.

1. **Dashboard** (`CrmDashboard.jsx`). Ocho tarjetas grandes en el orden del Excel más «aprobadas pendientes» y «seguimientos vencidos». Debajo, la tabla de prioridades inmediatas: leads rojos y vencidos ordenados por fecha, con empresa, contacto, etapa, semáforo, última gestión, próxima acción y fecha. Filtros de fecha, responsable, origen, prioridad y etapa aplican a todo el tablero.
2. **Oportunidades** (`CrmLeadList.jsx`). Tabla con empresa, contacto, etapa, semáforo, prioridad, responsable, próxima acción y fecha de seguimiento. Búsqueda y filtros persistidos en la sesión como en Gestión. Botón «Nuevo lead» abre un `SlideOver` con solo los campos esenciales; el resto se completa en la ficha.
3. **Ficha del lead** (`CrmLeadDetail.jsx`). Arriba: empresa, etapa (selector), semáforo con opción manual, responsable, próxima acción y fecha. Un bloque fijo «Registrar gestión» siempre visible. Pestañas: Datos de contacto, Oportunidad y propuesta (fechas, valor, enlace a cotización), Bitácora.
4. **Bitácora** (`CrmActivityTimeline.jsx`). Línea de tiempo cronológica con ícono por tipo, autor, resultado y siguiente paso. Los cambios de etapa aparecen como hitos.
5. **Seguimientos** (`CrmFollowUps.jsx`). Cuatro columnas o pestañas: Vencidos, Hoy, Esta semana, Sin fecha. Cada fila permite registrar la gestión sin salir de la vista, que a su vez pide la nueva fecha. Es la pantalla de trabajo diario de Franci.
6. **Reportes** (`CrmReports.jsx`, fase 2). Resultados por periodo, canal, responsable, etapa y conversión, con exportación.

Estilo: `PageHeader`, `tabs`, `Card`, `Badge`, `Select` compartido y `brain-popover-surface`, claro y oscuro. El rojo del semáforo usa únicamente el token destructivo global; verde y amarillo se agregan como tokens de estado en `index.css`. No existe tarjeta KPI compartida; se crea `CrmStatCard.jsx` siguiendo el estilo de `ManagerTaskAnalytics.jsx`.

## 6. Importación del Excel

Script `scripts/import-crm-excel.js`, ejecución manual y revisable, nunca desde la interfaz. Lee `CRM Maestro` y `Bitácora gestiones` con la librería `xlsx` ya instalada.

- Mapea etapas: «En preparación» → `CONTACTADO`; «Esperando RFP» y «Pendiente aprobación ajuste» → `ESPERANDO_CLIENTE`; «No respuesta / estancado» → `SIN_RESPUESTA`; «Cerrado / perdido» → `PERDIDO`; «Ganado / contratado» → `GANADO`.
- `enteredAt` = fecha publicación, si no fecha propuesta, si no última gestión, si no fecha de importación; marca `enteredAtEstimated = true` para que no contamine el promedio de velocidad de respuesta.
- Parte las observaciones con patrón `DD-MMM-YYYY:` en gestiones tipo `NOTA` con su fecha; el resto queda en `notes`.
- Carga la hoja Bitácora como gestiones, emparejando por nombre de empresa; lo que no empareje queda en un informe de salida para revisión.
- Responsable: «Francisco» y «Comercial» se mapean a miembros del roster con una tabla que Rodny confirma antes de correrlo.
- Es idempotente por `legacyCode`: se puede correr dos veces sin duplicar.
- Se ejecuta primero contra la base local; contra producción solo con confirmación explícita de Rodny.

## 7. Pruebas

Siguen `node --test` y las reglas de TDD de `AGENTS.md`.

- `tests/crmRules.test.js`: semáforo (cada regla y su precedencia), grupos de etapa, buckets de seguimiento en Bogotá con casos de borde a medianoche, embudo y promedios.
- `tests/crmSchema.test.js`: el inicializador es aditivo, transaccional, falla cerrado y está encadenado en `start` antes de `node server.js` (mismo patrón que `quotationProposalSchema.test.js`).
- `tests/crmService.test.js`: registrar gestión actualiza hitos del lead en una transacción; cambio de etapa exige motivo al perder; `requestId` repetido no duplica.
- `tests/crmRoutes.test.js`: sin permiso `crm` responde 403; `ADMIN` pasa.
- `tests/crmImport.test.js`: mapeo de etapas, partición de observaciones por fecha, idempotencia.
- `tests/crmComponentsCompile.test.js`: cada componente compila como JSX (patrón de `activityComponentsCompile.test.js`).
- `tests/crmPostgres.integration.mjs`: persistencia real contra el contenedor `127.0.0.1:55448 / recognition_test`, fuera del glob de `npm test`.
- `tests/browser/crm.mjs`: recorrido con API simulada y captura de pantalla del dashboard, la lista, la ficha y seguimientos, claro y oscuro, escritorio y móvil.

## 8. Orden de construcción

Fase 1, en cuatro PR pequeños para poder revisar y mergear cada uno:

1. **Base**: enum y modelos en Prisma, `ensure-crm-schema.js`, permiso `crm` en esquema, `Team.jsx` y `Sidebar.jsx`, `crmRules.js` con pruebas, API completa con pruebas. Sin pantallas todavía.
2. **Lista y ficha**: `CrmLayout`, `CrmLeadList`, `CrmLeadDetail`, `CrmActivityTimeline`, formulario de gestión. Captura de pantalla.
3. **Dashboard y seguimientos**: `CrmDashboard`, `CrmStatCard`, `CrmFollowUps`, filtros persistidos. Captura de pantalla.
4. **Importación**: script, pruebas, corrida local con el Excel real, informe de lo que no empareja, documentación de uso.

Fase 2, después de que Franci lo use una o dos semanas:

- Reportes por periodo, canal, responsable, etapa y conversión, con exportación.
- Recordatorios: notificación interna y push cuando un seguimiento vence o es hoy, reutilizando `Notification` y `pushNotificationController`.
- Tareas desde el lead: crear una tarea nativa de Gestión vinculada al lead.
- Puente con Cotizaciones: crear cotización desde la ficha y, al aceptarse la propuesta, pasar el lead a `APROBADA`.
- Puente con Clientes: al marcar `GANADO`, crear o vincular el `Client` y abrir la lista de verificación del protocolo de recepción (propuesta aprobada, contrato, datos de facturación, información base, accesos, canal, cronograma, reunión de inicio).
- Alerta de renovación previa al fin del servicio, según el plazo del protocolo (un mes para contratos anuales, quince días para trimestrales).

Fase 3, cuando haya datos suficientes:

- Bria: resumen del lead, sugerencia de próxima acción a partir de la bitácora, detección de oportunidades estancadas.
- Captura automática desde formulario web y WhatsApp.

## 9. Decisiones que conviene confirmar antes de la fase 1

Se puede empezar con estos supuestos; cambiarlos después cuesta poco si se avisa antes del PR 2.

- **Nombre y ubicación**: entrada «CRM» en la barra lateral, ruta `/crm`, permiso `crm` separado de `cotizaciones`.
- **Una sola entidad lead = oportunidad**, sin tablas aparte de empresa y contacto.
- **Moneda** por defecto COP; los 17 valores del Excel se importan como COP.
- **Umbrales del semáforo**: 7 días de vencimiento, 21 sin gestión, 3 seguimientos sin respuesta.
- **Quién es «Comercial»** en el Excel, para asignar responsable en la importación.
