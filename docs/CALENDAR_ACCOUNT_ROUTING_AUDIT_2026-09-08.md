# Auditoría de destino de Google Calendar — 8 de septiembre de 2026

## Estado y alcance

**Corrección implementada localmente; pendiente de publicación y validación de destino real por el usuario. No es una certificación de sincronización en producción.**

Los hallazgos siguientes describen el código base auditado, anterior a la corrección. El apartado «Implementación local» distingue los cambios y las comprobaciones posteriores.

Incidente: al elegir Social en el formulario, el usuario observa el evento en Coordinador. Los ejemplos afectados fueron eliminados por el usuario antes de esta investigación. No podemos reconstruir su solicitud, organizador y destino remoto exactos.

Código local auditado: `b783a0ab24e3488912a14e23b471da8ddc1895ad`. Railway confirmó ese mismo commit en el despliegue `8d89656f-3e6f-4603-9722-990ed08a0dd5`, estado `SUCCESS`. Se consultó la interfaz publicada con una sesión iniciada por el usuario: ambas cuentas aparecen conectadas. No se modificaron eventos, conexiones, tokens, calendarios activos ni variables productivas durante esta fase.

## P1 — Cuenta visible distinta de la enviada: reproducido

`OperationalCalendar.jsx` inicializa `googleConnectionId` con la primera conexión disponible o una cadena vacía al abrir el formulario. Las conexiones se consultan de forma asíncrona. Si llegan después de abrirlo, el estado del formulario permanece vacío, pero el `<select>` no contiene una opción vacía y el navegador muestra la primera cuenta.

Prueba con el componente real en Chromium, retrasando únicamente la respuesta simulada de conexiones:

| Señal | Resultado observado |
| --- | --- |
| Cuenta visible | `social.brainstudio@gmail.com` |
| Valor DOM del selector | `social` |
| `googleConnectionId` enviado en POST | `""` |
| Resolución del backend para ese valor, con dependencias externas simuladas | Coordinador |

El backend de creación usa `authorize(data.googleConnectionId || null)`. El caso `null` selecciona preferentemente la cuenta central. Se reproduce, por tanto, un camino completo compatible con el síntoma descrito: **Social visible → cuenta vacía → Coordinador**. No demuestra por sí solo que todos los eventos eliminados siguieran este camino.

Evidencia local reproducible, ignorada por Git:

- `verification/calendar-routing-browser-audit.mjs` y su JSON: seis escenarios, cinco conformes y uno que falla al comparar cuenta visible y enviada.
- `verification/calendar-routing-delayed-status.png`: pantalla del caso fallido.
- `verification/calendar-account-routing-audit.mjs` y su JSON: 18 escenarios del servicio real con OAuth, Google y persistencia simulados. Incluye el valor vacío observado en el navegador y los cinco tipos de evento para ambas cuentas.

Al cambiar explícitamente Coordinador → Social después de cargar las cuentas, el formulario envía Social en Producción, Proyecto, Reunión, Ausencia y Descanso. En el servicio no hay una regla que redirija estos tipos a Coordinador cuando el ID Social válido está presente.

Corrección necesaria: selección inicial estable y coherente con el estado; opción vacía explícita mientras no haya una elección válida; no permitir guardar con cuenta ausente/inactiva; preservar elecciones explícitas durante las actualizaciones del estado de conexiones. En creación, rechazar un ID ausente en vez de sustituirlo silenciosamente por Coordinador. No alterar el destino persistido de trabajos pendientes durante un reintento.

## P1 — Cambio de cuenta al editar ignorado: confirmado por código

El formulario de edición permite modificar `googleConnectionId` y lo envía en el PATCH. `updateOperationalEventUnlocked` no persiste ese campo ni `googleCalendarId`, ni rechaza el cambio. La sincronización usa el vínculo organizador y destino anteriores.

El usuario puede guardar creyendo que cambió el calendario cuando no ocurrió. No se ejecutó una edición de un evento real para probarlo. La corrección debe implementar un traslado explícito y seguro o bloquear la modificación con una explicación, nunca ignorarla. No reutilizar un ID remoto de un calendario como si fuera una creación en otro: puede duplicar eventos o perder el organizador.

## P1 — Cuenta OAuth y calendario destino son conceptos distintos

La creación guarda `auth.connection.calendarId`, no necesariamente el calendario primario de esa cuenta. `setActiveGoogleCalendar` permite persistir un ID sin comprobar que sea escribible ni resolver su identidad. El selector del evento solo muestra el correo de la cuenta, ocultando esa diferencia.

La prueba hipotética Social con `calendarId=coordinadorbrainstudio@gmail.com` envía correctamente las credenciales simuladas de Social, pero solicita insertar en Coordinador. **No se ha comprobado que esa sea la configuración productiva.** Tampoco se ha verificado en esta fase la identidad real de los tokens de cada conexión.

Google define `calendarId` como el destino de `Events.insert`; `primary` se refiere al calendario primario del usuario autenticado, no al texto mostrado por nuestro selector. Fuente: [Google Calendar — Events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

Corrección necesaria: definir y mostrar el destino concreto, validar identidad y permisos con Google y persistir el par conexión/calendario antes de escribir. Si el producto ofrece únicamente selección por cuenta, su significado debe ser inequívocamente el calendario propio de esa cuenta; una configuración histórica que lo contradiga debe notificarse y revisarse, no cambiarse a ciegas.

## P2 — Organizador de reserva engañoso

Después de escribir, `syncOperationalEventToGoogle` usa el correo central como reserva si Google no devuelve `organizer.email`. Eso puede registrar Coordinador sin evidencia, aunque no decide dónde se inserta el evento. No sustituir datos desconocidos por un organizador inventado; resolverlos mediante el calendario verificado o mantenerlos explícitamente desconocidos.

## Por qué las comprobaciones anteriores no bastaban

Se volvieron a ejecutar 147 pruebas existentes de calendario: todas pasaron. Cubren fechas, reintentos, autenticación, fallos, recurrencia, permisos y persistencia simulada. **Siguen pasando con el fallo del selector presente.** La prueba nueva del navegador falla precisamente en un caso que faltaba: apertura antes de cargar las conexiones.

El sondeo anterior llamado `ui-default-social` recibía directamente `googleConnectionId: 'social'`; no ejecutaba el formulario. Sus credenciales, destino remoto y persistencia eran simulados. No podía descubrir que la interfaz enviaba una cadena vacía ni demostrar entrega en Google real. Un despliegue `SUCCESS`, un estado de cuenta «Actualizado» y pruebas con dobles no equivalen a validar el calendario receptor.

## Implementación local

- Formulario: orden estable de cuentas, opción vacía real mientras falta una selección, bloqueo de cuentas desconectadas y del guardado/Meet sin selección válida. El estado de conexiones puede actualizarse sin cambiar la elección. Al editar, se muestra y bloquea la cuenta original, sin sustituir una cuenta desconocida por otra.
- Creación: exige un ID explícito; no usa la cuenta central como reserva. Se verifica el correo autorizado con Google y se resuelve el calendario principal escribible antes de guardar la intención. Una configuración histórica que apunte a otro calendario se rechaza sin cambiarla. Identidad incompatible habilita reconexión de esa conexión; una respuesta temporal de error no la desactiva.
- Edición: cambiar conexión o calendario produce `GOOGLE_CALENDAR_MOVE_REQUIRED`; editar contenido conservando origen sigue permitido. No se implementan traslados ni se mueven eventos anteriores.
- Recuperación: los reintentos de intenciones ya guardadas conservan su identidad y destino. No se redirigen trabajos pendientes ni se reconstruyen los ejemplos eliminados por el usuario.
- API: selección ausente devuelve 422; identidad/destino incompatibles o traslado implícito devuelven 409 con explicación. Si ya existe una intención persistida, prevalece la respuesta de recuperación de ese mismo evento. «Generar Meet» también exige selección explícita.
- Metadatos: se eliminó la reserva que inventaba Coordinador como organizador.
- No se cambió el esquema, CORS, la configuración productiva de conexiones ni las variables del despliegue. El endpoint administrativo de selección de calendario conserva su contrato histórico para sincronización; la nueva validación de creación impide usar un destino secundario oculto. Ampliar la interfaz para ofrecer calendarios secundarios o traslados queda fuera de esta corrección.

Pruebas versionadas de regresión: `tests/googleCalendarAccountRouting.test.js`, `tests/calendarAccountRoutingApi.test.js` y `tests/calendarFrontendBrowserVerification.mjs`. Se observó la prueba de cuenta visible/enviada fallar antes de corregir; los casos nuevos de identidad, edición y respuestas de API también se comprobaron en rojo antes de su implementación. La matriz de creación→inserción recorre el servicio y adaptador reales con Google, OAuth y persistencia simulados: sigue sin equivaler a entrega real.

Las pruebas iniciales exploratorias en `verification/calendar-*-audit.mjs` documentan el diagnóstico anterior; no son la suite de aceptación de la implementación nueva. Capturas finales: `verification/calendar-reliability/calendar-account-routing-light.png` y `calendar-account-routing-dark.png`.

Comprobación final local:

- 257 pruebas `.test.js` de calendario y actividad: pasan, sin omisiones. Incluyen 42 de enrutamiento por cuenta y 6 de respuestas API.
- 28 pruebas de navegador de `calendarFrontendBrowserVerification.mjs`: pasan. APIs interceptadas; escenarios de fechas, recuperación, conexiones y claro/oscuro/móvil. Capturas de la selección inspeccionadas en ambos temas.
- `npm run build`: pasa, incluidas 8 comprobaciones JSX y generación de Prisma Client (sin aplicar esquema ni conectar a la base). Permanecen advertencias de dependencias sobre Browserslist, configuración Prisma, uso de `eval` de Bluebird y tamaño de chunks; no se actualizaron dependencias en esta corrección.
- ESLint sobre los archivos JS/JSX/MJS modificados y `git diff --check`: sin errores.
- Conexiones de base configuradas con una URL local inoperante durante las pruebas unitarias. No se ejecutó la suite PostgreSQL real en este bloque; su fixture se actualizó al requisito de selección explícita. No se verificaron tokens ni inserciones reales en Google después de la corrección.

Reproducción (PowerShell; no ejecutar suites contra la conexión productiva):

```powershell
$env:DATABASE_URL='postgresql://verification:verification@127.0.0.1:1/disabled'
$env:DIRECT_URL=$env:DATABASE_URL
$calendarTests = @(rg --files tests | Where-Object { $_ -match '(calendar|activity).*\.test\.js$' })
node --test --test-isolation=none --test-concurrency=1 @calendarTests
node --test --test-isolation=none tests/calendarFrontendBrowserVerification.mjs
```

El navegador de pruebas usa Chrome instalado en Windows y un servidor Vite temporal en `127.0.0.1:3187`; no requiere iniciar sesión en Brainstudio o Google.

## Cierre en producción a cargo del usuario

El usuario retiró la prueba asistida con Google por la dificultad de acceso y solicitó terminar la implementación para comprobarla personalmente en producción. **No se creó ningún evento de prueba real ni hay eventos de prueba que limpiar.**

1. Publicar la corrección una vez autorizado el push y confirmar el commit desplegado; recargar la plataforma para recibir el formulario nuevo.
2. Crear un evento futuro inequívoco sin invitados/equipo eligiendo Social. En Google, comprobar el calendario organizador y el evento con el resto de calendarios ocultos. Que una cuenta tenga compartido el calendario de otra no significa que sea la organizadora.
3. Repetir con Coordinador. El tipo de evento no debe alterar la selección.
4. Editar título/hora desde Brainstudio y comprobar el cambio en Google; editar desde Google y comprobar retorno en Brainstudio mediante sincronización. La cuenta debe mantenerse durante ediciones normales.
5. Eliminar las pruebas y comprobar la eliminación recíproca. Si aparece un error de identidad o destino, conservar su texto exacto y la cuenta elegida; no cambiar la configuración a ciegas ni crear copias para ocultar el error.

Hasta disponer de esas comprobaciones, el estado correcto es **implementado y comprobado localmente, pendiente de validación productiva**, no «sincronización real resuelta».
