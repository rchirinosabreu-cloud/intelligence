# Acceso inicial y bienvenida

## Comportamiento

- Al crear un miembro **con correo** desde Equipo, solo un admin recibe su correo y una contraseña temporal única junto con «Copiar acceso», después de confirmar la transacción. Sin correo se crea el miembro, no una cuenta.
- La contraseña se genera con `crypto.randomBytes(18)` y se almacena únicamente como hash bcrypt. El texto temporal existe en la respuesta HTTPS y en el estado del diálogo hasta cerrarlo; no se guarda en localStorage, sessionStorage, auditoría ni en el miembro. Copiarla la coloca en el portapapeles del admin para compartirla privadamente.
- `mustChangePassword` exige elegir otra contraseña antes de usar los módulos. El cambio invalida las sesiones anteriores mediante `sessionVersion`. Una actualización concurrente no puede sobrescribir una credencial que ya cambió.
- No se utiliza una contraseña compartida. La contraseña personal nunca se muestra al admin.
- Si el correo ya existe, crear devuelve 409 sin cambiar, vincular ni reactivar la cuenta. Las bajas se reactivan explícitamente desde su ficha de Equipo, conservando el historial y sin revivir sesiones antiguas.

### Cuentas creadas anteriormente

En la ficha de un miembro activo con cuenta activa y **sin haber elegido nunca su contraseña**, un admin encuentra «Preparar acceso inicial». La confirmación genera una clave nueva e invalida la anterior, códigos de recuperación pendientes y dispositivos push; no modifica permisos. Comprueba la versión de sesión vigente y registra el actor, nunca la clave.

La acción también permite recuperarse de una respuesta perdida después de crear una cuenta. No se puede volver a consultar la clave anterior. Si el usuario ya eligió su contraseña, corresponde usar recuperación, no este flujo.

Raúl Gómez no recibe un cambio automático por nombre ni por este despliegue: el admin debe comprobar su ficha y usar esta acción si sigue pendiente.

Las claves temporales no tienen vencimiento por tiempo en este bloque. Quedan invalidadas al cambiarlas o al preparar otro acceso. Un plazo de invitación/caducidad requeriría otro flujo explícito.

## Bienvenida y guía

- `OnboardingProvider` obtiene permisos actuales y elegibilidad desde el servidor, después del cambio obligatorio de contraseña. No toma autorizaciones del prototipo ni de un perfil fijo.
- La bienvenida automática requiere `User.onboardingEligible === true`, además de no haber sido atendida. Esta marca se activa en la transacción de creación de una cuenta nueva desde Equipo o al preparar explícitamente el acceso inicial de una cuenta que nunca eligió su contraseña. No se deduce del nombre, rol, fecha de creación, cambio de contraseña ni ausencia de historial.
- La bienvenida enumera los módulos visibles según el mismo contrato que Sidebar. Drive comparte permiso de Minutas; Salud Operativa es exclusiva de admin.
- `UserGuideProgress` conserva el avance por usuario, guía y versión (v1). Cerrar la bienvenida confirma su visualización; no prueba comprensión. Omitir una guía no equivale a completarla. Reabrir y omitir no degrada un avance completado.
- Primera guía disponible: **Cotizaciones**, cuatro pasos explicativos sin crear, emitir ni enviar propuestas. Aparece al entrar al módulo si está pendiente y la cuenta está inscrita para primer acceso. «Ver guía» sigue disponible manualmente también para cuentas existentes con permiso. Los demás módulos tienen explicación en la bienvenida, todavía no un recorrido propio.
- Evita encadenar guía inmediatamente tras cerrar la bienvenida en la misma pantalla. Respeta modales abiertos y pausa avisos de tareas/reconocimientos mientras presenta la bienvenida.
- Ante error de guardado conserva el diálogo y ofrece reintento. Un error de lectura no marca nada como visto.
- Corrección del 14 de septiembre: las cuentas existentes quedan excluidas por defecto (`onboardingEligible = false`), incluso si nunca vieron la bienvenida. No se rellenan falsos registros de finalización ni se borran avances. Para clientes anteriores todavía abiertos, la API deriva `NOT_APPLICABLE` en los avances ausentes de cuentas no elegibles; no persiste ese estado y conserva el historial real. El polling deja así de abrir automáticamente ambos diálogos. Si el cliente aún no ha actualizado, recargar aplica la corrección frontend inmediatamente.
- No se inscriben retrospectivamente cuentas por nombre. Para una cuenta creada antes de esta corrección que siga genuinamente pendiente de su primer acceso, el admin puede usar «Preparar acceso inicial»; esta acción renueva la clave con confirmación. No se ejecuta automáticamente durante el despliegue.

## Esquema y publicación

`scripts/ensure-onboarding-schema.js` crea la tabla de avance y añade `User.onboardingEligible BOOLEAN NOT NULL DEFAULT false` con bloqueo transaccional y tiempo de espera limitado. El valor constante excluye las cuentas existentes; nuevas ejecuciones no sobrescriben inscripciones ni avances. Es aditivo, idempotente y se ejecuta en `npm start` antes de Prisma/backend. No usa `db push` ni borra datos. Revisar el despliegue del servidor por separado del push Git.

## Comprobaciones reproducibles

```powershell
node --test tests/teamInitialAccess.test.js tests/initialPasswordConcurrency.test.js tests/onboarding.test.js tests/onboardingStartup.test.js tests/welcomeContent.test.js
node --test --test-concurrency=1 tests/browser/teamInitialAccess.mjs tests/browser/onboardingRuntime.mjs tests/browser/welcome.mjs tests/browser/firstAccess.mjs
$env:TEST_DATABASE_URL = 'postgresql://recognition_test@127.0.0.1:55448/recognition_test'
node --test tests/initialAccessPostgres.integration.mjs
npm run build
```

La integración PostgreSQL rechaza cualquier destino distinto del clúster local aislado y elimina solo las identidades ficticias creadas por la prueba. Verifica creación, hashes, invalidación, rollback, concurrencia, permisos y progreso. No certifica el despliegue productivo.

Verificación del 14 de septiembre de 2026: 55 pruebas dirigidas, 16 de navegador y 5 de PostgreSQL local pasaron. La comprobación adicional de contraste móvil oscuro también pasó. Compilación y lint de archivos cambiados correctos. La suite general obtuvo 1381 aprobadas, 6 omitidas y 1 fallo previo: `globalDestructiveColor.test.js` detecta dos botones en `ProposalDetailsEditor.jsx` (77 y 90), archivo sin cambios en este bloque. No se presenta la suite global como completamente verde.

Verificación de la corrección de elegibilidad del mismo día: 58 pruebas dirigidas, 5 del runtime en navegador y 6 de PostgreSQL aislado pasaron; compilación y lint dirigido también. Se comprobó que las cuentas existentes no abren bienvenida ni guía automáticamente, que «Ver guía» funciona manualmente y que las cuentas nuevas conservan la bienvenida después de elegir su contraseña. La suite general no se volvió a ejecutar en esta corrección.

### Muestras locales sin acceso a producción

`node scripts/preview-welcome.js` sirve en 127.0.0.1:3092 sin dotenv, proxy, backend ni base de datos; CSP restringe conexiones y el servidor bloquea escrituras/API reales.

- `/tests/fixtures/welcome-preview.html`: diseño y guía con perfiles de muestra; su avance local es independiente del progreso real.
- `/tests/fixtures/team-access.html`: creación ficticia; `?pending` muestra preparación de acceso; `&dark` prueba modo oscuro.
- `/tests/fixtures/onboarding-runtime.html`: componentes integrados y respuestas de API simuladas en memoria; `?error` y `?denied` cubren errores/permisos; `?existing` representa una cuenta existente sin historial y `?legacy` una respuesta anterior sin elegibilidad explícita.
- Las credenciales de los ejemplos **no son válidas para ninguna cuenta real**.
