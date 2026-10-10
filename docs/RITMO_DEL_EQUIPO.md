# Ritmo del equipo

Rodny, 9 de octubre de 2026: «siento que aún no hay forma de analizar los tiempos, de leer al miembro del equipo … si Brayan hace en un día dos vídeos y en cada uno se demora 4 horas, eso hay que revisarlo … si en un vídeo se demora 5 horas y en otro 30 minutos, hay que ver por qué tanta diferencia. Y eso va para todos».

## Dónde vive

- **Pestaña Ritmo de Manager** (`/manager?tab=ritmo`). Lleva lo que antes estaba en Observer sobre tiempos (esfuerzo registrado, distribuciones, calidad del dato, sesiones recientes) y, encima, la lectura por persona. Observer se queda solo con la bandeja de señales.
- **Servidor:** `GET /api/manager/rhythm?days=7|30|90` (`teamRhythmService.js`), con la misma puerta que el resto de Manager: módulo Manager y rol de administrador o project manager.
- **Bria:** la herramienta `ritmo_del_equipo` lee el mismo cálculo, con la misma puerta. Una respuesta guardada deja de mostrarse a quien pierde ese acceso (`authorizeTurn`, fuente `ritmo`).

## Qué calcula

Por persona y por tipo de trabajo, sobre las tareas cerradas del periodo (`src/lib/teamRhythm.js`, lógica pura):

1. **Cobertura primero.** Cuánto de lo cerrado tiene tiempo medido. Lo que pasó a Realizada sin pasar por En proceso **no es rápido, no se midió**, y la pantalla lo dice antes que cualquier cifra. Menos de 10 minutos no cuenta como medición.
2. **Cuánto suele tardar.** Mediana y rango por tipo de trabajo, y la mediana del resto del equipo en el mismo tipo.
3. **Hallazgos.** Cada uno es una pregunta con las tareas que lo sustentan, nunca un juicio sobre la persona:
   - **Disparejo:** pocas tareas del mismo tipo muy distintas entre sí (la más larga cuatro veces la más corta).
   - **Fuera de lo habitual:** con cinco o más, las que tomaron tres veces la mediana y al menos 2 h.
   - **Comparación con el equipo:** solo con tres o más tareas de cada lado; más lento o más rápido por un factor de 1,5 o 0,5.
   - **Día cargado:** varias tareas del mismo tipo el mismo día que suman 6 h o más.
   - **Día largo:** 10 h o más medidas en un día, sea cual sea el trabajo.
   - **Retrabajo:** tiempo después de una devolución.
   - **Reloj olvidado:** una sesión de más de 8 h no se cuenta como trabajo; se avisa aparte.
   - **Relojes simultáneos:** una sesión abierta mientras la misma persona tenía otra corriendo (`isOverlapping`) no se suma; se avisa aparte. Pasaba al mover varias tareas a la vez a En proceso: tres publicaciones de 4 h 48 min cada una eran el mismo tiempo contado tres veces.

## Decisiones que no se ven a simple vista

- **El tiempo es de quien trabajó** (`TaskWorkSession.workerId`), no del responsable actual: una tarea reasignada no le cuenta a la persona nueva las horas de la anterior. Los colaboradores reciben sus propias horas.
- **El tipo de trabajo** sale del formato de la pieza (Reel, Carrusel, Post, Video, Historia), de «Publicación» si es una tarea de publicar, y si no, de la categoría de la tarea.
- **Solo se compara trabajo homogéneo.** «Operaciones & Reuniones» es la categoría de relleno del clasificador y «Marketing & Social Media» mezcla redactar una parrilla con responder mensajes: se muestran como «mezcla trabajos distintos» y nunca se comparan ni se llaman dispares.
- **Las tareas anteriores a las sesiones** conservan el tiempo acumulado que ya tenían (`accumulatedWorkMs`).

## Lo que mostró la primera lectura real (30 días, 9 de octubre de 2026)

- La cobertura del equipo es del 56 %, con personas por debajo del 15 %. Mientras eso no suba, los tiempos de esas personas no se pueden leer.
- Hay relojes que nadie pausa (sesiones de más de 8 h) y tiempo duplicado por relojes simultáneos.

## Fase A (10 de octubre de 2026): la lectura de la semana y el mapa de carga

Rodny: «no quiero mirar tablas, quiero que Bria me diga qué decidir». Ritmo abre ahora con dos piezas encima de la lectura por persona.

### La lectura de la semana
- **Qué es.** Bria lee Ritmo (30 días) y el mapa de carga y escribe de **3 a 5 decisiones** para la dirección, de la más urgente a la menos, cada una con su **evidencia** (cifras de los datos), su **por qué** y una **acción**. Y dos frases de resumen.
- **Cuándo.** Sola **los lunes desde las 7 de la mañana** (reloj de Bogotá), una vez por semana aunque el servidor se reinicie (`initWeeklyReadingScheduler`, revisa cada 30 minutos; la clave es la semana ISO de Bogotá, `weekKeyOf`). Al escribirla avisa a administradores y project managers con acceso a Manager (`RITMO_LECTURA_SEMANAL`, lleva a `/manager?tab=ritmo`). Y **a mano** cuando se quiera, con «Pedir la lectura» / «Volver a leer» (`POST /api/manager/rhythm/reading`).
- **El modelo propone, el código manda** (`src/lib/weeklyReading.js`). Esquema estricto, cliente gobernado de OpenAI (`manager.weekly-reading`). `validateReading` conserva solo lo que el resumen de datos respalda: una tarea que no estaba entre los ids mostrados o una persona que no aparece se descartan y la acción pasa a «ninguna»; una decisión sin evidencia no entra; la urgencia es `alta`, `media` o `baja`; máximo cinco. Los nombres se comparan sin tildes ni mayúsculas.
- **Las acciones nunca actúan solas.** `REVISAR_TAREA` y `REASIGNAR` abren la tarea en Gestión (`/gestion?taskId=`). `CONVERSAR` y `CREAR_PENDIENTE` llevan un `suggestedMessage` que **se deja escrito en el chat de Bria** (`askBria`, evento `bria:ask`; el panel se abre y la pregunta queda en el cuadro): la persona lo lee y lo envía, o no. Nada se manda ni se crea por tocar el botón.
- **Dónde se guarda.** `bria_memory.rhythm_readings` (una fila por generación, con el resumen de datos que vio el modelo y su coste; `scripts/sql/bria-rhythm-readings.sql`, aplicado al arrancar por `ensure-bria-knowledge-schema.js`). Única capa de acceso: `weeklyReadingRepository.js`. Nada se borra.
- **El tono es de Rodny para el equipo:** habla de carga y de tiempos, nunca de desempeño; si la cobertura de alguien es baja, la decisión es medir, no juzgar. Español latinoamericano.

### El mapa de carga
- **Qué es.** Quién está saturado y quién tiene espacio en los **próximos 10 días hábiles** de Colombia (festivos incluidos; `nextWorkingDays`). Una fila por persona activa, una celda por día con las **horas estimadas** de sus tareas abiertas (`PENDIENTE`, `EN_CURSO`, `DEVUELTA`) que vencen ese día; tocar una celda muestra las tareas y abre cada una en Gestión. Las vencidas van en una columna aparte y las que no tienen fecha se cuentan junto al nombre. Una tarea que vence un fin de semana o festivo cuenta en el siguiente día hábil.
- **De dónde salen las horas** (`estimateFor`): la mediana de **esa persona** en ese tipo de trabajo (Ritmo, 90 días); si no la tiene, la **del equipo**; si no hay nada, **una hora** y se marca «supuesto». La pantalla dice siempre que son estimaciones para repartir mejor, no un registro.
- **Los colores** (`levelOf`, jornada de 8 h): **con espacio** por debajo de media jornada, **al día** hasta casi una jornada, **día completo** (amarillo) desde el 90 % hasta un día y cuarto —Rodny: «dos videos de 4 horas en un día, eso hay que revisarlo»— y **más de lo que cabe** (coral) por encima. No subir los umbrales sin que lo pida.
- **Señales** (`loadSignals`), como en Ritmo, preguntas con sus tareas: día excedido, tareas vencidas, persona con espacio (menos del 30 % de la capacidad del horizonte y ningún día por encima de «con espacio»).
- **Servidor y Bria.** `GET /api/manager/rhythm/load` (`teamLoadService.js`) y la herramienta `carga_del_equipo`, con la misma puerta de Manager. Bria la usa cuando preguntan a quién asignarle algo o quién está sobrecargado.
- **Lo que enseñó la primera conversación real (10 de octubre de 2026).** Bria llamó «la mayor carga» a 11 h en 10 días hábiles (el 14 % del tiempo), dijo «el 19 de octubre» sin día de la semana y se leyó como hoy, y al cuestionarla «corrigió» repitiendo las mismas cifras y pidiendo disculpas dos veces. Desde entonces la herramienta entrega la **capacidad del periodo**, la **ocupación en porcentaje** de cada persona, una **lectura del equipo** («nadie pasa de la mitad de su tiempo») y cuántas tareas quedaron fuera por **no tener fecha**; las fechas llevan día de la semana; y la regla 10a de Bria dice que ante una duda reléa el dato, lo sostenga si estaba bien, corrija una sola vez si estaba mal y nunca invente una corrección ni nombre «la herramienta».

## Pruebas y muestra

- Contratos: `tests/teamRhythm.test.js`, `tests/teamRhythmService.test.js`, `tests/teamRhythmAccess.test.js`, `tests/teamRhythmUi.test.js`; Fase A: `tests/teamLoad.test.js`, `tests/weeklyReading.test.js`, `tests/weeklyReadingService.test.js`, `tests/teamRhythmFaseA.test.js`, `tests/briaAsk.test.js`, y `carga_del_equipo` en `tests/briaAssistantTools.test.js`.
- Muestra local con personas inventadas: `tests/fixtures/team-rhythm-preview.html` (`?tab=ritmo`, `?tab=observer`, `&dark`, `&sinlectura` para la semana sin lectura).
