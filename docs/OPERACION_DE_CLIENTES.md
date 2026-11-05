# Operación de clientes

Decisión de Rodny, 1 y 2 de octubre de 2026: dejar el Excel «PENDIENTES BRAIN STUDIO 2026» y trabajar en la plataforma. **Lo que dice la plataforma es lo que se refleja en la operación.**

## Alcance categorizado (5 de noviembre de 2026)

En Clientes → Operación → ficha del cliente → Editar se puede describir el contrato con campos opcionales:

- Límites por formato (video, reel, carrusel, post u otro), distinguiendo cantidad exacta, mínimo y máximo.
- Cupos compartidos entre formatos: por ejemplo, seis contenidos entre post, carrusel y reel, o hasta seis reels/videos en conjunto. La cantidad pertenece al grupo; no se atribuye a cada formato ni se suma nuevamente al cupo mensual.
- Historias por semana, por mes o días de publicación por semana, con cantidad por ocasión cuando se conoce.
- Producción incluida, no incluida o por confirmar; jornadas por mes o por contrato y horas por jornada. El límite de horas es independiente del número de jornadas.
- Servicios adicionales categorizados: blog, web, comunidad, marcas, perfiles y otros, con cantidad, unidad y frecuencia.
- Datos pendientes de confirmar, visibles en la ficha.

El cupo mensual que ya usa el semáforo sigue en las piezas contratadas. Estos detalles no convierten máximos en objetivos, no cuentan días como historias y no suman servicios adicionales a las piezas. Un valor pendiente es distinto de cero. El estado activo/inactivo del cliente tampoco se deduce de un color o una nota: se cambia expresamente en Directorio → opciones → Desactivar/Reactivar, con confirmación y conservando el historial.

Los contratos existentes mantienen sus valores, notas, responsables y avance. Esta entrega no importa la revisión de MIO ni aplica las diferencias comerciales pendientes. No añade un selector de fuente ni una sincronización con el Excel. Los datos de revisión y las capturas con información real permanecen locales.

Persistencia: `ClientContract.scopeDetails`, JSONB opcional añadido de forma idempotente. `normalizeContractScope` valida los campos antes de guardar. Omitir el campo en una edición conserva lo guardado; `null` lo retira expresamente. Una renovación sin alcance explícito no lo hereda del contrato anterior. No se reescriben contratos previos ni cuotas al leer la ficha.

`scopeDetails.contentGroups` amplía la versión 1 de forma opcional: cada grupo conserva `formats`, `quantity` y `rule`. Los alcances anteriores siguen siendo válidos. Cuando un grupo exacto explica todo el cupo, la ficha muestra los formatos compartidos y evita presentar ese cupo como desconocido. Un faltante parcial sigue visible como «Sin clasificar». Bria conserva los mismos grupos, límites y unidades al leer la operación.

La corrección puntual de clasificación autorizada el 5 de noviembre se prepara fuera del producto, con la hoja como evidencia de una sola revisión y contraste con cada contrato actual. No introduce importador ni sincronización. Conserva cupos, responsables, estados, vigencias, notas, jornadas e historial; una frecuencia de días con historias no se convierte en cantidad de historias. Las correcciones y su recibo de aplicación permanecen en archivos privados locales, separados del código.

Contratos de prueba: `tests/clientContractScope.test.js`, `tests/clientContractScopeUi.test.js` y `tests/browser/clientActivation.mjs`, junto con las pruebas existentes de operación y permisos. Las pruebas de persistencia usan únicamente PostgreSQL local aislado.

## Qué reemplaza

| Excel | Plataforma |
|---|---|
| Cliente, Definición, Link de Instagram | Ficha operativa |
| Fecha de inicio y terminación | Contrato: vigencia (avisa si vence o venció) |
| Contenidos, Servicio | Contrato: piezas por formato y nota libre |
| Producción / jornadas, historias | Contrato: jornadas al mes, historias por semana |
| Project manager, CM, Responsable | Ficha operativa: `projectManagerId` y `responsibleId` |
| Agencia (BRAIN/MIO), Nivel de complejidad | Ficha operativa, filtro del tablero |
| Informe MES | Informe entregado por mes, con quién y cuándo |
| Estado, % del mes, estados de redacción/diseño/aprobación/programación | Calculado con la parrilla |
| Comentario (INDICADORES) y OBSERVACIONES (MIO) | Sección «Observaciones» de cada cliente, con su origen; la última también en el tablero |
| Bloque HISTORIAS (MIO) | Contrato: historias por semana |
| Stand by / Servicios | Estado «Stand by» y tipo «Servicios» |
| Colaborador / Acción destacada / Clientes a cargo | Pestaña «Equipo», con la acción destacada editable |
| Hojas de enero, febrero y marzo | Gestión |
| Estado de pauta | Fuera de alcance (decisión de Rodny) |

## Cómo se calcula

- El ciclo de una parrilla va del día de corte al día anterior del mes siguiente; con corte 1 es el mes calendario. La parrilla del mes M es la `ContentPlan` de ese mes.
- Cada pieza llega a una etapa según lo que tiene (`pieceStage`): texto escrito → redactada; pieza final → diseñada; aprobada por el cliente → aprobada; con «Programar» en Meta → programada; `PUBLICADO` → publicada.
- El semáforo y sus motivos: `evaluateClientOperation` en `src/lib/clientOperations.js`. Umbrales: más de 3 días entre publicaciones, rojo sin parrilla desde el día 5, aviso de contrato a 30 días.

## Quién la ve

Administradores y project managers: pestañas «Operación» y «Equipo» en Clientes y la página `/clientes/operacion/:slug`. El resto del equipo ve el directorio.

## El Excel ya se cargó (2 de octubre de 2026)

El Excel se cargó una sola vez y el Excel se abandona: no hay función de carga en la plataforma y el script que lo hizo se retiró. Reglas que se siguieron, por si alguien revisa los datos:

- La plataforma mandó: el Excel solo llenó campos vacíos, nadie que ya tuviera contrato recibió otro, no se crearon clientes y no se tocaron los archivados. Se emparejó primero con las fichas activas («Corporación Titanes», no la «Titanes» archivada).
- Resultado: 34 fichas completadas, 33 contratos (`source = 'EXCEL'`), 52 observaciones (`source = 'EXCEL'`, con su columna de origen) y la acción destacada de Helen y Sara. Jarlan y Camila ya no estaban activos en el equipo.
- Lo que no se adivinó y conviene revisar en cada ficha: el día de corte (quedó en 1; Mimas, Titanes, Félix y Aristea empiezan otro día), «carretes» (se leyeron como carrusel), contenidos sin desglose (formato «Otro») y vigencias sin dos fechas (el contrato arranca el 1 de octubre de 2026).
