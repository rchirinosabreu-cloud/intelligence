# Animaciones y reconocimientos de Brain

## Decisión

La primera versión debe usar **Framer Motion para la interfaz y canvas-confetti para un acento de celebración opcional**. Ambos están en el proyecto. No hace falta instalar otro motor, comprar una biblioteca visual ni sustituir la mascota para validar esta experiencia. El valor inicial está en la oportunidad del reconocimiento, el texto y la tranquilidad de la interacción.

**Rive es la candidata para una futura Bria con gestos y estados propios.** Lottie/dotLottie es una alternativa para ilustraciones animadas preparadas por diseño. No conviene incorporar ambos antes de tener un recurso visual concreto que lo justifique. Esta es una recomendación de arquitectura y producto, no el resultado de una comparación de rendimiento entre todos los motores.

## Alcance y evidencia

La comparación utiliza documentación y licencias oficiales, consultadas el 10 de septiembre de 2026. El repositorio declara React 18.3.1, `framer-motion` ^11.15.0 y `canvas-confetti` ^1.9.4. La documentación actual de Motion también incluye APIs posteriores: la implementación conserva las APIs disponibles en la versión instalada y no realiza una actualización global.

El laboratorio monta **App, AppLayout, Dashboard y Gestión reales**, con respuestas locales simuladas. No ejecuta `server.js`, no carga `.env`, no importa Prisma, no inicia procesos de sincronización y no tiene un proxy a producción. Bloquea escrituras API y peticiones no contempladas. Las muestras se identifican como tales. No equivale al funcionamiento del motor automático, la persistencia entre usuarios o una validación productiva.

## Comparación de alternativas

| Opción | Utilidad para Brain | Trabajo adicional | Decisión |
| --- | --- | --- | --- |
| Framer Motion / Motion | Entrada y salida del aviso, transición de estados y gesto corto de Bria | Definir movimientos y probar accesibilidad; ya está instalada | Usar ahora |
| canvas-confetti | Partículas breves y delimitadas, no una lluvia sobre toda la aplicación | Ajustar cantidad, limpieza y movimiento reducido; ya está instalada | Usar de forma opcional |
| Rive | Mascota con estados como saludar, celebrar y volver a reposo | Diseñar/animar un `.riv`, seleccionar renderer, cargar runtime y probar fallback | Evaluar cuando se apruebe animar a Bria |
| Lottie / dotLottie | Medallas e ilustraciones preparadas que se reproducen al obtener un logro | Crear o licenciar cada recurso; integrar reproductor y carga diferida | Alternativa si diseño entrega animaciones compatibles |
| GSAP | Secuencias complejas y control detallado de múltiples elementos | Añadir otro motor y su integración React | No necesario para este bloque |
| Anime.js | Animación programática, SVG y líneas de tiempo | Añadir otro motor e integrar su ciclo de vida | No necesario para este bloque |
| CSS nativo | Opacidad, estados de interacción y decoraciones simples | Resolver ciclo de vida y coordinación si crece la complejidad | Complemento; no una nueva dependencia |

### Framer Motion / Motion

Motion ofrece componentes declarativos para React, transiciones y animación de layout. Su núcleo se distribuye con licencia MIT; la oferta Motion+ es separada. Brain no necesita las APIs ni los ejemplos de pago para el aviso propuesto. La documentación incluye `MotionConfig` y `useReducedMotion` para adaptar el movimiento a las preferencias del sistema. [Repositorio y licencia](https://github.com/motiondivision/motion), [accesibilidad](https://motion.dev/docs/react-accessibility).

La ventaja decisiva aquí no es afirmar que sea el motor más rápido: es que ya forma parte de Brain y permite conservar una sola forma de animar React. Se usan opacidad y desplazamiento corto, sin animar altura de todo el dashboard ni hacer scroll automático. La mascota realiza un solo gesto de entrada, sin bucle permanente. Una actualización futura del paquete debe tratarse por separado.

### canvas-confetti

El proyecto ofrece instancias sobre un canvas propio, parámetros de partículas y `disableForReducedMotion`. La licencia del repositorio es ISC. Un canvas delimitado permite mantener el efecto dentro del aviso; hay que activar expresamente el respeto a movimiento reducido. [API, opciones y licencia](https://github.com/catdad/canvas-confetti).

El laboratorio carga el módulo de forma diferida, solo en el estilo «Celebración». Limita el efecto a 26 partículas y reinicia la instancia al desmontarla. El canvas no recibe clics y no sustituye el texto del reconocimiento. No se ha medido consumo energético ni rendimiento en teléfonos físicos: la prueba móvil inicial usa un viewport de Chrome, no hardware móvil.

### Rive

Rive permite controlar animaciones, máquinas de estados y enlaces de datos desde React. Sus runtimes oficiales tienen licencia MIT. El recurso `.riv` y la selección de renderer son decisiones adicionales, no algo que la instalación produzca automáticamente. [Integración React](https://rive.app/docs/runtimes/react/react), [licencia de runtimes](https://rive.app/docs/runtimes/getting-started), [selección de renderer](https://rive.app/docs/runtimes/choose-a-renderer/faq).

Es una buena candidata para una Bria expresiva porque el comportamiento puede diseñarse alrededor de estados. Por ejemplo: reposo → celebración breve → reposo. Esto no necesita que Bria sea un chatbot. Antes de incorporarla, habría que disponer de la mascota por capas o de una ilustración animable, acordar los gestos, verificar exportación y condiciones del editor, y probar el archivo real. La licencia del runtime no garantiza que un recurso de terceros o todas las funciones del editor sean gratuitos.

No se promete un ahorro de bytes o una superioridad visual universal: dependerán del archivo, renderer y dispositivo. Tampoco se ha probado Rive dentro de este laboratorio.

### Lottie / dotLottie

El reproductor React oficial admite recursos `.lottie` o `.json`. La documentación actual contempla React 16.8 o superior. El formato dotLottie y sus SDK oficiales se presentan como MIT, pero la licencia de una animación descargada es una cuestión distinta. [Reproductor React](https://docs.lottiefiles.com/en/runtimes/distributions/react/v0.x), [formato y SDK](https://lottiefiles.com/dotlottie).

Las animaciones públicas cubiertas por Lottie Simple License permiten uso comercial bajo sus condiciones; hay que revisar la licencia concreta de cada archivo y preservar los términos aplicables. No basta con que un catálogo diga «gratis». [Lottie Simple License](https://lottiefiles.com/page/license).

Lottie sería especialmente útil si el equipo prepara una medalla animada o una secuencia corta de Bria. No se añade ahora porque aún no existe un recurso aprobado que necesite ese reproductor. La distinción no es «Rive interactivo frente a Lottie siempre estático»: el ecosistema dotLottie también incluye interactividad y máquinas de estados. [Interactividad dotLottie](https://docs.lottiefiles.com/en/format/dotlottie/interactivity).

### GSAP y Anime.js

GSAP dispone de una integración React con limpieza de animaciones mediante `useGSAP`. Su licencia estándar actual permite uso comercial sin coste, con condiciones propias; no debe describirse como MIT ni descartarse usando información antigua sobre plugins de pago. [React](https://gsap.com/resources/React/), [licencia estándar](https://gsap.com/community/standard-license/).

Anime.js ofrece animaciones, SVG, líneas de tiempo y una interfaz sobre Web Animations API. [Documentación](https://animejs.com/documentation/). Ambas opciones pueden servir para trabajos más complejos. En este caso, duplicar un motor existente no aporta una ventaja demostrada. No se instalaron ni se ejecutó una comparación práctica con ellas.

## Diseño de la primera experiencia

El dashboard conserva **Logros recientes**, su lista original de tareas completadas y su altura de 470 px junto a Anuncios. No se sustituye por un widget «Reconocimientos». Se mantienen persona, título de la tarea, cliente y hora, añadiendo únicamente títulos cortos de reconocimiento cuando existe una asociación explícita.

«Ver historial completo» abre el componente original **Historial de logros**, con tareas agrupadas por miembro, búsqueda de tarea/cliente, fecha, selector de miembro y acción de regresar al tablero restringida a administradores. Las tareas sin reconocimiento siguen apareciendo. La muestra usa datos ficticios en la misma consulta `/api/tasks/completed` y permite probar esos filtros sin tocar producción.

`TaskRecognitionLabels` presenta etiquetas desde eventos asociados a `taskId` y al `userId` del responsable. No confundir ese ID con `TeamMember.id` ni propagar el reconocimiento a todas las tareas de una persona. Los hitos diarios/semanales pueden etiquetar la tarea detonante si el servidor conserva esa relación. Una aprobación de parrilla sin tarea vinculada no se agrega arbitrariamente a otra tarea: su representación histórica y persistencia están pendientes de la integración real. La muestra no añade un segundo historial de premios.

El aviso personal aparece abajo a la derecha en escritorio y ajustado al ancho disponible en móvil. No toma el foco, no impide escribir y no crea una cortina de fondo. Usa `brain-ai-header`, cuerpo neutro light/dark y la mascota existente pequeña sobre blanco. Se sitúa por debajo del header, menús y diálogos; no debe cubrir una confirmación importante.

Los tres estilos del laboratorio son:

- **Sutil:** entrada de 280 ms, desplazamiento de 18 px y gesto único de la mascota.
- **Celebración:** la misma presentación más un pequeño efecto de partículas local.
- **Sin movimiento:** contenido inmediato, sin desplazamiento, giro ni partículas.

La preferencia del sistema por movimiento reducido tiene prioridad sobre el estilo elegido. El texto está disponible como estado anunciado de forma no urgente. Los controles tienen al menos 44 px de altura. No hay audio, parpadeo ni animaciones infinitas nuevas.

Fuera del modo de revisión, el componente prevé cierre tras 9 segundos, pausado al pasar el cursor, enfocar controles o esconder la pestaña. En el laboratorio, «Mantener aviso visible» está activado inicialmente para revisar la redacción; desmarcarlo permite probar el cierre. Cerrar el aviso no elimina la entrada del historial.

## Qué se puede probar ahora

Ejecutar `npm run dev:recognitions` y abrir `http://127.0.0.1:3000/`. Es un servidor de muestra aislado, no un backend financiero, de calendarios o de tareas. No requiere Docker ni credenciales reales. Si el puerto ya está ocupado, usar `RECOGNITION_PREVIEW_PORT` con otro puerto; no detener procesos ajenos.

Los seis botones simulan buen comienzo, entrega anticipada, on fire, ponerse al día, parrilla aprobada y 50 tareas semanales para Rodny. Se puede cambiar el estilo, navegar a Gestión, cambiar de tema, abrir el historial, cerrar el aviso y reiniciar la muestra. Repetir el mismo ejemplo no duplica su registro. Las muestras viven en memoria del navegador y se reinician al recargar; este comportamiento no es la persistencia deseada para producción.

Los nombres del equipo se usan solo para evaluar textos. Ninguna persona recibe estos reconocimientos ni notificaciones reales. Las seis situaciones son simuladas, no una certificación de su desempeño.

## Catálogo seleccionado: únicamente seis reconocimientos

Esta selección sustituye las propuestas anteriores de diez reconocimientos. No añadir primera conquista, cinco entregas a tiempo, semana redonda, colaboración, desbloqueo ni otros sin una nueva solicitud. Los textos de presentación están centralizados en `src/lib/recognitionPresentation.js`. Los títulos son cortos, sin saludo personalizado. Se usa «Entrega anticipada» como único nombre para el reconocimiento antes llamado «Un paso adelante»; no son dos premios diferentes.

Se elimina «Bria celebra contigo». El encabezado contiene solo el título del logro junto a la mascota. «Buen comienzo» sigue siendo la primera tarea del **equipo en el día**, aunque «del día» ya no figure en su mensaje. La muestra reemplaza al ganador ficticio al repetir ese escenario; esto no implementa exclusión mutua ni otorgamiento en servidor.

Las seis condiciones ya se evalúan en el servicio de servidor descrito abajo. La simulación visual sigue separada: por sí sola no prueba transacciones, conteos ni sincronización entre usuarios.

| Título | Condición seleccionada | Mensaje |
| --- | --- | --- |
| Buen comienzo | Primera tarea completada por el equipo en el día | Eres el primero del equipo en completar una tarea.<br>Cada avance cuenta. |
| Entrega anticipada | Completar el pendiente antes del plazo comprometido | Terminaste ese pendiente antes de lo previsto. Anticiparte también suma. |
| On fire | Ocho tareas distintas completadas por la persona en el mismo día | Hoy completaste ocho tareas. ¡Qué manera de hacer avanzar las cosas! |
| Al día | La persona tenía vencidas y las completa, quedando sin vencidas | Resolviste todo lo que tenías vencido, buen trabajo. |
| Parrilla aprobada | Todas las piezas activas están aprobadas; destinatario: responsable de la parrilla | El cliente aprobó tu parrilla, mandemos a producción |
| Ya son 50 | Cincuenta tareas distintas cumplidas por la persona en la misma semana | Llevas 50 tareas cumplidas en esta semana, puro trabajo y dedicación. ¡Felicidades! |

Precisiones de la implementación:

- «On fire» sustituye a constancia: **ocho tareas al día**, no cinco entregas puntuales ni días consecutivos. El umbral anterior de seis queda sustituido.
- En «Buen comienzo», «Cada avance cuenta» tiene un salto de línea explícito. «Mandemos a producción» es solo el texto del reconocimiento, no una instrucción para despachar tareas automáticamente.
- Las 50 son **semanales**, no un hito acumulado histórico ni los últimos siete días móviles. Convención de implementación: semana calendario de lunes a domingo, en `America/Bogota`, una vez por persona y semana. El día de «On fire» y «Buen comienzo» usa también Bogotá; no UTC.
- Completar/reabrir/completar no multiplica tareas ni avisos. Los conteos requieren evidencia de servidor y tareas distintas, no clics ni una lectura parcial del tablero.
- Ponerse al día exige completar las vencidas: no otorgarlo por borrarlas, reasignarlas, cambiarles la fecha, aplicar un filtro o fallar una consulta. No otorgarlo a quien nunca tuvo vencidas.
- La aprobación total requiere al menos una pieza activa y todas aprobadas; no basta estar pendientes de aprobación. Considerar aprobación del cliente y estados aprobados guardados en plataforma, siempre sobre la misma versión. El responsable recibe el reconocimiento; no quien hizo el último clic. No dispararlo por una aprobación parcial ni duplicarlo al guardar de nuevo.
- La evidencia de fechas comprometidas, episodios de vencimiento y primera finalización está en PostgreSQL, no en el laboratorio visual.

## Motor real y activación — 11 de septiembre de 2026

- `recognitionService.js` se integra en creación/actualización/eliminación de tareas, sincronización de tareas vinculadas y aprobación/comentarios de parrillas. Transacciones serializables, bloqueo compartido antes de leer y reintentos por conflicto conservan tarea y premio juntos. Un rollback no deja un reconocimiento huérfano.
- `RecognitionAward` conserva destinatario, tipo, versión, evidencia, día/semana Bogotá y clave única. `RecognitionTaskState` conserva primera finalización y fecha comprometida inicial; reabrir, reasignar o borrar no aumenta conteos. Una fecha cambiada hacia adelante no crea entrega anticipada. Se exige terminar en un día anterior, no unas horas antes del mismo día.
- `RecognitionDebtState` registra el conjunto vencido. Borrar, reasignar o aplazar una pendiente invalida ese episodio para «Al día». Un episodio nuevo puede empezar después; como máximo un premio por persona/día. La tarea que cierra el episodio recibe su etiqueta.
- `RecognitionPlanState` conserva aprobación explícita por pieza activa. Un estado de producción por sí solo no demuestra aprobación; un comentario de devolución invalida esa evidencia. Se otorga una sola vez por parrilla al responsable activo. Cambiar responsable no traslada premios ni crea otro. No se crean tareas de producción por celebrar.
- `ensure-recognitions-schema.js` corre antes del servidor mediante `npm start`. Es aditivo, transaccional e idempotente; si falla, el arranque falla explícitamente. Captura historia conocida de tareas/ciclos y parrillas ya aprobadas sin otorgar premios históricos. Las completadas conocidas de la semana participan en los conteos, pero no se emiten umbrales ya superados antes de activar. La fecha comprometida inicial de tareas antiguas es la que existe al activar: no se inventa historia de fechas no registrada.
- Los premios futuros nacen de transiciones nuevas. Crear directamente una tarea ya realizada se registra como base, no como una nueva transición a premiar. No hay puntos, dinero ni decisiones laborales asociados a estos conteos.

### Entrega y experiencia

`RecognitionRuntime` está montado en `AppLayout`, fuera del laboratorio. Consulta `POST /api/recognitions/claim` cada 20 segundos mientras la página está visible y no hay un modal abierto. La identidad viene de la sesión; no se acepta un destinatario enviado por el navegador. Se comprueban usuario activo, permiso de Gestión/Parrillas y recurso todavía perteneciente a esa persona.

Cada reserva dura 60 segundos y es exclusiva entre sesiones. `POST /:id/acknowledge` confirma la misma reserva y revalida el recurso; solo después de un 200 se muestra el popup. La confirmación es persistente y no se repite al recargar. Una reserva no confirmada puede recuperarse al expirar. Si el navegador se cierra exactamente después de confirmar y antes de pintar, el aviso puede no verse; no se promete entrega visual exactamente una vez ante un cierre abrupto. El premio sigue guardado.

Se muestra uno a la vez, con separación mínima de 30 segundos entre confirmaciones; no sustituye el aviso que alguien mantiene abierto con el cursor. Dura 9 segundos de lectura activa, se puede cerrar, respeta movimiento reducido y no reproduce avisos de más de 24 horas. El estilo inicial es sutil, sin partículas; el laboratorio conserva las variantes para comparar.

«Logros recientes» y «Historial de logros» mantienen tareas, clientes, fechas, búsqueda, agrupación y reapertura. Añaden únicamente etiquetas del premio persistido que coincide con tarea/persona. No hay tarea ficticia para «Parrilla aprobada»: ese reconocimiento se guarda asociado a la parrilla y se entrega por popup, no como fila de tarea. Una tarea reabierta sale del historial de completadas sin borrar su evidencia ni generar otro premio al cerrarla otra vez.

### Despliegue y siguiente revisión

Railway construye frontend y backend desde `main` usando `Dockerfile` y `npm start`. La activación no depende de una bandera de demostración. Confirmar el SHA y el estado `SUCCESS`, además del mensaje de arranque `[Recognition schema] Ready`, antes de afirmar que está activo en producción. No crear premios sintéticos en producción para probarlo.

Después del estreno conviene observar el uso real y los cierres, revisar falsos positivos con el equipo y ajustar frecuencia antes de añadir más categorías. Las pruebas locales no certifican por sí solas que un miembro concreto haya visto un aviso productivo.

## Comprobaciones reproducibles

- `node --test tests/recognitionPresentation.test.js`: categorías, saneamiento, duplicados por ID, orden, cambio de día en Bogotá y movimiento reducido.
- `node --test tests/browser/recognitions.mjs`: dashboard real, altura compartida, aviso no bloqueante, historial, cierre, movimiento intermedio, móvil oscuro, navegación y aislamiento de escrituras.
- `node --test tests/personalDashboardLayout.test.js tests/personalDashboardUi.test.js`: protección de la distribución y funciones existentes.
- `node --test tests/recognitionRules.test.js tests/recognitionSchema.test.js tests/recognitionIntegration.test.js tests/recognitionController.test.js tests/recognitionRuntimeContract.test.js`: reglas, contratos y validación API.
- `tests/recognitionPostgres.integration.mjs`: PostgreSQL real aislado, concurrencia, rollback, 8/50 tareas distintas, historial, vencidas, aprobación mediante el servicio real, permisos, reservas/expiración y popup real en Chrome con sesión autenticada. Exige `TEST_DATABASE_URL=postgresql://recognition_test@127.0.0.1:55448/recognition_test` y rechaza cualquier otro destino. Preparar exclusivamente ese clúster, generar cliente con `npx prisma generate` y DDL con `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output output/recognition-test-schema.sql`; ejecutar con `NODE_ENV=test`. El test limpia únicamente sus tablas en ese clúster explícito.
- `npm run lint` y `npm run build`: validación del repositorio sin publicar.

Las capturas quedan en `output/recognitions`. `real-api-popup.png` procede de una transición real, PostgreSQL aislado y API autenticada; las demás muestras visuales son simuladas. Ninguna captura local certifica el despliegue productivo. No se han comprado recursos ni añadido runtimes nuevos.

## Fuentes

Fuentes primarias consultadas: Motion, repositorio `motiondivision/motion` y guía de accesibilidad; `catdad/canvas-confetti`, README y licencia; Rive, documentación de React, runtimes y renderer; LottieFiles, SDK React, formato dotLottie, interactividad y licencia de recursos; GSAP, integración React y licencia estándar; Anime.js, documentación técnica. Los enlaces aparecen junto a cada afirmación para distinguir capacidades documentadas de recomendaciones para Brain.
