# Carpetas de Drive con contraseña — prueba local, 6 de noviembre de 2026

Rodny eligió un bloqueo dentro de Intelligence, también para administradores sin la clave. El acceso directo al bucket de Railway queda fuera de este bloqueo: no se cifran los archivos. Rodny autorizó la fusión de este incremento el 6 de noviembre de 2026, tras revisar la muestra local; es independiente de la corrección de comentarios fusionada en el PR #1269.

## Recorrido

- Quien creó una carpeta manual encuentra el candado para poner, cambiar o quitar su contraseña. Cambiarla o quitarla requiere la clave vigente; no hay restablecimiento por rol de administrador.
- La carpeta sigue visible con su nombre y candado. Su descripción y contenido quedan cerrados. Los archivos y subcarpetas heredan el bloqueo; una subcarpeta puede tener otra clave adicional.
- Desbloquear habilita solo la sesión autenticada durante 30 minutos. La contraseña no se guarda en el navegador. Cambiarla invalida accesos anteriores; «Bloquear carpetas» cierra los desbloqueos de esa sesión.
- Lectura, búsqueda, vista previa, descarga, carga, edición, movimiento, papelera y restauración comprueban los ancestros en el servidor. Los enlaces directos pasan por la misma comprobación. El permiso del módulo Drive sigue siendo obligatorio.
- Las carpetas automáticas de entregables y minutas conservan sus permisos nativos y no ofrecen esta opción. La protección de una carpeta manual no cambia los entregables asociados a tareas o piezas.

## Persistencia y límites

El arranque aditivo `ensure-drive-schema.js` crea `DriveFolderProtection` y `DriveFolderUnlock`. Se guarda un hash scrypt con sal aleatoria; los desbloqueos se vinculan al usuario, una huella de su token de sesión, revisión de la clave y caducidad. No se escriben claves en auditoría ni se exponen hashes en las respuestas. Los intentos de clave tienen un límite de 10 por minuto y persona en cada proceso del servidor; el contador se reinicia al reiniciar ese proceso.

Los controladores usan una transacción de servidor y bloqueos compartidos/exclusivos para coordinar lectura y cambios de árbol/protección. Las respuestas se envían después de confirmar la transacción, con `private, no-store`. El cuerpo de una petición no puede sustituir el identificador, base de datos o identidad elegidos por el servidor. Los accesos vencidos se limpian al desbloquear otra carpeta.

La interfaz limpia los archivos y las vistas previas al bloquear, caducar, cambiar de usuario o recibir un rechazo de acceso. La plataforma no puede retirar copias que alguien ya hubiera descargado mientras tenía acceso. Una contraseña cambiada desde otra sesión se comprueba en la siguiente petición; no se añadió un canal de cierre remoto en tiempo real.

## Comprobaciones

- `tests/driveFolderProtectionApi.integration.mjs`: cinco casos con autenticación, HTTP, PostgreSQL 55451 y almacenamiento ficticio local reales. Cubren administrador sin clave, bytes de descarga, herencia, claves independientes, cambios de contraseña, sesiones diferentes, caducidad, cargas rechazadas, destino protegido, papelera/restauración, ciclos, intento de sustituir el id desde el cuerpo, permiso de módulo y límite de intentos. El recorrido inicial falló con 404 antes de implementar las rutas.
- La ejecución conjunta de los cinco casos nuevos y los contratos existentes de Drive, descripciones, almacenamiento, entregables y enlaces pasó **39/39 pruebas**, incluyendo HTTP/almacenamiento de entregas.
- `tests/browser/drivePassword.mjs`: interfaz real con respuestas controladas, protección, clave incorrecta, desbloqueo y bloqueo. Falló antes de existir el botón y pasó después. Las seis pruebas existentes de navegador de entregables también pasaron.
- `tests/browser/drivePasswordReal.mjs`: aplicación completa y servidor real locales, entrada de Dirección, clave incorrecta/correcta, descarga, nuevo bloqueo y móvil oscuro. Pasó sin errores de página. Capturas inspeccionadas en `output/drive-password`.
- Esquema Prisma válido; ESLint de los archivos modificados y `git diff --check` sin errores.

## Abrir la muestra

Con `NODE_ENV=test` y la base dedicada `postgresql://shared_tasks_test@127.0.0.1:55451/shared_tasks_demo`, ejecutar `node scripts/preview-drive-password.mjs`. Usa API 8098 y aplicación 3184; solo datos ficticios, sin cron ni conexiones externas. El esquema aditivo se prepara en ese clúster.

El acceso vigente queda en `output/drive-password/access.json`. La carpeta de prueba usa la clave `Clave local de Drive 2026`. La muestra permanece en `http://127.0.0.1:3184/drive`; los ensayos HTTP usan 8097 para no interferir con ella. La publicación aplica las tablas mediante el arranque aditivo; los datos y claves ficticios de esta muestra no se transfieren a producción.
