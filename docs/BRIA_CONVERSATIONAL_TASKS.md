# Pendientes desde la conversación con Bria

8 de octubre de 2026. Disponible para Admin y Project Manager con Bria activada y acceso a Gestión.

## Uso

Escribe o dicta: «Necesito crear un pendiente para [persona], para mañana, para [cliente]: [trabajo y resultado esperado]». Si ya indicaste prioridad, referencias o ausencia de insumos, no se vuelven a pedir. Bria sintetiza un título y un comentario inicial; valida los nombres contra clientes no archivados y personas activas. Ante ambigüedad pregunta cuál.

Sin material pregunta si añadirás referencias o insumos, con una advertencia de la dificultad para empezar. «Continuar sin insumos» permite seguir. La prioridad se elige entre Normal, Alta y Urgente. Cada botón envía su texto como un mensaje, igual que las sugerencias de inicio.

Antes de guardar aparece el resumen completo. Puedes corregirlo conversando. «Crear pendiente» confirma el último borrador guardado; «Cancelar pendiente» lo descarta. Una petición inicial, una instrucción en un documento o un borrador incompleto no crean tareas. La respuesta de éxito y el enlace a Gestión proceden del servidor después de guardar.

## Integración y conservación

La herramienta del modelo `preparar_pendiente` solo prepara datos; el modelo no tiene una herramienta de escritura. La confirmación reutiliza `nativeTaskService.createTask`, los estados, comentarios, referencias, insumos, reconocimiento y trazabilidad de Gestión. No hay un segundo formulario de tareas. «Mañana» se calcula con el día de Bogotá; la fecha viaja a Gestión al mediodía UTC, como su panel.

El borrador y las opciones se guardan en los metadatos privados del historial. La confirmación corre después de bloquear la conversación y comprobar propiedad y revisión; sesiones y permisos se revalidan, igual que la vigencia de cliente y responsable. Un identificador generado por el servidor se entrega por un segundo argumento de confianza al servicio nativo. Reintentar una confirmación recupera esa misma tarea, incluso si se perdió la respuesta posterior a su guardado.

Los archivos elegidos durante la preparación se copian desde adjuntos propios al almacenamiento de tareas al confirmar (máximo cinco de 20 MB). Los enlaces deben haber sido proporcionados por la persona en el chat. Borrar la conversación elimina sus adjuntos privados, pero conserva la tarea y sus copias, con los permisos y retención de Gestión. La política de privacidad 2.8 describe este uso.

La vista local de investigación solo prepara borradores: no es una sesión operativa y no puede crear tareas de producción. La creación está disponible desde la plataforma autenticada.

## Verificación

Reglas y orquestación: `briaTaskDraft.test.js`, `briaTaskCreation.test.js`, `briaTaskConversation.test.js`. Persistencia real y creación nativa: `briaTaskPostgres.test.js`, únicamente con el PostgreSQL aislado validado por `briaTestDatabaseUrl`. Recorrido del componente real: `tests/browser/briaTasks.mjs`, con modelo y datos ficticios, incluye ajustes, confirmación repetida y capturas claro/oscuro/móvil. `briaChoices.mjs` comprueba el envío inmediato de sugerencias y opciones.

No se modifican tareas existentes, publicaciones, pagos ni reglas editoriales mediante este flujo. Son ampliaciones separadas que requieren su propia verificación y acción explícita.
