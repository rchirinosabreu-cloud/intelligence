# Brainstudio: integridad, Bria y ruta al siguiente nivel

Fecha: 5 de septiembre de 2026. Auditoría de código sobre `main`, base `9dd5c16`, más el ajuste pendiente de popovers. Documento de diagnóstico y propuesta: **no constituye autorización ni implementación de la nueva arquitectura**.

Seguimiento, 6 de septiembre: fiabilidad, cobertura, verificación de hallazgos y gobierno de criterios tienen bloques implementados; esto no certifica cerradas todas las brechas de la auditoría. El nuevo bloque local de [aprendizajes editoriales](BRIA_CRITERION_DISCOVERY.md) propone criterios desde feedback, notas internas y piezas aprobadas, previa solicitud y sin autoaprobación. Siguiente puerta: validación editorial con responsables, calibración del puntaje candidato y después extracción por cambios. La unificación completa de contexto y los flujos de reuniones/foco siguen pendientes.

Actualización posterior: el ajuste de popovers se publicó en `a2d4cfc`. Tras autorización del usuario se inició el primer bloque de fiabilidad de revisiones de parrillas y la limpieza de herramientas del repositorio. Su alcance y límites se registran en [Fase 1: revisiones fiables](BRIA_PHASE_1_REVIEW_RELIABILITY.md) y [Skills del proyecto](AGENT_SKILLS.md). Las cifras y hallazgos siguientes corresponden a la auditoría inicial, no al cierre de todas las fases.

## Conclusión ejecutiva

Brainstudio ya tiene una base operativa importante y piezas reales de inteligencia. El siguiente salto no requiere empezar otra plataforma ni añadir varios agentes independientes: requiere **unificar el contexto, cerrar el ciclo entre detectar y resolver, y demostrar utilidad en el trabajo diario**.

Actualmente conviven tres rutas de conocimiento: el chat con Discovery, Brain Core con `AgencyContext`, y la memoria nueva de Bria utilizada en revisiones de parrillas. Observer añade señales, pero todavía no es un coordinador autónomo que verifique resultados. Esto explica por qué disponer de mucha información no equivale a tener una IA que comprenda y gestione toda la agencia.

La dirección recomendada es una Bria con una identidad y políticas comunes, varios modos de trabajo por especialidad, memoria verificable y herramientas limitadas por permisos. Debe saber qué sabe, qué está vigente, qué desconoce y qué necesita autorización humana.

## Alcance y evidencia de integridad

Se inspeccionaron servicios, controladores, esquema, rutas, tareas programadas, componentes, pruebas, CI y documentación. Se ejecutaron verificaciones locales y se renderizó una muestra de los componentes de popover con datos de ejemplo, sin modificar datos operativos.

| Comprobación ejecutada | Resultado |
|---|---|
| `npm test`, después del ajuste pendiente | 801 pruebas: 799 correctas, 2 omitidas, 0 fallidas |
| `npm run lint` | Correcto |
| `npm run build` | Correcto; conserva advertencias de tamaño y dependencias |
| `npm audit --omit=dev --json` | 0 vulnerabilidades reportadas por el registro consultado |
| Nueva regresión de popovers | Fechas conservadas desde el servicio, valores inválidos seguros, zona Bogotá, final exclusivo de eventos de día completo y posición en ancho reducido |

**Límites importantes:** las dos pruebas omitidas requieren una base de datos de pruebas. Parte de la suite comprueba contratos de código/compilación, no recorridos completos. No se auditó la base productiva, restauración de backups, configuración efectiva de producción, sincronización real con Google ni calidad de respuestas reales de modelos. No se midieron Core Web Vitals, tasa de adopción ni tiempo ahorrado en usuarios reales. Cero avisos de dependencias no significa seguridad integral. Los riesgos siguientes son verificables en código; no se presentan como incidentes observados en producción.

## Lo construido que debemos conservar

| Capa | Capacidades existentes | Brecha principal |
|---|---|---|
| Operación | Tareas, ciclos/sesiones, responsables, historial, parrillas vinculadas y calendario | Medir recorridos completos y comprobar integraciones en un entorno aislado |
| Captura | Fireflies, transcripción, análisis estructurado, minutas y artefactos PDF | Identificación fiable del cliente y cobertura de otras fuentes |
| Memoria Bria | Fragmentos con evidencia, búsqueda semántica/textual, exclusión de minutas eliminadas | Drive general no está incorporado en esta memoria; falta conocimiento vigente/versionado |
| Revisión de parrillas | Resultado compartido, puntuación calculada en servidor, revisión ligada al contenido, acciones sobre hallazgos | Cobertura total, coordinación de ejecuciones y evaluación de criterio |
| Observer | Señales de analítica de tareas y minutas, deduplicación, historial, aplazamiento y separación de reuniones antiguas | Relacionar señal con responsable/objeto/acción y comprobar resolución real |
| Trazabilidad | Eventos operativos, identificadores de peticiones y estados de procesos | Coste, latencia, evidencia utilizada y resultado de cada intervención de Bria |

Hay decisiones acertadas: servidor como autoridad de estado, transacciones para tareas vinculadas, `completedAt` preservado, importación idempotente, revisión compartida en lugar de un resultado distinto por usuario, exclusión de reuniones históricas como alertas nuevas, almacenamiento privado y CI con PostgreSQL/pgvector. Deben protegerse con regresiones durante la evolución.

## Hallazgos priorizados

Registro: **0 P0 confirmados, 5 P1, 7 P2 y 1 P3**. P1 = atender antes de ampliar autonomía; P2 = siguiente etapa; P3 = mantenimiento. No confundir severidad de arquitectura con una vulnerabilidad explotada.

### P1 — confianza y consistencia

**P1-01. La memoria antigua no respeta la aprobación al recuperar contexto.**

- Evidencia: `src/services/brainCoreService.js:95` construye una consulta que no filtra `status` ni lo selecciona. En `:167`, el filtro posterior permite registros sin `status`. `askBrainCore` también usa esa búsqueda.
- Impacto: información pendiente o descartada puede alimentar respuestas; una aprobación deja de funcionar como barrera fiable.
- Acción: filtrar aprobación en origen, validar autorización/cliente en cada consumidor y añadir casos negativos para PENDING/DISCARDED. Revisar además el fallback a vectores de ceros ante errores de embeddings (`:14`), que oculta una indexación fallida.
- Aceptación: ninguna respuesta ni perfil generado usa material excluido/no aprobado; los fallos de indexación quedan visibles y reintentables.

**P1-02. El mismo asistente no comparte una política única de conocimiento.**

- Evidencia: `src/controllers/chatController.js:3` usa Discovery; `src/services/brainCoreService.js:337` usa `AgencyContext`; `src/services/briaContentPlanReviewService.js:334` usa `searchBriaMemory`. Los vectores son de 3072 y 1536 dimensiones respectivamente.
- Impacto: resultados distintos según el punto de entrada; no puede garantizarse globalmente vigencia, permisos y retirada de fuentes. La búsqueda de memoria nueva sí valida fuentes activas y minutas no eliminadas (`briaMemoryService.js:283`).
- Acción: un contrato común de contexto que reciba usuario, cliente, propósito y momento; adaptadores temporales, migración y reindexación controladas. No mezclar directamente vectores incompatibles. La coincidencia por nombre de cliente del fallback (`briaContentPlanReviewService.js:174`) no debe sustituir una relación explícita ni un control de acceso.
- Aceptación: chat, revisión y Observer usan la misma política de fuentes permitidas; pruebas de clientes homónimos, reuniones multicliente y documentos retirados.

**P1-03. Las revisiones automáticas pueden quedar detenidas o competir con revisiones manuales.**

- Evidencia: `src/services/briaContentPlanReviewScheduler.js:19` selecciona PENDING y reclama RUNNING; no recupera RUNNING vencidos tras una caída, ni reintenta FAILED automáticamente. `src/routes/api/content.js:88` ejecuta manualmente con `force: true` fuera de ese reclamo. La petición base al proveedor (`openAIClient.js:164`) no fija timeout explícito.
- Impacto: revisión que no termina, consumo duplicado y posibilidad de publicar resultados calculados sobre versiones diferentes.
- Acción: trabajo durable con arrendamiento temporal, timeout, reintento acotado, clave de idempotencia y una misma coordinación manual/automática. Publicar solo si la versión analizada sigue siendo la vigente.
- Aceptación: pruebas de reinicio a mitad del trabajo, timeout, doble clic, dos usuarios y edición concurrente; sin procesos bloqueados ni sobrescritura silenciosa de resultados actuales.

**P1-04. Resolver un hallazgo no equivale a demostrar que desapareció su causa.**

- Evidencia: `src/services/briaObserverService.js:138` convierte RESOLVED en OPEN cuando reaparece la detección. En minutas, se vuelve a leer una señal del documento, no el resultado operativo de la corrección.
- Impacto: avisos ya atendidos pueden regresar, erosionando confianza y generando fatiga.
- Acción: distinguir resuelto por persona, verificado y reaparecido por evidencia nueva. Asociar hallazgo a objeto/versión y definir una condición de resolución, no solo un estado visual.
- Aceptación: una misma evidencia no reabre un caso resuelto; una recaída comprobable sí puede producir un nuevo evento explicado.

**P1-05. Observer puede interpretar una lectura parcial como desaparición de una señal.**

- Evidencia: `briaObserverService.js:178` limita la lectura a 500 minutas; `resolveMissing` (`:149`) resuelve señales ausentes del conjunto recibido para todo el detector.
- Impacto: al superar esa ventana, señales de documentos no examinados pueden quedar resueltas por omisión. Es un riesgo de escala, no un recuento confirmado en producción.
- Acción: paginación/checkpoints y reconciliación limitada al alcance efectivamente examinado; no resolver nada si la lectura es incompleta o falla.
- Aceptación: caso con más de 500 fuentes y fallos parciales conserva señales no examinadas.

### P2 — capacidad, medición y experiencia

**P2-01. Cobertura de conocimiento menor que la promesa de “saber todo”.** `briaMemoryService.js:260` informa Drive general con `indexed: 0`, estado NEXT. La memoria nueva indexa minutas; los conocimientos extraídos siguen dentro de documentos/fragmentos. Incorporar documentos aprobados, reglas de marca, estrategia y decisiones como fuentes versionadas. Separar hechos históricos, reglas vigentes y compromisos activos; conservar procedencia, fecha efectiva, aprobación y qué versión sustituye a otra. No convertir todo el historial en alertas.

**P2-02. La revisión de una parrilla puede ser parcial sin expresar ese límite.** `briaContentPlanReviewService.js:81` toma las primeras 60 piezas y limita longitudes antes de crear el hash. Cambios fuera de ese alcance pueden no invalidar la revisión. Procesar todas las piezas por lotes y mostrar cobertura real; separar calidad editorial, coherencia estratégica y confianza/cobertura de evidencia. Los identificadores de reglas generados por el modelo requieren normalización para que una recomendación descartada no reaparezca con otro nombre. Aceptación: pieza 61 y texto largo revisados; desconocer al cliente reduce cobertura de marca, no inventa reglas ni penaliza automáticamente buena redacción.

**P2-03. Autonomía y predicción aún no demostradas.** Observer registra dos detectores (`briaObserverService.js:169`); la analítica aplica umbrales y `readyForPrediction` depende de diez sesiones (`managerTaskAnalyticsService.js:117`). Chat/Brain Core atienden la primera llamada de herramienta en sus respectivos caminos. Esto no prueba predicción fiable ni planificación autónoma multietapa. Construir primero flujos delimitados, herramientas validadas y verificación posterior; usar modelos predictivos solo después de medir precisión frente a una regla simple y contar con muestras comparables.

**P2-04. Adopción no equivale a actividad registrada ni a productividad.** `operationalHealthService.js:156` cuenta principalmente creación de registros/comentarios; las piezas se atribuyen al dueño de la parrilla (`:166`). Una persona que completa o edita tareas puede quedar infrarrepresentada. Instrumentar recorridos exitosos por rol y resultados, además de latencia/coste/intervención de Bria. No usar este índice para calificar desempeño individual ni premiar más horas o clics.

**P2-05. Accesibilidad y responsividad necesitan una matriz de regresión transversal.** `ActivityMap.jsx:98` elimina el indicador de foco; `:243` usa mucho padding y `:277` conserva cuatro columnas con avatares de ancho fijo. La composición puede desbordar en móvil; debe verificarse con el mapa real. Los popovers ajustados en esta entrega mejoran fechas, tipografía, sombra y objetivos táctiles, pero no certifican todo el módulo. Priorizar navegación por teclado, foco visible (WCAG 2.4.7), reflow (1.4.10), nombres accesibles y viewport/zoom; 44 px es el objetivo táctil del proyecto, no una afirmación de que WCAG AA exige siempre 44 px.

**P2-06. Coste de carga del frontend.** Build observado: entrada JS 723,07 kB minificados / 226,91 kB gzip; Minutas 550,20 / 146,84 kB; emojis 457,80 / 149,15 kB; CSS 242,65 / 34,74 kB. Ya existe carga dividida por rutas. Perfilar antes de dividir más: cargar editores/PDF/emoji cuando se usan y presupuestar carga, interacción y memoria en equipos normales. Las advertencias de Vite no demuestran por sí mismas lentitud percibida.

**P2-07. El sistema visual aún depende demasiado de disciplina manual.** Tokens y componentes comunes existen, pero conviven tipografías muy pequeñas, sombras intensas, colores puntuales y controles con estilos propios. `TeamAvatar.jsx` todavía tiene un fallback final con `bg-white` sin variante oscura; `BriaObserverInbox.jsx` tiene semánticas de severidad que deben contrastarse con el contrato destructivo global. Consolidar primitivas, estados y regresiones visuales. No eliminar los degradados de Bria: son una decisión explícita de marca, no un defecto genérico por usar gradientes.

### P3 — documentación

**P3-01. Documentación parcialmente desfasada.** `ARCHITECTURE.md` y `docs/KNOWN_ISSUES.md` contienen información que debe reconciliarse con proveedores, arranque y verificaciones actuales. Mantener decisiones de arquitectura fechadas, mapa de flujos y criterios de aceptación. AGENTS.md debe contener reglas estables, no sustituir el backlog ni el registro de decisiones.

## Auditoría visual/técnica de la muestra

Evaluación **provisional de código y muestra renderizada**, no nota de toda la plataforma ni certificación WCAG. La skill `audit` guio las cinco dimensiones; su dependencia `frontend-design` no estaba disponible, así que el contrato visual del proyecto fue la referencia.

| Dimensión | Nota /4 | Evidencia principal |
|---|---:|---|
| Accesibilidad | 2 | Esfuerzos de etiquetado y diálogos; quedan indicadores de foco y cobertura de teclado por revisar |
| Rendimiento | 2 | Lazy loading existente; entrada y módulos pesados, sin medición de campo |
| Responsividad | 2 | Modales adaptables; mapa de cuatro columnas/padding y controles pequeños heredados |
| Temas | 2 | Tokens y dark mode amplios, pero uso desigual y excepciones |
| Consistencia / antipatrones | 2 | Primitivas compartidas junto con sombras, microtipografía y cajas anidadas heredadas |
| Total orientativo | **10/20** | Base utilizable con trabajo significativo pendiente |

Veredicto de consistencia: **no pasa todavía como sistema uniforme**. Esto no permite inferir si una interfaz fue generada por IA. Los defectos concretos importan más que esa etiqueta. Patrones sistémicos: estilos repetidos fuera de primitivas y pruebas estáticas que no sustituyen una pasada visual/interactiva. Como etiquetas de trabajo para otra pasada: `/harden`, `/adapt`, `/optimize`, `/normalize` y finalmente `/polish`; no se presupone que estén instaladas. Repetir `/audit` tras los cambios y comparar evidencia, no solo notas.

## Arquitectura objetivo: una Bria, no varias memorias aisladas

```text
Minutas + documentos aprobados + reglas de cliente + cambios operativos
                              ↓
Memoria versionada y autorizada + estado operativo consultado en vivo
                              ↓
Servicio común de contexto, evidencia y herramientas
                              ↓
Observer detecta → Bria propone → política/usuario autoriza
                              ↓
Ejecución idempotente → verificación del resultado → aprendizaje revisable
```

Las tareas, fechas, permisos y disponibilidad deben consultarse en la fuente transaccional actual; una copia vectorial no debe decidir si una tarea sigue abierta. La memoria aporta el porqué, la estrategia y los antecedentes. Cada recomendación necesita evidencia, vigencia, destinatario, próxima acción y condición para dejar de aparecer.

Mantener por ahora el monolito modular, PostgreSQL/pgvector y servicios existentes. Un registro durable de trabajos y acciones puede empezar en PostgreSQL: no es necesario introducir microservicios, otra base vectorial ni un framework multiagente para corregir estas brechas. Anthropic recomienda partir de composiciones simples y aumentar complejidad cuando aporta valor medido; esta arquitectura es una propuesta aplicada a Brainstudio, no una receta literal de esa fuente. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

### Límites de autonomía

- **Lectura y diagnóstico:** automáticos, con permisos, evidencia y posibilidad de decir “no tengo información suficiente”.
- **Borradores y propuestas:** crear sugerencias de corrección, compromisos y replanificación sin alterar el trabajo aprobado.
- **Cambios internos acotados:** habilitarlos después del piloto, con política explícita, registro, idempotencia y recuperación.
- **Publicación, mensajes al cliente, cambios de alcance/plazo/responsable y operaciones financieras:** autorización humana explícita. La IA no debe convertirse en otro canal que cambia compromisos sin que el equipo lo sepa.
- Documentos y transcripciones son datos, nunca instrucciones con autoridad para usar herramientas. Probar inyección de instrucciones y separación de datos financieros/personales.

## Ruta de ejecución recomendada

Duraciones orientativas, no compromisos: dependen de acceso a un entorno aislado, datos autorizados y disponibilidad del equipo. Avanzar por criterios de aceptación, no por fechas.

### Etapa 0 — recuperar confianza técnica (1–2 semanas orientativas)

Resolver P1-01 a P1-05; disponer de pruebas con PostgreSQL aislado y endpoints simulados; ensayar fallo, reinicio y recuperación. Registrar cada ejecución de IA con versión, alcance, evidencia, duración, consumo disponible, error y resultado. Crear 30–50 casos de evaluación representativos, revisados por responsables operativos.

Casos imprescindibles: cliente sin memoria, reglas contradictorias, aprobación posterior que sustituye una anterior, minuta vieja, documento eliminado, cliente homónimo, fecha reprogramada, ausencia, doble clic, dos usuarios, tarea ya creada/resuelta y texto malicioso dentro de un documento. Repetir casos para observar variabilidad; comprobar tanto la respuesta como el estado final. Este enfoque se apoya en evaluaciones de agentes basadas en tareas, trazas y resultados, no solamente en “el texto parece bueno”. [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

**Salida:** sin incumplimientos de permisos/vigencia en la batería; reinicios y concurrencia controlados; fallos visibles y recuperables. No afirmar seguridad absoluta por aprobar una batería.

### Etapa 1 — contexto común y conocimiento vigente (2–3 semanas orientativas)

Crear el servicio común e integrar progresivamente los tres consumidores. Incorporar Drive aprobado, identidad explícita de cliente, reglas versionadas, precedencia de decisiones y política única de retirada. Migrar por adaptadores con reversión, sin borrar memoria anterior precipitadamente. Ofrecer una ficha de conocimiento por cliente: “qué sé, de dónde, qué está vigente y qué falta”.

**Salida:** el mismo objeto/versión comparte resultado para todos los usuarios autorizados; fuentes prohibidas o retiradas no reaparecen; la falta de memoria se comunica sin inventar contexto. Una nueva regla vigente invalida análisis afectados de forma controlada.

### Etapa 2 — primer flujo completo: parrilla → corrección → verificación (2–3 semanas orientativas)

Es el mejor primer caso porque ya tiene uso, interfaz, persistencia y decisiones de usuario. Revisar todas las piezas; enlazar cada hallazgo con una regla/evidencia y versión; “corregido” solicita verificación, no concede puntos instantáneamente. “Descartar” registra motivo; solo convertirlo en regla duradera tras aprobación, no aprender cualquier rechazo como verdad universal.

**Salida:** cambios comprobados actualizan el puntaje compartido; las recomendaciones no vuelven por renombrarse; se conserva historial de versiones y cobertura. Demostrar reducción del tiempo de revisión sin aumentar errores ni retrabajo.

### Etapa 3 — dos flujos adicionales y autonomía gradual (2–4 semanas orientativas)

1. **Reunión → compromiso → tarea:** extraer compromiso con evidencia y fecha, detectar tarea existente, proponer dueño, aprobar creación y seguir cumplimiento. Nunca convertir todo comentario histórico en pendiente.
2. **Foco diario → bloqueo → propuesta:** combinar tareas, insumos, calendario y ausencias; explicar qué impide avanzar, proponer próxima acción o replanificación y verificar tras aprobación.

**Salida:** trazabilidad completa y sin duplicados; cada aviso tiene destinatario y condición de cierre; la automatización interna se amplía únicamente por tipo de acción evaluada. Observer conserva su espacio de supervisión para administradores; el equipo recibe ayuda dentro de la tarea/parrilla, no necesita visitar otra bandeja para obtener valor.

## Adopción y productividad: demostrar utilidad, no exigir más clics

Pilotar con un grupo pequeño de project, community y diseño; dos clientes contrastantes, uno con historial y otro con poca memoria. Recoger una línea base de dos semanas y comparar trabajos de formato/complejidad semejantes. Formación breve dentro del flujo y un responsable operativo que revise semanalmente falsos positivos, omisiones y recomendaciones útiles. No contactar ni enrolar personas automáticamente: esto es una propuesta de piloto.

| Pregunta | Indicador recomendado |
|---|---|
| ¿La gente obtiene valor? | Usuarios elegibles que completan semanalmente un flujo útil con Bria; repetición en semanas siguientes |
| ¿La revisión mejora? | Hallazgos útiles según revisión humana; correcciones verificadas; defectos omitidos en muestra |
| ¿Ahorramos trabajo? | Tiempo de revisión y ciclo de piezas comparables; tiempo esperando insumos/aprobación |
| ¿Mejora la calidad? | Aprobación a la primera; retrabajo separado por error interno, solicitud del cliente o cambio de alcance |
| ¿Interrumpe demasiado? | Avisos descartados/repetidos, aplazamientos y tasa de interrupciones sin acción útil |
| ¿Es sostenible? | Coste y latencia por resultado útil verificado; trabajos fallidos, duplicados y pendientes vencidos |

Meta inicial propuesta, **no benchmark de industria**: ≥80% de sugerencias útiles en muestra humana, ≥70% del grupo piloto completando un flujo útil por semana y reducción del 20% del tiempo de revisión comparable, sin elevar defectos. Ajustar objetivos tras la línea base y reportar tamaños de muestra; no presentar ahorro estimado por el propio modelo como ahorro medido.

Priorizar un resumen diario breve —por ejemplo tres asuntos importantes— y avisos inmediatos solo para bloqueos urgentes. Permitir “no aplica”, “ya está resuelto” y “más tarde”, con estados compartidos cuando corresponde. Evaluar resultados agregados con acceso por rol; no confundir sesiones abiertas o horas registradas con esfuerzo ni usarlas para rankings punitivos.

HEART aporta la disciplina de conectar objetivos con señales y métricas de adopción, retención y éxito de tareas. [Google Research: HEART](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/). Para la fiabilidad de **nuestro desarrollo de software**, medir además frecuencia/tiempo de entrega y fallos/recuperación; las métricas DORA no son una clasificación de productividad de community managers o diseñadores. [DORA metrics](https://dora.dev/guides/dora-metrics/).

## Qué no haría todavía

- No iniciar entrenamiento propio/fine-tuning antes de corregir recuperación, reglas, herramientas y evaluación.
- No añadir más alertas a una bandeja que aún no comprueba resolución.
- No premiar un puntaje alto si la revisión cubre parcialmente la parrilla o desconoce al cliente.
- No migrar infraestructura ni dividir en varios agentes por apariencia de sofisticación.
- No prometer una IA omnisciente: construir una IA institucional con contexto autorizado, actualizado y verificable.

## Próxima decisión

Priorizar **Etapa 0 + diseño del contrato común**, seguida del piloto de parrillas. Entregable del primer bloque: brechas P1 cerradas con regresiones, casos de evaluación, seguimiento de ejecuciones y una demostración de una revisión compartida que comprueba una corrección real. El resto del roadmap permanece como propuesta hasta aprobar su ejecución.

El ajuste de popovers solicitado anteriormente se trata por separado: superficie neutra compartida, tipografía menos pesada, controles accesibles y fechas seguras. No se han aplicado de forma implícita los cambios de arquitectura recomendados por esta auditoría.
