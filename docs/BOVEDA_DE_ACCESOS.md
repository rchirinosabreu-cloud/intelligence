# Bóveda de accesos (dentro de Bria)

9 de octubre de 2026. Rodny pidió que Bria «pueda darme contraseñas». Hasta hoy vivían en texto plano en el Drive (el Access Book, la hoja «Formato usuarios y contraseñas» y unos veinte documentos de claves), circulaban por correo y no se cambiaban cuando alguien salía del equipo.

Rodny pidió que **no haya un módulo aparte**: «eso me lo puede dar la misma Bria cuando yo se lo pregunte … si quiero guardar una contraseña se lo digo a Bria». Toda la bóveda se usa conversando con Bria.

## Cómo se usa
- **Pedir una clave:** «dame la contraseña del correo de SunPartners». Bria la busca (`buscar_acceso`) y la plataforma la muestra en una tarjeta bajo su respuesta. Si es una sola y la respuesta es nueva, se muestra de una vez. Se oculta sola al minuto y cada lectura queda registrada.
- **Guardar o cambiar una clave:** «quiero guardar una contraseña» o «guarda la clave del correo de SunPartners». Bria pregunta lo que le falte: cliente, plataforma, nombre y usuario. Luego llama `preparar_acceso`, y bajo su respuesta aparece un **campo protegido** (`BriaAccessCapture`). La clave se escribe ahí y va **directo a la bóveda**: nunca entra al chat, al historial ni al modelo. Al guardar, el chat le avisa a Bria con un mensaje sin la clave, y la conversación sigue.
- **Retirar:** «olvida ese acceso», con pedido explícito. Queda en el historial, no se borra.
- **Compartir y ver quién leyó una clave:** «compártelo con Camila» y «¿quién vio la clave de…?». Solo administradores.

**Lo único que no se puede hacer** es escribir la contraseña en un mensaje normal: iría a OpenAI y quedaría en el historial de la conversación. Bria nunca la pide así. Si alguien la escribe igual, Bria no la repite: le indica usar el campo protegido y le sugiere cambiarla.

## Quién ve qué
Decisión de Rodny: un administrador ve todos los accesos. Un project manager ve los de los clientes donde figura como PM (`Client.projectManagerId`), más los que un administrador le comparta. Los accesos de la propia agencia, sin cliente, son de administración. La regla vive en `src/lib/vaultAccess.js` y se aplica **en la consulta SQL**: un acceso que no te toca nunca sale de la base.

## Seguridad
- **Cifrado.** Usuario, contraseña y notas van con AES-256-GCM (`src/lib/vaultCrypto.js`). Cada valor queda atado a su registro y campo, y la clave se deriva con HKDF de `VAULT_ENCRYPTION_KEY` o de `ENCRYPTION_KEY`. Las tablas del esquema aditivo `vault` nunca guardan un valor en claro.
- **Registro antes de mostrar.** Antes de mostrar un valor, se anota quién lo vio, cuándo y desde dónde (`reveal_events`). Sin registro no hay valor.
- **Límites.** 30 lecturas por persona cada 10 minutos, y respuestas sin caché.
- **El modelo nunca recibe un valor** de la bóveda. Las herramientas le devuelven solo nombre, plataforma y cliente, y `preparar_acceso` no tiene ningún campo para la contraseña.
- **Nada se borra.** Las ediciones dejan evento con los campos que cambiaron, nunca con los valores.
- **Si falta la clave de cifrado,** las herramientas de la bóveda se apagan y Bria sigue respondiendo con todo lo demás.

## La carga desde el Drive
`C:\Proyectos\lectura-del-negocio\herramientas\importar-boveda.mjs` queda fuera del repositorio, porque lee los textos confidenciales.

- **Access Book** (25 de septiembre de 2026): una sección por cliente, ligada a su ficha cuando el nombre coincide con seguridad.
- **Documentos sueltos:** uno por documento.
- **Solo para administradores:** la hoja «Formato», porque mezcla clientes, y las cuentas de la agencia.
- **Sin cortes:** los bloques largos se parten, nunca se cortan.
- **Idempotente**, nunca imprime un valor, y simula salvo con `--confirmar IMPORTAR`.
- **Una cuenta por fila** (9 de octubre de 2026, Rodny: «solo hay un CapCut … se ve terrible la forma en que lo muestra»): `scripts/lib/vaultImportParser.js` (junto a los scripts de operación, porque solo lo usa el importador) parte cada documento en cuentas sueltas (plataforma, usuario, contraseña, enlace, notas). Entiende la tabla aplanada del Access Book (« | valor», también con «Aplicación» como primera columna), las hojas exportadas y las notas libres («Clave: …»). Lo que no reconoce como cuenta con seguridad no se pierde: queda en un bloque «Notas sin ordenar», sin índice de plataformas. Una contraseña de menos de cuatro caracteres va a notas. Duplicados: la misma cuenta del mismo dueño se guarda una vez, y la misma plataforma con la misma contraseña y otro usuario también (queda una, con el otro usuario anotado). La hoja «Formato» es la copia anterior del Access Book: no se parte en cuentas, sus bloques quedan solo para administración y fuera del índice. Los bloques de texto de la primera carga se **retiran** (no se borran) solo cuando todo lo suyo quedó guardado. Comando: `--ordenar ORDENAR` (simula sin la palabra; `--detalle` muestra la forma de cada cuenta, nunca un valor).
- **El correo partido** (10 de octubre de 2026, Rodny: «no entiendo esa nota que aparece allí»): en el Drive una celda estrecha cortaba el correo («…@gmail.co» en una línea y «m» en la siguiente); el lector tomaba la primera línea como usuario y la «m» como nota, y al encontrar el correo entero con la misma clave lo anotaba como «otro usuario». Trece accesos quedaron así. Regla en `scripts/lib/vaultWrappedUsername.js`: una cola corta que completa una terminación conocida se pega al correo (también en tres líneas), y dos usuarios donde uno es el otro cortado son la misma cuenta. El lector la aplica al importar; `scripts/repair-vault-wrapped-usernames.js` revisó lo guardado (solo lee; `--confirmar CORREGIR` escribe por el repositorio, con evento, sin mostrar valores) y los trece se corrigieron ese día.
- **Bria elige** (mismo día: «que haya un razonamiento detrás»): con una sola coincidencia la tarjeta se muestra de una vez; con varias, `buscar_acceso` no pinta ninguna y Bria razona cuál pidió la persona y la muestra con `mostrar_acceso` (hasta tres), o pregunta cuál si de verdad no se puede saber.
- **Índice de plataformas** (9 de octubre de 2026): cada bloque va cifrado entero, así que «me recuerdas la clave de CapCut» no encontraba nada aunque CapCut estuviera dentro. La columna `platforms` guarda en claro **solo los nombres** de las plataformas de un bloque, sacados de un diccionario cerrado (`--indexar INDEXAR`, simula sin la palabra). Se probó tomar la primera celda de cada tabla y se descartó: algunos usuarios se colaban como plataforma. La búsqueda mira plataforma, nombre, `platforms` y cliente; ignora las palabras de la petición («clave», «de») y los espacios, y un acceso sin cliente responde a «agencia» o «Brain Studio».
- **Clave de cifrado:** se comprobó por huella, sin mostrarla, que la `ENCRYPTION_KEY` local es la misma de Railway.

**Lo que queda en manos del equipo:**
- **Borrar del Drive** los documentos con claves en texto plano, una vez revisados con Bria.
- **Cambiar las claves más sensibles.**
- **Activar la verificación en dos pasos** para administradores y PM.

## Verificación
- `tests/vaultCore.test.js`: cifrado, alteración detectada y permisos.
- `tests/vaultRoutes.test.js`: rutas sin caché, identidad de la sesión, límite de lecturas, y que no exista página aparte.
- `tests/vaultBriaTools.test.js`:
  - preparar un guardado sin contraseña en el modelo;
  - cambiar con su versión;
  - retirar solo con pedido;
  - «quién la vio» y compartir solo para administradores, y solo con administradores o PM;
  - el historial guarda tarjetas y campo;
  - la instrucción prohíbe pedir la clave en el chat.
- `tests/vaultPostgres.test.js`, contra PostgreSQL real aislado: nada en claro, cada quien ve lo suyo, lecturas registradas, carga idempotente, retirar sin borrar.
- Muestra local `tests/fixtures/vault-preview.html` (`?guardar`, `&dark`): guardar con el campo protegido y entregar una clave.
- Carga de prueba en la base aislada: 101 bloques; la segunda vez, 0; los 101 se descifran.
