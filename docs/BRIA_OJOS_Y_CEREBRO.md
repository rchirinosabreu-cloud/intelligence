# Bria como ojos y cerebro de la dirección

19 de octubre de 2026. Rodny: «quiero que BRIA sea mi project, mis ojos, mi cerebro… quiero mejorar los análisis que hace, la lectura que hace, la forma en que me recomienda o no hacer algo, que tenga autonomía en su lectura… esto necesito sea una guía, una ayuda continua». Y el mismo día: «arranquemos con eso, olvidemos lo de Meta, concentrémonos en la operación dentro de la plataforma».

Esta es la guía viva de ese camino: qué se va a construir, en qué orden y qué ya está.

## Lo que le faltaba a Bria

Bria ya tenía manos (acciones con confirmación), ojos de corto plazo (el pulso cada 15 minutos) y memoria de hechos de la agencia. Le faltaban cuatro cosas para pensar en grande:

1. **Memoria del tiempo.** Veía cómo está todo hoy, pero no cómo se movió: no sabía que una cuenta lleva diez días en rojo ni que alguien acumula vencidas desde el viernes.
2. **Una lectura propia.** Solo pensaba cuando le preguntaban o cuando saltaba un aviso; nunca se sentaba a leer el negocio entero.
3. **Criterio explícito.** No conocía cómo decide la dirección: qué cuenta pesa más, qué es grave, cuándo escalar, cuándo no hacer algo.
4. **Saber si acierta.** Recomendaba y nunca se enteraba de qué se decidió ni de cómo salió.

## Las cuatro piezas, en orden

| # | Pieza | Qué es | Estado |
|---|---|---|---|
| 1 | Memoria del tiempo y la mañana | Foto diaria de cada cuenta y persona, lectura del día con lo que haría y no haría, mensaje a las 7:30 | **Construida** (este documento, abajo) |
| 2 | Libro de decisiones | Cada recomendación queda anotada con lo que decidió la persona («lo hice», «no», «después») y, días después, qué pasó; así se mide el acierto | **Construida** (abajo) |
| 3 | Manual de criterio | Cómo decide Rodny, escrito con él en una sesión de preguntas; Bria lo cita al recomendar y propone ajustarlo cuando la corrigen, nunca lo cambia sola | **Construida** (sesión del 20 de octubre de 2026; abajo) |
| 4 | Rentabilidad y revisión mensual | Horas de Ritmo frente al fee de cada cuenta; revisión de cada cliente al cerrar el mes | Pendiente |

**Autonomía:** sigue mandando la regla de Rodny del 21 de septiembre de 2026 (`docs/BRIA_AUTONOMY_PLAN.md`): **la decisión final siempre es humana** y Bria no ejecuta nada sola, ni siquiera lo interno y reversible. Lo que crece es su lectura y la calidad de lo que propone; si algún día Rodny autoriza que algo concreto se ejecute solo, se decide aparte y por tipo. Lo que toca a un cliente, el dinero o los permisos pasa por una persona en cualquier caso. Los comentarios de Meta quedaron fuera del plan por decisión de Rodny.

Regla de todas las piezas: **el código manda**. Sin evidencia, Bria no afirma ni recomienda; una recomendación siempre dice qué la sostiene; nunca un juicio sobre una persona.

## Pieza 1: la memoria del tiempo y la mañana

Tres pasos cada día, cada uno una sola vez aunque el servidor se reinicie (`src/services/dailyReadingService.js`, `initDailyReadingScheduler` en `server.js`, cada 10 minutos):

1. **6:00 (Bogotá), todos los días: la foto.** Una fila por cuenta y por persona en `bria_memory.agency_snapshots` (`scripts/sql/bria-daily-reading.sql`).
   - **Cuenta:** el color y los motivos de Operación de clientes (el mismo cálculo, `clientOperationsService.listOperations`), lo publicado frente a lo esperado del mes, las piezas que esperan al cliente (en revisión, o aprobadas con material nuevo; un borrador no), devoluciones abiertas de piezas y de tareas, tareas abiertas y vencidas, y las tareas cerradas y horas **del día anterior**.
   - **Persona** (equipo activo sin administradores, como en el cierre del día): abiertas, en proceso, vencidas, devueltas, y cerradas y horas del día anterior. Una sesión de más de 8 h es un reloj olvidado y no se suma; las simultáneas tampoco.
   - Son números de trabajo, nunca una calificación. La tabla no tiene llave hacia el cliente a propósito: la historia sobrevive a la ficha.
2. **6:30, días hábiles: la lectura** (`bria_memory.daily_readings`).
   - **Los ojos** (`src/lib/agencySnapshot.js`, `readSignals`): comparan la foto de hoy con la historia de **esa misma** cuenta o persona. La base es la última foto de un día hábil, así que la lectura del lunes suma el fin de semana. Un día sin foto es desconocido y corta cualquier racha. Señales: cuenta que empeoró o mejoró de color, rojo sostenido, aprobaciones detenidas, devoluciones que suben, cuenta que nadie tocó en 4+ días hábiles, horas de la semana frente a las tres anteriores (solo con cuatro semanas de fotos); persona con vencidas sostenidas, vencidas que suben, carga inusual frente a su propia mediana, devueltas que suben, vencidas resueltas. Sin historia no hay señales: el primer día solo se dice lo que se ve.
   - **El cerebro** (`src/lib/dailyReading.js`): el modelo (`bria.daily-reading`, por el cliente gobernado) recibe las señales con su id y las cuentas en rojo o amarillo, y propone de 1 a 6 decisiones —HACER, CONVERSAR, VIGILAR o **NO_HACER**— con su porqué, la frase para pedírsela a Bria y una lectura corta de cada cuenta. **El código manda:** una decisión entra solo si cita señales reales, el sujeto lo pone la señal y no el modelo, y un juicio («lento», «flojo», «desempeño») la descarta. Si el modelo falla o no deja ninguna decisión respaldada, lee con las reglas de la plataforma (`fallbackDailyReading`): nunca se queda muda.
3. **7:30, días hábiles: el mensaje de la mañana.** A cada administrador y project manager con Bria, un chat nuevo «Lectura de la mañana · martes 20 de octubre» (`buildMorningBrief`), un aviso en la campana (`BRIA_LECTURA_MANANA`, abre el chat) y «Bria dejó tu lectura de la mañana» encima de la mascota (`LECTURA_DIA`, después del cierre del día y antes del foco de la semana). Una vez por día y persona (`bria_memory.morning_brief_deliveries`).
   - **Contenido:** cómo amaneció (cuentas por color y equipo, con «antes» cuando cambió), lo que se hizo desde la última lectura, **lo que haría hoy** (tres decisiones, cada una con «Se ve en» y «Pídemelo así»), **lo que no haría**, lo que también cambió y lo que mejoró. Mientras haya menos de cuatro semanas de fotos, lo dice.
   - **Alcance:** un administrador lee la agencia; un project manager, **sus cuentas** (`Client.projectManagerId`; si no tiene ninguna asignada, la agencia). La carga de las personas solo la ve quien tiene Manager.

**En el chat**, la herramienta `lectura_de_la_agencia` (administradores y project managers, regla 24 de Bria) responde «¿cómo viene X?», «¿qué cambió?», «¿desde cuándo?», «¿qué harías hoy?» y «¿qué no harías?» con la lectura del día y la serie día por día de una cuenta o una persona, con el mismo alcance que el mensaje. Solo lee.

**Medido:** dos preguntas nuevas en el conjunto de preguntas reales (`como-viene-cuenta`, `que-no-harias`). Con ellas el conjunto pasó 13 de 13 contra el modelo real. Al agregarlas, una pregunta anterior (`fecha-no-inventada`) empezó a fallar 2 de cada 8 veces: buscaba en la parrilla y respondía sin mirar las tareas. La regla 10 ahora pide buscar también en las tareas antes de decir que algo no está, y esa pregunta pasó 6 de 6.

**Contratos:** `tests/agencySnapshot.test.js`, `tests/dailyReading.test.js`, `tests/dailyReadingService.test.js`; con PostgreSQL real en la base aislada: `tests/dailyReadingPostgres.test.js`. **Muestra local:** `node scripts/preview-bria.js` y abrir `/?lectura`.

## Pieza 2: el libro de decisiones

Rodny, 19 de octubre de 2026: «avanza con el libro de decisiones», y la condición que lo define: «no quiero que se sienta de forma mecánica que uno la está enseñando». Por eso no hay botones ni formularios: el libro se llena con la conversación y con la plataforma.

**Cómo se ve desde la persona.**
- La lectura de la mañana propone, como siempre, sus decisiones numeradas.
- Durante el día la persona trabaja con Bria como quiera. Si en algún momento cuenta, de pasada, qué hizo con una de esas decisiones («ya le escribí a Gema», «lo de Aristea no, eso lo hablo yo en la reunión», «la de Endova la dejo para la otra semana»), Bria lo anota en media frase y sigue. No da las gracias, no pide confirmar, no pregunta por las demás.
- Al día siguiente la lectura abre con **«Lo que decidiste ayer»**: qué decidió y **qué pasó**, leído de la plataforma, no preguntado: «la hiciste; hoy la señal ya no se ve» o «la descartaste; hoy Aristea sigue en rojo». Si de alguna decisión no supo nada, lo dice en una sola frase («de ayer no supe qué pasó con…; si la trabajaste o la descartaste, cuéntamelo cuando puedas») y no insiste.
- Si se le pregunta «¿cómo vas acertando?», responde con cifras de sus decisiones: cuántas propuso, cuántas se hicieron, cuántas de esas se resolvieron, cuántas descartadas se resolvieron solas.

**Cómo aprende sin que nadie la entrene.**
- **El desenlace lo lee el código** (`decisionOutcome`), desde la lectura del día siguiente y hasta 14 días: sigue (hay una señal que empeora del mismo sujeto, o la cuenta sigue en rojo, o la persona sigue con dos o más vencidas), mejoró (hay una señal que mejora) o ya no se ve. Una decisión «no hacer» no se mide.
- **Lo que la dirección descarta tres veces seguidas en 30 días deja de proponerse** (`suppressedDecisions`), salvo que la señal suba a la gravedad máxima. Un «hecho» reinicia la cuenta. Así Bria deja de insistir en lo que no se quiere sin que nadie se lo diga.
- **El acierto** (`scorecard`) mide decisiones, nunca personas: adopción, hechas que se resolvieron, descartadas que se resolvieron solas, descartadas que siguen. Es la cifra que dirá, con los meses, si Bria vale la pena.

**Qué no hace.** No cambia su criterio por su cuenta (eso es la pieza 3, con Rodny), no ejecuta nada, no anota por adivinar: si no entiende a cuál decisión se refiere o qué decidió, pregunta en una frase. Regla pura en `src/lib/decisionLog.js`; tabla `bria_memory.decision_log`; herramienta `anotar_decision`. Contratos: `tests/decisionLog.test.js`, `tests/dailyReadingService.test.js`, `tests/dailyReadingPostgres.test.js`.

## Pieza 3 — El manual de criterio (20 de octubre de 2026)

**Qué es.** Cómo decide Rodny, escrito con él en una sesión de doce preguntas en el chat y guardado como **trece reglas numeradas** en la memoria de la agencia (`bria_memory.agency_facts`: entidad «Brain Studio», tema `criterio`, origen `EQUIPO`, certeza `CONFIRMADO`, actor Rodny). No hay tabla nueva ni pantalla: el manual **es memoria**, como todo lo que el equipo le enseña a Bria, y se corrige por la misma vía (`guardar_en_memoria` reemplaza la regla anterior, que queda `SUPERSEDED` con su historial). Las reglas que contradecían lecturas anteriores de los chats las sustituyeron; las dudas que respondían quedaron cerradas.

**Las reglas, en resumen** (el texto completo vive en la memoria):
1. Nada se publica sin aprobación del cliente; excepción del equipo: si de verdad no responde y conocemos su criterio, se publica con confianza. Bria avisa antes de la fecha cuando falta la aprobación, sin frenar.
2. Lo ajustado vuelve al cliente antes de publicarse, salvo al límite de tiempo o de publicaciones, o si el ajuste es sencillo y evidente (una tilde, un tono).
3. Liderar al cliente o darle literal lo que pide es criterio del equipo, cuenta por cuenta: dato de la ficha, no regla general.
4. Días sin publicar: tres días es alerta para cualquier cliente salvo un plan muy básico; seis días es grave.
5. Lo que Bria le sube directo a Rodny sin pasar por el PM: cliente en riesgo de irse, pauta apagada por falta de pago, contenido publicado en la cuenta de otro cliente, cualquier error con MIO, entrega web atada a un evento. Lo demás va al PM.
6. Prioridad entre cuentas: MIO Agencia y sus clientes primero; hoy el objetivo es que todas estén sanas, y en un momento crítico se cuida más al que más paga. *(Propósito `direccion`, sensibilidad restringida: solo la ve la dirección.)*
7. La carga de una persona se mide por horas estimadas y por vencidas acumuladas; noches y fines de semana no son señal por sí solos (Bria dice el hecho sin suponer el motivo).
8. Línea roja en web: nunca se entregan accesos al cPanel ni al hosting; si el cliente los exige, la responsabilidad del sitio pasa a él y se deja por escrito.
9. Nunca se promete una fecha sin los insumos completos, ni se promete al cliente lo que no pidió.
10. Todo trabajo fuera de alcance se cuenta y se cobra por bloque; Bria avisa cuando una cuenta acumula pedidos fuera de parrilla o versiones de más.
11. A un mensaje del cliente se le acusa recibo siempre: lo normal es 20 a 30 minutos; una o dos horas es inaceptable; medio día, lo peor. (Bria la cita, no la vigila mientras los chats vivan en WhatsApp.)
12. En los informes y ante el cliente se cuida el tono aunque los resultados sean malos; hacia adentro, y en lo que Bria le dice a Rodny y al equipo, crudo y sin suavizar.
13. No hay regla general sobre el uso de IA en el contenido: Bria propone y el criterio final es del equipo, cliente por cliente.

**Cómo se usa.**
- **La lectura de la mañana lo lee entero** antes de escribir (`dailyReadingService`, `criteria()` → `buildDailyDigest({ criteria })`: sección «Criterio de la dirección (confirmado por Rodny)» con `[R:<id>]` por regla). El modelo debe decir en cada decisión **qué regla aplica** (`regla`), nunca proponer contra una y, si una regla pide no hacer algo, proponerlo como «no hacer» con esa regla. `validateDailyReading` conserva la regla **solo si el id existe** en el manual: una regla inventada se descarta. Si la memoria no responde, la lectura sale sin el manual y se anota; nunca se frena por eso.
- **El mensaje lo cita**: «Según tu criterio: «Regla 4. …»» debajo de la evidencia. Una regla de propósito `direccion` (la 6) se cita completa solo a la dirección; a un project manager se le dice «Según el criterio de la dirección.» y nada más.
- **La regla 10 vive también en las señales**: `FUERA_DE_ALCANCE` (`agencySnapshot.readSignals`) avisa cuando una cuenta tiene más piezas creadas que las contratadas, con cuántas de más; la lectura sin modelo la vuelve «Revisar el alcance de X».
- **En el chat**, la regla 24 de Bria le pide citar la regla que aplica cuando recomienda, no recomendar contra ninguna y, si la corrigen en algo que una regla dice, **ofrecer guardar la corrección** con `guardar_en_memoria` en vez de cambiarla sola.

**Qué no hace.** No convierte las reglas en criterios editoriales de la revisión automática de parrillas (eso se decide aparte, por cliente, en `ClientEditorialCriterion`); no aplica el manual a personas (ninguna regla juzga a nadie: la 7 mide carga, no desempeño); no inventa reglas que la dirección no dijo. Contratos: `tests/dailyReading.test.js`, `tests/dailyReadingService.test.js`, `tests/agencySnapshot.test.js`.
