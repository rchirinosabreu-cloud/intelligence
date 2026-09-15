# Corrección de la prueba real de Reportes

## Problema observado

Una prueba con ocho capturas generó 129 avisos, repitió cifras exactas y
abreviadas, presentó filas de pauta como decenas de tarjetas y mostró el marcador
interno `$UNKNOWN`. También hubo dos errores de transcripción numérica y
atribuciones incorrectas del alcance de Instagram al contexto combinado.

La evaluación previa no certificaba ese flujo: producción heredaba un modelo
distinto de los modelos evaluados. Los originales y la evidencia privada del caso
se conservan fuera de Git; este documento no publica capturas ni identificadores.

## Comportamiento corregido

- El modelo de visión de Reportes es independiente de la configuración global.
  Usa `OPENAI_MODEL_REPORT_VISION` o `gpt-6-astra`.
- La extracción distingue el tablero principal de excepciones por tarjeta,
  conserva celdas con guiones y costos por resultado, y no interpreta seguidores
  del período como saldo acumulado sin evidencia.
- `resultType` distingue resultados y sus costos, no etiquetas técnicas como
  `SUMMARY` y `METRIC`. La conciliación prefiere la cifra exacta compatible con
  una lectura abreviada y conserva las fuentes de ambas.
- Los contextos de distribución se resuelven mediante relaciones explícitas
  compatibles. Las visualizaciones propias de Facebook, las de Instagram y
  la distribución de contenido de Instagram en Facebook siguen separadas.
- Período heredado, distribución no especificada y moneda no identificada
  se explican una vez. Un símbolo visible se conserva sin atribuirle COP/USD;
  no habilita conversiones ni sumas monetarias ambiguas.
- Las diferencias reales de valor, plataforma, período o comparación siguen
  bloqueando el análisis y la publicación. Reducir avisos no omite conflictos.
- Editor y PDF comparten `buildReportPresentation`: indicadores por red,
  volumen publicado, rendimiento por formato, campañas y una fila por anuncio.
  Fuentes, encabezados sin valor, paneles y correcciones siguen disponibles
  en la revisión detallada. Las celdas conservan identidad de la observación.
- Las correcciones semánticas y numéricas tienen motivo, versión y evidencia
  anterior/posterior. Una reparación de mantenimiento registra su procedencia,
  conserva los originales y no publica un informe por el usuario.

## Verificación y límites

Las pruebas incluyen el caso sintético de ocho fuentes, conciliación negativa
entre redes/cuentas/períodos, duplicación de capturas, tablas mixtas, símbolos
monetarios, edición semántica, versionado y documento compartido.

La reparación del caso real contrasta todas las observaciones con los originales;
los artefactos locales incluyen el plan de cambios, huellas de fuentes y una
comprobación que solo permite los cambios numéricos revisados. No se usan pruebas
ni limpieza contra la base productiva.

Una nueva evaluación real se realiza sobre las mismas ocho imágenes autorizadas,
incluyendo celdas nulas y tipo de resultado. La exactitud numérica no garantiza
que todas las variaciones se lean correctamente: una discrepancia de comparación
entre dos capturas debe seguir produciendo `CHANGE_CONFLICT` y bloquear la salida.
No se promete una ingesta infalible ni se convierte una evaluación parcial en
certificación general.

No hay cambios de esquema, CORS ni permisos. El PDF final mantiene el flujo de
análisis vigente y aprobación; la vista previa se identifica como borrador.
