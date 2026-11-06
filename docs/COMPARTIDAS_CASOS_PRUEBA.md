# Tareas compartidas: matriz de aceptación local

Fecha de análisis y ejecución: 5 de noviembre de 2026. Aceptación local con PostgreSQL, API y navegador reales. La matriz distingue casos ejecutados de combinaciones todavía no recorridas; no equivale a certificar cada camino de toda la plataforma.

El pedido vigente conserva una Task, ID, código, conversación, archivos y cliente. Ana es responsable; Bea y Carlos colaboran. Cada persona tiene estado, reloj y logro propios. El estado global es REALIZADA únicamente cuando todos terminaron; en otro caso prevalece DEVUELTA, después EN_CURSO y finalmente PENDIENTE. La prioridad de devolución no autoriza detener relojes de otras personas.

## Contrato comprobado

`Task.sharedProgress`, `rosterVersion` y `participants`: cada participación expone `memberId`, `member`, `role`, `status`, `completedAt`, `returnedAt`, `returnCount`, `revision`, `startedAt`, `accumulatedWorkMs`, `isReturned`, `legacy` y `permissions`.

`PATCH /api/tasks/:taskId/participants/:memberId` recibe `status`, `expectedRevision`, `expectedRosterVersion` y los motivos/notas aplicables. Devuelve la Task canónica con participaciones, sesiones y `participationTransition { memberId, fromStatus, toStatus, changed, completed, globalCompleted }`.

Una revisión antigua devuelve 409 y la interfaz refresca sin reenviar automáticamente. Mismo estado y revisión válida es una operación sin cambios; repetir la revisión antigua no lo es.

El logro personal es su cierre y su presencia en el historial/dashboard, con el mismo Task ID y `participantMemberId`. No se crean puntos ni un `RecognitionAward` nuevo por cada persona. Los reconocimientos globales conservan sus reglas. Retirar a una persona conserva su cierre y saldo anterior en `TaskParticipationArchive`, sin conservar acceso al detalle privado. Reincorporarla inicia otro episodio con revisión superior: un diálogo anterior no puede declarar tiempo para el nuevo. El saldo legado sin sesiones permanece separado de las horas fechadas; `isRework` identifica retrabajo personal aunque otra persona siga en el ciclo global INITIAL.

## Entorno y alcance de la evidencia

- PostgreSQL 17 nuevo en `127.0.0.1:55451/shared_tasks_demo`, rol `shared_tasks_test`; archivos en `output/shared-tasks-pg-data`. No comparte tablas con `recognition_test` de 55448.
- Preparación: `node scripts/test-shared-tasks-local.mjs`. Rechaza cualquier otro destino. No borra ni reinicia bases.
- API local: `127.0.0.1:8091`, montando el router real, autenticación y controladores reales. No se inicia el bootstrap de cron, correo, IA o WhatsApp.
- Navegador: `127.0.0.1:3181`, tres contextos independientes autenticados contra la API. La entrada compila Gestión, login y sus proveedores reales; no monta los demás módulos. El proxy solo transporta las peticiones a 8091. Las tareas, movimientos, sesiones, permisos y respuestas no se simulan. La prueba de demora retiene el transporte y luego entrega la petición original.
- El proceso recibe un entorno nuevo con solo variables operativas locales; `DOTENV_CONFIG_PATH` apunta a un archivo vacío propio. Prisma se ejecuta fuera del repositorio, en un directorio temporal con `package.json` propio, para evitar su búsqueda automática del `.env` raíz.
- El PostgreSQL portable disponible no incorpora pgvector. Solo se omiten las dos columnas `Unsupported("vector(...)")` en la copia temporal de entrada de Prisma. El esquema fuente no cambia. Todas las tablas/campos, índices y relaciones del circuito de tareas se conservan; esta prueba no acredita búsquedas vectoriales.
- Los datos son ficticios. Las notificaciones internas, cuando correspondan, se escriben en esta base; no hay suscripciones push ni credenciales de proveedores. Se bloquea la salida de red que no sea loopback.

Las cuentas principales son Ana, Bea y Carlos. Un administrador y una cuenta ajena sirven exclusivamente para comprobar intervenciones autorizadas y denegaciones; no son participantes de la tarea principal.

## Matriz

| ID | Acción/condición | Resultado que debe acreditarse | Capa |
|---|---|---|---|
| I01 | Crear una tarea con tres personas | Una sola fila Task; tres participaciones/tarjetas; mismo ID y código; sin subtareas ni clones | API + SQL + navegador |
| I02 | Abrir desde cualquiera de las tres tarjetas; corregir título autorizado | Mismo detalle, comentarios, archivos y cliente; título común actualizado una vez | API + navegador |
| I03 | Recargar y abrir segundo dispositivo | Se recuperan posiciones, revisiones y tiempos desde PostgreSQL, sin depender de memoria local | API + navegador |
| M01 | Ana: PENDIENTE → EN_CURSO | Una sesión de Ana, hora del servidor; Bea/Carlos siguen pendientes y sin reloj; global EN_CURSO | API + SQL + navegador |
| M02 | Bea empieza mientras Ana trabaja | Dos sesiones con workerId distinto; ninguna sesión reiniciada o atribuida a otra persona | API + SQL + navegador |
| M03 | Ana pausa; Bea continúa | Solo reloj de Ana cerrado; duración exacta guardada; global EN_CURSO | API + SQL |
| M04 | Ana termina; Bea continúa; Carlos pendiente | Ana REALIZADA con fecha/logro personal; Bea EN_CURSO; Carlos PENDIENTE; global todavía EN_CURSO; no publicación anticipada | API + SQL + navegador |
| M05 | Sin nadie trabajando, una persona terminada y otras pendientes | Global PENDIENTE con avance personal conservado; completedAt global null | API + SQL |
| M06 | Termina el último participante | Global REALIZADA, completedAt global, ciclo cerrado una vez; todas las sesiones terminadas | API + SQL + navegador |
| M07 | Editar texto sin mover estados | No cambia fechas de cierre, revisiones de progreso ni sesiones por inferencia | API + SQL |
| M08 | Mismo estado con revisión válida; repetición con revisión anterior | Primero no-op; segundo 409; sin segundos relojes, auditorías de transición ni premios | API + SQL |
| D01 | Devolver una participación con motivo y nota | Solo esa parte DEVUELTA; su sesión cerrada; returnCount/returnedAt correctos; otras partes conservadas; global DEVUELTA | API + SQL + navegador |
| D02 | Devolver sin motivo/nota requerida | Rechazo explícito; ningún cambio parcial de estado, reloj, ciclo o auditoría | API + SQL |
| D03 | Devolver A mientras B sigue trabajando | Global DEVUELTA sin cerrar sesión B; B puede terminar su parte con la devolución A pendiente | API + SQL |
| D04 | Reintegrar parte devuelta a PENDIENTE o EN_CURSO | Exige reintegrateReason y permiso; EN_CURSO inicia solo su reloj; motivo anterior permanece en historial | API + SQL + navegador |
| R01 | Reabrir parte realizada con motivo y nota | Solo esa parte PENDIENTE; fecha personal vigente se limpia; historia/logro anterior no se borra ni se duplica | API + SQL + navegador |
| R02 | Reabrir una parte después de terminar el conjunto | Global deja REALIZADA y completedAt pasa a null; retrabajo conserva cierres de otras personas; nueva sesión/ciclo según contrato | API + SQL |
| R03 | Completar otra vez una parte reabierta | No concede por segunda vez el mismo logro de primera finalización; cierre global idempotente respecto de publicación | API + SQL |
| R04 | Reapertura/devolución por rutas anteriores, panel, drag, Parrilla y Bria | Ningún camino modifica directamente el agregado contradiciendo participaciones; rechaza o delega con motivos/permisos nativos | Regresión API + navegador |
| A01 | Agregar persona nueva a tarea abierta | Nueva parte PENDIENTE; rosterVersion aumenta; no hereda tiempos ni realización | API + SQL |
| A02 | Promover colaborador a responsable | Conserva su estado, fecha, revisión y sesiones por workerId; no suma tiempos del responsable anterior | API + SQL |
| A03 | Reasignar a persona que no participaba | Persona nueva PENDIENTE; reloj de quien sale se cierra; historial y autoría anteriores conservados | API + SQL |
| A04 | Retirar a alguien que trabaja | Se cierra únicamente su sesión; no se borran horas ni eventos históricos | API + SQL |
| A05 | Retirar al último incompleto cuando eso cerraría todo | Rechazo: no se declara entrega completa por retirar a esa persona | API + SQL |
| A06 | Cambiar integrantes del conjunto cerrado | Rechazo hasta reabrir explícitamente; no cambia cierre histórico silenciosamente | API + SQL |
| A07 | Usar rosterVersion anterior tras agregar/quitar/reasignar | 409; no se mueve una participación ya retirada ni se sobrescribe el nuevo roster | API + SQL |
| A08 | Retirar definitivamente al responsable con saldo legado y cierre propio | Archivo conserva saldo/fecha/autor; nuevo responsable no hereda horas; retirado pierde acceso privado | API + SQL |
| A09 | Retirar/reincorporar/completar y usar un diálogo de tiempo anterior | Revisión monótona; declaración antigua 409, vigente 200; archivo del cierre anterior intacto | API + SQL |
| C01 | Dos personas distintas empiezan simultáneamente | Ambas transacciones confirmadas o conflicto recuperable explícito; ningún avance perdido; una sesión por persona | PostgreSQL concurrente |
| C02 | Dos dispositivos mueven la misma participación/revisión | Solo uno gana; otro 409; una transición/auditoría/sesión efectiva | PostgreSQL concurrente + navegador |
| C03 | Los dos últimos participantes terminan simultáneamente | Un cierre/ciclo global, una transición de pieza y una tarea Publicar; logro individual de cada persona una vez | PostgreSQL concurrente |
| C04 | Retiro/reasignación simultáneo a movimiento personal | Serialización válida; respuesta stale o roster actualizado; sin sesión huérfana ni trabajo atribuido al sustituto | PostgreSQL concurrente |
| C05 | Fallo de persistencia a mitad de transición | Rollback de estado, sesión, agregado, ciclo y efectos transaccionales; ningún éxito anunciado | PostgreSQL + API |
| C06 | Lectura antigua llega después del recibo; API demorada/falla | Proyección solo visual «Guardando…»; no reloj/logro prematuro; no reaparece estado viejo; rollback no borra cambios ajenos | Navegador con demoras de transporte |
| P01 | Participante mueve su parte y prueba mover la ajena | Propia permitida; ajena denegada salvo permiso de dirección | API real |
| P02 | Devolver propio/como creador/responsable/Manager; reintegrar | Matriz de permisos del contrato aplicada en servidor; reintegración solo creador/Manager | API real |
| P03 | Reabrir con acceso autorizado; cuenta ajena/privada/sin módulo | No amplía privacidad ni permisos de lectura; cabecera no concede detalle ni transición | API real |
| P04 | Cliente suspendido y restricciones de foco | Cada entrada nueva y anterior conserva la misma puerta aplicable; no se evade usando ruta personal | API real |
| P05 | Persona inactiva, sesión revocada o colaborador retirado | Auth/membresía vigente comprobadas al ejecutar; sin movimiento ni reloj | API real |
| E01 | Reconocimientos y carga personal | Un logro atribuible al participante correcto; una Task global; no triple total de tareas ni horas mezcladas | API + SQL + métricas |
| E02 | Avisos, pieza vinculada y siguiente etapa | Cierre personal no ejecuta cierre global; cierre final dispara efectos permitidos una sola vez | API + SQL |
| E03 | Tarea individual sin colaboradores | Mantiene columnas/reloj/fechas/cierre existentes, sin exigir selección de participante innecesaria | Regresión + navegador |
| E04 | Tarea histórica compartida abierta/cerrada | Preserva cierre global conocido; no infiere finalizaciones de pausas ni entrega premios retroactivos | SQL + API |
| E05 | Prioridad y filtro personal/general | Clave visual compuesta sin nuevo TaskID; movimiento personal no reordena otras tarjetas; sin duplicados en respuesta | API + navegador |
| E06 | Corregir reloj abierto de colaborador y sesión histórica de exresponsable | Pausa/revisión solo de la persona corregida; reloj ajeno y total del nuevo responsable intactos | API + SQL |
| E07 | Reabrir una parte mientras otra sigue trabajando | Nueva sesión personal isRework; sesión ajena intacta; mismo ciclo global INITIAL abierto | API + SQL |
| V01 | Claro, oscuro, móvil | Tres estados y persona identificables; reloj propio, retorno, formularios de motivo y errores legibles | Capturas navegador |

## Registro de ejecución y límites

Cada resultado debe indicar comando, fecha, participantes/IDs sintéticos, número de pruebas, resultado y limitación. Las capturas acreditan presentación; el estado PostgreSQL y los recibos de API acreditan persistencia. Una pantalla simulada o una prueba solo de funciones no sustituye las filas API/SQL/navegador de esta matriz.

- `node --test tests/sharedTaskSandbox.test.js`: 2/2 aprobadas. Hubo RED antes de implementar las guardas; se verifica destino exacto, aislamiento de variables y credenciales sintéticas.
- `node --test tests/sharedTaskApi.integration.mjs`: 22/22 aprobadas en la última corrida integral de 10,06 s, incluyendo GET individual privado denegado tras retiro y plan operativo sin shareToken/internalNotes/briaReviewLeaseToken. Login, permisos, router, servicios y persistencia son reales. Se acredita I01/I03, edición común I02 (título/fecha/descripción/enlace de referencia), movimientos personales, devolución/reintegración/reapertura parcial, A01/A02/A04–A09, C01–C05, privacidad y retiro, P04, tiempo declarado, pieza/publicación, legado abierto/cerrado E04, E03/E06/E07. Las autorizaciones se comprobaron con cinco cuentas ficticias; no cubre todas las permutaciones de roles de P02/P03/P05.
- La concurrencia usa peticiones HTTP simultáneas: dos revisiones iguales dan 200/409; dos últimos cierres distintos dan dos cierres personales, un ciclo global cerrado, una transición de pieza y una sola Task de publicación. La publicación es una fila local de trabajo, no una publicación en redes.
- El rollback se provoca con un trigger SQL limitado al ID sintético. El trigger se elimina en `finally`. Se comparan Task, participantes, sesiones y ciclos completos, comentarios y eventos transaccionales `TASK_PARTICIPATION_CHANGED`; no se cuenta como rollback la escritura asíncrona independiente `PLATFORM_MUTATION` de peticiones anteriores.
- Las dos correcciones de reloj E06 fallaron contra el servicio anterior (parte quedó EN_CURSO y tiempo histórico alteró el total del nuevo responsable); después de la corrección pasaron en PostgreSQL real. El alta ligada a pieza también reveló un recibo sin participaciones y fue corregida antes del resultado verde.
- `node --test tests/browser/sharedTaskReal.mjs`: 2/2 aprobadas en 22,81 s. Acreditó inicio de Ana, inicio de Bea, cierre solo de Ana, Carlos pendiente, recarga conservando estado, cierre final únicamente tras los tres y SQL sin relojes abiertos. Incluye reapertura personal después del cierre global (R02) y conflicto real 409 con demora (C06): sin logro/reloj prematuro, refresco autorizado, sin reenvío y una única sesión. Ese segundo caso detectó un GET individual inexistente, que los dobles de UI no mostraban; el endpoint autorizado se añadió y el caso pasó en la repetición. `page-errors.json` quedó vacío.
- `node node_modules/eslint/bin/eslint.js` sobre los archivos propios del entorno y pruebas: sin errores. La regresión raíz comunicada fue 597 pruebas: 592 aprobadas, 0 fallos, 5 omitidas (suites históricas que requieren otra base); no se suman pruebas solapadas. Build Vite aprobado con avisos previos de tamaño. El lint general no concluyó por EMFILE al recorrer worktrees ajenos.

Durante la demostración del 5 de noviembre, cambiar de Ana a Bea en la misma pestaña dejó los permisos anteriores en la caché de consultas: Bea aparecía correctamente como «Tú», pero solo veía «Devolver mi parte». Cerrar el detalle, actualizar tareas y abrirlo recuperó sus acciones. `AuthContext` ahora limpia la caché al entrar/salir o invalidar la sesión y cancela las consultas pendientes, conservando la caché mientras se usa la misma sesión. TDD con React, QueryClient real y JSDOM: cuatro regresiones fallaron antes del cambio y pasaron después, incluyendo respuesta tardía y contenido privado de la cuenta previa. `node --test tests/authQueryIsolation.test.js tests/authSessionPolicy.test.js tests/managementFilterSession.test.js tests/mfaClient.test.js tests/nativeTasksSynchronization.test.js`: **28/28 aprobadas**, con `NODE_ENV=test` y `DATABASE_URL` explícita en 55451, sin red ni base en esas pruebas. Este resultado no acredita por sí solo el recorrido de navegador posterior al arreglo.

Los artefactos viven en `output/shared-tasks-local`: `api-fixtures.json` conserva IDs ficticios del último conjunto API; `api-acceptance.log` conserva el log local. `browser/acceptance.json`, `page-errors.json` y las capturas documentan el recorrido del navegador. Las capturas parcial claro/oscuro/móvil se toman después de refrescar otras sesiones para que el avance 1/3 sea coherente; la actualización entre navegadores usa las lecturas normales, no un canal en tiempo real añadido.

No se han recorrido con PostgreSQL real todas las entradas de Parrillas/Bria R04 ni todas las combinaciones de sesión revocada/inactiva P05. C04 cubre retiro concurrente con inicio; otras carreras de reasignación necesitan recorridos adicionales. I02 acredita datos comunes y enlace de referencia; no incluye subida/descarga de un archivo binario. E04 acredita cierre legado sin fechas personales, un único logro histórico y reapertura sin premios retroactivos. Los tests unitarios complementan, pero no sustituyen los recorridos faltantes. La autopublicación compartida se comprobó en 22 pruebas de servicio con Meta y DB simuladas; no se envió contenido a redes. Ritmo sigue seleccionando tareas por cierre GLOBAL del período; no representa todos los cierres personales anteriores al global. Horas diarias/semanales sí usan worker/fecha de sesiones reales, sin inventar fecha para el saldo legado.

Incidencias del montaje: la primera invocación de Prisma detectó y cargó el `.env` raíz; `DATABASE_URL` ya estaba fijada a 55451 y no se imprimieron valores ni se conectó a producción. Se corrigió el aislamiento ejecutando Prisma fuera del repositorio con paquete propio. Hubo un intento inicial de autoinstalación del generador en el temporal; se detuvo y se fijó el generador instalado y `PRISMA_GENERATE_SKIP_AUTOINSTALL`. La primera prueba RED de alertas de otro bloque ignoró una inyección falsa e hizo una lectura con usuario ficticio, sin filas ni escrituras; se corrigió y las siguientes fijaron la base aislada. Estos incidentes no acreditan datos productivos. El entorno final sí usa destino fijo y ninguna integración externa.

## Revisión antes de integrar

Rodny autorizó la fusión después del recorrido real con Ana, Bea y Carlos. La revisión añadió dos protecciones: una respuesta tardía de `/api/auth/me` no puede restaurar la cuenta anterior después de salir, cambiar de persona o expirar la sesión; y `TaskParticipationArchive` forma parte del catálogo de historial inmutable, sin retención ni borrado en cascada. `taskId` conserva la identidad histórica y `currentTaskId` queda en nulo al borrar la tarea. Las vistas operativas omiten esos archivos sin borrarlos. El instalador migra tanto el esquema anterior como una columna creada previamente por Prisma, pero no vuelve a vincular archivos ya protegidos.

Validación adicional: 31/31 contratos de sesión, 73/73 de métricas/dashboard y 3/3 pruebas PostgreSQL del archivo en esquemas temporales aislados de 55451. Prisma validó el esquema y Vite compiló; `npm run build` local no pudo reemplazar la DLL de Prisma que mantiene abierta la API de la demostración. La compilación completa se comprueba en CI antes de fusionar. Seguridad, licencias y código sin uso pasaron sus puertas; el lint del código pasó excluyendo copias de trabajo y compilaciones locales ignoradas por Git.

## Vista local reproducible

Arranque: `node scripts/preview-shared-tasks-local.mjs`. Prepara únicamente 55451, crea cuentas/clientes/tareas ficticios y mantiene API 8091 + Gestión 3181. El acceso, contraseñas de prueba y los dos Task ID quedan en `output/shared-tasks-local/preview-access.json`, sin JWT. No ejecutar las suites de API/navegador mientras el preview ocupe esos puertos.

Abre `http://127.0.0.1:3181/gestion` e inicia sesión con una de las cuentas del archivo. Selecciona el cliente de esta ejecución. «Responsable: Todos» permite ver las tres tarjetas del mismo Task ID; Ana/Bea/Carlos muestran su parte. La tarea «prueba desde cero» permite repetir todo; la segunda comienza con Ana realizada, Bea trabajando y Carlos pendiente. «Cambiar persona» cierra la sesión local y muestra el login real; perfiles independientes del navegador permiten probar a las tres personas a la vez. Este preview es Gestión real sobre una base ficticia, no una instancia de todos los módulos ni un despliegue.

Vista persistente verificada el 5 de noviembre a las 17:13 de Bogotá mediante `node scripts/capture-shared-tasks-preview.mjs`: login real de Dirección en la pantalla, selección del cliente y «Todos», tres tarjetas de la misma Task con estados PENDIENTE/EN_CURSO/REALIZADA y un detalle común con el código `029348d0`. La comprobación no movió las tareas. Recibo: `output/shared-tasks-local/preview-verified.json`; capturas: `browser/preview-todos.png` y `browser/preview-mismo-id.png`. El proceso permanece activo y los datos del acceso vigente están en el JSON de acceso; un reinicio crea otro conjunto ficticio y actualiza ese archivo.

Para comprobar el arreglo de cambio de persona sin reiniciar esa API ni volver a sembrar, se compiló después un frontend independiente en **`http://127.0.0.1:3182/gestion`**, usando la misma entrada real y proxy a 8091. `sharedTaskWebFixture` acepta ahora un puerto opcional y conserva 3181 por defecto; el lanzador local está en `output/shared-tasks-local/frontend-only-3182.mjs`. El archivo `preview-access.json` apunta a 3182 y mantiene la ejecución `2d9b11a7-f45b-4cb7-8b95-aac6804ee813` y la tarea `823d130f-11b5-497d-9998-41a59bf9a263`. El listener anterior de 3181 conserva su bundle anterior. Se verificó HTTP 200 del frontend nuevo y su bundle, con el proceso de API 8091 intacto. Después se verificó en pantalla el recorrido **Ana → Cambiar persona → Bea → Cambiar persona → Carlos**, abriendo siempre esa misma tarea y sin actualizar manualmente: Carlos mostró inmediatamente «Empezar», «Terminar» y «Devolver» su parte. Se conservaron Ana realizada con 13 s, Bea realizada con 7 s y Carlos pendiente con 9 s, avance 2/3. Captura final: `output/shared-tasks-local/walkthrough/06-final-verificado.jpg`; la pestaña de esta vista quedó abierta como entrega.
