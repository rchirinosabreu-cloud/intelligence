# Desplegables globales

## Decisión

El estilo es global para los controles existentes y futuros, no exclusivo de Gestión. `Select.jsx` conserva la API `value`, `defaultValue`, `onChange(event)`, opciones y grupos de los formularios. En escritorio usa Radix Select; en dispositivos de entrada táctil sin hover conserva el `<select>` nativo. La anchura de una ventana no identifica un teléfono. La selección múltiple/listas `size > 1` mantiene semántica nativa; no hay casos de esos tipos en el inventario actual.

La lista visible utiliza `brain-popover-surface`, igual que los menús de acciones. Conserva opciones mientras se está eligiendo y revalida la elección contra las opciones vigentes antes de emitir el evento. Las actualizaciones del servidor no remontan el control. La comprobación `required`, FormData y los valores vacíos siguen siendo los del formulario real, sin cambiar destinos de Google, IDs, enums o payloads.

## Inventario migrado

83 selectores nativos en 32 archivos de producto: Gestión; formularios e historial de tareas; Dashboard y anuncios; Actividad/Calendario; clientes y detalle; Equipo y perfil; parrillas y Bria; reportes y fuentes; Financiero, cartera, movimientos y conciliación; cotizaciones, servicios y propuestas; Moodboard; BrainCore; Radar de Mérito y trazabilidad.

El componente de menús aplica la misma superficie a cuenta/notificaciones, Clientes, Parrillas, criterios de Bria y comentarios. Enlaces de tareas y menú Añadir de Moodboard también usan ese componente. Menciones de chat/anuncios, sugerencias de catálogo, emojis y prioridad conservan su interacción especializada con la superficie neutra común. Los acordeones de contenido y datepickers no se convierten en selectores.

`tests/sharedSelectContract.test.js` impide introducir selectores HTML de producto fuera del componente compartido. Las fixtures de pruebas pueden usar controles nativos de laboratorio: no forman parte del producto.

## Verificación y límites

- Prueba de Gestión con su polling real de 30 segundos y opciones que cambian: el desplegable de escritorio sigue abierto, permite elegir y devuelve el foco al cerrar.
- Formularios dentro de diálogos: etiqueta accesible, validación obligatoria, cuenta elegida, opciones deshabilitadas, teclado/typeahead, FormData y restablecimiento.
- Menús de casillas y radio: corregido un `inset` no definido que causaba una excepción al renderizar estas variantes.
- Pruebas móviles con emulación táctil: el elemento sigue siendo un `SELECT`. No equivale a certificar cada versión real de iOS/Android.
- Capturas locales en `output/selects/`; no se escribe en producción al ejecutar estas pruebas.
- Regresión adicional: calendario y logros (36 pruebas de navegador), incluyendo carga tardía de cuentas Google, conexiones revocadas, identidad de reintentos e historial por miembro. La prueba de Finanzas interactúa con listas visibles y comprueba alineación de controles, nunca con las coordenadas del campo nativo oculto.

No se ha atribuido el cierre original del desplegable del navegador a una causa única: no fue reproducido de manera concluyente con el control nativo. Se prueba específicamente la estabilidad del nuevo control frente al refetch y cambios de opciones. No confundir esta evidencia con pruebas de datos o infraestructura productiva.

## Comprobaciones

`node --test tests/sharedSelectContract.test.js tests/browser/selects.mjs`

`npm run lint` y `npm run build`.

Muestra sin datos reales: iniciar `npm run dev:recognitions` (servidor de demostración ya existente); abrir `/gestion` o `/tests/fixtures/selects.html`. No publicar fixtures como evidencia de cambios persistidos.
