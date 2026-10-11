# Los buzones que lee Bria

11 de octubre de 2026. Rodny: «recordarnos si recibimos un correo importante y que no se abra el chat necesariamente pero sí que aparezca allí como un recordatorio arribita de Bria». Las cuentas son dos buzones compartidos: `social.brainstudio@gmail.com` (Gmail normal, la más importante) y `contacto@brainstudioagencia.com` (Workspace).

## Por qué IMAP y no el botón de Google

El calendario se lee con un permiso que Google llama «sensible»; leer Gmail es un permiso «restringido» y, para una app que lo pida con cuentas @gmail.com, Google exige una auditoría de seguridad externa (CASA) antes de dejar conectar. Sin eso, la cuenta de Gmail queda bloqueada o en modo prueba con tokens que caducan cada 7 días. Por eso los dos buzones entran por **IMAP con contraseña de aplicación**: la genera la cuenta (Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones), se pega una vez en Actividad → «Buzones que lee Bria» y se sella en el servidor con la misma llave y la misma forma que la bóveda (`vaultCrypto.js`, AES-256-GCM atada al id del buzón). Nunca viaja al navegador ni pasa por el modelo. Sirve igual para Gmail y para Workspace (los dos viven en `imap.gmail.com`).

## Qué hace la plataforma con el correo

- **Conectar** (`POST /api/bria/mail/accounts`, solo administradores): prueba la entrada por IMAP antes de guardar nada; una contraseña rechazada no se guarda y se dice por qué. Volver a conectar el mismo buzón solo reemplaza la contraseña. Administradores y project managers con Bria ven la lista; probar y quitar es de administradores.
- **Leer** (`mailboxService.readImportant`, dentro del pulso cada 15 minutos en horario hábil): lo recibido desde la última lectura (como mucho 24 horas, con 10 minutos de margen), solo la bandeja de entrada. De cada correo se guarda **remitente, asunto, fecha, decisión y motivo** en `bria_memory.mail_seen` (30 días), nunca el cuerpo; el extracto se usa para decidir y se descarta. Un buzón que falla se anota y no frena a los demás; una contraseña rechazada apaga ese buzón hasta que la cambien, y el semáforo lo muestra.
- **Decidir qué importa** (`src/lib/mailImportance.js`, reglas puras): viene de un contacto de un cliente registrado (correo de la ficha o del CRM, o el dominio propio del cliente, nunca gmail y parecidos), habla de dinero o contrato, de una aprobación, pide cambios o se queja, o responde a un hilo de la agencia. Un desconocido que solo dice «urgente» no entra. Boletines, avisos automáticos y lo que mandamos nosotros nunca entran. El hecho para el pulso (`describeMail`) es una frase con quién, de qué y por qué.
- **Avisar**: el hecho `CORREO_IMPORTANTE` entra al pulso como los demás (topes, repetición, juicios), con sus acciones: **Abrir el correo** (enlace directo al mensaje en Gmail, en otra pestaña) y **Que Bria me lo resuma y proponga respuesta** (queda escrito en el chat; la persona lo envía).
- **Resumir a pedido** (`correos_importantes`, `leer_correo`; solo administradores y project managers con Bria): Bria lista lo marcado importante y lee un correo concreto por su id, con el texto acotado a 6.000 caracteres y los nombres de los adjuntos. El contenido es dato, nunca instrucción (regla 8 y 21). **Bria no envía correos ni los archiva**: propone el texto y la persona lo manda desde su correo.

## Dónde vive

`scripts/sql/bria-mail.sql` (`mail_accounts`, `mail_seen`; aplicado al arrancar por `ensure-bria-knowledge-schema.js`), `src/services/mailAccountRepository.js`, `src/services/mailboxReader.js` (imapflow + mailparser; un cliente por llamada, origen acotado a 24 KB para el extracto y 400 KB para el cuerpo), `src/services/mailboxService.js`, `src/routes/api/briaMail.js`, `src/services/briaMailTools.js`, `src/components/modules/Activity/MailboxConnections.jsx`. Semáforo: luz «Buzones de Bria» (`mailboxes`), que lee el estado que deja el pulso sin entrar al buzón. Política de privacidad 2.13.

## Lo que queda

- Buzones personales por persona (cada quien conectaría el suyo desde Perfil): la base es la misma; falta la pantalla y la regla de que solo su dueño lo lea.
- Hilos que la agencia abrió y llevan un día sin respuesta del cliente: hoy solo se detecta la respuesta que llega, no el silencio.

## Pruebas

`tests/mailImportance.test.js`, `tests/mailboxReader.test.js`, `tests/mailboxService.test.js` (servicio, repositorio con sellado real, ruta, herramientas y hecho del pulso), `tests/serviceHealthMailboxes.test.js`, `tests/mailboxUi.test.js`.
