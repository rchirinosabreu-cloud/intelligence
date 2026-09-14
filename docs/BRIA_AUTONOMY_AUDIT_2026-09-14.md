# Bria: autonomía real, integridad y siguiente etapa

Auditoría del 14 de septiembre de 2026. Base local `04dd681`, con cambios anteriores de Equipo aún sin commit/push. Consulta productiva de solo lectura iniciada a las 14:59 UTC (09:59 Bogotá), seguida de comprobaciones puntuales. Este documento no autoriza cambios operativos ni constituye un despliegue.

## Dictamen

Brainstudio tiene **automatización productiva real y análisis especializado**, no únicamente una demostración o un chat. La captura de reuniones y la revisión de parrillas funcionan sin una petición por cada ejecución. La revisión editorial es el ciclo de inteligencia más completo: detecta, conserva estado, recibe decisiones humanas y vuelve a verificar contra el contenido actual.

La autonomía es desigual. Minutas produce conocimiento y propuestas; Observer detecta condiciones; el radar personal ordena señales; reconocimientos y avisos ejecutan reglas. Todavía no existe un coordinador común que conecte un compromiso con su tarea, conserve quién autorizó actuar, supervise el resultado y escale solo las excepciones. La prioridad es cerrar ese circuito, no añadir otro asistente independiente.

Guardar JSON aporta estructura; indexarlo permite recuperar información. Ninguna de las dos cosas prueba, por sí sola, que una decisión sigue vigente, que corresponde al cliente consultado o que un compromiso ya se cumplió.

## 1. Alcance y método

- Lectura de arranque, programadores, servicios, rutas, esquema, consumidores de UI, pruebas y documentación de Bria, minutas, memoria, parrillas, criterios, Observer, radar personal, avisos, reconocimientos y puntos de entrada del chat.
- Contraste con la auditoría del 5 de septiembre, distinguiendo problemas corregidos y pendientes.
- Dos transacciones PostgreSQL `REPEATABLE READ READ ONLY`, con timeout y `ROLLBACK`, para recuentos, estados, errores guardados y cobertura. No se leyeron cuerpos de transcripciones ni se ejecutaron modelos, sincronizaciones, reintentos, notificaciones o cambios de datos.
- 124 pruebas existentes seleccionadas, 124 correctas, cero fallidas/omitidas. Base sustituida explícitamente por una URL local inválida y claves de IA ficticias. Son pruebas unitarias/de contratos y dobles, no una certificación de integración productiva.
- Cuatro pruebas diagnósticas adicionales sobre funciones reales con datos sintéticos, sin red ni base real. Confirman los comportamientos descritos abajo; no representan correcciones.
- Consulta de fuentes primarias sobre flujos de agentes, evaluaciones y entrega durable de eventos, utilizadas solo para orientar la propuesta.

Límites: no se realizó una nueva evaluación editorial con modelos y responsables, ni se comprobó cada objeto del almacenamiento, cada endpoint externo, el despliegue exacto o la configuración efectiva de todos los procesos. No se revisaron logs del proveedor para atribuir causas a errores genéricos. No se hizo una auditoría visual, WCAG, financiera, de backups o de seguridad integral. No se ejecutó la suite completa ni se repitió el build en esta auditoría. El código fue inspeccionado como candidato local; los recuentos de la base son evidencia productiva independiente.

La skill `audit` ayudó a ordenar evidencia y prioridades, pero su preparación visual depende de `frontend-design`, no disponible. Se complementó con las guías de backend, PostgreSQL y verificación. No se asigna una puntuación visual ni un porcentaje de autonomía sin medición.

## 2. Evidencia productiva actual

| Área | Observación | Interpretación correcta |
|---|---|---|
| Minutas | 49 READY activas; otras 3 READY en papelera | 49 fuentes activas, no 52 disponibles para contexto |
| Archivo JSON | Las 49 tienen referencias a transcripción y minuta JSON | Referencias persistidas; no se descargaron los 98 objetos para verificar su integridad |
| Memoria | 49 fuentes READY; 1.176 fragmentos, ninguno sin embedding; cero minutas READY activas sin indexar | Cobertura de indexación del conjunto activo actual, no precisión semántica demostrada |
| Cliente de la memoria | Las 49 fuentes tienen `clientId = null` | No hay asociación explícita por cliente en esas fuentes |
| Revisión editorial | 181 registros COMPLETED automáticos y 11 manuales | Resultados persistidos; no son 192 parrillas distintas ni el total de llamadas al modelo |
| Verificación | 321 hallazgos RESOLVED con resultado explícito de verificación | No demuestra que cada juicio sea editorialmente correcto; los otros cierres históricos no deben recibir esa certificación por inferencia |
| Hallazgos abiertos | 717 en 25 parrillas no finalizadas y no eliminadas | Es carga de revisión registrada, no 717 defectos verdaderos ni necesariamente contemporáneos |
| Observer | 8 señales de minutas OPEN, sin `lastActionById`; 284 señales históricas ARCHIVED | No hay interacción humana persistida en esas ocho; no se puede inferir que nadie las haya leído |
| Compromisos | 530 entradas en `actionItems` de las 49 minutas activas | No son 530 obligaciones pendientes: pueden repetirse, estar cumplidas o no haberse aceptado |
| Criterios editoriales | Cero registros actuales | La función existe, pero no hay reglas guardadas en `ClientEditorialCriterion` para alimentar revisiones en este corte; no demuestra que nunca se haya probado |
| Búsqueda de aprendizajes | Aristea: FAILED, checkpoint 1 de 10 lotes | Ejecución no completada; el error guardado no identifica la causa técnica exacta |

Incidencias concretas:

- Revisión FAILED después de tres intentos: **Nattal, octubre 2026; FoobeSpain, septiembre 2026; Aristea, julio 2026**. Las tres guardan el mensaje genérico de reintento manual. No se atribuye el fallo a tiempo, proveedor o volumen sin consultar evidencia adicional.
- Cuatro parrillas FINALIZADO conservan revisión PENDING y no tienen hallazgos VERIFYING. El programador las excluye; el estado mostrado no representa trabajo que vaya a ejecutarse automáticamente.
- Una minuta FAILED agotó tres intentos por `FIREFLIES_TRANSCRIPT_EMPTY`; no es prueba de una caída general del servicio.
- Solo tres minutas activas tienen las dos referencias PDF; 46 carecen de ellas y ya tienen los cuatro metadatos editoriales que hacen que el sincronizador las omita. Su memoria/JSON sí existe. El navegador puede tener otras presentaciones, pero el archivo PDF central no queda completo por esa vía.
- `AgencyContext`, la memoria antigua, contiene un registro APPROVED sin vector. No hay evidencia actual de que notas rechazadas se hayan utilizado desde esa tabla; el riesgo sigue presente en su consulta.

Comprobación defensiva: se observaron tipos de fecha con y sin zona en Observer. Se contrastaron directamente en SQL contra UTC y no había fechas de detección en el futuro. La conversión del cliente SQL no se reporta como un incidente del producto.

## 3. Mapa de capacidades: qué es automático y qué no

| Flujo | Disparador y trabajo real | Límite actual |
|---|---|---|
| Reunión → minuta | El servidor consulta al proveedor cada 10 minutos; analiza transcripción, genera resumen/decisiones/acciones/señales y persiste artefactos | No comienza exactamente al terminar la reunión: depende de que el proveedor tenga la transcripción y del siguiente ciclo |
| Minuta → memoria | Indexación tras procesar y conciliación cada 10 minutos; resumen y transcripción fragmentados; búsqueda semántica + textual | Recuerda documentos, no administra todavía decisiones vigentes y compromisos como entidades propias |
| Memoria → señales | Observer escanea cada 10 minutos, con línea base para no tratar reuniones antiguas como novedades | Dos familias: analítica de tareas y señales de minutas. No es un vigilante integral de todos los módulos |
| Parrilla → revisión | Cambios relevantes encolan; programador cada minuto con 45 segundos de espera tras cambios; misma coordinación para revisión manual | Diagnóstico y verificación, no edición/publicación autónoma |
| Hallazgo → comprobación | Corregido pasa a VERIFYING; análisis explícito con citas actuales, deshacer y publicación protegida | Verificación de IA no equivale a aceptación del responsable; conserva incertidumbre cuando falta evidencia |
| Feedback/notas → criterios | «Buscar aprendizajes» procesa fuentes del mismo cliente por lotes y crea propuestas con fuentes | Es bajo solicitud. No hay barrido por comentario. No incluye todavía minutas, Drive o conversaciones de tareas |
| Criterio → conocimiento aplicable | Responsable de origen, PM o admin decide; ámbito CLIENT/PLAN, versiones, historia e invalidación | No autoaprueba; actualmente no hay criterios persistidos en producción |
| Radar personal | Reglas sobre tareas vencidas/devueltas, clientes asignados, contexto faltante y parrillas | Orienta al abrir/refrescar el dashboard; no prepara y ejecuta un plan multietapa |
| Alertas y logros | Avisos de 15 horas/devoluciones, aplazamiento y reconocimiento ligado a transacciones reales | Son automatizaciones deterministas útiles, no aprendizaje de un modelo. La entrega de popups depende del runtime autenticado del usuario |
| Calendario | Sincronización programada y mecanismos de reciprocidad | Integración operativa de apoyo, no una IA que tome decisiones de agenda libremente |
| Reportes | Extracción y generación de narrativa a partir de datos aportados | No encontré en el arranque un ciclo mensual autónomo completo de recolectar, validar, producir y entregar todos los reportes |
| Chat/consultas | Chat usa Discovery; rutas antiguas usan AgencyContext/herramientas de Workspace | No comparten aún la política de recuperación de minutas y criterios de las parrillas |

Referencias principales: [arranque](C:/Proyectos/intelligence/server.js:185), [minutas](C:/Proyectos/intelligence/src/services/minuteAutomationService.js:235), [memoria](C:/Proyectos/intelligence/src/services/briaMemoryService.js:266), [revisiones](C:/Proyectos/intelligence/src/services/briaContentPlanReviewScheduler.js:48), [descubrimiento](C:/Proyectos/intelligence/src/services/briaCriterionDiscoveryService.js:25), [foco personal](C:/Proyectos/intelligence/src/services/personalDashboardService.js:222).

## 4. Hallazgos prioritarios

P1 significa corregir antes de ampliar la autonomía afectada; no necesariamente detener toda la plataforma. P2 es la siguiente etapa de fiabilidad/adopción. No se confirmó ningún P0.

### P1-01. El cliente y el propósito no están garantizados al recuperar memoria

**Evidencia:** `MeetingMinute` no tiene relación con cliente en el esquema; el indexador asigna `minute.clientId || null`. Las 49 fuentes productivas están sin cliente. La revisión pide fuentes sin ámbito y las acepta si su texto menciona el nombre/slug del cliente. La prueba sintética confirmó que una mención en contexto interno ajeno a lo editorial entra al prompt.

**Impacto:** omisión de acuerdos que no mencionen el nombre, mezcla entre clientes o usos indebidos de fragmentos internos. Es una debilidad demostrada de selección; no una filtración productiva confirmada.

**Propuesta:** asociación explícita y revisable de reunión/fragmento a uno o varios clientes, clasificación de propósito/sensibilidad y acceso por actor/recurso. Una coincidencia de nombre solo puede sugerir la asociación. Minutas internas, financieras y personales no deben convertirse en contexto editorial por contener un nombre comercial.

**Aceptación:** casos de clientes homónimos, reunión multicliente, usuario sin permiso y mención incidental no producen exposición cruzada; lo ambiguo solicita clasificación.

Ubicación: [modelo](C:/Proyectos/intelligence/prisma/schema.prisma:126), [indexador](C:/Proyectos/intelligence/src/services/briaMemoryService.js:94), [filtro y recuperación](C:/Proyectos/intelligence/src/services/briaContentPlanReviewService.js:91).

### P1-02. Existen rutas de conocimiento con controles distintos

**Evidencia:** chat → Discovery; minutas/parrillas → BriaMemory; rutas antiguas → AgencyContext. `searchContext` y el perfil de cliente no filtran APPROVED. El filtro posterior admite ausencia de `status`, precisamente un campo no seleccionado por la consulta. Embeddings fallidos pueden sustituirse por un vector de ceros. La pantalla antigua BrainCore no es la ruta activa `/manager`, pero sus endpoints siguen montados.

**Impacto:** una misma pregunta puede utilizar conocimiento diferente según dónde se haga; restaurar la pantalla antigua o ampliar sus consumidores reintroduciría el problema de aprobación. Sus herramientas de Workspace reciben argumentos del modelo sin una política común por recurso/usuario; no se verificó aquí qué documentos permiten las credenciales externas.

**Propuesta:** contrato común de contexto y herramientas: actor, cliente, propósito, permiso vigente, estado de aprobación, fuente/versionado y límite de lectura. Migrar o retirar de forma explícita los caminos antiguos, sin mezclar vectores de dimensiones distintas ni reindexar silenciosamente.

Ubicación: [chat](C:/Proyectos/intelligence/src/controllers/chatController.js:103), [búsqueda antigua](C:/Proyectos/intelligence/src/services/brainCoreService.js:95), [perfil](C:/Proyectos/intelligence/src/services/brainCoreService.js:437), [ruta activa](C:/Proyectos/intelligence/src/App.jsx:157).

### P1-03. Observer no comprueba la resolución operativa

**Evidencia:** `upsertDetection` convierte RESOLVED en OPEN ante la misma clave; `resolveMissing` resuelve todo lo ausente del detector, aunque el lector solo toma 500 minutas. Ambas conductas fueron reproducidas con dobles. Resolver guarda último actor/fecha, no una historia completa ni una condición de cumplimiento.

**Impacto:** un aviso atendido puede reaparecer por releer el mismo documento; al crecer el conjunto, una fuente no examinada podría interpretarse como resuelta. Con 49 minutas activas no se alcanzó el límite en producción.

**Propuesta:** separar decisión humana, verificación y recaída. Relacionar cada caso con objetos operativos y evidencia/versiones. Reconciliar solo el alcance leído completamente. Una nueva apertura necesita evidencia nueva o condición objetiva persistente, no una simple relectura.

Ubicación: [reapertura](C:/Proyectos/intelligence/src/services/briaObserverService.js:138), [resolución por ausencia](C:/Proyectos/intelligence/src/services/briaObserverService.js:149), [ventana](C:/Proyectos/intelligence/src/services/briaObserverService.js:178).

### P1-04. Minutas y memoria no tienen la misma robustez de ejecución que parrillas

**Evidencia:** minutas consulta solo `listTranscripts(limit, 0)` con 50 por defecto; no hay avance paginado persistente. Su exclusión de concurrencia vive en el proceso, no en un reclamo compartido por registro. La llamada a Fireflies no tiene timeout explícito. Memoria recorre por defecto las últimas 500 filas, sin cursor de recuperación ni control de publicación contra una versión reclamada.

**Impacto:** tras una parada larga puede quedar material fuera de la ventana; una petición detenida bloquea el ciclo de ese proceso; varios procesos pueden analizar la misma minuta o competir al indexarla. Son riesgos de continuidad/concurrencia; no se reprodujeron con producción ni se comprobó cuántas réplicas están activas.

**Propuesta:** extender el patrón de parrillas: trabajo persistido por fuente/versión, reserva con vencimiento, timeout, reintento acotado, checkpoint, estado terminal visible y publicación condicionada. La recuperación de artefactos no debe obligar a pagar otra vez todo el análisis.

Ubicación: [lote de minutas](C:/Proyectos/intelligence/src/services/minuteAutomationService.js:352), [HTTP del proveedor](C:/Proyectos/intelligence/src/services/firefliesService.js:3), [conciliación de memoria](C:/Proyectos/intelligence/src/services/briaMemoryService.js:215).

### P1-05. Una nueva fuente no invalida automáticamente todo resultado que depende de ella

**Evidencia:** las revisiones se invalidan al editar parrillas/criterios; los flujos de minutas/memoria no notifican esos cambios a los consumidores. Antes de publicar se revalidan la parrilla y los criterios aprobados, pero no la vigencia/versiones de todas las fuentes recuperadas. La búsqueda sí excluye minutas retiradas al momento de leerlas.

**Impacto:** una revisión puede seguir como CURRENT pese a nuevos acuerdos relevantes, o terminar con una instantánea de una fuente retirada durante el análisis. No se observó un caso productivo concreto.

**Propuesta:** registrar dependencias de evidencia y eventos de fuente añadida/modificada/retirada. Revalidar antes de publicar; invalidar resultados afectados, no recalcular toda la agencia cada diez minutos. Definir además qué significa «vigente» cuando dos reuniones se contradicen.

Ubicación: [guardia de publicación](C:/Proyectos/intelligence/src/services/briaContentPlanReviewService.js:127), [recuperación](C:/Proyectos/intelligence/src/services/briaContentPlanReviewService.js:299), [indexación](C:/Proyectos/intelligence/src/services/briaMemoryService.js:165).

### P1-06. JSON de minuta válido no significa conocimiento validado

**Evidencia:** `parseMinuteAnalysis` solo parsea JSON; acepta `{}`. Se solicita esquema al proveedor, pero no hay una validación propia equivalente a la de citas/identidades del extractor de criterios. `knowledgeItems.evidence`, responsables y fechas pueden persistirse sin comprobarse contra transcripción/equipo. Observer tiene fallbacks de evidencia al resumen cuando falta una cita.

**Impacto:** una respuesta formalmente legible puede transformarse en memoria o señal sin respaldo suficiente. La prueba confirma el parser permisivo; no demuestra que las 49 minutas sean incorrectas.

**Propuesta:** validar estructura, completitud, citas literales y origen antes de indexar. Separar afirmación, propuesta y decisión; mantener responsable ambiguo sin asignar; preservar fecha relativa y su interpretación. Los textos de reuniones son datos, nunca autoridad para ejecutar herramientas.

Ubicación: [parser](C:/Proyectos/intelligence/src/services/minuteAutomationService.js:91), [procesamiento](C:/Proyectos/intelligence/src/services/minuteAutomationService.js:270), [detecciones](C:/Proyectos/intelligence/src/services/briaObserverService.js:43).

### P2-01. Los compromisos todavía no tienen ciclo propio

El JSON de `actionItems` no conserva un ID de compromiso, tarea vinculada, aceptación, responsable oficial resuelto, versión ni verificación. La UI enumera las acciones. Es una capacidad pendiente, no un error de creación de tareas: el prompt dice expresamente que son propuestas.

Convertir la extracción en compromisos revisables; primero buscar tarea existente, después proponer creación o vínculo. No convertir en masa las 530 entradas históricas en tareas. [Presentación actual](C:/Proyectos/intelligence/src/components/modules/Minutes/AutomaticMinutesPanel.jsx:217).

### P2-02. La recuperación de fallos no ofrece suficiente explicación

Los tres trabajos editoriales agotados y la búsqueda de Aristea fallida requieren atención explícita. Se conserva el checkpoint de descubrimiento, pero el mensaje guardado no explica la causa. Los cuatro estados PENDING de parrillas finalizadas no corresponden a la selección del programador. Normalizar estados y añadir diagnóstico técnico privado por intento, mensaje humano y recuperación dirigida. No reintentar todo indiscriminadamente.

Verificar también el coste de volver a comprobar todos los hallazgos abiertos: el verificador trabaja de cuatro en cuatro repitiendo contexto, dentro de un trabajo de cuatro minutos. Es una posible presión de coste/tiempo, **no una causa confirmada de los tres fallos**. [Verificación](C:/Proyectos/intelligence/src/services/briaFindingVerification.js:48), [trabajos](C:/Proyectos/intelligence/src/services/briaContentPlanReviewScheduler.js:13).

### P2-03. Memoria editorial implementada, pero todavía sin evidencia de adopción sostenida

Cero criterios actuales y un descubrimiento incompleto significan que el gobierno editorial está construido, pero no que exista un conjunto vigente de preferencias aprobadas. Las revisiones sí pueden usar instrucciones del cliente, notas y memoria histórica; no están necesariamente «sin contexto».

Practicar con pocos clientes y decisiones reales, medir si el responsable entiende/aprueba/ajusta la propuesta y cuántas falsas alarmas evita. La ausencia de datos actuales no demuestra desinterés del equipo ni inexistencia de pruebas anteriores. [Gobierno de criterios](C:/Proyectos/intelligence/src/services/briaClientCriterionService.js:43).

### P2-04. Falta medir el coste y el resultado de cada intervención

El generador de revisiones recoge uso/latencia por llamada, pero el servicio productivo no conserva `calls` en el resultado persistido. Minutas guarda modelo/request ID, no un coste consolidado ni impacto. Descubrimiento guarda progreso, no toda la trazabilidad de intentos. Los logs humanos son valiosos y deben seguir limpios; la salud técnica necesita un registro separado.

Medir coste por resultado útil, latencia, cobertura, reintentos, tasa de propuestas aceptadas/ajustadas, tiempo hasta resolver y omisiones. No interpretar cantidad de acciones, tokens o horas abiertas como productividad. [Métricas del generador](C:/Proyectos/intelligence/src/services/briaContentPlanReviewGenerator.js:60), [persistencia](C:/Proyectos/intelligence/src/services/briaContentPlanReviewService.js:325).

### P2-05. Archivo PDF histórico incompleto

Las 46 minutas sin par PDF quedan fuera de la regeneración al tener metadatos editoriales. Drive solo publica los archivos cuya clave exista; no hay reparación de PDF en la lectura. Proponer backfill acotado desde el JSON existente, separado de reanálisis y previa confirmación del alcance. No afecta a la cobertura de memoria ya comprobada. [Omisión](C:/Proyectos/intelligence/src/services/minuteAutomationService.js:237), [Drive](C:/Proyectos/intelligence/src/services/driveService.js:119).

### P2-06. «Predicción» y foco necesitan resultados observables

La analítica actual es descriptiva y de umbrales; `readyForPrediction` se vuelve true desde diez sesiones, lo cual no valida un predictor. El radar personal da orientación, pero no un caso coordinado con plan y seguimiento. Integrar calendario/disponibilidad y dependencias reales antes de proponer fechas o capacidad, y comparar cualquier predicción con una regla simple sobre muestras adecuadas. [Analítica](C:/Proyectos/intelligence/src/services/managerTaskAnalyticsService.js:112), [radar](C:/Proyectos/intelligence/src/services/personalDashboardService.js:264).

### P3-01. La documentación debe distinguir infraestructura, uso y resultados

Algunos documentos registran pruebas/pilotos anteriores y promesas como «conocimiento canónico» o «predictivo». No deben usarse como prueba de aceptación humana o estado productivo actual. Mantener un inventario vivo con disparador, fuentes, permisos, última ejecución, fallos y criterio de éxito; este informe es una fotografía, no ese monitor.

## 5. Qué sí mejoró respecto al 5 de septiembre

- La revisión de parrillas ya tiene lease compartido, timeout, intentos acotados, recuperación de RUNNING vencido, checkpoints y coordinación manual/automática.
- La huella y el análisis incluyen piezas activas y textos completos por lotes; no se mantiene el recorte de 60 piezas como alcance productivo.
- No se certifica una corrección por ausencia en otra respuesta: se piden resultados explícitos y citas contra la versión actual.
- Criterios con permisos, ámbitos, historial, propuestas de IA y deduplicación ya están implementados; la aprobación no depende de una persona fija.
- El puntaje candidato sigue separado del productivo; eso protege frente a promover una rúbrica sin evaluación humana suficiente.
- Avisos/logros y trazabilidad humana aportan una base de identidad, deduplicación y confirmación que conviene reutilizar.

Persisten las brechas de contexto común, estado operativo de señales y continuidad de minutas/memoria. No se puede dar por cerrada la auditoría anterior solo por haber completado el bloque de parrillas.

## 6. Ruta propuesta

### Bloque A — confiabilidad y conocimiento autorizado

1. Diagnosticar los trabajos fallidos con sus logs técnicos, sin inventar causa; permitir recuperación dirigida y estados honestos para finalizadas.
2. Corregir reapertura/lectura parcial de Observer y validar semánticamente las minutas.
3. Introducir relación explícita de fuentes con cliente/propósito, retirada/versionado y acceso. Unificar consumidores progresivamente mediante adaptadores.
4. Extender trabajos durables e instrumentación a minutas/memoria. Usar los servicios/PostgreSQL existentes como primera opción; no requiere otra plataforma.

**Puerta:** fuentes retiradas o no autorizadas nunca entran en nuevos resultados; una ejecución puede recuperarse sin duplicar efectos; fallos no aparecen como «todo bien».

### Bloque B — Bria coordina compromisos (primer piloto de nueva autonomía)

Reunión procesada → compromisos candidatos → comparación con tareas existentes → revisión por responsable/PM → creación o vínculo confirmado → seguimiento → cierre comprobado o excepción.

Cada compromiso propuesto conserva fuente/cita, cliente, dueño oficial o incertidumbre, fecha explícita o propuesta, versión, tarea relacionada y criterio de cumplimiento. Toda acción registra quién o qué política la autorizó. Una petición repetida no duplica tareas. Si alguien cambia el trabajo antes de confirmar, se revalida.

Primero operar en modo observación/borrador con reuniones nuevas desde una fecha de corte, dos o tres clientes y una muestra acotada —por ejemplo 20–30 compromisos—. Los responsables valoran utilidad y omisiones; el PM revisa ambigüedades. Los valores son una propuesta de piloto, no un resultado ni una autorización para crear tareas.

La condición de cumplimiento no siempre es «Task = REALIZADA»: enviar, recibir aprobación o publicar requieren su evidencia correspondiente. Si se reabre una tarea, registrar el cambio sin sobrescribir la historia de cumplimiento anterior.

### Bloque C — foco diario que prepara trabajo

Reutilizar Radar de foco y Gestión para presentar pocas decisiones prioritarias: qué ocurrió, a quién afecta, evidencia y acción preparada. Integrar permisos/calendario de disponibilidad y dependencias. Ejemplo sintético: «Este compromiso vence mañana; encontré la tarea, falta el insumo acordado y preparé el seguimiento para que lo revises».

El coordinador debe cerrar y agrupar avisos de la misma causa, respetar aplazamientos y evitar repeticiones en dashboard, popups y notificaciones. Escalar al PM solo cuando venza un acuerdo real o falte una decisión. No cambiar responsables, plazos comprometidos o prioridades sensibles sin la política autorizada.

### Bloque D — aprendizaje editorial y otros ciclos

Con datos de uso reales, habilitar propuestas de criterios ante feedback nuevo mediante cola y presupuesto, conservando aprobación humana. Convertir acuerdos editoriales pertinentes de minutas en propuestas, no reglas autoaprobadas.

Después, extender el patrón a preparación de reportes y pulso de clientes. Las operaciones financieras siguen en modo análisis/propuesta y sus permisos propios; un acuerdo en una reunión nunca autoriza mover dinero, modificar nómina o crear un cobro.

## 7. Contrato mínimo para cualquier autonomía nueva

- **Disparador verificable:** evento confirmado o revisión periódica con alcance/cursor conocido.
- **Contexto autorizado:** cliente, actor, propósito, fuente, versión y vigencia; datos financieros/personales separados.
- **Acción acotada:** herramienta con parámetros validados, dueño, condición de éxito y nivel de autorización.
- **Trabajo durable:** clave de idempotencia, lease, timeout, reintentos limitados y recuperación.
- **Confirmación:** resultado real en la aplicación; no basta que el modelo diga que actuó.
- **Supervisión:** pausa/cancelación por flujo, presupuesto y reversión cuando la acción lo permita; no prometer deshacer comunicaciones ya enviadas.
- **Aprendizaje revisado:** resultados y decisiones útiles alimentan propuestas con procedencia, no cambios silenciosos de reglas.

Un registro transaccional de eventos pendientes puede evitar perder el paso «minuta guardada → programar siguiente trabajo». Necesita consumidores idempotentes: el patrón no promete ausencia de duplicados por sí solo. Esta aplicación al monolito es una propuesta de arquitectura, no una obligación de migrar a AWS. [Referencia primaria: transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

## 8. Cómo sabremos que estamos operando mejor

| Medida | Qué observar |
|---|---|
| Captura | Reuniones disponibles frente a procesadas/indexadas, con antigüedad y fallos visibles |
| Calidad del compromiso | Propuestas correctas, ajustes, rechazos, ambigüedades y compromisos omitidos, adjudicados por humanos |
| Duplicación | Tareas propuestas/creadas que ya existían; pruebas de repetición/reinicio sin doble efecto |
| Seguimiento | Tiempo desde acuerdo hasta tarea aceptada y hasta cumplimiento comprobado |
| Ruido | Avisos repetidos, aplazados y descartados; causas agrupadas |
| Calidad editorial | Falsos positivos y omisiones, correcciones verificadas y tiempo de revisión comparable |
| Coste | Uso y latencia por flujo/resultado útil, no solo total de llamadas |
| Adopción | Personas que completan el recorrido y lo consideran útil, sin confundir clics con rendimiento individual |

Definir metas tras medir la línea base y aprobarlas con el equipo. Las barreras de seguridad —autorización, aislamiento y ausencia de dobles efectos en pruebas— no se sustituyen por un promedio alto de satisfacción. Un estado final verificable pesa más que una respuesta convincente; la evaluación combina pruebas de código, casos reales y criterio humano. [Referencia primaria: evaluación de agentes](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

## 9. Decisión recomendada

Mantener una sola Bria de cara al equipo, con políticas y evidencia comunes, especializada por flujo. El siguiente producto concreto es **coordinación de compromisos**, precedido por las correcciones del Bloque A. El enfoque incremental y de flujos delimitados evita complejidad que todavía no ha demostrado utilidad; coincide con el principio de aumentar autonomía solo cuando aporta valor medido. [Referencia primaria: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

Al finalizar esta auditoría no se cambiaron datos productivos, lógica de aplicación, esquemas, automatizaciones ni permisos, y no se hizo push. Se creó este informe y un diagnóstico local ignorado por Git. Los cambios anteriores de Equipo siguen pendientes de publicación independiente.

Evidencia local: [salida de 124 pruebas](C:/Proyectos/intelligence/output/bria-autonomy-audit-tests.log), [cuatro pruebas diagnósticas](C:/Proyectos/intelligence/output/bria-autonomy-probes.mjs), [ruta previa](C:/Proyectos/intelligence/docs/BRIA_INTEGRITY_AND_ROADMAP_2026-09-05.md).
