# Navegación con contexto: primer incremento local

Fecha: 5 de noviembre de 2026. Rama: `codex/claridad-navegacion-local`, creada sobre `18e934b9`. Este documento describe la validación local inicial. La fusión del trabajo fue autorizada después de la demostración de tareas compartidas del mismo día; este bloque de navegación no modifica el esquema ni consulta producción.

## Resultado y alcance

La persona puede recorrer varias pantallas y regresar por la misma cadena, conservando las selecciones que este incremento representa en la dirección. El mecanismo existente de «Volver a…» se amplía y se conecta con tareas, parrillas, directorio de clientes, Financiero, Terceros, CRM, Cotizaciones, Minutas y las pestañas de Actividad. No se añade otro menú ni una nueva capa de navegación.

Esto es un primer incremento, no una certificación de que todas las funciones de la plataforma estén integradas. La implementación posterior de una tarea con varias tarjetas personales está documentada en: [TAREA_COMPARTIDA_UNICO_REGISTRO.md](TAREA_COMPARTIDA_UNICO_REGISTRO.md).

## Hallazgos y correcciones

| Prioridad | Problema observado en el código o reproducido | Corrección local |
|---|---|---|
| P1 | La procedencia guardaba un solo salto: A → B → C perdía el regreso completo a A. | Cadena acotada de orígenes, conservada al regresar. |
| P1 | Elegir pieza, cambiar pestaña o consumir `taskId` reemplazaba la dirección y descartaba su estado. | Los cambios dentro de una pantalla conservan su procedencia. |
| P1 | Gestión elimina `taskId` tras abrir la tarea; al salir hacia Parrillas el regreso no sabía qué tarea reabrir. | La salida desde la tarea lleva un enlace explícito a esa tarea. |
| P1 | Enlaces entre Terceros, CRM y Cotizaciones recargaban la aplicación y perdían origen/selección. | Enlaces internos con procedencia y regreso común. |
| P2 | Financiero elegía pestaña solo al montarse; un nuevo enlace no cambiaba una vista ya abierta. | La selección se deriva de la dirección actual, con aliases y valores validados. |
| P2 | Un enlace renderizado antes de bajar la página recordaba una altura antigua. | Al regresar se consulta la última altura de esa entrada de historial. |
| P2 | Repetir un regreso después de usar Atrás del navegador podía dejar la página arriba. | Cada regreso recibe una identidad nueva, incluso si la flecha pertenece a una pantalla que se desmontó. |
| P2 | La flecha de Cotizaciones ignoraba el lugar de procedencia y no tenía nombre accesible. | Usa el regreso común y anuncia el destino; sin origen vuelve al listado. |

La revisión independiente encontró además una regresión durante el desarrollo: al guardar en URL la carpeta abierta de Parrillas, el cierre por clic exterior podía competir con un enlace y cancelar la salida. Se añadió un recorrido de navegador para ese caso y se limitó el cierre a la superficie no interactiva del módulo.

## Recorridos cubiertos

| Pantalla / recorrido | Contexto conservado | Límite |
|---|---|---|
| Regreso común | Cadena de pantallas, parámetros, fragmento y altura; Atrás del navegador; recarga de la entrada vigente. | Doce orígenes como máximo; se cortan ciclos. No sincroniza historial entre dispositivos. |
| Tarea → parrilla → tarea | Identidad de la tarea abierta; selección de pieza; origen previo. | No incorpora todavía una vista de pieza dentro del diálogo de tarea. |
| Listado de Parrillas → parrilla | Búsqueda y carpeta de cliente. | El selector directo de período dentro del editor sigue pendiente. |
| Clientes → espacio | Pestaña, búsqueda de Directorio, CM e inactivos. La normalización de ID a slug conserva consulta y origen. | Los filtros internos del tablero de Operación son un trabajo posterior. |
| Financiero | Pestaña, año, mes, escenario, tipo, categoría y búsqueda globales. | No todas las selecciones internas de cada pestaña se representan aún en URL. |
| Terceros → CRM / cotización → regreso | Ficha abierta, búsqueda, rol y estado, además del contexto financiero. | Formularios de edición abiertos no se copian al historial. |
| CRM → oportunidad → cotización | Pestaña y procedencia; filtros de CRM siguen usando su persistencia existente. | El listado independiente de Cotizaciones aún requiere su propio ajuste. |
| Cotización nueva → guardada | Origen tras el reemplazo por la dirección de edición. | El enlace público de la propuesta mantiene su comportamiento propio. |
| Minutas → tarea → Minutas | Minuta abierta, panel desplegado y vista de papelera. | Solo viajan IDs y selección, no el contenido de las reuniones. |
| Actividad | La elección entre mapa y calendario conserva el origen. | No conserva aún fecha/persona seleccionada dentro de los submódulos. |

## Reglas de implementación

- Se reutilizan `useNavigateFrom`, `useOriginState`, `usePageLabel`, `useScrollMemory` y `BackToOrigin`. Las flechas propias pueden usar `useBackToOrigin(fallback)` para compartir el mismo comportamiento.
- Cambiar la selección dentro de una ruta conserva `location.state`. Salir a otra ruta añade un origen. Regresar recupera el anterior sin volver a ejecutar instrucciones de creación o apertura de formularios.
- El origen guarda únicamente dirección interna, etiqueta breve, altura, clave de historial y origen anterior. No copia indiscriminadamente el estado completo, los datos consultados ni borradores. Rechaza direcciones externas, barras inversas y caracteres de control.
- La dirección conserva identificadores y filtros necesarios para repetir la consulta autorizada. Ningún parámetro concede permisos ni evita las guardas existentes.
- La restauración de desplazamiento se detiene ante interacción de la persona. La memoria de altura es acotada y local a la pestaña.
- Se conserva el diseño y la tipografía compartidos. El botón de regreso tiene un área mínima de 44 px y utiliza los tokens de marca en claro y oscuro. Los acentos heredados de Actividad, Gestión y el listado de Parrillas pasan a tokens de marca; la cabecera del tutorial de tiempos usa la superficie Bria con contraste suficiente para texto blanco.

## Evaluación técnica acotada

La puntuación corresponde al mecanismo común de regreso y sus controles modificados, no a la accesibilidad ni al rendimiento de toda la aplicación.

| Dimensión | Puntuación / 4 | Evidencia y límite |
|---|---:|---|
| Accesibilidad | 3 | Botón semántico, nombre, foco visible, activación por teclado y área táctil comprobados; falta una auditoría completa con lector de pantalla. |
| Rendimiento | 3 | Sin dependencias nuevas ni lecturas de negocio adicionales por el regreso; historial y memoria acotados. No se midió rendimiento bajo carga. |
| Adaptación de pantalla | 3 | Recorridos en escritorio y móvil; control de regreso sin desbordamiento en 390 px. No se revisó cada módulo a todas las escalas. |
| Temas | 4 | Tokens compartidos, capturas en claro/oscuro y comprobación del tema efectivo en navegador. |
| Consistencia visual | 3 | Se reutiliza el control y la jerarquía existentes; no se introduce otro patrón visual. La evaluación completa de pantallas queda fuera de alcance. |
| **Total acotado** | **16 / 20** | Base consistente; quedan recorridos y validaciones de accesibilidad por completar. |

La revisión visual sigue la identidad vigente del repositorio. No se aplican preferencias estéticas externas que contradigan los componentes y superficies aprobados.

## Siguiente orden de trabajo

1. **Inicio → destinos internos.** `Dashboard.jsx`, `dashboard/DashboardUpcomingTasks.jsx`, `DashboardMeetings.jsx` y `DashboardReminders.jsx` mantienen enlaces que recargan o no llevan origen. Separar destinos internos de enlaces externos de reuniones.
2. **Ritmo → tarea.** `TeamWeekOverview.jsx` y `TeamLoadMap.jsx`: recuperar horizonte, persona y día seleccionado al regresar, sin convertir simulaciones en cambios reales.
3. **Listado de Cotizaciones → editor.** `Quotations/QuotationList.jsx`: conservar búsqueda, estado y origen del listado. Mantener separado el portal público.
4. **Formalización → anticipo concreto.** `financial/FormalizationsTab.jsx`: hoy se abre Cartera, no necesariamente la cuenta exacta. Añadir identificación y retorno sin alterar la aprobación ni el vínculo financiero.
5. **Selecciones restantes de Financiero.** Clase y antigüedad de cartera, clientes desplegados, tramos de Por pagar y el selector interno de mes de Rentabilidad.
6. **Equipo, Drive y Moodboards.** Recuperar selección de inactivos al volver de un perfil; carpeta y filtros de Drive; búsqueda del listado de Moodboards.
7. **Consulta sin salir.** Completar la vista de pieza desde tarea y el cambio de período dentro del cliente, siguiendo la regla «mirar no es viajar».

Cada bloque se acepta con un recorrido completo: entrar desde un origen, seleccionar, abrir detalle, actuar solo si corresponde, regresar y comprobar selección/posición. Una lista de enlaces existentes no demuestra continuidad.

## Muestra local

Ejecutar `node scripts/preview-navigation.js --port=3711` y abrir `http://127.0.0.1:3711/inicio`.

La muestra monta componentes reales de Gestión, Parrillas, Clientes y espacio del cliente con datos ficticios. Escucha solo en 127.0.0.1. La API de muestra solo admite lectura, no carga `.env` ni conecta una base. Los controles de negocio no guardan cambios en esta muestra. Para revisar el tema oscuro se puede abrir `/inicio?dark`.

La muestra no representa todas las pantallas modificadas ni acredita el comportamiento de una cuenta real. Las comprobaciones de Financiero, Terceros y Minutas incluyen pruebas de lógica e interacción con datos simulados.

## Verificación

Contratos y pruebas de interacción: `navigationOrigin`, `navigationOriginUi`, `financialNavigation`, `commercialNavigationUi`, `commercialNavigationInteractions`, y los contratos existentes de rutas operativas, enlaces, formulario de cotización, finanzas y minutas.

Recorridos de Chrome: `node --test tests/browser/navigationContinuity.mjs` y `node --test tests/browser/taskPieceNavigation.mjs`. El primero verifica el mecanismo común, la repetición del regreso y las pestañas reales de Actividad con sus cuerpos simulados. El segundo monta las pantallas reales de tareas, parrillas y clientes con una API ficticia de lectura.

Capturas: `output/navigation-continuity/` y `output/task-piece-navigation/`. Se revisan claro, oscuro y móvil. La compilación de producción es una comprobación de construcción, no un despliegue.

En la captura del tutorial oscuro se observó un pintado intermitente de la cabecera en Chrome sin ventana, aun con texto y estilos presentes. Las capturas finales de ese diálogo se obtuvieron con composición por software (`--disable-gpu`); no se atribuye ese comportamiento a producción ni se declara resuelto un problema general del navegador. El ajuste experimental de apilamiento se descartó. Los recorridos de navegación se ejecutaron con la configuración habitual de Chrome.

Resultado de la comprobación consolidada: **117/117 pruebas de contrato/interacción (93 generales y 24 sobre tiempos, colaboradores, tarjetas y sincronización) y 11/11 recorridos de navegador aprobados**; ESLint sin errores en los archivos cambiados y `git diff --check` limpio. `npm run build` completó correctamente. La compilación avisa de paquetes grandes, configuración de Prisma obsoleta y una regla CSS inválida derivada de un patrón de texto ya presente en `receivablePdfService.js`; son asuntos separados de este incremento. No se ejecutó la suite completa de integraciones ni una prueba sobre datos productivos.

## Incremento local posterior a PR #1264: períodos y estados (5 de noviembre de 2026)

Este bloque está implementado localmente en `codex/recorrido-tarea-pieza-local`; no forma parte del alcance fusionado que describe la sección anterior.

- El editor ofrece **Período de la parrilla**, con las parrillas existentes del mismo cliente. Cambiar de período conserva la procedencia, la carpeta/búsqueda del listado y la elección Editor/Calendario; esta última también sobrevive a una recarga. La pieza seleccionada no se arrastra a otro mes. Elegir una pieza desde Calendario o Bria actualiza pieza y vista en una sola navegación.
- El espejo MIO usa `GET /api/content/external-plans/:slug/periods`, antes de la ruta mensual. Lee exclusivamente `Client` y `ExternalPlanSnapshot` del cliente solicitado; devuelve meses con `okAt` y `tabName`, incluidos años anteriores. Conserva la guarda de Parrillas. No consulta Google, no importa meses y no cambia la semántica del listado global actual/siguiente. Un intento posterior fallido no borra la última lectura válida. El cuerpo del catálogo no incluye piezas, comentarios ni credenciales.
- Sin otro período disponible o si falla la consulta, el selector lo explica y conserva la parrilla abierta. Mientras se edita una pieza o se entrega material desde el editor, no permite cambiar de período. En MIO también queda bloqueado mientras haya una respuesta abierta, tanto en una pieza como en comentarios sin pieza: cancelar una no descarta las demás, un envío rechazado conserva el borrador y solo cancelar o confirmar todas permite cambiar de mes. Las acciones de cabecera se ajustan a varias líneas en móvil.
- Aprobada, realizada y publicada llevan etiquetas, iconos y tintes distintos en el carril, calendario y portal. Se reutiliza `PIECE_STATUS`: cian, coral y verde, respectivamente. El texto del distintivo usa los tonos neutros compartidos para alcanzar contraste AA sobre esos tintes. «Material nuevo» sigue prevaleciendo cuando falta revisar la entrega; una publicación no vuelve a revisión por una marca antigua. No cambian los estados guardados, permisos, filtros de aprobación ni automatismos de publicación.

Verificación TDD: los primeros casos fallaron por ausencia del selector/distintivos; la extensión de MIO falló al intentar elegir un mes histórico y su ruta devolvía 400. La revisión móvil detectó y corrigió un desbordamiento real de las acciones de cabecera. La prueba de contraste detectó 4,45:1 en el distintivo cian antes de usar texto neutro; después pasan los tres distintivos en claro y oscuro.

Comprobaciones focalizadas: **66/66 pruebas** de navegación, calendario, aprobación/portal, MIO y rutas HTTP con guarda real y servicios/base simulados; **8/8 recorridos nuevos de Chrome** en `tests/browser/contentPlanPeriods.mjs` y **6/6 regresiones** de `taskPieceNavigation.mjs`. Las pruebas de navegador montan componentes reales con respuestas ficticias y comprueban que consultar/cambiar períodos no envía escrituras. La regresión añadida de respuestas reproduce primero el selector habilitado con texto pendiente y después comprueba apertura, múltiples borradores, cancelación parcial, rechazo de envío, reintento y cambio al mes no cacheado tras el recibo. Última ejecución: `output/task-piece-delivery/premerge-periods-browser.log`; también pasan **23/23 contratos MIO**. ESLint sin errores ni advertencias en los archivos del cierre.

La aceptación con la aplicación completa encontró una interacción adicional: al llegar desde Gestión, el ajuste de posición de la pieza seguía activo al abrir el selector y desplazaba sus opciones fuera de la pantalla. `tests/browser/planPeriodReal.mjs` reprodujo el fallo (opción Octubre en `y=-515`) antes de corregirlo. El ajuste ahora se suelta también al primer clic; conserva el asentamiento inicial y deja mandar a la persona. La prueba con login, API y datos ficticios reales pasa Gestión → pieza → Octubre → misma tarea, sin esperas artificiales, clics forzados ni subida de archivos. También pasan **24/24 contratos** focales del editor, calendario, revisión y navegación. Captura revisada: `output/task-piece-local/period-regression/selector-abierto.png`.

Capturas revisadas en `output/content-plan-periods/`: `calendario-claro.png`, `editor-movil-oscuro.png`, `estados-editor-claro.png`, `estados-editor-oscuro.png`, `mio-claro.png`, `portal-claro.png`, `portal-oscuro.png` y `portal-oscuro-movil.png`.

Límites: los meses de MIO nunca importados no se inventan ni aparecen como destinos; el catálogo no realiza una sincronización nueva. El selector cambia la consulta, no traslada piezas ni crea parrillas. El portal público conserva el alcance de su enlace compartido y no recibe un catálogo privado de otros meses. Estas pruebas no certifican una cuenta real ni consultan producción. La aceptación posterior del catálogo con HTTP y PostgreSQL reales pasó 3/3 y está detallada en `docs/RECORRIDOS_PLATAFORMA_2026-11-05.md`; el recorrido completo y sus límites están en `docs/RECORRIDO_TAREA_PIEZA_ENTREGA_LOCAL.md`.
