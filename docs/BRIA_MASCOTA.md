# Bria Chispa

Integración visual del 10 de octubre de 2026, corregida según la referencia «4 · Bria Chispa» facilitada por Rodny: Bria tiene un cuerpo turquesa/cian/verde con volumen suave, pliegues de cerebro redondeados, ojos directamente en el rostro y una chispa amarilla de cuatro puntas flotando sobre la cabeza. No lleva visor ni punta de llama. Sustituye el diseño pixelado. Ocupa la esquina inferior derecha donde antes estaba el chat del equipo. El chat se abre desde la cabecera, inmediatamente a la izquierda de la campana, y conserva sus avisos de mensajes sin leer. El lienzo mide 96 × 96 px en escritorio y 80 × 80 px en móvil; el personaje visible ocupa aproximadamente 60 y 50 px. Las poses comparten un encuadre fijo y transparente y se pintan con interpolación suave de alta calidad, sin escalones de pixel art. Se conservan los permisos de acceso de Bria y las conversaciones, borradores y modos del chat del equipo.

El acceso se pinta en un portal del body para que el filtro de la cabecera no altere su posición fija. **Al abrir el chat de Bria, la mascota se oculta; al cerrarlo, vuelve a aparecer en la misma esquina y recupera el foco.** Se aplica en escritorio, móvil y pantalla completa. La base contempla el área segura del dispositivo. El chat del equipo usa un portal para su botón en la cabecera y otro para el panel, conservando una sola instancia de su estado y suscripción.

El botón de cambio de tema está junto al nombre de Brainstudio en la barra lateral; se oculta cuando la barra está recogida en escritorio. También está disponible dentro del menú móvil y conserva la preferencia existente de `ThemeContext`.

La cabecera del chat muestra únicamente sus controles: menú, nueva conversación, pantalla completa y cierre. Por decisión de Rodny del 10 de octubre de 2026, no muestra el nombre ni la imagen de Bria; la bienvenida conserva Bria Chispa.

El punto independiente de comprobación se retiró de la cabecera. El propio icono de Salud Operativa del menú lateral muestra el resumen real de servicios con los tokens verde, amarillo y destructivo; la ausencia de comprobaciones sigue siendo neutra y un error al actualizar se indica en amarillo. Conserva la consulta cada minuto con la pestaña visible y el acceso exclusivo de administradores. El tablero mantiene el detalle y la comprobación manual.

## Estados

- Reposo: expresión seria y respiración discreta.
- Trabajo: sentada con portátil mientras el chat está ocupado o procesando dictado.
- Final: una celebración de 930 ms por respuesta nueva y completa, seguida de reposo. Las respuestas parciales, errores, historial, navegación y recargas no provocan celebraciones.

La mascota pausa el movimiento si la pestaña está oculta, el botón está fuera del viewport o la persona prefiere movimiento reducido. En ese último caso conserva las poses estáticas. No añade solicitudes ni trabajo al servidor.

## Conexión con las funcionalidades de Bria

`BriaConversation` añade el prop opcional `onActivityChange({ working, completionId })`. Observa el estado existente y la respuesta recién guardada; no modifica envío, streaming, herramientas, adjuntos, permisos ni persistencia. `BriaAssistant` pasa esos valores a `BriaMascot` y conserva la apertura, foco y sesión del panel.

El alcance actual es la actividad del chat. Los análisis automáticos del servidor no se deducen de refetches o de llamadas genéricas. Una futura conexión a esos trabajos debe emitir su estado real y una identidad de finalización confirmada, evitando celebrar lecturas de resultados históricos.

La mascota vive en `src/components/bria`, sus reglas en `src/lib/briaMascot*` y su arte transparente en `src/assets/bria-chispa`. El atlas tiene las tres poses completas, que conservan el volumen del personaje; la animación aporta respiración y un salto corto de celebración. **Bria Chispa es la única representación de Bria en toda la plataforma.** Las imágenes estáticas de chat, bienvenida, guías, parrillas, Gestión, lectura semanal, reconocimientos y avisos pasan por `BriaPortrait`, que importa un único `idle.png`. El fallback animado usa el mismo componente. Ya no se consume la URL pública heredada: reutilizarla permitía que un navegador siguiera mostrando el diseño anterior en caché. La compilación publica el recurso con una huella de su contenido. `tests/briaIdentity.test.js` impide volver a usar la ruta antigua o el diseño pixelado en cualquier módulo. Arte, prompts y modo de generación: `src/assets/bria-chispa/DESIGN.md`. La redistribución de los accesos toca `AppLayout`, `Sidebar` y el botón de `TeamChat`; `ServiceHealthIcon` sustituye al antiguo `ServiceHealthDot`. El estudio de caminar no se incluye.

## Revisión local

Ejecutar `node scripts/preview-bria-mascot.js` y abrir `http://127.0.0.1:3730/clientes`. Usa el AppLayout real y datos de muestra de Clientes. Preguntar «¿Qué tengo pendiente hoy?» permite ver trabajo y celebración; «esto da error» permite comprobar el retorno a reposo sin celebración. Las respuestas y los datos son simulados, sin base de datos ni llamadas de IA. No carga `.env` ni ejecuta cambios de esquema.

Pruebas: `node --test tests/briaMascot.test.js`; recorrido real del acceso flotante, separación del chat, móvil, retorno de foco, oscuro y movimiento reducido: `node tests/browser/briaMascot.mjs`. Capturas en `output/bria-integrada`, incluida `bria-abajo-derecha.png`.
