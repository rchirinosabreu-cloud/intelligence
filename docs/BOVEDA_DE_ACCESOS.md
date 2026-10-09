# Bóveda de accesos

9 de octubre de 2026. Rodny pidió que Bria «pueda darme contraseñas». Hasta hoy vivían en texto plano en el Drive: el Access Book, la hoja «Formato usuarios y contraseñas» y unos veinte documentos de claves. También circulaban por correo y no se cambiaban cuando alguien salía del equipo.

## Qué es
- **Página `/boveda`**, para administradores y project managers. Ahí se guardan, se buscan, se ven y se editan los accesos de cada cliente.
- **Quién ve qué** (decisión de Rodny): un administrador ve todos. Un project manager ve los de los clientes donde figura como PM (`Client.projectManagerId`), más los que un administrador le comparta. Los accesos de la propia agencia, sin cliente, son de administración salvo que se compartan. Compartir y ver quién leyó un acceso es solo de administradores. La regla vive en `src/lib/vaultAccess.js` y se aplica **en la consulta SQL**: un acceso que no te toca nunca sale de la base.
- **Cifrado.** Usuario, contraseña y notas se guardan con AES-256-GCM (`src/lib/vaultCrypto.js`). Cada valor se ata a su registro y campo, así que un texto cifrado copiado a otra fila no se abre. La clave se deriva con HKDF de `VAULT_ENCRYPTION_KEY` o, si no existe, de `ENCRYPTION_KEY`. Las tablas nunca guardan un valor en claro.
- **Ver deja registro.** «Ver» descifra solo ese acceso, primero anota quién lo vio, cuándo y desde dónde (`reveal_events`, en la bóveda o desde Bria), y lo muestra durante un minuto. Si el registro no se guarda, no se muestra nada. Está limitado a 30 lecturas por persona cada 10 minutos. Las respuestas van sin caché.
- **Nada se borra.** Retirar un acceso lo saca de la vista y de Bria, pero queda en el historial. Las ediciones dejan evento con los campos que cambiaron, nunca con los valores.

## Bria y la bóveda
`buscar_acceso` encuentra los accesos que la persona puede ver y devuelve al modelo **solo nombre, plataforma y cliente**. Debajo de la respuesta, la plataforma dibuja una tarjeta con «Ver acceso» (`BriaAccessCards`). Al pulsarla se comprueba el permiso otra vez, se registra la lectura y se muestra el valor.

- **El modelo nunca ve, escribe ni recibe una contraseña.** Tampoco pide que la peguen en el chat: para guardar o cambiar un acceso, la persona usa la página Bóveda.
- **Si falta la clave de cifrado**, la herramienta se apaga y Bria sigue respondiendo con todo lo demás.

## La carga desde el Drive
`C:\Proyectos\lectura-del-negocio\herramientas\importar-boveda.mjs` está fuera del repositorio porque lee los textos confidenciales descargados del Drive.

- **Cómo carga cada fuente:**
  - **Access Book** (versión del 25 de septiembre de 2026): una sección por cliente, cada una como un **bloque** (`kind = BLOQUE`) ligado al cliente cuando el nombre coincide con seguridad.
  - **Documentos sueltos:** uno por documento.
  - **La hoja «Formato»**, una copia anterior del Access Book cuya exportación mezcla clientes: entera pero **solo para administradores**, para que ningún PM vea claves de otra cuenta.
  - **Las cuentas de la propia agencia** (Brain Studio, iCloud de MIO, Basecamp): también solo para administradores.
- **Sin pérdidas.** Un bloque de más de 3.800 caracteres se parte en varias partes, nunca se corta.
- **Idempotente.** Cada bloque tiene una clave de importación: repetir la carga no duplica nada ni pisa lo editado después.
- **Nunca imprime un valor:** solo cuántos bloques salen y a qué cliente van.
- **Simula por defecto.** Escribe con `--confirmar IMPORTAR`.

Antes de cargar en producción se comprobó, comparando huellas y sin mostrar ningún valor, que la `ENCRYPTION_KEY` local es la misma de Railway.

**Lo que queda en manos del equipo:**
- **Borrar** del Drive los documentos con claves en texto plano, una vez revisados en la bóveda.
- **Cambiar las claves más sensibles**, porque circularon por correo y en documentos compartidos.
- **Activar la verificación en dos pasos** para administradores y project managers (`MFA_REQUIRED_ROLES`).

## Verificación
- Lógica: `tests/vaultCore.test.js` (cifrado atado a su registro, alteración detectada, clave corta rechazada, permisos y validación).
- Rutas y servicio: `tests/vaultRoutes.test.js` (sin caché, identidad de la sesión, causas técnicas ocultas, límite de lecturas, PM resuelto en cada llamada, herramienta de Bria sin valores, ruta detrás de la autenticación).
- PostgreSQL real aislado: `tests/vaultPostgres.test.js` (nada en claro, cada persona ve lo suyo, cada lectura registrada, edición vieja rechazada, compartir solo administradores, carga idempotente, retirar sin borrar).
- Muestra local con datos ficticios: `tests/fixtures/vault-preview.html` (`?rol=pm`, `&dark`, `&bria`).
- Carga de prueba en la base aislada: 101 bloques; la segunda vez, 0; los 101 se descifran y ninguno queda sin cifrar.
