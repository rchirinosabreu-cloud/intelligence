# Ritmo del equipo

## Entrada semanal y previsión (Rodny, 14 de octubre de 2026)

Rodny pidió simplificar la lectura y anticipar entregas, tomando como referencia la claridad de CRM y Financiero. Esta organización sustituye el orden de la Fase A descrito más abajo; conserva sus datos, permisos y acciones.

- **Esta semana** es la entrada: entregas previstas, entregas que necesitan revisión y personas que pueden recibir trabajo. Hoy, mañana (siguiente día hábil), semana actual y próxima semana comparten la misma lectura. Los indicadores filtran la lista del equipo. Una fila por persona, con horas cronometradas hoy/semana, rango estimado por hacer, fiabilidad y próximo vencimiento. Al abrirla aparecen las tareas, sus motivos, acceso a Gestión y «Simular».
- **Bria** muestra tres decisiones inicialmente; «Por qué y evidencia» abre su explicación y se pueden ver las demás. La lectura guardada conserva fecha y autor; «Actualizar» relee los datos, «Volver a leer» genera una lectura nueva. Ninguna propuesta reasigna, crea ni envía por sí sola.
- **Historial** contiene los periodos de 7/30/90 días, cobertura, filtros por persona/formato/cliente/complejidad, promedio, mediana, percentil 75 y muestra. Las horas por día/semana y las observaciones del cronómetro se abren por elección. Las consultas históricas se hacen al entrar allí.
- El mapa de diez días se abre opcionalmente como **fechas de entrega**. Conserva los umbrales y el cálculo anteriores: agrupa por vencimiento y no demuestra que todo deba trabajarse ese día.

### Cómo se anticipan compromisos

`src/lib/teamForecast.js` calcula una sola previsión que `teamLoadService` adjunta como `forecast` a `GET /api/manager/rhythm/load`. La pantalla, la herramienta `carga_del_equipo` y el resumen que recibe Bria leen ese mismo resultado.

1. Horizonte de quince días hábiles de Colombia. Una fecha sin hora no hábil se lleva al siguiente día hábil; una hora explícita de compromiso/publicación se conserva incluso en fin de semana y no añade capacidad fuera de jornada. La fecha de publicación sin hora también limita una entrega posterior, pero no se presenta como una hora conocida.
2. `workPrediction.js` agrupa persona × tipo × cliente × complejidad. Busca primero el contexto exacto, después amplía a su complejidad, equipo/cliente/complejidad, equipo/complejidad, persona/tipo y equipo/tipo; siempre revela el alcance. Solo el contexto exacto con al menos tres mediciones comparables y 50 % de cobertura se considera suficiente. Sin historia usa una hora supuesta con confianza baja. El rango es mediana–percentil 75; el promedio se muestra aparte en Historial. No se entrenan duraciones completas con tareas privadas, colaboradores ni responsabilidad repartida entre personas.
3. Se descuenta únicamente tiempo válido del **responsable actual en el ciclo abierto**. No se descuentan colaboradores, otros responsables, ciclos cerrados, sesiones simultáneas ni sesiones de 8 h o más. No se usa el acumulado histórico de la tarea para inferir avance. Al alcanzar el tiempo habitual se conserva al menos 25 % (mínimo 15 min) pendiente y se pide revisar cuánto falta: nunca se da por terminada una tarea con el reloj.
4. Se acumula el trabajo por límite, empezando por las vencidas, contra la capacidad desde hoy hasta cada vencimiento y hora. Superar esa capacidad indica riesgo; superar capacidad con el extremo superior del rango o alcanzar el 90 % con el habitual indica margen ajustado. Las tareas que comparten el mismo límite reciben la misma lectura conjunta. En vistas futuras, horas pendientes y capacidad son acumuladas desde hoy hasta el cierre seleccionado; las entregas del indicador pertenecen al periodo elegido.
5. Referencia de 8 h nominales por día. Hoy se prorratea la franja operativa 8:00–18:00 de Bogotá; no se descuentan reuniones ni ausencias. Es una estimación condicional, no una promesa ni una probabilidad calibrada. Tampoco programa el orden real de ejecución ni comprueba compatibilidad de habilidades al sugerir apoyo.
6. «Puede recibir» requiere al menos media jornada libre incluso usando el extremo superior, sin vencidas, riesgos, fechas ajustadas, tareas sin fecha ni datos insuficientes. Una consulta que alcanza el tope de tareas se marca incompleta y nunca confirma espacio.

No hay cambios de esquema. La previsión y las simulaciones son de lectura; no cambian estados, fechas ni asignaciones.

### Analítica predictiva de la operación

Rodny aclaró: «quiero analítica predictiva, poder anticipar lo que podría pasar». Esta entrega conecta la lectura semanal con el historial contextual y los escenarios de asignación dentro de Ritmo:

- Tiempo habitual y variación por **persona × tipo de trabajo × complejidad × cliente**. Post, carrusel, reel y elaboración de parrilla son trabajos distintos. No comparar las 1 h 30 min de una persona con las 4 h de otra sin comprobar que el contexto sea comparable.
- Horas efectivamente registradas por persona, día y semana, separadas del trabajo futuro estimado. Los tramos se reparten en las fechas en que ocurrieron; cerrar una tarea el viernes no convierte en trabajo del viernes lo realizado desde el martes.
- Compromiso con hora: en los escenarios de Ritmo, cruzar el esfuerzo pendiente con la cola anterior y con la hora real de entrega/publicación. Ejemplo ilustrativo: asignar a las 15:00 un reel que suele tomar 4 h y debe publicarse a las 18:00 merece revisión, aunque la jornada nominal completa sea de 8 h. El límite de producción puede requerir margen para revisión y aprobación; no confundirlo automáticamente con publicar.
- Anticipación para mañana y la próxima semana, identificando la primera fecha que se queda sin margen y las tareas que explican el riesgo.
- Escenarios: qué cambia si se reasigna, se mueve una fecha o entra trabajo nuevo. Una simulación debe mostrar supuestos y nunca modificar asignaciones por sí sola.
- La calibración contra resultados reales queda pendiente. Se muestran riesgo y confianza del dato; no porcentajes de probabilidad ni calificaciones personales. Tampoco se descuentan reuniones/ausencias ni se comprueba disponibilidad de habilidades.

**Aviso retirado de las tareas (Rodny, 15 de octubre de 2026).** Crear o editar una tarea ya no muestra el bloque predictivo ni consulta previsiones al cambiar responsable o fecha, incluidos domingos. Rodny señaló que mezclaba trabajos de «Operaciones & Reuniones» y presentaba advertencias poco útiles para una tarea concreta. La exploración queda en Ritmo, mediante «Simular» y `TaskAssignmentForecast`; no reintroducirla automáticamente en el formulario.

Los escenarios consultan `POST /api/manager/rhythm/assignment-preview`. Solo administradores/PM con Manager; la ruta exige las dos puertas y verifica acceso a una tarea existente. La simulación sustituye la tarea en la cola, sin duplicarla, y conserva el límite de publicación. El navegador no fija las horas estimadas. Respuestas antiguas se descartan al cambiar la selección. La complejidad viene de las mismas reglas locales que clasifican tareas: es orientativa, no una medida fina validada.

`recordedWorkHours` distribuye sesiones por día de Bogotá y semana desde lunes, incluidas tareas abiertas; prorratea una duración corregida, separa declarado y excluye simultáneas/relojes olvidados. Horas solo se filtran por persona y periodo, como dice la pantalla. Consultas truncadas se señalan como parciales. Las tareas privadas conservan título y cliente públicos como en Gestión; el cálculo compartido no lee su clasificación ni pieza protegida y los perfiles contextuales las excluyen.

Bria puede consultar contexto y horas con `ritmo_del_equipo`, y los cuatro horizontes con `carga_del_equipo`. La lectura semanal recibe el alcance y muestra de cada previsión. El pulso usa el mismo riesgo para mañana y añade entregas de hoy con historial suficiente; no alerta desde una duración supuesta ni una consulta incompleta. Conserva topes, silencios y acciones actuales. El paso del reloj solo no vuelve a anunciar el mismo riesgo.

Pruebas: `tests/workPrediction.test.js`, `tests/assignmentPrediction.test.js`, `tests/predictiveRhythmUi.test.js`, `tests/teamForecast.test.js`, contratos de Ritmo, lectura semanal, pulso y herramientas de Bria. Recorridos visuales: `node tests/browser/teamRhythm.mjs` y `node tests/browser/predictiveRhythm.mjs`; capturas en `output/team-rhythm/` (datos inventados, ambos temas, móvil, escenarios y ausencia de avisos/consultas predictivas en las tareas con plazos entre semana y en domingo).

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
