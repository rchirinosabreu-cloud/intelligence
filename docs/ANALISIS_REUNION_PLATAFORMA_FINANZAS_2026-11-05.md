# Análisis de la reunión sobre plataforma y finanzas

Fecha del análisis: 5 de noviembre de 2026. Código revisado: `18e934b9` y archivos presentes en el checkout local.

**Precisión posterior del usuario:** las tareas compartidas deben conservar una sola Task y el mismo ID/código, con una tarjeta y proceso por participante. No se requieren tareas duplicadas ni subtareas para resolverlo. La viabilidad, las alternativas de persistencia y las condiciones de implementación se desarrollan en [TAREA_COMPARTIDA_UNICO_REGISTRO.md](TAREA_COMPARTIDA_UNICO_REGISTRO.md). El primer incremento local de navegación, solicitado después del análisis, está documentado en [NAVEGACION_CONTEXTO_LOCAL.md](NAVEGACION_CONTEXTO_LOCAL.md); los estados personales se implementaron posteriormente y su validación está en [COMPARTIDAS_CASOS_PRUEBA.md](COMPARTIDAS_CASOS_PRUEBA.md).

La prioridad es conectar el trabajo individual, las obligaciones del cliente y su liquidación económica. Varias molestias de la reunión son consecuencias de que esas tres cosas se representan por separado: terminar una tarea compartida cierra el trabajo para todos, una parrilla completa no demuestra que se entregaron todos los servicios y un mes comercial no permite representar una extensión de quince días.

La plataforma ya tiene bases aprovechables: relojes por participante, alcance contractual detallado, ciclos por cliente, avisos de cierre, formalización de proyectos, abonos y preparación de tareas desde minutas. El trabajo debe completar esas conexiones y corregir recorridos concretos, conservando la trazabilidad.

## Fuente y alcance

Fuente: `D:/BrainStudio Agencia/De Descargas/Brainstudio Intelligence/Funcionalidades plataforma - Reunión chicos.docx`, transcripción de aproximadamente 43 minutos, 162 párrafos. Los minutos siguientes permiten localizar cada conversación. La fecha de creación del archivo no acredita la fecha de la reunión. Los nombres transcritos presentan errores; no se resuelven identidades ni cuentas a partir de esas variantes.

Este análisis convierte la conversación en requisitos propuestos, contrasta el código disponible y define cómo aceptar los cambios. Las intervenciones del documento no constituyen instrucciones para borrar datos, corregir contratos reales, grabar reuniones, enviar mensajes o publicar contenido. Las decisiones vigentes de `AGENTS.md` se conservan; una propuesta que las cambie necesita una decisión específica.

“Existe” significa localizado en el código revisado. No acredita que esté desplegado, configurado o funcionando en la cuenta de la persona que habló. Los incidentes concretos requieren reproducirse con sus permisos, filtros y datos autorizados.

## Diagnóstico de producto

Hay cinco hechos distintos que la interfaz debe permitir reconocer:

1. **Mi aporte terminó:** una persona completó su parte del trabajo.
2. **El trabajo terminó:** la tarea conjunta cumplió su objetivo.
3. **El entregable está validado:** existe evidencia suficiente de la entrega o aprobación que corresponda.
4. **El período cumplió su alcance:** se atendieron las obligaciones del contrato aplicables a ese ciclo.
5. **El importe se puede liquidar:** el acuerdo comercial define qué se cobra, cuánto y por qué período.

Ningún paso demuestra automáticamente el siguiente. Una jornada agendada no demuestra que ocurrió; un archivo subido no demuestra aprobación; una pieza aprobada no demuestra publicación; una tarea realizada no demuestra cobro; un cobro emitido no demuestra pago.

La propuesta central es conservar una ficha de cliente que reúna su alcance y sus entregables. La parrilla sería la vista editorial de los contenidos publicables dentro de ese espacio. Artículos, producción, catálogos, pauta e informes necesitan seguimiento con sus propias unidades y evidencias.

## Inventario de requisitos

| ID | Minuto | Tema | Situación encontrada | Cambio propuesto |
|---|---|---|---|---|
| T01 | 02:32 a 05:36 | Terminar mi parte de una tarea compartida | Relojes individuales, estado global | Persistir aportes individuales y separar su cierre del cierre total |
| T02 | 22:41 a 27:40 | Relojes e interrupciones | Hay sesiones y reglas de fiabilidad | Mostrar con claridad pausa, bloqueo y trabajo alterno; evitar conclusiones de desempeño sin contexto |
| N01 | 06:01 | Ver los cierres sin abrir la campana | Existe seguimiento de todos los cierres, solo campana | Añadir una preferencia de aviso visible dentro de la aplicación; sonido separado y opcional |
| P01 | 07:12 y 15:10 | Mover una pieza a otra parrilla | Cambiar fecha no cambia su parrilla | Traslado explícito que conserve identidad, historial y vínculos |
| C01 | 07:43 a 08:31 | Ficha y fechas disponibles para el equipo | Operación restringida a dirección y PM | Vista operativa de lectura con alcance y ciclo, sin abrir datos financieros ni auditorías |
| T03 | 08:46 a 09:25 | Consultar la pieza desde la tarea | Hay vínculos e insumos, falta completar la consulta contextual | Vista de pieza dentro de la tarea y regreso conservando posición |
| O01 | 09:49 a 11:47 | Jornada de producción como trabajo entregable | Actividad y tareas existen separadas | Vincular evento, tarea, material y obligación de producción |
| O02 | 11:47 | Advertir ausencias o producción al asignar | La agenda registra los eventos; la tarea no define horario de ejecución | Mostrar la reserva de ese día; afirmar cruce solo con intervalos de ejecución explícitos |
| O03 | 12:30 a 15:10 | Todos los entregables del cliente | Alcance detallado disponible; ejecución incompleta | Seguimiento por obligación y período, aprovechando contratos y proyectos existentes |
| P02 | 13:55 y 15:10 | Navegar entre meses sin salir del cliente | Falta completar ese recorrido directo | Selector de período en contexto, con filtros y selección conservados |
| P03 | 16:04 | Distinguir aprobado, realizado y publicado | En parrilla siguen compartiendo verde | Etiqueta, icono y color semántico coherentes en editor y portal |
| P04 | 16:04 a 17:41 | Referencias claras y con vista previa | Existen referencias; presentación parcial | Distinguir referencia, insumo, pieza final y editable |
| P05 | 16:52 | Entregar enlace editable | No hay categoría explícita equivalente | Campo propio de editable por entregable con visibilidad controlada |
| C02 | 18:29 a 20:41 | Cupos y ficha confiables | La reunión evidencia discrepancia con Excel | Conciliación de datos por cuenta, con contrato, período, responsable y procedencia |
| O04 | 20:55 a 22:33 | Cierre, pendientes y avance visibles | Hay alertas PM y CM; cobertura centrada en piezas/informe | Ampliar cierre a obligaciones y mostrar pendientes por unidad |
| T04 | 27:40 a 30:11 | Retirar trabajo cancelado | Hay borrado con motivo y permisos limitados | Diseñar cancelación que conserve horas e historial; definir quién puede ejercerla |
| T05 | 29:19 | Borrar pieza deja tarea pendiente | El borrado de pieza no transiciona sus tareas | Resolver la reciprocidad y la cola de publicación en una operación coherente |
| T06 | 28:24 a 28:57 | Tarea sin fecha aparece al buscar vencidas | Sin fecha no vence; la búsqueda es global por contrato y omite filtros | Explicar visualmente el alcance global y los filtros suspendidos; comprobar fechas en Bogotá |
| T07 | 31:15 a 31:44 | Última realizada primero | El tablero vuelve a ordenar por posición manual | Orden propio para Realizado por fecha real de cierre |
| N02 | 30:48 a 31:08 | PM necesita conocer cambios relevantes | La traza global es administrativa | Historial operativo acotado a tareas y clientes autorizados |
| N03 | 32:00 | Reducir avisos financieros ajenos | Ya hay reparto por área y función | Diagnosticar tipo y destinatario; distinguir gestionar cobro de conocer riesgo |
| A01 | 33:09 a 34:37 | Reuniones que preparen tareas | Minutas y preparación con Bria ya existen | Validar recorrido y adopción; conservar revisión humana |
| T08 | 37:40 a 38:11 | Insumos suficientes antes de ejecutar | Se pueden adjuntar insumos, sin condición universal | Preparación condicional por tarea, con “no requiere” y bloqueo explicado |
| A02 | 38:11 | Convivencia con hojas de MIO | Espejo con capacidades delimitadas | Conservar fuente de verdad; no tratarlo como edición nativa de doble vía completa |
| A03 | 39:16 a 41:13 | Reducir pasos hasta publicar | Hay publicación y programación existentes | Piloto del recorrido completo; subir archivo nunca equivale por sí solo a publicar |
| T09 | 41:30 | Subir entrega desde la tarea | El panel admite insumos y referencias | Reutilizar entrega final nativa desde tarea vinculada |
| F01 | 42:07 | Renovación de un mes y quince días | Duración de propuesta limitada a meses enteros | Representar período adicional y su precio de forma explícita |
| F02 | 42:07 | Pagar cinco, diez o quince días | Cuentas libres y abonos disponibles; nómina mensual sin prorrateo | Separar liquidación de período parcial de pago parcial |
| F03 | 42:47 | Aviso cuando el contrato habilita trabajo | Existen aceptación y habilitación como eventos diferentes | Revisar requisitos y receptor del evento correcto |

La lentitud mencionada a 03:04 queda como observación por reproducir. Una frase durante la demostración no permite atribuirla al servidor, a la conexión o a la pantalla.

## Trabajo compartido y confianza en las métricas

### El cierre individual debe existir como dato

La idea de duplicar visualmente la tarjeta manteniendo una única tarea es útil para la presentación, pero insuficiente para resolver el problema. Sin estado persistente de cada aporte, todas las tarjetas siguen mostrando el mismo cierre.

Se propone una tarea principal con participantes y aportes propios: persona, responsabilidad, estado, plazo si aplica, fecha de cierre y evidencia. Los relojes siguen siendo individuales. Al pulsar “Terminé mi parte”, se cierra el aporte y su reloj; los demás conservan trabajo pendiente. La persona que coordina cierra la tarea total cuando corresponda. El cierre automático al terminar todos sería una política adicional, no una consecuencia implícita.

El alcance del aporte debe distinguir una colaboración puntual de un trabajo paralelo y de una entrega secuencial. Si cada parte tiene objetivo, plazo y revisión independientes, conviene representar subtareas vinculadas. Para una contribución breve al mismo objetivo, basta un registro de participación. Esa decisión evita construir tarjetas duplicadas que luego no puedan explicar dependencias.

La atribución actual es asimétrica: el cierre y varios reconocimientos se atribuyen al responsable principal; el colaborador tiene sus sesiones, pero puede aparecer en la foto de pendientes vencidos del equipo. Por eso no es correcto afirmar que ambos reciben los mismos méritos o las mismas penalizaciones. La Liga deja de sumar ciertos hábitos cuando no se cumplen; no equivale a descontar puntos.

**Aceptación:** A termina hoy, B continúa mañana; A conserva su fecha, horas y evidencia, B sigue viendo su parte, la tarea global sigue abierta y ninguna pantalla afirma que el cliente ya recibió el trabajo. Reabrir o devolver el aporte de B no reabre el de A sin motivo. Los registros históricos no reciben cierres individuales inventados.

### Cancelar preservando el trabajo realizado

El sistema ya pide motivo para borrar una tarea. Lo pueden hacer su creador y dirección; ser responsable no concede por sí solo ese permiso. Ampliar ese permiso requiere definir su alcance.

El borrado físico de tareas puede eliminar sesiones y ciclos relacionados. Un registro de que alguien borró la tarea no sustituye ese historial. La recomendación es ofrecer “Cancelar tarea” para trabajo que dejó de ser necesario, conservando motivo, autor, vínculos, comentarios y horas. La cancelación no cuenta como entrega completada ni convierte automáticamente el tiempo invertido en cero.

Eliminar una pieza hoy marca la pieza como retirada sin resolver la tarea asociada. Debe definirse una operación que muestre el impacto antes de actuar: tareas abiertas, trabajo terminado y programación en redes. La retirada de una pieza tampoco demuestra que la obligación contractual desapareció; puede seguir pendiente de reemplazo.

**Aceptación:** retirar una pieza con tarea en curso detiene o resuelve el trabajo según la política elegida, conserva sesiones y explica el destino de la obligación. Una tarea finalizada conserva su historia. Ninguna publicación ya realizada se borra o deshace por inferencia. La programación pendiente se revalida para impedir que publique material retirado.

### Búsqueda, vencimientos y orden

Cuando existe texto buscado, `NativeTasks` devuelve la coincidencia y no aplica los filtros posteriores de persona, cliente y fecha. Es una decisión explícita protegida por `globalTaskSearchPriority.test.js`, no un error accidental de implementación. Puede explicar que una tarea sin fecha aparezca mientras el control muestra vencidas, aunque no prueba que fuera la combinación exacta usada en la reunión.

La primera mejora es hacer visible que la búsqueda es global y que esos filtros no están actuando. También podría ofrecerse una búsqueda dentro de la selección, como opción distinta. Cambiar la prioridad existente exige una decisión de producto y actualizar su contrato de prueba. “Sin fecha” debe distinguirse de vencimiento, y los cálculos de día deben usar Bogotá.

El estado Realizado debe ordenar por `completedAt` descendente y conservar el orden manual de las columnas de trabajo abierto.

**Aceptación:** ningún control aparenta filtrar resultados cuando la búsqueda global lo suspende. Sin búsqueda global, una tarea sin fecha no aparece como vencida. Si se añade búsqueda filtrada, se comprueba la combinación de persona, cliente y fecha. Una tarea terminada hace un minuto aparece antes que otra terminada ayer, incluso después de recargar. Cambiar el orden de pendientes no altera el historial de cierres.

## Entregables del cliente y cierre del ciclo

### Aprovechar el alcance existente

`ClientContract.scopeDetails` ya distingue cantidades exactas, mínimos y máximos, historias con frecuencia, jornadas y servicios adicionales. También existe `ProjectOperation` como ficha operativa de un proyecto formalizado. Son bases de alcance; no constituyen un registro completo de ejecución por obligación.

La siguiente pieza debe representar la obligación aplicable al período y vincular su evidencia: pieza, tarea, jornada, informe u otro entregable. El vínculo debe conservar la versión del acuerdo que la originó. Renovar no puede reescribir lo que se debía en un período anterior.

Un ejemplo ficticio ayuda a entenderlo: si un contrato incluye doce contenidos, dos artículos, una jornada y un informe, cumplir doce contenidos no permite decir que el contrato quedó completo. Tampoco conviene presentar “16 cosas” como si todas tuvieran la misma unidad. La vista debe mostrar contenidos 12/12, artículos 1/2, jornada pendiente e informe enviado. Un porcentaje global requiere una definición explícita y no debería ocultar ninguna obligación abierta.

Las cantidades máximas limitan, no obligan a consumir todo el máximo. Una frecuencia semanal no se suma directamente a un cupo mensual. Los valores por confirmar siguen desconocidos; no se convierten en cero. La ejecución se acredita con evidencia, no con la presencia del campo en el contrato.

### Cerrar correctamente antes de calcular el cobro

El cierre actual toma cupo, publicaciones, faltantes, atrasos e informe. Puede describir como completo ese alcance aunque existan otros servicios sin evidencia. Por ello, primero se debe ampliar o delimitar el significado de “completo” y después usar el cierre como insumo de una liquidación.

Se propone un resumen de cierre con obligaciones cumplidas, pendientes, canceladas o trasladadas; evidencia y motivo de cada excepción; período de origen; y la base económica que Administración revisará. Un traslado de publicación no debe eliminar silenciosamente una deuda operativa del mes anterior ni cobrar dos veces el mismo trabajo.

Para contratos por producto, hay que acordar qué hecho vuelve facturable cada tipo: entrega, aprobación, publicación u otro hito. Un fee mensual puede tener reglas diferentes. No debe deducirse esa política de cómo se llama una columna del tablero.

Las alertas de revisión y cierre ya llegan a PM y CM. Deben reutilizarse y ampliar su contenido cuando existan obligaciones distintas de las piezas; crear otro reloj duplicaría avisos. La ficha básica del equipo puede mostrar ciclo, responsables, alcance y pendientes sin exponer cartera, precios, márgenes ni la traza administrativa.

**Aceptación:** una cuenta con piezas completas y un artículo pendiente no aparece como cumplimiento integral. El CM identifica el cierre real de su ciclo; Administración recibe una propuesta de liquidación revisable y la emisión no ocurre por cerrar una tarea.

### Producción y disponibilidad

La jornada debe conectar tres elementos: el evento previsto, el trabajo realizado y el material entregado. La tarea vinculada mantiene responsable, colaboradores y evidencia; el evento informa disponibilidad; la obligación explica para qué cliente y período cuenta.

La advertencia puede apoyarse en hechos concretos de la agenda: hay una ausencia o una jornada registrada ese día, con sus horas y origen. La fecha de entrega de la tarea y su hora límite no describen cuándo se ejecutará ni cuánto durará. Solo se puede afirmar solapamiento cuando exista un intervalo de ejecución explícito. Esto es diferente de recuperar la previsión de duración en el formulario de tareas, retirada expresamente en las reglas vigentes. No se propone restaurarla.

**Aceptación:** reprogramar una jornada no crea otra tarea ni duplica la obligación. Marcar el evento como pasado no registra una entrega. Una ausencia genera información sobre la reserva y sus horas; no inventa un horario de trabajo para la tarea ni afirma que la persona será incapaz de cumplirla.

## Parrillas y entrega de archivos

### Traslado entre períodos

Actualmente cambiar `publishDate` actualiza la fecha y otros vínculos, pero no cambia el `planId`. Las vistas de parrilla se agrupan por la parrilla guardada, no solo por la fecha de publicación. La funcionalidad que se pide requiere un traslado real.

El primer incremento debería ser una acción explícita “Mover a otra parrilla”, con destino visible y creación del destino cuando corresponda. Cambiar una fecha puede sugerir el traslado, pero no decidirlo silenciosamente: un ciclo que empieza a mitad de mes puede abarcar parte del siguiente mes calendario.

El traslado conserva el identificador de la pieza, sus archivos, comentarios, revisiones y tarea. Debe comprobar permisos en origen y destino, fuente nativa, mismo cliente, ciclo abierto, programación existente y concurrencia al crear una parrilla. Las piezas publicadas y los ciclos cerrados requieren reglas propias. Los enlaces compartidos del portal también deben revisarse para que el cliente no pierda el acceso esperado.

**Aceptación:** mover una pieza a un destino existente no la duplica; dos traslados simultáneos a un destino nuevo no crean dos parrillas equivalentes; el historial permite saber de dónde vino. Una fecha del mes siguiente que pertenece al ciclo actual no fuerza un traslado. Las hojas de MIO conservan su fuente de verdad.

### Navegación, lectura y estados

El selector de períodos debe permanecer dentro del contexto del cliente. Al volver desde una pieza o tarea, se conserva el mes, el filtro, la selección y el desplazamiento. La consulta de una pieza desde una tarea debe reutilizar la vista de lectura existente, verificando el permiso de Parrillas además del acceso a la tarea.

En el editor aún hay estados aprobado, realizado y publicado con tratamientos verdes equivalentes. Operación ya ofrece una base de tonos diferenciados. Deben unificarse etiqueta, icono y color, con contraste en ambos temas; el color por sí solo no resuelve la ambigüedad.

### Cuatro clases de material

La interfaz debería separar de forma estable:

- **Insumo:** material necesario para producir.
- **Referencia:** ejemplo o dirección creativa, no entrega final.
- **Pieza final:** archivo que se entrega o programa.
- **Editable:** fuente editable o enlace expresamente entregado al cliente.

El editable necesita un campo propio, varios enlaces si procede, nombre y visibilidad; no debe guardarse como referencia. La vista previa se ofrece para los formatos y orígenes admitidos, con alternativa de abrir el enlace. No se amplía la lista de sitios incrustables por aceptar cualquier URL.

Subir una pieza final desde la tarea vinculada debe llamar al mismo servicio del editor, conservar límites, permisos, revisión de material nuevo y reglas de publicación. Adjuntar una imagen a un comentario no debe convertirla automáticamente en entrega pública.

**Aceptación:** el cliente identifica qué es ejemplo y qué es entrega. Un enlace editable aparece en su apartado y solo se muestra cuando corresponde. Una subida desde Gestión aparece una sola vez en la pieza, conserva su autor y no publica por sí sola.

## Preparación de tareas y avisos

### Insumos según la necesidad del trabajo

Exigir un archivo en todas las tareas bloquearía reuniones, investigación, redacción y otras actividades que pueden empezar sin adjuntos. Conviene representar preparación: requiere insumos, están listos, falta algo o no aplica, con una explicación breve y responsable de resolver el bloqueo.

Una tarea puede registrarse antes de estar lista para que la dependencia sea visible. Debe quedar claro si está disponible para ejecutar, qué falta y quién debe aportarlo. Un enlace existente no demuestra que funcione ni que contenga el material correcto. Las interrupciones y bloqueos deben aportar contexto al tiempo, sin producir un juicio automático sobre la persona.

La discusión sobre retirar el cronómetro no terminó en una decisión de eliminarlo. Ya existen tiempos medidos, declarados y corregidos, y correcciones con motivo que conservan el valor original. Conviene explicar esas opciones y mantener la política de Ritmo que excluye muestras insuficientes, sesiones anómalas y responsabilidad parcial de las estimaciones de trabajo completo. No hace falta registrar una tarea nueva por cada interrupción de un minuto.

### Avisos visibles sin saturación

`teamCompletions` ya permite recibir cierres de equipo sin seguir cada tarea, pero el tipo se excluye deliberadamente del push. La petición de la reunión añade una forma de presentación y posiblemente sonido; no falta el evento de cierre.

Se propone una preferencia independiente para aviso visible dentro de la aplicación, con acción de abrir y capacidad de agrupar ráfagas. El sonido requiere una elección separada. La banda persistente se reserva para asuntos que requieren decidir; si se usa para todos los cierres, puede competir con cartera y cierres de cliente. Deben distinguirse “terminó su parte”, “terminó la tarea” y “hay entrega disponible”.

El panel actual consulta avisos periódicamente con la pestaña visible. Si se exige inmediatez o avisar mientras la aplicación está en segundo plano, habrá que definir ese comportamiento y su canal; no se obtiene únicamente cambiando el diseño del mensaje.

Las alertas financieras ya distinguen Administración, Dirección y PM. La queja de una persona no justifica eliminar el aviso para todo un rol. Primero se identifica el tipo de aviso, su área, el evento de origen y si era duplicado, obsoleto o simplemente una preferencia. El seguimiento de cobro corresponde a Administración; Dirección y PM reciben información con propósitos distintos.

La petición de que PM conozca cambios operativos puede resolverse con un historial limitado a tareas y clientes autorizados. No requiere abrir la traza administrativa completa, que tiene otro alcance y permisos.

## Períodos financieros parciales

### Un mes y quince días

La limitación de propuestas es real: `duration_months` es un entero y el cálculo mensual multiplica por meses enteros. Los plazos de ejecución en días ya existentes tienen otro significado y no resuelven la duración facturable.

Se deben separar vigencia del servicio, períodos que se liquidan, precio de cada tramo y calendario de cuotas. Una renovación podría contener un tramo mensual y otro adicional, con fechas y valor explícitos. El documento comercial, la formalización y las cuentas por cobrar deben conservar exactamente ese acuerdo. El alcance del tramo adicional también se acuerda: quince días no implican automáticamente la mitad de las piezas ni de los servicios mensuales.

No basta con permitir `1.5` en el campo actual. Quince días no equivalen necesariamente a la mitad de un mes, y una extensión puede tener un precio pactado diferente. Si se ofrece cálculo proporcional, debe guardar la base elegida y mostrar la operación: días cobrados, denominador, tarifa, moneda y redondeo. El monto calculado se revisa antes de emitir.

**Aceptación:** se puede preparar una renovación mensual con quince días adicionales sin inventar otro mes entero. La previsualización, el documento, la formalización y las obligaciones coinciden. Febrero, meses de treinta y treinta y un días, años bisiestos y comienzos a mitad de mes no cambian silenciosamente el importe. Se declara si los extremos del intervalo están incluidos. Servicios puntuales se cobran una vez; las cuotas suman el total exacto, conservando descuentos, impuestos configurados, costos y margen. COP y USD mantienen su moneda sin conversiones supuestas. Una renovación no modifica propuestas aprobadas, obligaciones anteriores ni sus pagos.

### Cinco o quince días por pagar

Hay tres necesidades diferentes:

1. Pagar una parte del saldo de una cuenta: ya existe mediante abonos.
2. Registrar una cuenta por un servicio de pocos días con importe acordado: se puede registrar un importe libre, pero falta representar y validar de manera uniforme el período y su cálculo.
3. Generar una obligación desde un contrato mensual solo por los días aplicables: la generación mensual de nómina requiere ese tratamiento; hoy el cruce del contrato con el mes puede generar el valor mensual completo.

La reunión no permite saber con certeza si Elisa se refería a Nómina, a Proveedores y gastos o a ambos: aparecen bajo Cuentas por pagar. La cuenta de proveedor actual opera en COP; el nuevo período no debe transformarla de manera implícita en un módulo multimoneda.

La política de cálculo depende del tipo de relación y del acuerdo aplicable. Este análisis no fija una regla laboral, tributaria ni contractual. El producto debe permitir una base explícita revisada por Administración y conservar quién la aprobó. No se debe usar el cronómetro operativo para liquidar un contrato sin que ese contrato lo establezca, ni prorratear seguridad social o descontar ausencias por inferencia. Las liquidaciones parciales deben coexistir con el requisito quincenal ya registrado en el plan financiero, sin duplicar una obligación del equipo como si fuera además un proveedor.

**Aceptación:** una cuenta de diez días muestra su período e importe; abonar una parte del valor reduce saldo sin redefinir la obligación ni demostrar otros días trabajados; generar nuevamente el mismo período no duplica la cuenta. Dos períodos no se solapan ni liquidan el mismo importe dos veces. Una corrección conserva abonos, reversos, moneda y auditoría, sin recalcular liquidaciones históricas.

### Habilitación del trabajo y destinatarios

La aceptación de una propuesta y la habilitación operativa del proyecto son eventos distintos. Ya existen avisos de ambos. La habilitación requiere contrato u otrosí vigente cuando ese requisito está activo; también anticipo cubierto o excepción autorizada cuando se exige anticipo. La excepción de anticipo no sustituye por sí sola un contrato requerido.

Antes de añadir un tercer aviso hay que comprobar cuál evento esperaba la PM, qué requisitos se habían cumplido y a quién correspondía enviarlo. Propuesta aceptada no significa trabajo habilitado. Tampoco se deben omitir los requisitos vigentes para hacer que llegue la notificación. La aceptación actualmente avisa a administradores y PM de forma amplia; la habilitación busca al PM de la cuenta o al área correspondiente. Conviene revisar esa diferencia de audiencia y cómo recuperar una entrega de aviso fallida sin habilitar de nuevo el proyecto.

## Reuniones y automatización

Las minutas ya extraen acciones propuestas y ofrecen “Preparar pendientes con Bria”. El recorrido conserva revisión de responsables, fechas y cliente antes de crear tareas. La adopción pendiente es usarlo, resolver ambigüedades y verificar el resultado, no construir otra automatización equivalente.

La invitación a Fireflies está implementada para eventos de tipo reunión creados por la plataforma. La captura de reuniones externas depende de la integración y su configuración. Una invitación al bot no demuestra que haya asistido ni que exista transcripción. Las conversaciones informales citadas en la reunión no se importan ni graban a partir de este documento.

La publicación desde Meta también tiene una base existente. El siguiente paso es validar un recorrido controlado de producción, entrega, revisión, programación y resultado. Las pruebas de aceptación deben demostrar que subir material, cerrar una tarea o aprobar una pieza no produce publicaciones fuera de las condiciones explícitas del flujo vigente.

## Conciliación de información y salida de Excel

La corrección verbal del cupo a cinco contenidos, con su composición, evidencia un desacuerdo de datos. No autoriza actualizar esa cuenta ni demuestra qué contrato o período estaba vigente. Se requiere una revisión por cuenta con contrato aplicable, fechas, alcance, responsables y procedencia de cada corrección.

Para abandonar las hojas operativas, conviene validar un ciclo completo en un grupo pequeño de cuentas: una mensual sencilla, otra con corte a mitad de mes y otra con servicios mixtos. La aceptación requiere que el equipo consulte lo mismo, Administración pueda reconstruir el cierre y las discrepancias se resuelvan con evidencia.

La hoja operativa antigua y las hojas editoriales de MIO tienen papeles diferentes. La primera no debe convertirse de nuevo en una integración permanente; las segundas conservan sus capacidades actuales mientras no se decida otra transición. La frase de la reunión sobre sincronización no acredita edición bidireccional de todos los campos.

## Orden recomendado de implementación

| Entrega | Resultado verificable | Dependencias | Tamaño relativo |
|---|---|---|---|
| 1 | Búsqueda global claramente rotulada, realizados recientes primero y estados legibles | Conservar contrato de búsqueda; pruebas de regresión y revisión de interfaz | Pequeño |
| 2 | Ver pieza y entregar resultado desde tarea; navegar períodos | Permisos y reutilización de servicios existentes | Medio |
| 3 | Cierre individual y cancelación trazable | Política de aportes, autoridad de cierre, historia y métricas | Grande |
| 4 | Traslado íntegro entre parrillas | Regla de período de origen y destino, cierre y programación | Medio a grande |
| 5 | Obligaciones por ciclo y jornadas vinculadas | Alcance validado, evidencia y definición de cumplimiento | Grande |
| 6 | Períodos parciales en propuestas y cuentas por pagar | Base económica acordada y revisión de Administración | Medio a grande |
| 7 | Cierre operativo revisable que alimente liquidación | Entregas 4, 5 y 6; regla de facturabilidad | Grande |
| Transversal | Avisos pertinentes, datos confiables y adopción | Destinatarios y canales definidos; piloto con el equipo | Medio |

Los tamaños expresan alcance relativo, no fechas ni estimaciones de horas. La entrega financiera puede trabajarse en paralelo una vez resuelta su base de cálculo. No hace falta terminar el rediseño de entregables para resolver una renovación con precio y fechas explícitos.

La primera entrega de código recomendada reúne claridad de búsqueda, orden de realizados y estados distinguibles. La primera decisión estructural es cómo cerrar aportes individuales. La primera decisión financiera es cómo valorar el período adicional comercial y qué submódulo debe admitir liquidaciones parciales. Esto permite avanzar sin convertir ambigüedades comerciales en reglas automáticas.

## Decisiones que condicionan el diseño

| Decisión | Propuesta inicial | Qué depende de ella |
|---|---|---|
| Quién cierra una tarea compartida | Cada persona cierra su aporte; responsable o PM cierra el conjunto | Estados, permisos, avisos y métricas |
| Cuándo usar subtareas | Cuando cambian objetivo, plazo o revisión; aportes para colaboración al mismo objetivo | Estructura de participación |
| Quién puede retirar una tarea asignada por otra persona | Distinguir solicitar cancelación de cancelar con motivo; definir alcance por rol | Privacidad, coordinación e historial |
| Qué significa mover una pieza atrasada | Conservar período de origen y explicitar si hay arrastre o cambio de obligación | Cierre y cobro sin omisiones ni duplicados |
| Qué evento vuelve facturable un producto | Definir por tipo de contrato y entregable | Liquidación económica |
| Cómo valorar una extensión comercial | Importe pactado, tarifa diaria o proporcional con base visible y aprobada | Propuestas, alcance adicional y cuentas correspondientes |
| Cómo liquidar un período parcial de nómina | Regla específica revisada por Administración, distinta de la fórmula comercial | Nómina, quincenas y períodos excepcionales |
| Cuándo llamar completo a un ciclo | Solo con todas las obligaciones aplicables resueltas y excepciones expresas | Semáforo, cierre y lenguaje de Bria |
| Qué aviso debe interrumpir | Cierres visibles opcionales; banda para decisiones; sonido independiente | Experiencia del equipo |

Estas decisiones no impiden aclarar la búsqueda y mejorar orden, estados y navegación. Sí impiden dar por terminado el comportamiento financiero o la medición individual. Para el pago por días hace falta identificar además si el primer alcance es Nómina, proveedores o ambos.

## Condiciones técnicas de aceptación

Los cambios de estados, importes y vínculos se probarán primero con casos que fallen, conforme a las reglas del proyecto. Los cambios de esquema serán aditivos sobre PostgreSQL, con los mecanismos existentes de preparación de esquema y compatibilidad de registros previos. No se alterarán CORS, `Task.completedAt`, la fuente de verdad de MIO ni las reglas de aprobación de Bria.

Los recorridos críticos requieren pruebas de integración aisladas: dos personas cerrando aportes, dos traslados al mismo destino, correcciones con una pantalla desactualizada y generación repetida del mismo período económico. Las pruebas no deben tocar producción.

La revisión de interfaz incluirá claro, oscuro y móvil; permisos de PM, CM y colaborador; vuelta al origen; confirmaciones basadas en respuesta real del servidor; y mensajes que distingan preparado, guardado, entregado y publicado.

La evaluación de Bria debe comprobar que entiende los nuevos datos sin inventar equivalencias: aporte terminado no es tarea cerrada; tarea cerrada no es obligación cumplida; alcance descrito no es ejecución; cierre operativo no es cobro ni pago. Las indicaciones específicas irán en las descripciones de herramientas y en sus validaciones, sin planificador previo, frases disparadoras ni plantillas de respuesta.

## Referencias verificables en el código

Las líneas son las del checkout revisado y pueden cambiar en futuras implementaciones. Los archivos siguientes son puntos de entrada, no una lista exhaustiva de todo lo que deberá modificarse.

| Hallazgo | Referencias |
|---|---|
| Una tarea y colaboradores sin cierre individual | `prisma/schema.prisma:1421`, `prisma/schema.prisma:1560`; `src/lib/taskCollaborators.js:26`; `src/services/taskCollaboratorService.js:88` |
| Atribución de méritos y pendientes | `src/services/recognitionService.js:78`; `src/services/platformLeagueService.js:75`; `src/services/dailyReadingService.js:237`; `src/lib/leagueDay.js:54` |
| Borrado de pieza sin transición de tareas | `src/services/contentService.js:448`, `src/services/contentService.js:737`; `src/services/nativeTaskService.js:136` |
| Permiso de borrado e historial | `src/config/security.js:84`; `src/controllers/taskController.js:251`; `src/services/nativeTaskService.js:1261`; `prisma/schema.prisma:1492` y `:1518` |
| Búsqueda global y orden | `src/components/modules/NativeTasks.jsx:644`; `tests/globalTaskSearchPriority.test.js:24`; `src/components/modules/NativeTasks.jsx:669`; `src/lib/taskOrder.js:8`; `src/lib/taskDeadlines.js:6` |
| Agenda separada de ejecución | `prisma/schema.prisma:1301`; `src/services/activityStatusService.js:115`; `src/lib/teamForecast.js:8` |
| Corrección de tiempos | `src/lib/taskWorkCorrection.js:48`; `src/services/taskWorkCorrectionService.js:12`; `src/components/tasks/DeclaredTimeDialog.jsx:10` |
| Alcance contractual y seguimiento actual | `src/lib/clientContractScope.js:1`; `src/lib/clientOperations.js:62`, `:153`, `:278`; `prisma/schema.prisma:741` |
| Ficha de proyecto existente | `prisma/schema.prisma:2926`; `src/services/projectOperationsService.js:56`; `src/services/projectFormalizationService.js:179` |
| Cierre limitado a piezas e informe | `src/lib/monthlyClose.js:48`; `src/services/clientOperationsService.js:481` |
| Operación agrupa por período de parrilla | `src/services/clientOperationsService.js:115`; `tests/clientOperations.test.js:16` |
| Edición de fecha sin traslado | `src/services/contentService.js:596`; restricciones MIO en `src/services/contentService.js:313` |
| Acceso restringido a Operación | `src/routes/api/clientOperations.js:11`; `src/components/modules/Clients/operations/ClientOperationRoute.jsx:21` |
| Navegación y colores de parrilla | `src/components/modules/ContentPlanDetail.jsx:2033`, `:667`, `:747`; tonos compartidos en `src/components/modules/Clients/operations/operationTones.js:43` |
| Contexto de pieza dentro de tareas | `src/components/modules/TaskSidePanel.jsx:676`, `:1963`, `:2410`; `src/components/modules/Clients/operations/PiecePeekDialog.jsx:71` |
| Referencias públicas y revisión de material | `src/components/public/SharedContentPlan.jsx:315`; `src/controllers/publicController.js:42`; `src/lib/contentApproval.js:48` |
| Avisos de cierre por función | `src/lib/contractCycleAlerts.js:22`; `src/services/contractCycleAlertService.js:78` |
| Cierres del equipo solo en campana | `src/lib/teamNotifications.js:24`, `:109`; `src/services/pushNotificationService.js:71`; `src/components/layout/AppLayout.jsx:151` |
| Audiencia financiera | `src/services/collectionAlertService.js:68`; `src/services/collectionAlertService.js:105` |
| Auditoría administrativa | `src/services/operationalTraceService.js:69` |
| Minutas y preparación de pendientes | `src/components/modules/Minutes/AutomaticMinutesPanel.jsx:219`; `src/lib/minuteTasks.js:1`; `src/services/briaActionService.js:911`; `src/lib/firefliesAutoJoin.js:42` |
| Meses enteros en propuesta | `prisma/schema.prisma:2743`; `src/services/quotationDomainService.js:35`, `:246`, `:284`; `src/components/modules/Quotations/QuotationForm.jsx:914` |
| Propagación económica y documental | `src/services/quotationAcceptanceService.js:58`; `src/services/quotationPdfService.js:360`; `src/services/quotationDraftAi.js:17`; `src/services/quotationDraftService.js:230` |
| Plazo de ejecución y cuotas son diferentes | `src/services/quotationProposalDetails.js:61`, `:91` |
| Cuenta de proveedor y abonos | `src/services/accountsPayableService.js:95`, `:190`; `src/components/modules/financial/PayableDialog.jsx:18` |
| Generación mensual de nómina | `src/services/financialPayrollService.js:27`; pagos en `src/services/financialPayrollService.js:101` y `src/lib/payrollPayments.js:1`; identidad por contrato y mes en `prisma/schema.prisma:2486`, `:2511` |
| Aceptación y habilitación son eventos distintos | `src/services/quotationAcceptanceService.js:113`; `src/services/projectFormalizationService.js:246`; `src/lib/projectFormalization.js:66` |
| Emisión de cobros y cuotas ya creadas | `src/services/receivableDocumentService.js:174`; `src/services/projectFormalizationService.js:193` |

Contexto de diseño existente: `docs/OPERACION_DE_CLIENTES.md`, `docs/BRIA_ACCIONES.md`, `docs/FINANCIAL_ROADMAP.md` y `docs/PLAN_FINANCIERO_ELISA_2026-09-21.md`. Sus descripciones históricas no sustituyen la comprobación del código actual.

## Verificación realizada

La verificación corresponde al comportamiento existente, no a cambios ya implementados. Durante la revisión se ejecutaron 200 pruebas locales, todas aprobadas, en estos bloques sin solapamiento:

| Bloque | Archivos de prueba | Resultado |
|---|---|---|
| Tareas y equipo | `taskDeadlines`, `taskOrder`, `taskCollaboratorService`, `taskCollaboratorSessions`, `contentTaskReciprocity`, `globalTaskSearchPriority` | 48 aprobadas |
| Operación y parrillas | `clientOperations`, `clientContractScope`, `projectOperations`, `contractCycleAlerts`, `contentPlanUx`, `contentPlanPeriod` | 112 aprobadas |
| Avisos y reuniones | `teamNotifications`, `notificationFeed`, `firefliesAutoJoin`, `notificationPresentation` | 40 aprobadas |

Los nombres corresponden a `tests/<nombre>.test.js`, ejecutados mediante `node --test` por cada bloque. Son comprobaciones de reglas locales y servicios con dobles; no acreditan concurrencia real en PostgreSQL ni que las capacidades propuestas ya existan.

En financiero se inspeccionaron los cálculos y los contratos de prueba existentes, sin ejecutarlos en esta revisión: `quotationLifecycleAndEconomics`, `quotationProposalDetails`, `quotationProposalAcceptance`, `quotationAcceptanceAndCurrency`, `financialPayrollService`, `payrollPayments`, `accountsPayable`, `projectFormalization`, `monthlyClose` y `collectionAlertService`.

No se consultó la base productiva ni se modificaron datos de clientes. No se probó la interfaz contra producción ni la entrega efectiva de avisos o publicaciones. No se ejecutaron evaluaciones con proveedores de IA.

Se conservaron los archivos previamente modificados o no versionados. El único archivo de proyecto añadido por este análisis es este documento.
