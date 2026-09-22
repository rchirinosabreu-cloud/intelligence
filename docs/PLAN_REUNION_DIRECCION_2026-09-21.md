# Plan de plataforma — reunión con dirección, 21 de septiembre de 2026

**Origen:** transcripción `0706.MP3` (Fireflies), 21-sep-2026 12:35 Bogotá, 36 minutos.
Speaker 2 = dirección. Speaker 1 = Rodny.
Los minutos citados son los de la transcripción; algunos sellos de tiempo vienen corridos, la cita textual manda.

Este documento **delimita** lo que se pidió: qué es nuevo, qué ya existe, qué falta y qué hay que decidir antes de tocar código. No es un compromiso de fechas.

---

## 1. Orden que pidió dirección

Dirección dio dos órdenes distintos en la misma reunión. El último gana porque es una condición, no una preferencia:

> «Llámala para que creo que antes de avanzar cualquier cosa cerremos financiero porque fue primero de toda esta vaina, entonces nos abrimos puertas y dejamos la otra inconclusa» (36:50)

Y dentro de lo demás:

> «Lo más importante para mí si tienes que hacer este tema de clientes, lo pendiente de la persona, segunda prioridad» (31:10)
> «Lo primero es pestaña cliente. Lo segundo, proyectos especiales» (21:12)

**Orden resultante:**

| # | Bloque | Estado |
|---|--------|--------|
| 0 | Financiero — cuentas de cobro con Elisa | Puerta. Bloquea lo demás según dirección |
| 1 | Ficha de cliente (pestaña cliente) | Nuevo, el bloque más grande |
| 2 | Pendientes con hora límite y bloqueo | **Ya construido el 21-sep**, faltan detalles |
| 3 | Proyectos especiales / campañas | Nuevo, módulo completo |
| 4 | Reuniones automáticas con Fireflies | Mitad hecho |
| 5 | CRM → cotización prellenada | Cañería lista, falta la unión |

---

## 2. Lo que ya está hecho (para responderle en la próxima)

### 2.1 Pendientes con hora límite y bloqueo — hecho hoy

Dirección lo pidió en 23:32 y 24:45 («le pongo hora, le sale urgente, no lo deja avanzar hasta que no entregue»). Se implementó el mismo 21 de septiembre, antes de procesar esta transcripción.

Lo que existe (`Task.focusDeadlineAt`, `src/lib/taskFocus.js`, `src/services/taskFocusService.js`, contrato en `tests/taskFocusDeadline.test.js`):

- Solo admin y project manager fijan la hora, desde el panel de la tarea. El servidor rechaza a los demás con 403.
- Con hora activa, los **demás pendientes de esa persona quedan bloqueados**: no se abren, no se arrastran, no se abren por enlace directo. El servidor responde 423.
- La tarjeta bloqueada solo se atenúa; al primer toque vibra y al segundo sale el popup «Primero tu compromiso».
- Lo que la persona ya tenía EN_CURSO cuando llegó el compromiso **no** se bloquea.
- Los managers nunca quedan bloqueados.
- Al vencer, un cron avisa una vez a quien la puso y a la persona; el diálogo de vencimiento es ineludible.
- «Pedir más tiempo»: 15 min / 30 min / 1 h / 2 h / 4 h con motivo obligatorio. **Se aplica solo, nadie aprueba.**

**Lo que pidió dirección y no está:**

- *«Aquí le tiene que salir como los minutos, o sea, te faltan tanto»* (24:45). Hoy la tarjeta muestra la hora fija y, si venció, «Venció a las HH:mm». **No hay cuenta regresiva en vivo.** Falta.
- Dirección asumió que él mismo o el admin desbloquea manualmente (25:60, 25:06). Hoy el desbloqueo real es: terminar la tarea, o que la persona se dé más tiempo sola. **No hay un «quitar el bloqueo» de admin.** Hay que decidirlo (ver §8).

Tamaño de lo que falta: **pequeño** (cuenta regresiva) + **una decisión** (desbloqueo manual).

### 2.2 Otras piezas que ya existen y sirven de base

- **Fireflies en reuniones:** la casilla «Invitar a Fireflies» ya existe en Actividad (`OperationalCalendar.jsx:1315`), pero **nace apagada** (`captureWithFireflies: false`, línea 124). Eso explica por qué las reuniones del viernes no quedaron.
- **Cotización ligada a oportunidad:** `Quotation.lead_id` y `CrmRequest.suggestedItems` ya existen en la base; la ficha de la oportunidad ya lista sus cotizaciones (`CrmLeadDetail.jsx:256`). Lo que falta es el botón que crea la cotización prellenada.
- **Chat por cliente:** existe (`FlowMessage`, `FlowWidget`), pero es texto plano sin titular ni secciones.
- **Enlaces clave por cliente:** existe (`ClientLink`, `KeyLinksWidget`). Dirección dijo que es *lo único* que está usando de esa columna (29:05).
- **Estado de cuenta del cliente:** existe el modal del segundo bloque financiero, pendiente de validar con Elisa.

---

## 3. Bloque 0 — Financiero: cuentas de cobro (la puerta)

**Lo que pidió dirección:** cerrar financiero antes que nada, reuniéndose con Elisa por el tema de cuentas de cobro (36:34, 36:50).

**Ya está resuelto el insumo.** La reunión con Elisa fue el mismo 21 de septiembre a las 11:00, hora y media **antes** de la reunión con dirección. El requisito quedó capturado.

➡️ **El detalle completo de este bloque vive en [PLAN_FINANCIERO_ELISA_2026-09-21.md](PLAN_FINANCIERO_ELISA_2026-09-21.md).** Resumen de lo que salió:

- La cuenta de cobro hay que generarla desde la plataforma **con PDF y consecutivo propio**, para que Elisa no la haga en Word y la registre después. Es la pieza grande.
- Falta el **filtro por categoría** en Movimientos: las categorías ya están en la base, solo no están en la pantalla. Es el arreglo más barato de todos.
- Falta la vista de **cuántos meses debe cada cliente** y las **edades de cartera** a 30/60/90 días.
- **Hay dos registros malos en producción** de las pruebas de esa reunión, y **no existe forma de revertir un abono**. Eso va primero.
- **Contabilidad formal y plan único de cuentas quedan fuera**, decidido entre ambos. Elisa lleva eso en Siigo.
- Sigue pendiente que Elisa **concilie lo cargado contra su Excel** — es el paso 4 de «Antes de publicar» de [FINANCIAL_ROADMAP.md](FINANCIAL_ROADMAP.md).

**Urgencia de calendario:** Elisa aún no ha mandado las cuentas de cobro de septiembre. Si la funcionalidad no llega a tiempo, salen en Word otra vez.

---

## 4. Bloque 1 — Ficha de cliente

La queja de fondo, textual:

> «Cerraste Excel. Necesito que todo esté acá y que lo pueda revisar de manera importante acá» (04:36)
> «Esto está como desorganizado de cierta manera y no tiene como esa visualidad que yo tengo acá en el Excel» (04:41)

Dirección mostró Basecamp como referencia (30:49). Se divide en dos pantallas: **la lista de clientes** y **la ficha de un cliente**.

### 4.1 Lista de clientes: dashboard de entrada

> «Me tendría que salir en clientes algo como un dashboard acá» (11:28)
> «De entrada que tenga números iniciales y saber qué cliente están caídos y que no» (27:08)
> «Cada cliente en cuadritos y una card con ya información ahí que uno pueda ver» (28:28, propuesto por Rodny y aceptado)

| Ítem | Qué falta | Tamaño |
|------|-----------|--------|
| 1.1 | Fila de números arriba: activos, caídos, cuántos por **estado de avance**, cuántos por **fase de aprobación** | Medio |
| 1.2 | Pasar la lista a rejilla de tarjetas con los datos clave visibles sin abrir | Medio |
| 1.3 | Que funcione en móvil («ahorita me tocó abrir computador», 11:14) | Pequeño si 1.2 se hace bien desde el inicio |

Hoy `Clients.jsx` es una lista con filtros y filas expandibles, sin números agregados.

### 4.2 El porcentaje es falso — hay que arreglarlo o quitarlo

> «Y eso, ese porcentaje, ¿qué es lo que está dando?» (04:24)
> «Que ese porcentaje sea real, o sea ese porcentaje sea real porque no está siendo real» (07:49)

**Tiene razón, y es peor de lo que cree.** Verificado en código:

- En modo automático el puntaje es literalmente `finalScore = score || 85` (`src/controllers/clientController.js:105`), con el comentario `// Logic to be handled by service if needed`. **No calcula nada.**
- «Validación CM» es un `useState(true)` local en `ClientExpandedDetail.jsx:22`. **Nunca se guarda, nunca se lee del servidor, y suma 20 puntos** al puntaje manual. Es un interruptor decorativo.

Dirección además pidió quitarlo: *«Esta validación del CM no sé qué función cumple, así que creo que deberíamos de quitar»* (28:03).

| Ítem | Qué hacer | Tamaño |
|------|-----------|--------|
| 1.4 | Quitar «Validación CM» | Pequeño |
| 1.5 | Definir y calcular el cumplimiento de parrilla contra datos reales (`ContentPlan` / `ContentItem`), o no mostrar porcentaje hasta tenerlo | Medio. Necesita la definición de §8, decisión 2 |

### 4.3 La ficha por secciones (message board)

> «Mira lo que yo veo de entrada en message board... tengo accesos, basic info y la facturación» (05:40)
> «Yo creo que ese chat de esta gente tiene que verse así, tiene unos titulares... un titular y un desglose» (07:22)
> «Lo que Sara hizo fue horrible, lo que hizo aquí fue como poner resumen de la reunión» (07:22)

Hoy la ficha (`ClientDetail.jsx`) tiene: Anuncios, Entregables, Tareas, Chat Flow, Identidad Digital, Enlaces clave. Dirección quiere secciones temáticas, cada una con hilos titulados.

| Ítem | Sección pedida | Estado hoy | Tamaño |
|------|----------------|------------|--------|
| 1.6 | **Chat flow con titular + desglose + enlaces**, agrupado por tema (solicitudes importantes / seguimiento general) | `FlowMessage` es texto plano sin título ni tema | Medio |
| 1.7 | **Reuniones**: bitácora dentro del cliente, con titular, fecha, responsables y desglose (09:34, 10:38, 30:57) | `MeetingMinute` **no tiene `clientId`**. Las minutas viven sueltas | Medio |
| 1.8 | **Accesos**: links, usuarios y contraseñas del cliente (05:40) | No existe. **Ver §8, decisión 3 — no lo construyo sin decidir esto** | Medio |
| 1.9 | **Basic info**: metas del cliente, brandguía, información general | Parcial y disperso | Pequeño-medio |
| 1.9b | **Fecha de inicio y fin del contrato**, con aviso 15 días antes de que termine | No existe. **Lo pidieron dirección (05:40) y Elisa (32:46) el mismo día**, por separado | Pequeño |
| 1.10 | **Facturación**: «literal lo que compró el cliente» (05:40) | Existe el estado de cuenta financiero; falta la vista de servicios contratados en la ficha | Medio. Depende del bloque 0 |
| 1.11 | **Enlace al Drive general del cliente**, en grande (10:29, 29:08) | No existe. Un campo y un botón | **Pequeño** |
| 1.12 | **Quitar Identidad Digital** — *«esa vaina quítalo»* (29:08) | `DigitalIdentityWidget.jsx`, 37 líneas | **Pequeño** |
| 1.13 | **Salto a la parrilla** desde la ficha (29:25, 30:41) | No existe el enlace | **Pequeño** |
| 1.14 | Que al abrir la tarea completa se vea todo lo de adentro, no un resumen recortado (31:35) | Por revisar | Pequeño |

**Ganancias rápidas de este bloque:** 1.11, 1.12, 1.13 y 1.4 se pueden soltar en un solo día y son visibles de inmediato.

---

## 5. Bloque 2 — Pendientes: cerrar lo que falta

Ver §2.1. Queda:

| Ítem | Qué | Tamaño |
|------|-----|--------|
| 2.1 | Cuenta regresiva en vivo en la tarjeta («te faltan 40 min») | Pequeño |
| 2.2 | Decidir si admin puede levantar el bloqueo a mano (§8, decisión 4) | Depende de la respuesta |
| 2.3 | Mostrarle el flujo completo a dirección y confirmar que es lo que pidió | Reunión de 10 min |

---

## 6. Bloque 3 — Proyectos especiales / campañas

> «Necesitamos tener una vaina que se llame proyectos especiales» (13:01)
> «Los proyectos importantes no se tienen el mismo tratamiento que una tarea diaria, pero además necesita planificación» (17:10)

Rodny ya lo tenía pensado como «campañas» (14:47). Acordaron que es lo mismo: *«Puede ser proyecto especial o campaña»* (15:48).

**No existe nada de esto.** `Task.isSpecial` es solo una estrella en una tarea suelta, no un contenedor. Es módulo nuevo completo.

Estructura que pidió, en su orden (17:33):

| Ítem | Parte | Tamaño |
|------|-------|--------|
| 3.1 | Entidad Proyecto/Campaña + listado en cuadritos (17:19) | Medio |
| 3.2 | **Onboarding/brief**: referencias visuales, lo que dijo el cliente, la reunión inicial | Medio |
| 3.3 | **Cronograma sencillo**: fecha, acción a hacer ese día, estado, comentario; el proyecto tiene fecha de entrega y fase (16:51, 16:04) | **Grande** |
| 3.4 | El cronograma **genera pendientes**, y cada pendiente tiene **subtareas asignables** a distintas personas (17:44, 17:02) | **Grande**. Toca el modelo de tareas |
| 3.5 | **Dashboard del proyecto**: porcentaje de avance, cosas en rojo, próxima acción, día de entrega (18:47, 26:21) | Medio |
| 3.6 | **Recursos**: textos, banco de imágenes, brand kit, en un solo sitio (14:14, 22:40) | Medio |

**Piloto que pidió dirección:** montar el proyecto web de Mi Agencia como primer caso (21:21). Sirve de prueba real antes de abrirlo al equipo.

**Nota de alcance:** 3.4 (subtareas) es el punto donde este bloque se puede desbordar. El modelo `Task` actual no tiene jerarquía. Conviene una primera versión sin subtareas y añadirlas después, si dirección lo acepta.

---

## 7. Bloques 4 y 5

### 7.1 Reuniones automáticas

> «No le invites, mételo siempre, o sea que no dé la opción porque es que toca venir acá y eso nadie lo va a hacer» (33:20)
> «Ponlo porque mira que no se está haciendo, entonces más bien yo lo quito en la que no» (34:38)

Es decir: **Fireflies encendido por defecto, con opción de apagarlo en la reunión puntual.**

| Ítem | Qué | Tamaño |
|------|-----|--------|
| 4.1 | Cambiar el valor por defecto de `captureWithFireflies` a `true` al crear reunión en Actividad | **Muy pequeño** |
| 4.2 | Que el resumen quede pegado al cliente correspondiente | Es el ítem 1.7, el mismo trabajo |
| 4.3 | Mandar el PDF del resumen al cliente (34:17) | Pequeño. `summaryPdfStorageKey` ya existe |

**Lo que no tiene arreglo:** las reuniones viejas sin Fireflies no tienen transcripción, solo grabación. Eso no se recupera; hay que decirlo claro.

**Advertencia:** grabar por defecto **todas** las reuniones incluye las que tienen clientes y personas externas. Antes de encenderlo conviene decidir cómo se les avisa. No es un problema técnico, es una decisión de la agencia.

### 7.2 CRM → cotización prellenada

> «Esta oportunidad que sale del formulario... ahora yo tengo que conectar con la cotización... un número, cotización con el nombre, todo prellenado» (00:09, 00:22)
> «La categoría está con las categorías del catálogo» (01:47)

| Ítem | Qué | Tamaño |
|------|-----|--------|
| 5.1 | Botón «Crear cotización» en la oportunidad, que abra `/cotizaciones/nueva` con nombre, empresa, correo, teléfono y las **líneas sugeridas del formulario** ya cargadas, y guarde el `lead_id` | Medio-pequeño. La cañería ya está |

`QuotationForm.jsx` hoy no lee ningún parámetro de la URL; ese es el trabajo.

---

## 8. Decisiones que hacen falta antes de codificar

Estas cambian el trabajo según la respuesta. Las cinco primeras son para dirección; la tercera es urgente.

1. **¿«Cerrar financiero» significa validar con Elisa, o construir el módulo de cuentas de cobro completo?** Tras la reunión con Elisa ya se sabe qué es cada cosa (ver el plan financiero). Lo que falta decidir es si dirección espera **todo** el bloque antes de tocar la ficha de cliente, o si acepta que avancen en paralelo: la cuenta de cobro con PDF es grande, y la ficha de cliente no depende de ella.
2. **¿Cómo se calcula el cumplimiento de parrilla?** Hace falta la fórmula, no una preferencia visual: ¿piezas publicadas sobre piezas planificadas del mes? ¿aprobadas a tiempo? Sin esto el porcentaje sigue siendo inventado.
3. **Contraseñas de accesos del cliente en la plataforma.** Dirección lo pidió («puede tener hasta las contraseñas», 05:40). Guardar contraseñas de cuentas de clientes es un riesgo distinto a todo lo demás que hay ahí: si alguien entra a la plataforma, entra a las cuentas de todos los clientes. Recomiendo **no guardar la contraseña**, y en su lugar dejar en Accesos el usuario, el enlace, quién la tiene y un enlace al gestor de contraseñas. Si dirección insiste, entonces: cifrada, detrás de permiso propio, con registro de quién la ve. Hay que decidirlo antes de construir 1.8.
4. **¿El admin puede levantar el bloqueo a mano?** Dirección lo dio por hecho en la reunión, pero hoy solo se sale terminando la tarea o pidiendo más tiempo. Si se añade, ¿queda registrado?
5. **«Facturación» en la ficha del cliente: ¿qué contrató o qué debe?** Dirección dijo «literal lo que compró el cliente», lo que suena a servicios contratados, no a cartera. Conviene separarlos: servicios contratados en la ficha, deuda en el estado de cuenta financiero.

---

## 9. Lo que no entra

- **Recuperar el contenido de las reuniones viejas.** Solo hay grabación; no hay transcripción que analizar.
- **«Abolir WhatsApp» y «abolir Drive»** no son tareas: son la consecuencia de que el bloque 1 y el 3 queden bien. No se ponen como entregable.
- **Subtareas de proyecto (3.4)** quedan fuera de la primera versión de proyectos especiales, salvo que dirección diga lo contrario.

---

## 10. Secuencia propuesta

1. **Esta semana:** reunión con Elisa (0.1) + soltar las ganancias rápidas de la ficha de cliente (1.11, 1.12, 1.13, 1.4) + Fireflies por defecto (4.1) + cuenta regresiva (2.1). Todo esto es visible y barato, y no depende de ninguna decisión pendiente.
2. **Apenas responda dirección:** el porcentaje real (1.5) y el bloque de accesos (1.8).
3. **Bloque grande 1:** ficha de cliente por secciones (1.6, 1.7, 1.9, 1.10) + dashboard de la lista (1.1, 1.2).
4. **Bloque grande 2:** proyectos especiales, con el proyecto web de Mi Agencia como piloto.
5. **Al final:** CRM → cotización (5.1), que es autónomo y se puede adelantar si algo se traba.
