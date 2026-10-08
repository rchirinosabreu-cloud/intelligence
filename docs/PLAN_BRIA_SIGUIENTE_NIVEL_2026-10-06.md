# Plan: Intelligence al siguiente nivel, una Bria que conoce la agencia

**Origen:** pedido de Rodny del 6 de octubre de 2026 y la carpeta de 17 lecturas de `Downloads\Brainstudio Intelligence`. Inventario del código al commit `ad84173c`. Este documento delimita qué es lo que se pide, qué existe, qué falta y qué hay que decidir antes de tocar código. No es un compromiso de fechas.

---

## 1. Lo que pidió Rodny, en sus palabras

> «Quiero una IA integrada que realmente apoye cada proceso… quiero que leas todo, mi correo, mi drive, toda mi agencia, separar información, destacar por roles… algo tan sencillo como preguntarle a Bria "dame la contraseña del correo de coordinador" y que te la dé, que no necesites preguntar a nadie en el equipo.»

Traducido a piezas:

1. **Una Bria a la que se le pregunta**, desde cualquier pantalla.
2. **Que vea toda la agencia:** lo que ya está en la plataforma, el Drive y el correo.
3. **Que responda según quién pregunta:** cada rol ve lo suyo y nada más.
4. **Que guarde y entregue accesos** (contraseñas) a quien le toca, con registro.
5. Por la carpeta de lecturas: que **la gestión de personas** (clima, rotación, desarrollo, 1:1) también viva aquí.

---

## 2. Dónde está Bria hoy (leído en el código, 6 de octubre de 2026)

En una frase: **Bria es hoy un conjunto de trabajos por lotes, no una asistente.** Revisa parrillas, analiza minutas y propone; nadie puede preguntarle nada.

| Pieza | Estado | Dónde |
|---|---|---|
| Fuentes de memoria | Solo minutas de Fireflies (resumen, decisiones, señales, transcripción) | `briaMemoryService.js:57-105` |
| Chat con Bria | **No existe.** `chatController.js` y `brainCoreService.js` se borraron en la limpieza de código huérfano del 4 de octubre (`246a391c`). Queda un proxy a OpenAI que usan dos pantallas de Minutas, sin memoria, sin datos de la persona y sin herramientas | `proxyController.js:22`, `frontendApiService.js:18-38` |
| Google Drive | **No hay conexión.** El módulo `/drive` es un bucket propio compatible con S3, no Google Drive. Lo subido se lista, no se indexa | `documentStorageService.js`, `briaMemoryService.js:242,260` |
| Correo | Solo envío SMTP (formulario comercial y recuperación de contraseña). Ninguna lectura | `transactionalEmailService.js`, `passwordResetEmailService.js` |
| Respuesta según el rol | **Ninguna.** La búsqueda de memoria la ven admin y PM, sin filtro de cliente ni de persona | `routes/index.js:185-190`, `briaMemoryController.js:20` |
| Accesos y contraseñas | **No hay bóveda.** `ClientLink` guarda título y URL; la ayuda pide no poner contraseñas ahí | `schema.prisma:1482-1489` |
| Herramientas del modelo (function calling) | Soportado y **sin uso** | `openAIClient.js:53-130` |
| Bria avisando a alguien | Ningún flujo de Bria crea notificaciones; el Observer solo se ve en `/manager` | `briaObserverService.js` |
| Scopes de Google que ya pide | `openid`, `email`, `calendar`, `meetings.space.created`. Ninguno de Gmail ni Drive | `googleCalendarOAuthService.js:8-14` |

Lo que sí existe y sirve de base: cifrado con `ENCRYPTION_KEY` (`src/utils/encryption.js`, AES-256-CBC **sin MAC**, hay que subirlo a GCM antes de guardar contraseñas), `AiUsageEvent` y `governedFetch` (registro de toda salida a la IA, sin contenido), política de privacidad versionada, MFA por rol, páginas legales y solicitudes de titulares, `FeedbackRecord` con nota privada, horas por persona, reconocimientos, Radar de Mérito, alerta de 15 horas. Y un modelo `AgencyIntegration` pensado para Gmail y Sheets con `credentials` en JSON **sin cifrar** y sin ningún uso: retirarlo o reusarlo cifrado.

**Distancia:** grande en la primera pieza (la asistente no existe), media en accesos y Drive, y condicionada por Google en el correo.

---

## 3. Qué dicen las lecturas

17 archivos. Uno está repetido («IA en talento» y «Cómo construir una organización más inteligente en 90 días» son el mismo PDF). El que se llama «State of Generative AI Report» es en realidad el «Informe de decisiones sobre IA» de Microsoft. Trece son piezas comerciales de Crehana, dos de Microsoft, una de Udemy y una de Nebius. Salvo el informe de Microsoft, ninguno trae fuentes verificables: sirven como marco y lista de ideas, no como evidencia.

Lo que vale para este plan:

- **Un caso a la vez, con métrica antes de escalar.** Lo dicen todos. La fórmula de Crehana: «Voy a usar IA para [problema] y medir éxito con [métrica] en [plazo]».
- **Tres zonas** (HR Report 2026, p. 58): automatizar lo repetitivo; «IA sugiere, humano decide» en señales y conversaciones; y lo irreductiblemente humano, que no se automatiza: feedback crítico, conflictos, salario, promociones. «El error más común: empresas automatizan Zona 3». Coincide con la regla de Rodny del 21 de septiembre: la decisión final siempre es humana.
- **La señal la calcula la plataforma; la conversación la tiene una persona.** Nunca un puntaje visible al equipo; aviso privado al PM con el motivo en una frase.
- **La vigilancia destruye la confianza que pretende proteger.** Señales como actividad en LinkedIn, cámara apagada o «días libres extraños» no entran. El HR Report cita 40 % de confianza en IA aplicada a personas, y 82 % cuando hay transparencia y opción de salirse (p. 59).
- **La adopción falla por hábitos y claridad, no por tecnología** (Microsoft, Nebius, Crehana). Guías por rol: qué hace Bria, qué revisa la persona, qué no se automatiza. Medir el % del equipo que la usa cada semana, no licencias. `AiUsageEvent` ya lo permite.
- **Gobierno desde el día uno:** ficha por flujo con dueño, propósito, acceso mínimo, qué no puede hacer, registro y revisión periódica (Microsoft). Ya existe Gobierno de IA; falta esa ficha por flujo.
- **Crehana** vende una suite de RR. HH. (gestión de personas, reclutamiento, cursos, desempeño, clima, nómina de México, asistencia, analítica) con una capa transversal «Crehana AI»: asistente 24/7 que responde sobre vacaciones, desempeño y beneficios, y alertas de rotación. Va a empresas grandes de LATAM y no publica precios. Lo que Rodny pide es la misma idea **con la operación entera dentro** (clientes, parrillas, dinero, reuniones, redes): eso no lo vende nadie, y es justamente la ventaja de construirlo.

Ideas de las lecturas que encajan con lo que ya hay:

| Idea | De dónde | Encaja con |
|---|---|---|
| Brief antes de cada 1:1 con la carga, lo vencido, lo devuelto y lo dicho en minutas | HR Report (Nubank, p. 60); «IA en talento» | Horas, tareas, minutas y el insight del Radar, que hoy usa un prompt fijo |
| Vigilante de 1:1: aviso al PM cuando pasan N semanas sin una o se cancela tres veces | «Anatomía de una renuncia», «Enamorar a tu equipo» | Actividad (calendario) |
| Pulso de clima de 3 a 5 preguntas, anónimo, periódico | Calendario HR, ROI Playbook, «Enamorar» (test de 6 ítems) | Nuevo, pequeño |
| Tiempo hasta la primera tarea cerrada sin devolución de cada ingreso | HR Report (Time-to-Competency, p. 30) | `Task.completedAt`, fecha de alta |
| «Único que sabe X»: puntos únicos de falla y captura de conocimiento entre pares | HR Report, p. 67 | Categorías de tareas por persona |
| Plan de desarrollo y aspiraciones por persona, consultable por ella | «Rotación a promoción», «Enamorar» | `TeamMember` |
| Tablero de adopción de Bria: % del equipo que la usa por semana, por módulo y rol | «Adopte AI», Nebius | `AiUsageEvent` |
| Anuncios que dicen qué cambia, por qué y una situación real antes del detalle | «HR posts no son comunicados» | Anuncios del dashboard |
| Registro de conversaciones salariales, privado, sin comparar personas | «Conversaciones sobre el sueldo» | `FeedbackRecord` |

---

## 4. La pieza central: Bria con herramientas

Lo que convierte a Bria en asistente no es un chat: es que pueda **buscar en la plataforma con los permisos de quien pregunta** y responder con evidencia. Diseño:

1. **Una sola entrada a Bria desde cualquier pantalla** (como el chat de equipo, que es una instancia global en `AppLayout`), no un módulo nuevo. Mantiene la regla del 19 de septiembre: una sola Bria, sin pantallas independientes.
2. **Herramientas, no prompt gigante.** Cada pregunta se responde llamando funciones que ya existen en los servicios: mis tareas, tareas de un cliente, parrilla del mes, última minuta con un cliente, contrato y semáforo de un cliente, cartera (solo con permiso de Financiero), oportunidades del CRM (solo con permiso `crm`), memoria de minutas, accesos (bóveda), archivos (cuando exista Drive). `openAIClient.js` ya soporta function calling.
3. **Los permisos viven en las herramientas, no en el modelo.** Cada función recibe al usuario que pregunta y aplica exactamente lo que aplica la pantalla (`modulePermissions`, `isManagerRole`, privacidad de tareas, permiso financiero). Así «destacar por roles» no es una instrucción al modelo que se pueda saltar: es que la herramienta no devuelve lo que la persona no puede ver. Bria nunca sabe más que quien le pregunta.
4. **Los secretos nunca pasan por el modelo.** Todo lo que entra al prompt viaja a OpenAI; `governedFetch` lo registra pero no lo impide. Para «dame la contraseña del correo de coordinador», Bria entiende la intención, la herramienta comprueba el permiso y **la plataforma muestra el secreto en la pantalla de la persona** con un botón de revelar; Bria solo dice «aquí está». Cada lectura queda registrada con quién, cuándo y qué acceso.
5. **Cada respuesta cita de dónde sale** (minuta, tarea, archivo, fila), como ya exige la plataforma a Observer y a los compromisos. Sin fuente, Bria dice que no sabe.
6. **Registro:** `AiUsageEvent` ya anota persona, flujo y coste; se añade qué herramientas se llamaron y para qué persona, sin contenido.
7. **Nivel de autonomía:** 0 y 1. Bria responde y prepara borradores (una tarea, un mensaje, un recordatorio) y una persona los acepta. No ejecuta nada sola, según la regla fija de Rodny.

Lo que esto da desde el primer día, sin ningún conector externo: «¿qué tengo vencido?», «¿qué dijo Endova en la última reunión?», «¿quién lleva la parrilla de Foobespain y cómo va?», «¿cuánto debe Mimas?» (solo quien tiene Financiero), «¿qué piezas salen mañana en redes?». Los datos ya están; hoy nadie puede preguntarlos.

---

## 5. Las fuentes y lo que cuesta cada una

| Fuente | Qué aporta | Qué hace falta | Condición |
|---|---|---|---|
| **La plataforma** (tareas, parrillas, clientes, contratos, financiero, CRM, minutas, redes) | La más rica y la única que nadie consulta por pregunta | Herramientas de la sección 4 | Ninguna externa. Es lo primero |
| **Bóveda de accesos** | «Dame la contraseña de X» | Modelo nuevo, cifrado AES-GCM, permiso por persona o rol, registro de cada lectura, MFA activo para consultarla | Decisión 1 |
| **Google Drive** | Briefs, brandguías, archivos de cliente | Conexión OAuth nueva más indexación con propósito y sensibilidad (A2 del plan de Bria) | Ver Google, abajo |
| **Correo del coordinador** | Qué pidió el cliente, qué se envió, qué respondió el proveedor | Conexión OAuth nueva o IMAP, indexación por propósito, actualización de la política de privacidad | Ver Google, abajo |
| **Chat de equipo y comentarios de tareas** | Ya están en la base | Reglas de qué se indexa (canales privados no) | Decisión 3 |
| **Datos de personas** (horas, devoluciones, feedback, pulsos) | Sección 7 | Separados de la memoria editorial, visibles solo para PM y admin y para la propia persona | Decisión 5 |

### Lo que pide Google para leer correo y Drive (comprobado en su documentación el 6 de octubre de 2026)

- Leer Gmail (`gmail.readonly` o cualquier scope que lea correo) y leer todo el Drive (`drive.readonly`, `drive.metadata.readonly`) son **scopes restringidos**. Con una app que tiene servidor propio, Google exige **verificación de la app más una evaluación de seguridad CASA** hecha por un laboratorio autorizado, **renovada cada año**; el proceso tarda semanas y el costo lo cotiza cada laboratorio (Google no lo publica; terceros hablan de cientos a miles de dólares).
- En modo «Testing» con usuarios externos (las cuentas @gmail.com del equipo) no hace falta verificación, pero **la autorización caduca a los 7 días**: cada persona tendría que volver a conectar semanalmente. Inviable para producción.
- **Salida real: Google Workspace para todo el equipo.** Con un dominio propio (hoy solo `contacto@` está en Workspace; el resto del equipo está en Gmail), la app se registra como «Internal» y **no necesita verificación ni CASA**. Trae además Meet con transcripción nativa, Drive compartido con permisos por persona y correo con el dominio de la agencia. Tiene costo por persona y por mes; hay que cotizarlo.
- **Camino intermedio para Drive sin Workspace:** el scope `drive.file` no es restringido. La persona elige con el selector de Google qué carpetas o archivos comparte con Bria; Bria no ve nada más. Sirve para empezar con los briefs y brandguías de los clientes.
- **Para un solo buzón** (el de coordinador) existe la vía IMAP con contraseña de aplicación, sin pasar por OAuth. Es frágil (una contraseña de larga vida en Railway) y hay que comprobar que Google la siga permitiendo en cuentas personales. Solo como puente, si se decide no ir a Workspace.

Leer correo **no es solo técnica:** los buzones del equipo son personales. Se empieza por **un** buzón de la agencia (coordinador), se define qué nunca se indexa (financiero, personas, lo marcado como privado), y se sube la versión de la política de privacidad en el mismo PR, como manda la regla de `AGENTS.md` §17.

---

## 6. Accesos: cómo se construye bien

Dirección lo pidió el 21 de septiembre y entonces recomendé no guardar contraseñas. Rodny lo pide ahora de forma explícita, así que se construye **con tres condiciones**:

1. **Cifrado de verdad:** AES-256-GCM con autenticación, no el CBC sin MAC actual. Se migra el helper y se conservan los campos ya cifrados (TOTP, tokens de Google, token de Meta).
2. **Quién ve qué, explícito:** cada acceso tiene dueño, clientes o área a la que pertenece y una lista de personas o roles que pueden revelarlo. Nada «para todos» por defecto. Revelar exige sesión con MFA activo.
3. **Registro de cada lectura:** quién, cuándo, qué acceso, desde dónde (pantalla o Bria). Visible para el dueño del acceso y para admin. Rotar una contraseña deja historial.

Bria es solo la puerta cómoda: la bóveda tiene su pantalla propia en la ficha del cliente (la sección «Accesos» que pidió dirección) y en Equipo para los accesos de la agencia.

---

## 7. Personas: un caso, 90 días, tres zonas

Lo que las lecturas sostienen y la plataforma ya puede alimentar, ordenado por zona:

- **Zona 1, automatizar:** calendario anual de personas con recordatorios (revisar retención en julio, conversaciones de permanencia en noviembre), tiempo hasta la primera tarea cerrada de cada ingreso, tablero de adopción de Bria.
- **Zona 2, Bria sugiere y una persona decide:** brief antes de cada 1:1; vigilante de 1:1; señales de carga (horas fuera de horario, urgentes por semana, compromisos con hora acumulados) como aviso privado al PM; pulso de clima corto con lectura de tendencia; mapa de «único que sabe X».
- **Zona 3, nunca automatizar:** feedback crítico, salario, conflictos, promociones. Bria puede preparar el brief de la conversación salarial con la política, el criterio y el historial, y **nunca comparar a una persona con otra**.

**Primer caso recomendado:** el brief pre-1:1 más el vigilante de 1:1, medidos 90 días con «tiempo entre la señal y la conversación» y con la opinión del equipo. Es barato (los datos existen), toca lo que más duele según las lecturas (la gente se va por falta de conversación, no de salario) y no exige vigilar a nadie.

Reglas que no se negocian: ningún puntaje de «riesgo de fuga» visible; ninguna señal de comunicaciones personales; todo dato de personas separado de la memoria editorial (regla de `AGENTS.md` §7); cada persona ve lo suyo; transparencia escrita de qué calcula Bria y con qué datos.

---

## 8. Orden propuesto

| # | Bloque | Qué entrega | Tamaño | Depende de |
|---|---|---|---|---|
| 1 | **Bria con herramientas** sobre la plataforma | Preguntarle a Bria desde cualquier pantalla, con permisos de quien pregunta, citas y registro | Grande (2 a 3 semanas) | Nada externo |
| 2 | **Bóveda de accesos** + Bria la consulta | «Dame la contraseña de X» con registro; sección Accesos en cliente y Equipo | Medio (1 a 2 semanas) | Decisión 1, cifrado GCM |
| 3 | **Drive** por selector (`drive.file`) e indexación con propósito | Bria responde con los briefs y brandguías elegidos | Medio | Decisión 2; A2 del plan de Bria |
| 4 | **Correo del coordinador** | Bria sabe qué pidió y qué se envió | Medio | Decisión 2 (Workspace o puente IMAP); política de privacidad |
| 5 | **Personas, primer caso** | Brief pre-1:1 y vigilante de 1:1, 90 días medidos | Medio | Decisión 5 |
| ∥ | **Compromisos** (bloque B del plan de Bria) | De la reunión sale un compromiso con cita, una persona lo aprueba como tarea, Bria le hace seguimiento | Grande | A1 runtime; se apoya en el bloque 1 como interfaz |
| ∥ | **Base que aguante** | Healthcheck, ventanas de despliegue, entorno de prueba | Pequeño | Nada |

**Estado del bloque 1 (6 de octubre de 2026, tarde):** construido en la rama `feat/bria-asistente` (worktree `C:\Proyectos\intelligence-bria`), pendiente de PR. `POST /api/bria/ask` con siete herramientas (`buscar_cliente`, `mis_tareas`, `tareas_de_cliente`, `parrilla_de_cliente`, `operacion_de_cliente`, `memoria_de_reuniones`, `publicaciones_programadas`), botón en la barra superior y diálogo centrado. Pruebas: `tests/briaAssistant.test.js`, `tests/briaAssistantTools.test.js`, `tests/briaAssistantRoutes.test.js`, `tests/briaAssistantUi.test.js`, `tests/briaAnswerFormat.test.js`; recorrido con capturas `node tests/browser/briaAssistant.mjs`; muestra local `node scripts/preview-bria.js` (puerto 3720, `?abierta`, `&dark`). Lo que falta en la asistente: cartera (permiso de Financiero), CRM, historial de conversación guardado y el tablero de adopción.

El bloque 1 es la puerta de todo lo demás: sin asistente, las fuentes nuevas solo alimentan lotes que nadie lee. Los bloques 3 y 4 se pueden adelantar o retrasar según la decisión sobre Workspace.

Métricas desde el primer día, ya posibles con `AiUsageEvent`: % del equipo que usó a Bria esta semana, preguntas por módulo, preguntas sin respuesta, coste mensual.

---

## 9. Decisiones de Rodny

1. **Bóveda con contraseñas: sí o no,** y si el permiso de revelar va por rol (admin, PM) o por persona nombrada en cada acceso. Recomendación: por persona nombrada, con admin siempre incluido.
2. **Google Workspace para todo el equipo, sí o no.** Desbloquea correo y Drive sin auditoría anual, y Meet con transcripción. Si no, Drive por selector y correo por puente IMAP para un solo buzón.
3. **Qué se lee primero y qué no se indexa nunca.** Propuesta: primero el buzón de coordinador y las carpetas de clientes del Drive; nunca financiero, personas, canales privados ni lo marcado privado.
4. **Respuestas por rol.** El 22 de septiembre Rodny decidió que la memoria la ve quien tiene el permiso del módulo. Con contraseñas, dinero y datos de personas en juego, la propuesta es que cada herramienta aplique los mismos permisos que su pantalla. No contradice lo anterior: lo extiende a cada dato.
5. **Personas:** confirmar el primer caso (brief pre-1:1 y vigilante) y la regla de que nada de personas es visible al resto del equipo.
6. **Tope mensual de gasto en IA.** Más preguntas son más llamadas; fijar una cifra y que el tablero la muestre.

---

## 10. Bria de cada quien: el asistente vivo por rol

Aclaración de Rodny el mismo 6 de octubre: lo de «leer mi correo y mi Drive» era primero para **Claude Code en esta sesión**, para entender el negocio y construir a partir de ahí; lo de Bria en producción es la sección 5. Son dos accesos distintos: el de Claude Code va por los conectores de claude.ai (Google Drive ya conectado; Gmail existe como conector oficial y falta conectarlo con la cuenta de coordinador) y no toca a Google Cloud ni a la verificación de la app.

**Qué se hace con ese acceso:** una lectura del negocio, de una vez, cuyo resultado entra a la plataforma y no a un documento: inventario de clientes con lo que hay de cada uno en Drive (brief, brandguía, contrato, propuestas, informes) y lo que falta; brandguías convertidas en criterios editoriales propuestos para Bria; contactos y accesos que hoy viven en correos y van a la ficha del cliente; y la lista de procesos que hoy ocurren por correo y deberían vivir aquí (aprobaciones, cuentas de cobro, pedidos de cambio). Esa lectura es además el insumo para diseñar cada asistente con la realidad del equipo y no con teoría.

**La idea:** una sola Bria con una lente por persona. Tres capas:

1. **Te acompaña** (proactiva, sin que preguntes): al empezar el día, qué importa hoy para tu rol; durante el día, reacciona a lo que pasa; al cerrar, qué quedó. Es «Foco de hoy» del plan de Bria (C-2), que hoy existe a medias en los recordatorios del dashboard (`dashboardTips.js`).
2. **Te responde** (bloque 1 de la sección 8): preguntas en lenguaje natural con herramientas y permisos de quien pregunta.
3. **Aprende de ti y de la agencia:** tus clientes, tus piezas, lo que dijiste en reuniones, lo que el cliente pidió por correo, la brandguía.

**«Algo vivo» significa que reacciona a eventos**, no a un reloj: terminó una reunión (tarjeta con los compromisos para confirmar), el cliente aprobó o devolvió, llegó material a una pieza aprobada, llegó el día de corte de un cliente, un contrato vence en 30 días, alguien lleva 15 horas en una tarea, un prospecto no respondió en 7 días. Casi todos esos eventos ya disparan una notificación; el salto es que Bria **prepare el siguiente paso** (un borrador, una lista, un recordatorio redactado) y la persona lo acepte con un clic. Nivel 1, siempre.

| Rol | Cada mañana le prepara | Vigila y avisa | Borradores que deja listos |
|---|---|---|---|
| Community manager | Sus parrillas del mes: qué falta redactar, qué pieza no tiene material, qué lleva N días sin aprobación; lo que sale hoy en redes | Devoluciones del cliente con el motivo, piezas con fecha pasada sin publicar, feedback nuevo en el portal | Captions en el tono del cliente a partir de los criterios aprobados; respuesta al feedback; revisión de Bria antes de enviar |
| Diseño y producción | Piezas aprobadas en texto que esperan material, ordenadas por fecha de publicación; brandguía del cliente a mano | Pieza con material rechazado por formato o peso, carrusel con un archivo que no es lo que dice | Lista de entregas de la semana por cliente |
| Project manager | Semáforo de sus clientes con el motivo, compromisos de reuniones sin dueño, 1:1 pendientes, carga del equipo | Informes sin entregar, contratos por vencer, cliente sin reunión ni entrega en 30 días, persona con más de 15 horas en una tarea | Tarea desde un compromiso, recordatorio al cliente por un insumo pendiente, brief del 1:1 |
| Comercial | Seguimientos vencidos y de hoy en el CRM, qué dijo el prospecto en la última reunión | Oportunidad sin gestión en 21 días, propuesta enviada sin respuesta en 7 | Mensaje de seguimiento, borrador de cotización, resumen del prospecto |
| Financiero | Cuentas de cobro por emitir según el día de corte de cada contrato, cartera vencida por edad, abonos sin comprobante | Conciliación pendiente, nómina del 15 y del 30, pago que no cuadra con el extracto | Recordatorio de cobro redactado, cuenta de cobro prellenada desde el contrato |
| Dirección | Pulso de la agencia: clientes en rojo, cartera y flujo, equipo (carga, 1:1, señales), lo que Bria propuso y nadie decidió, qué cambió desde ayer | Todo lo anterior agregado; servicios caídos | Informe semanal para dirección |
| Cada persona | Sus tareas de hoy, su compromiso con hora, sus reconocimientos, su próximo 1:1, su plan de desarrollo | Lo suyo, nunca lo de los demás | Pedir más tiempo, explicar una devolución |

Dónde vive: el dashboard pasa a ser la casa del asistente (la fila de «Foco de hoy» con lo preparado y un botón de aceptar por ítem), la entrada a Bria desde cualquier pantalla para preguntar, y las notificaciones llevan el siguiente paso preparado en vez de solo avisar.

Qué hace falta para construirlo, en orden: la asistente con herramientas (bloque 1), el runtime de trabajos durables (A1) para que los eventos no se pierdan, los compromisos (B) para que las reuniones produzcan trabajo, y la lectura del negocio desde Drive y correo para que Bria conozca a los clientes. Personas (sección 7) entra como la lente de PM y dirección.

## 11. Lo que no haría

- Puntajes de riesgo de rotación visibles, ni señales de vigilancia de comunicaciones personales.
- Automatizar la zona 3: feedback crítico, salario, conflictos, promociones.
- Meter una contraseña, un token o un dato de nómina en el prompt del modelo.
- Leer los buzones personales del equipo. Solo buzones de la agencia, uno a la vez.
- Construir lo que Crehana vende y aquí no hace falta: reclutamiento (ATS) para 14 personas, catálogo de cursos, nómina genérica (la nómina de la plataforma ya es la de la agencia).
- Abrir fuentes nuevas (Drive, correo) antes de que exista la asistente que las use.

---

## Lecturas revisadas

Carpeta `C:\Users\chrod\Downloads\Brainstudio Intelligence`, 6 de octubre de 2026. Todas se leyeron completas con extracción de texto (`pdfjs-dist`), porque el visor de PDF del entorno no está instalado. Crehana: Cómo enamorar a tu equipo, Cómo lograr que tu empresa adopte AI, Cómo transformar tu estrategia de HR con IA, Anatomía de una renuncia, Calendario HR 2026, IA en talento (duplicado como «90 días»), De la rotación a la promoción interna con IA, Guía para conversaciones sobre el sueldo, HR posts no son comunicados internos, HR como motor de crecimiento, HR Report 2026, HR Tech ROI Playbook 2026. Microsoft: Informe de decisiones sobre IA (archivo «StateofGenerativeAIReport»), Haz crecer tu negocio con una IA en la que puedes confiar («Ebook-Trust»). Udemy: 2026 Global Learning & Skills Trends Report. Nebius Academy: Por qué las empresas no logran escalar la IA.
