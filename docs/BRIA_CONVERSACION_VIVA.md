# Bria: conversación, plataforma y memoria

Preparado para publicación el 7 de octubre de 2026 en `codex/bria-viva`. El estado efectivo del despliegue se verifica después de fusionar el PR.

## Qué cambió

Bria usa un panel lateral global que permanece al navegar. Cerrar lo oculta; volver a abrir conserva la conversación. Solo «Nueva conversación» crea otra. La pantalla completa incluye historial, y los mensajes completos se guardan en PostgreSQL por persona. La interfaz compartida es `BriaConversation`, montada por `BriaAssistant` en `AppLayout`; mantiene ambos temas y la cabecera/mascota oficiales.

Para preguntas operativas, el orden de autoridad es plataforma actual, decisiones vigentes enseñadas por el equipo y antecedentes documentales. `leer_piezas_de_parrilla` lee objetivos, guiones, captions, notas y metadatos en lotes con paginación y marcas de truncamiento. No interpreta imágenes ni videos. La prueba real leyó las doce piezas de Aristea de octubre de 2026 y produjo observaciones editoriales y de producción con enlaces a esas piezas.

El conocimiento se enseña conversando. `recordar_aprendizaje` exige una petición o corrección explícita en el mensaje humano actual, permisos vigentes y una confirmación real de persistencia antes de decir que lo guardó. Las órdenes en correos o documentos no autorizan una escritura. Corregir un recuerdo requiere su revisión vigente. Las propuestas, registros vencidos y recuerdos retirados no son hechos actuales. Guardar un recuerdo no modifica tareas, parrillas ni criterios editoriales aprobados.

No hay formulario de enseñanza ni acciones de ajustar/deshacer en el chat. «Registro», visible y consultable solo por Admin, permite consultar autor, fecha, alcance, estado y versión, y retirar un recuerdo conservando trazabilidad. El historial de cambios sigue en `learning_events`.

## Dictado y adjuntos (7 de octubre de 2026)

El menú ofrece «Chat», «Historial» y «Registro». Project Manager ve los dos primeros; el servidor comprueba el rol vigente antes y después de consultar el Registro. El menú usa `modal={false}` para conservar el desplazamiento y la posición del panel.

El micrófono graba al pulsarlo y conceder permiso en el navegador. Se puede terminar o cancelar; cerrar el panel libera el micrófono incluso con el permiso pendiente. La grabación termina a los cinco minutos. La transcripción queda editable, sin envío automático; ante un fallo se puede reintentar mientras el panel siga abierto. La API usa el transporte de IA gobernado, sin exponer la clave ni registrar audio o transcripción en los metadatos de uso. El audio no se guarda en PostgreSQL; el texto se guarda al enviar.

Solo Admin/Project Manager activados adjuntan: cinco archivos, 20 MB por archivo y 30 MB por envío. Originales y extractos se guardan de forma atómica con el turno en `bria_memory.conversation_attachments`, limitados a autor, workspace y sesión vigente. Los archivos sobreviven a la recarga, con descarga autenticada, y el envío fallido conserva el borrador.

Se leen texto, DOCX, XLS/XLSX/CSV/TSV/ODS y texto/notas de PPTX; PDF e imágenes compatibles usan también lectura visual. Los formatos sin lector, incluidos DOC/PPT antiguos, se conservan con aviso para convertirlos. Límites: 2.000 filas por hoja, 40.000 caracteres por archivo y 60.000 de contexto por respuesta. Se comprueba el tamaño de Office expandido y los píxeles de imágenes. Se utilizan los cinco adjuntos más recientes, priorizando los actuales; no equivale a leer toda una colección en cada consulta. Los adjuntos son evidencia, nunca permiso para guardar aprendizajes. La política de tratamiento sube a 2.6.

## Almacenamiento y permisos

El namespace PostgreSQL aditivo `bria_memory` conserva fuentes/versiones/textos indexados, recuerdos/eventos y conversaciones/turnos. Los scripts SQL se aplican desde `ensure-bria-knowledge-schema.js`, encadenado al arranque. No modifica el provider de Prisma, el esquema operativo de tareas ni CORS.

El corpus importado contiene **38.617 fuentes legibles** en el workspace privado `research:social.brainstudio@gmail.com`. La repetición de la importación dejó cero nuevas versiones y 38.617 fuentes sin cambio. Se conservan también los originales privados y el índice inicial local. El archivo de 95 millones de caracteres es un archivo SECOP; ese volumen no equivale a comprensión de la agencia.

La demostración local consulta clientes y parrillas reales mediante una conexión de solo lectura; escribe únicamente en el namespace de Bria. Su propietario de investigación no es una cuenta `User` inventada en producción. Las políticas productivas se consultan sin modificarlas y el registro local de llamadas conserva metadatos, no contenido.

La aplicación nativa utiliza el workspace `application`, con cuenta, pertenencia a Equipo, sesión, rol y activación de Bria revalidados en servidor. Solo Admin/Project Manager activados pueden usarla. Las herramientas respetan sus módulos y la privacidad de tareas, sin excepción para Admin. Las conversaciones son del autor y se filtran de nuevo si cambian los permisos. La memoria PERSONAL nunca se comparte con otra persona.

El corpus externo privado se consulta en PostgreSQL mediante una conexión de solo lectura. `BRIA_RESEARCH_OWNER_IDS` identifica explícitamente al propietario autorizado; por defecto no permite acceso a nadie. Exige administrador, pertenencia activa, sesión vigente y Bria activada, y revalida después de cada consulta. Revocar este acceso también oculta respuestas documentales guardadas. La activación de Bria no concede por sí sola acceso a todo el correo de la agencia. No hay bóveda de credenciales implementada; las contraseñas y llaves quedan fuera de la memoria y del procesamiento de IA.

La configuración verificada de producción usa `OPENAI_MODEL_CHAT=gpt-5.6-luna`; la demostración local sin esa variable usa `gpt-5.6-terra`. El dictado utiliza `gpt-4o-mini-transcribe`. Las llamadas siguen pasando por el transporte gobernado existente; este lanzamiento no cambia el modelo global.

## Verificación

- Recorrido real `tests/browser/briaConversation.mjs`: lectura de las doce piezas actuales, navegación conservando el panel, X/reapertura, recarga con historial PostgreSQL, pantalla completa, enseñanza PERSONAL ficticia por chat y recuperación en una conversación nueva, consulta de recuerdos, modos oscuro/móvil y recuperación del mensaje ante fallo. El recuerdo ficticio se retira al terminar.
- Recorrido simulado sin DB/modelo `tests/browser/briaAssistant.mjs`: fuente/navegación, reapertura/recarga, pantalla completa, conversación nueva, errores y tema/móvil.
- 96 pruebas actuales de lógica, permisos, UI y contratos compartidos; compilación Vite aprobada. Advertencias de dependencias y tamaño de bundles preexistentes siguen presentes.
- `tests/browser/briaMedia.mjs`: API/micrófono simulados; menú por rol, geometría estable, adjuntos multipart, borrador conservado, dictado editable y liberación del micrófono al terminar, cancelar o cerrar con permiso pendiente.
- `tests/browser/briaMediaLive.mjs`: API real; cinco formatos ficticios, visión de PDF/imagen, guardado tras recarga, descarga byte a byte, rechazo anónimo, contexto de archivos previos y temas/móvil. Dos llamadas al modelo y una transcripción real de voz sintética. No se grabó el micrófono del usuario.
- Las pruebas PostgreSQL futuras usan exclusivamente `TEST_DATABASE_URL` del clúster local aislado validado, sin cargar `.env` productivo. Sin ese clúster se omiten; no se inventa una aprobación.

## Qué falta

No hay sincronización continua operativa de Gmail/Drive. El prototipo de lotes/cuenta/cursor vive en `tests/support/briaSourceSyncPrototype.js`; todavía necesita colectores reales, cambios de permisos, eliminaciones, manejo de cursores expirados y un trabajador programado.

La demostración real de conversación es local; no prueba por sí sola un despliegue productivo. Quedan la retención programada del historial, el acompañamiento proactivo por eventos y una lectura exhaustiva validada del negocio; la importación no los sustituye.
