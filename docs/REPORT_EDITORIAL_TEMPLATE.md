# Reportes: estructura editorial y selección de modelos

## Implementación preparada el 15 de septiembre de 2026

La ingesta y la narrativa son operaciones separadas. El generador anterior elegía hasta doce hechos y exigía que cada interpretación empezara como recomendación. Esto conservaba las referencias, pero impedía construir el balance y la lectura estratégica solicitados.

`reportEditorialService.js` construye el contexto a partir del mismo `buildReportPresentation` que alimenta la vista y el PDF. Cada referencia corresponde a un hecho persistido o a una celda identificada de un panel. No utiliza coincidencias por valor, ni agrega campañas, anuncios, alcance o redes.

### Estructura común

1. Portada, cliente y período.
2. Resumen ejecutivo.
3. Resultados por red: indicadores, formatos y comentario con observación, interpretación y siguiente paso.
4. Pauta: campañas y anuncios por separado, con sus comentarios.
5. Oportunidades y aprendizajes.
6. Recomendaciones con prioridad, justificación y KPI de seguimiento.
7. Plan de acción propuesto y cierre.
8. Firma de BrainStudio con el logo oficial.

Las secciones dependen de la evidencia disponible. No se inventan demografía, publicaciones destacadas, resultados comerciales ni series diarias para completar la plantilla. Los gráficos comparan categorías observadas; el volumen publicado se mantiene separado del rendimiento.

### Integridad y compatibilidad

- Contrato editorial versionado, JSON estructurado y soporte defensivo para bloques Markdown.
- Un comentario por sección; referencias existentes y pertenecientes a esa sección.
- Las cifras del texto usan marcadores como `{{E1.value}}` y `{{E1.change}}`; el servidor inserta el valor y formato guardados. Los nombres observados de anuncios pueden contener números.
- Rechazo de referencias inexistentes, variaciones ausentes, secciones omitidas, texto incompleto y algunas afirmaciones de causalidad o garantía no sustentadas. Estos controles no certifican toda la semántica de un comentario: sigue siendo necesaria la revisión editorial.
- La distribución cruzada explícita permite describir ambas redes; una mención aislada no cambia la plataforma de la cifra.
- Se mantienen los requisitos de revisión, versión de datos, publicación y exportación. Una narrativa obsoleta no se incorpora al PDF vigente.
- Las narrativas históricas siguen legibles. Se obtiene la nueva estructura al generar un análisis nuevo; no se reescriben reportes publicados automáticamente.
- Web y PDF comparten las secciones y el análisis. El PDF utiliza tarjetas, barras por indicador y tablas; la revisión web conserva los controles de fuentes y correcciones.

### Convención de moneda y voz editorial

- COP (pesos colombianos) es la moneda predeterminada de la agencia. El formulario permite indicar USD, EUR o MXN; la API acepta códigos de tres letras. La selección se conserva en `normalizedMetrics.currency` y durante las revisiones.
- La convención se aplica a importes con `$`, moneda ausente o unidad monetaria genérica. No convierte cantidades ni altera unidades de conteo. Una moneda explícita en la captura o corregida por una persona se conserva. `originalUnit` y `currencyProvenance` distinguen la convención del dato leído; las fuentes originales también permanecen disponibles.
- Los importes muestran la moneda resuelta junto a la cifra; los aproximados conservan su aproximación. La procedencia de la moneda permanece en la revisión interna.
- El tono dirigido al cliente es positivo y propositivo: base actual, oportunidades, acciones y seguimiento. Las señales desfavorables orientan las recomendaciones; no se describen como «caída», «retroceso» o «no está funcionando».
- Esta voz no autoriza cambiar cifras, eliminar signos de los indicadores, afirmar crecimiento inexistente ni convertir indicadores totales en orgánicos. El servidor inserta los valores reales y rechaza expresiones negativas frecuentes y atribuciones orgánicas sin referencias del indicador correspondiente. La validación por patrones no sustituye toda la revisión semántica.
- La convención entra en nuevas ingestas y reconstrucciones durante la revisión. Los informes históricos guardados o publicados no se reescriben automáticamente con un despliegue.

## Modelos y costo

| Etapa | Valor predeterminado | Variable específica |
| --- | --- | --- |
| Lectura de capturas | `gpt-5.6-sol` | `OPENAI_MODEL_REPORT_VISION` |
| Análisis editorial | `gpt-5.6-terra` | `OPENAI_MODEL_REPORT_NARRATIVE` |

No heredan el modelo global del asistente. Una variable específica existente prevalece sobre el valor predeterminado; revisar esta configuración al desplegar. Cambiar la plantilla, previsualizar o descargar el PDF no vuelve a ejecutar la ingesta.

La narrativa recibe datos consolidados en una llamada, sin imágenes, historial de correcciones ni extracciones duplicadas. Usa razonamiento bajo y un máximo de 10.000 tokens de salida. Guarda modelo, identificador de respuesta, versión del prompt y consumo devuelto por el proveedor. No hay una segunda llamada narrativa automática por una validación fallida.

### Evaluación local real, no certificación universal

Se compararon ocho capturas autorizadas contra 86 puntos de referencia locales. Los archivos, respuestas y referencias privadas permanecen fuera de Git.

- Sol: ocho respuestas completas. Los 86 valores de referencia coincidieron; hubo quince diferencias de `CONTENT_FORMAT` frente a `FORMAT` y cinco referencias afectadas por una letra ambigua en el nombre truncado de un anuncio. La equivalencia de formato se normaliza de manera general; la letra no se sustituye silenciosamente. Las variaciones de referencia no presentaron diferencias.
- Terra para visión: dos importes mal leídos y errores de contexto/distribución. No se eligió para lectura.
- Terra para análisis: una llamada real sobre 74 hechos revisados, con nueve secciones comentadas, tres oportunidades y tres recomendaciones. El primer validador rechazó una comparación legítima entre contenido nativo y distribución cruzada; se corrigió con una prueba y se reprodujo la misma respuesta localmente, sin otra llamada pagada.
- La prueba editorial utilizó un snapshot previamente revisado. No equivale a una cadena automática sin revisión desde la salida nueva de Sol hasta la publicación.

Consumo de Sol: 37.571 tokens de entrada (25.716 en caché) y 29.789 de salida. Estimación: USD 0,65–0,67, dependiendo del tratamiento de escrituras de caché. La redacción consumió 9.674 de entrada y 2.856 de salida: aproximadamente USD 0,06. Presupuesto observado combinado aproximado: USD 0,71–0,73 para este caso, no una tarifa fija ni una lectura de factura.

Tarifas consultadas: [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra). El costo depende de cantidad/resolución de capturas, longitud de respuesta, caché y reintentos. No extrapolar exactitud o precio a todos los clientes sin ampliar la evaluación.

## Validación y despliegue

Pruebas de contrato editorial, referencias, JSON con Markdown, cero y ausencia, aislamiento entre clientes, distribución cruzada, selección de modelo, versión obsoleta y orden de presentación. Regresión de reportes/PDF, lint y build. PDF de muestra renderizado desde `renderMetricReportPdf`; revisión visual de sus doce páginas y de la interfaz a 1440 px y 390 px, con modo oscuro.

Estos cambios no aplican reparaciones a datos productivos ni publican documentos por sí mismos. La muestra local es un borrador. El despliegue y cualquier actualización de un informe existente deben verificarse como operaciones distintas.

### Nueva prueba con COP y tono propositivo

Se conservaron las 88 observaciones del snapshot de MultiK, comprobando por identidad que valor, texto fuente, variación, indicador, plataforma y distribución permanecieran iguales. Se enviaron los 74 hechos numéricos y las nueve secciones a Terra, sin imágenes ni escrituras en base de datos.

La primera respuesta utilizó «interacción orgánica» para un indicador total en el cierre. Se añadió una regresión y un control general de esa atribución, y se ejecutó una segunda llamada. La versión final (`report-editorial-2026-09-15.3`) pasó la validación y se revisó completa. Las variaciones negativas permanecen visibles en tarjetas y tablas.

Última llamada: 9.935 tokens de entrada, 2.607 de salida y 9.932 tokens de escritura de caché. Estimación según tarifas oficiales: USD 0,056 para esa redacción; las dos llamadas de esta prueba sumaron aproximadamente USD 0,114. No incluye una nueva ingesta, porque se reutilizaron los datos revisados, ni equivale a una factura.

Verificación: 309 pruebas de reportes/PDF y controles compartidos, 308 aprobadas y una omitida; build y lint de archivos modificados aprobados. PDF local de trece páginas inspeccionado visualmente. Selector verificado en escritorio y móvil oscuro, incluida la selección explícita de USD y el inicio en COP.

### Versión de entrega al cliente

El PDF y su previsualización omiten por defecto citas, nombres de capturas, versiones internas y el apéndice de fuentes y metodología. La evidencia permanece en los datos y en el espacio de revisión de la plataforma. `buildMetricReportHtml` permite incluirla explícitamente mediante `includeSources: true` para diagnóstico interno. Los requisitos de validación y publicación se conservan; una previsualización pendiente sigue identificada como borrador.

El cierre incorpora el logo oficial de BrainStudio desde un recurso local del proyecto, sin depender de imágenes externas. El prompt `report-editorial-2026-09-15.4` pide lenguaje cotidiano para clientes sin formación técnica, recomendaciones concretas y referencias de evidencia exclusivamente internas.

La muestra final de MultiK reutiliza la respuesta real anterior y añade una revisión editorial local: no hubo otra llamada pagada ni escrituras en base de datos. Conserva las 88 observaciones, las cifras y las variaciones originales. Se genera una prueba local de entrega de once páginas, sin publicar ni cambiar el estado del informe guardado. La versión del prompt de la respuesta original permanece registrada junto al metadato de revisión.

Verificación de este ajuste: 311 pruebas de reportes/PDF y controles compartidos, 310 aprobadas y una omitida; lint aprobado. Se renderizaron e inspeccionaron las once páginas, incluidas las tablas, el plan de acción y la firma de la agencia.

### Portada editorial y revisión final

La portada destaca título y cliente con tipografía amplia, acento corporativo y metadatos legibles para la agencia y el período. El logo del cliente sigue siendo opcional. «Tus redes, de un vistazo» muestra visualizaciones, interacciones y seguidores del período por separado para Instagram y Facebook, reutilizando las filas existentes del modelo de presentación.

Solo se incluyen indicadores totales de cuenta, numéricos, inequívocos y del mismo período del informe. No se suman cifras ni se sustituyen por desgloses orgánicos, anuncios, distribución cruzada o seguidores acumulados; ante varias filas candidatas se conserva únicamente el detalle del informe. Ceros y aproximaciones mantienen su formato. Los informes sin estos indicadores omiten el bloque sin crear tarjetas vacías. El cambio es general, sin condiciones por nombre de cliente.

También se contiene la tabla del plan de acción en la superficie de desplazamiento de la vista móvil. Verificación: 315 pruebas, 314 aprobadas y una omitida; lint y build aprobados. Comprobación real en Chromium a 1440, 390 y 320 px, en claro y oscuro, y casos de nombre largo con logo; sin desbordamiento horizontal ni solapamiento. La muestra MultiK conserva once páginas y todo el texto aprobado posterior a la portada. PDF completo renderizado e inspeccionado, sin nuevas llamadas a IA ni escrituras productivas.

El ajuste visual final mantiene el nombre del cliente en violeta y permite que continúe junto a «digital»: en la muestra A4 el título completo ocupa dos líneas. Los títulos, tarjetas, tablas, comentarios y gráficos utilizan la paleta aprobada `#1F3C58`, `#4D6E8C`, `#8FA8BF`, `#CEE1F2` y `#A6D4FF`, con fondos aclarados y variantes para oscuro. La impresión restaura siempre la paleta clara. No se fuerza un número fijo de líneas para nombres largos ni pantallas pequeñas.

La regresión de navegador `node tests/browser/report-cover.mjs` usa datos sintéticos, comprueba la posición del nombre junto a la última palabra del título en A4, separación entre palabras, dos líneas, colores y contraste, y ausencia de desbordamiento a 1440, 390 y 320 px. En los elementos de portada medidos, el contraste mínimo fue 5,72:1 en claro y 7,17:1 en oscuro. La suite de reportes conserva 314 pruebas aprobadas y una omitida; se verifica además el PDF completo de once páginas y la conservación del texto aprobado posterior a la portada.
