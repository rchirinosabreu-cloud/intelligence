# Una tarea compartida con estados personales

Fecha del análisis: 5 de noviembre de 2026.

**Estado: implementación validada en local y fusión autorizada el 5 de noviembre de 2026.** Se eligió ampliar la relación de colaboradores existente y conservar una sola `Task.id`, con varias tarjetas según la persona y reloj automático al mover cada parte. El análisis de alternativas que sigue documenta la decisión inicial. Los resultados verificables y límites de las pruebas están en [la matriz de aceptación](COMPARTIDAS_CASOS_PRUEBA.md).

La implementación añade estados, fechas y revisiones por persona; conserva las sesiones por `workerId` y archiva una participación cuando sale del equipo, sin mantener su acceso. El cierre general espera a todos. Devolver o reabrir una parte conserva el progreso de las demás. Los movimientos se guardan juntos con el reloj, la auditoría y sus efectos; un conflicto entre dispositivos exige actualizar y revisar. Solo el cierre general activa los efectos de pieza y publicación. El historial de logros distingue persona y tarea, incluyendo participaciones retiradas, sin convertir cada tarjeta en otra tarea.

La prueba local usa datos inventados y una base PostgreSQL separada. Se conservan las reglas de tareas individuales, los permisos privados y las confirmaciones. El orden manual dentro de una columna personal no se ofrece para compartidas: su prioridad sigue siendo común; el movimiento de estado personal sí está disponible. Las rutas antiguas que intenten cambiar un estado global contradictorio reciben un rechazo explícito.

## Análisis inicial, anterior a la implementación

El resto de este documento conserva la auditoría previa como antecedente; sus referencias de línea y contratos describen esa versión anterior. Para el resultado actual se aplica el estado de implementación y la matriz enlazada arriba.

La solución es viable. La tarea conserva sus datos comunes y el servidor guarda el estado de cada participante. La interfaz representa ese estado mediante tarjetas personales. Independencia visual y persistencia personal no requieren duplicar la tarea.

## Tres personas y un mismo identificador

Ejemplo ficticio: Ana es responsable y Bea y Carlos colaboran en la tarea `T-123`, “Preparar presentación”. El código es ilustrativo, no una afirmación sobre el formato de identificadores de producción.

| Persona | Tarjeta que ve | Estado personal | Reloj |
|---|---|---|---|
| Ana | T-123 · Preparar presentación | Realizado | Detenido al terminar su parte |
| Bea | T-123 · Preparar presentación | En proceso | Corriendo desde su movimiento |
| Carlos | T-123 · Preparar presentación | Pendiente | Detenido |

Las tres tarjetas abren la misma tarea, conversación, archivos y cliente. Editar el título modifica ese título común. Ana no deja de tener constancia de su trabajo porque Bea continúe; Carlos no inicia su reloj porque otra persona haya empezado.

En una vista general pueden aparecer las tres representaciones, identificadas por persona. Para React y el arrastre se necesita una clave visual compuesta, por ejemplo `taskId + memberId`, porque dos elementos de la misma lista no pueden compartir identidad de interfaz. **Esa clave visual no es otro ID ni otro código de tarea.** La API sigue recibiendo el ID común y la participación sobre la que se actúa.

## Qué se conserva y qué debe persistirse

“Sin más registros” puede significar cosas diferentes:

- **Sin crear otras Task:** se cumple. Una tarea compartida sigue siendo una fila Task.
- **Sin insertar un registro de estado por cada movimiento:** se puede actualizar el estado personal en registros existentes.
- **Sin guardar ningún estado personal en el servidor:** no permite recuperar las posiciones al recargar, sincronizar dispositivos ni medir quién terminó.
- **Una sola fila para todo, incluidas horas e historial:** cambiaría el modelo existente, que ya guarda colaboradores, sesiones, ciclos, comentarios y auditoría en relaciones separadas.

El alcance recomendado es no duplicar tareas y reutilizar las relaciones actuales. Los registros de sesiones y auditoría siguen cumpliendo su propósito; no son tareas adicionales.

## Alternativas de almacenamiento

| Alternativa | Una sola Task | Estado personal persistente | Ventaja | Costo principal |
|---|---|---|---|---|
| A · Estado en las relaciones existentes | Sí | Sí | Aprovecha colaboradores y consultas actuales | Normalizar responsable y colaboradores desde dos lugares |
| B · Estados en JSONB dentro de Task | Sí | Sí | Todos los estados personales viven en la fila Task | Validación, consultas y actualizaciones parciales más complejas |
| C · Estado solo en el navegador | Sí | No de forma compartida | Sirve para una maqueta | No satisface sincronización, tiempos ni métricas fiables |

### A Extender los registros existentes

**Es la recomendación mínima.** Task mantiene su responsable y se le añaden los datos de su estado personal. Las filas TaskCollaborator existentes reciben campos equivalentes. Una función común entrega una lista uniforme de participantes a pantalla y servicios.

Los datos mínimos son estado personal, fecha personal de cierre y revisión para detectar cambios desactualizados. Las horas se apoyan en las sesiones existentes, sin mantener otra suma independiente innecesaria. Task.status y Task.completedAt conservan el significado del conjunto; no se reutilizan como si fueran únicamente el estado del responsable.

Para el ejemplo existen una Task y las dos relaciones de colaboración que el sistema ya necesita. No se crea una Task por persona ni hace falta una tabla nueva de tareas personales. Añadir participantes continúa utilizando el mecanismo de relaciones existente.

No conviene incluir al responsable como una fila adicional de TaskCollaborator sin revisar todos los consumidores: actualmente se lo excluye de esa lista y tener colaboradores determina si el trabajo se considera compartido. Hacerlo indiscriminadamente convertiría tareas individuales en compartidas.

Al reasignar, el estado no debe pasar a otra persona como si ella hubiera trabajado. Promover a un colaborador a responsable conserva su estado personal; retirar o sustituir participantes conserva horas y evidencia histórica mediante los mecanismos correspondientes. No se debe prometer que retirar una relación equivale a borrar su historia o terminar su trabajo.

### B Guardar los estados en JSONB

Un campo estructurado de Task puede asociar cada memberId con su estado, cierre y revisión. Es viable si la restricción consiste en mantener todos los estados en la propia fila Task. No elimina las sesiones ni la auditoría relacionadas.

El servidor debe validar la estructura, los estados admitidos y la pertenencia real de cada persona. Una petición solo cambia la entrada autorizada; no se acepta que el navegador reemplace el objeto de todos los participantes. La escritura debe ser atómica y comprobar la revisión esperada, para que dos personas no sobrescriban sus cambios.

También habrá que adaptar filtros por persona y estado, consultas de métricas, compatibilidad del formato y conservación de historia. Reemplazar un JSON no es por sí mismo un registro de auditoría. Guardar dentro de ese campo una lista creciente de todas las sesiones sería un rediseño distinto y no se recomienda para este alcance.

La comparación se apoya en la habilidad del repositorio `postgresql-table-design`: conservar relaciones para datos operativos centrales es preferible cuando ya existen; JSONB sigue siendo una alternativa posible, no una imposibilidad técnica.

### C Mantener los estados solo en la interfaz

Se podrían dibujar y mover tres tarjetas localmente, pero al recargar o usar otro dispositivo el servidor seguiría teniendo un único estado. LocalStorage no resolvería la sincronización entre personas. Tampoco puede deducirse “terminado” de una sesión detenida: puede estar pausada, devuelta o interrumpida.

Esta opción no cumple el pedido completo. Puede utilizarse para demostrar la interacción, nunca como fuente de tiempos, finalización o méritos.

## Movimiento personal y reloj automático

Cada arrastre debe ser una sola operación del servidor:

1. Identificar la tarea y la participación afectada, comprobar permisos y revisión vigente.
2. Cambiar el estado personal y abrir o cerrar su sesión con la hora del servidor.
3. Recalcular el estado global y ejecutar sus efectos solo cuando corresponda.
4. Devolver el estado confirmado para actualizar la tarjeta y su reloj.

Mover a En proceso inicia automáticamente el reloj de esa persona. Pasar a Pendiente lo detiene. Pasar a Realizado detiene su reloj y conserva la fecha de su finalización. No se inicia, pausa ni termina el trabajo ajeno.

Se reutilizan TaskWorkSession y sus workerId; el tiempo ya se registra por persona. Los filtros de apertura y cierre deben identificar inequívocamente a quien trabaja, incluida la reasignación del responsable. El tiempo acumulado del responsable no se transforma silenciosamente en la suma de todo el equipo.

La tarjeta puede anticipar su columna con “Guardando…”, como exige el comportamiento vigente. El reloj y los efectos de finalización se confirman con la respuesta real. Ante un error se retira solo esa proyección, sin restaurar una lista antigua que borre avances de otras personas.

Los botones manuales dejan de ser un paso obligatorio. Si se conservan como alternativa, deben ejecutar la misma transición personal que el arrastre, sin crear dos fuentes contradictorias para estado y reloj.

## Estado global y efectos del cierre

**La regla de cierre global siguiente es una propuesta, no una decisión ya implementada:**

- Si todos los participantes requeridos terminaron, el conjunto queda Realizado.
- Si alguien está trabajando, el conjunto queda En proceso.
- Si queda trabajo y nadie está trabajando, el conjunto queda Pendiente, con un avance legible como “1 de 3 terminó”.

Si el producto requiere una validación final del responsable, debe representarse expresamente. La independencia de las tarjetas no obliga por sí sola a elegir entre cierre automático del conjunto o validación final.

Devolver una participación y devolver todo el trabajo son acciones diferentes. Retirar a una persona o cancelar una tarea tampoco equivale a completar. La política de devolución y reapertura debe preservar los cierres de los participantes no afectados y señalar a quién corresponde corregir.

El cierre personal no puede invocar directamente la transición global actual: hoy realizar una Task cierra todos los relojes, cierra el ciclo, modifica la pieza vinculada y puede crear el pendiente posterior de Publicar. Esos efectos deben esperar al cierre global efectivo, con protección frente a repeticiones. Nunca debe generarse un pendiente de Publicar por cada participante.

TaskWorkCycle puede seguir siendo global: se abre al primer trabajo y no se cierra porque termine una sola persona. Al completar el conjunto se cierra; reabrir una participación después del cierre global inicia el retrabajo correspondiente sin borrar las finalizaciones anteriores de los demás.

## Primer incremento sin ordenar cada tarjeta por separado

El usuario solicita independencia del proceso, no un sistema nuevo de prioridades individuales. El primer incremento puede limitar el arrastre personal al cambio de columna y mantener un orden determinista dentro de cada columna. No necesita añadir sortOrder a cada participante.

El movimiento personal no debe reescribir Task.sortOrder y alterar las otras representaciones. Puede conservarse la prioridad general de la tarea, con un desempate estable por participante donde se muestren varias tarjetas. El orden independiente por persona sería una ampliación posterior si se solicita.

La operación actual de ordenar recibe IDs de Task únicos y exige un solo estado global. No se le deben enviar tres veces el mismo ID ni posiciones de tarjetas personales. La prioridad general de dirección puede seguir gestionándose donde cada Task se representa una vez; en la vista personal se deben distinguir claramente cambiar estado y cambiar prioridad.

## Concurrencia y sincronización

El proyecto ya utiliza transacciones serializables, bloqueo previo y reintentos para transiciones de tareas y reconocimientos. Esa base puede reutilizarse, manteniendo estado personal, sesión y estado global dentro de la misma transacción.

Además hace falta comprobar la revisión personal conocida por quien mueve. Dos participantes diferentes pueden avanzar sin perder cambios; dos dispositivos de la misma persona no pueden sobrescribirse silenciosamente. La repetición de una petición no abre otra sesión ni entrega otro reconocimiento. Las transiciones simultáneas que completen el conjunto producen un solo cierre global.

Los recibos y la caché deben actualizar la participación correcta. Hoy applyConfirmedTaskMove identifica solo Task.id y limpia todas las sesiones al pausar o realizar. Con tarjetas personales debe conservar las sesiones ajenas. Las lecturas anteriores al guardado no pueden reponer una posición obsoleta.

El tablero actualmente consulta periódicamente mientras está visible y al recuperar foco. Ese mecanismo permite actualización entre dispositivos, pero no debe describirse como instantáneo. Si se exige inmediatez, debe añadirse y verificarse el canal correspondiente.

## Permisos y métricas

Una persona mueve su tarjeta sin obtener permiso para terminar las ajenas, cambiar integrantes o modificar la privacidad. Las intervenciones autorizadas de dirección identifican tanto a quien actuó como a la persona afectada. Una cabecera privada visible sigue sin conceder acceso al contenido; el servidor debe filtrar cualquier nuevo campo que contenga motivos o evidencia privada.

La nueva operación mantiene las comprobaciones de suspensión del cliente y compromiso horario. Estas reglas hoy consultan principalmente responsable y estado global: deben adaptarse a los estados personales sin ampliar su alcance por accidente ni permitir que otra ruta las omita.

El trabajo global se cuenta por Task.id, una vez. La carga personal se cuenta por la participación correspondiente. Cada persona conserva sus horas. La suma de horas del equipo es esfuerzo total, no duración de calendario ni tiempo individual.

Los reconocimientos actuales atribuyen cierres principalmente al responsable. Tres tarjetas no autorizan tres premios por el mismo cierre. La regla de reconocimiento personal debe definirse explícitamente y no reconstruir puntos históricos. La foto matinal debe distinguir una participación finalizada de otra pendiente para no atribuir el vencimiento restante a quien ya terminó.

Ritmo conserva las exclusiones de responsabilidad compartida y muestras insuficientes: proyectar tarjetas personales no demuestra que el tiempo de cada participante sea comparable con la duración de una tarea completa.

## Compatibilidad con tareas anteriores

La evolución será aditiva, manteniendo PostgreSQL y el contrato de Task.completedAt. Las tareas individuales deben seguir funcionando como hoy. Ninguna sesión histórica pausada se interpreta como una finalización personal.

Los trabajos compartidos anteriores no contienen toda la evidencia necesaria para reconstruir estados individuales. Su tratamiento debe conservar el cierre global histórico y distinguirlo de una finalización personal registrada con la nueva función. No se asignan fechas personales por inferencia.

La instrucción actual del usuario sustituye la política anterior de reloj manual en tareas compartidas. Al implementar deberán actualizarse los contratos que exigían ese comportamiento, preservando las garantías de privacidad, tiempos exactos, confirmación y ausencia de duplicados.

## Criterios de aceptación

1. Una Task con tres participantes produce tres vistas con el mismo ID/código y datos comunes.
2. Arrastrar la tarjeta de Ana a En proceso inicia solo su reloj, sin otro botón.
3. Bea puede empezar mientras Ana trabaja; ambas sesiones conservan su identidad y hora.
4. Ana termina y Bea continúa; Carlos permanece pendiente. La tarea global no declara entrega completa prematuramente.
5. Pausar, terminar o reabrir una participación no modifica las otras por inferencia.
6. El cierre global dispara una sola vez sus efectos autorizados sobre pieza, avisos y siguiente etapa.
7. Repetir peticiones y actuar simultáneamente no duplica sesiones, cierres ni premios.
8. Una revisión antigua de la misma participación se detecta; dos personas distintas conservan sus avances.
9. Recargar y cambiar dispositivo recupera los estados y tiempos confirmados por el servidor.
10. Reasignar o retirar participantes conserva horas y autoría y no transfiere una finalización a otra persona.
11. Privacidad, suspensión, foco y permisos se comprueban también por la nueva ruta.
12. Las métricas distinguen una tarea global y sus participaciones; no cambian puntos históricos.
13. Las tareas individuales y los registros anteriores mantienen su comportamiento compatible.
14. El arrastre personal no cambia la prioridad de todas las tarjetas del mismo trabajo.

La implementación requiere pruebas de integración con PostgreSQL aislado para concurrencia y transacciones, además de recorridos de navegador con tres personas, dos dispositivos, respuesta demorada y error de guardado. La revisión visual incluye claro, oscuro y móvil.

## Referencias del código revisado

Las líneas corresponden al checkout local revisado el 5 de noviembre de 2026 y pueden cambiar con el desarrollo.

| Referencia | Evidencia |
|---|---|
| `prisma/schema.prisma:1421` | Task única, estado, responsable y fechas globales |
| `prisma/schema.prisma:1498` | Sesiones con workerId e isCollaborator |
| `prisma/schema.prisma:1560` | Relación TaskCollaborator y unicidad por tarea/persona |
| `src/lib/taskCollaborators.js:13` | Normalización que excluye al responsable de los colaboradores |
| `src/services/taskCollaboratorService.js:90` | Contexto autorizado para el reloj personal actual |
| `src/services/taskWorkSessionService.js:13` | Ciclo global por Task |
| `src/services/taskWorkSessionService.js:44` | Apertura de sesión y comprobación de sesión previa |
| `src/services/nativeTaskService.js:724` | Detección de tarea compartida y transición global |
| `src/services/nativeTaskService.js:832` | Cierre de todos los relojes y del ciclo |
| `src/services/nativeTaskService.js:887` | Cierre global y siguiente etapa de publicación |
| `src/services/taskUpdateGate.js:27` | Permisos, restricciones y validación del cambio actual |
| `src/lib/taskPrivacy.js:34` | Autorización para abrir una tarea privada |
| `src/services/taskFocusService.js:9` | Foco ligado al responsable y estado global |
| `src/services/recognitionService.js:11` | Transacción serializable y bloqueo previo |
| `src/services/recognitionService.js:78` | Atribución actual del primer cierre |
| `src/lib/taskMoveConfirmation.js:20` | Aplicación del recibo por Task.id y sesiones |
| `src/components/modules/NativeTasks.jsx:791` | El arrastre actual identifica solo la Task |
| `src/components/modules/NativeTasks.jsx:1586` | Identificador visual actual de la tarjeta |
| `src/services/taskOrderService.js:25` | Reordenado con IDs únicos y estado global |
| `src/services/dailyReadingService.js:237` | Carga de responsable y colaboradores en la foto matinal |
| `src/lib/teamForecast.js:35` | Exclusión de responsabilidad compartida en la previsión |

## Verificación de esta auditoría

Se revisaron esquema, servicios, puertas de permiso, arrastre, actualización confirmada, orden, sesiones, ciclos y consumidores de métricas. Las referencias anteriores se comprobaron contra los archivos presentes. No se conectó a producción ni se probó una implementación nueva.

En el análisis previo del mismo pedido pasaron 46 pruebas de `taskDeadlines.test.js`, `taskOrder.test.js`, `taskCollaboratorService.test.js`, `taskCollaboratorSessions.test.js` y `contentTaskReciprocity.test.js`. Confirman comportamientos existentes; no acreditan las tarjetas personales propuestas. Entre los contratos que deberán revisarse están `taskCollaboratorsPicker.test.js:34`, `taskCollaboratorsPicker.test.js:45`, `taskCollaboratorService.test.js:135` y `taskUpdateGate.test.js:27`, que hoy reflejan restricciones o reloj manual de la política anterior.

Esa auditoría inicial añadió únicamente este documento. Después, con la autorización explícita de Rodny, se implementó la versión local descrita al comienzo; sigue sin fusionar ni desplegar.
