# Plan de reconstrucción del módulo Reportes

## Decisión ejecutiva

El módulo no debe pedirle a una IA que «dibuje HTML» ni conservar la captura como
pieza principal del informe. La captura debe convertirse en **datos canónicos
validados** y la aplicación debe reconstruir esos datos con componentes propios
(tarjetas, tablas y gráficos). La IA interpreta; React/HTML representa.

Esta separación produce informes visualmente consistentes, editables, comparables
y exportables, aunque cambie el proveedor de IA o el formato de una captura.

## Diagnóstico del estado actual

### Flujo existente

1. El frontend separa manualmente capturas orgánicas y de pauta y las envía por
   `multipart/form-data`.
2. `POST /api/reports/generate` guarda cada archivo en GCS.
3. Todas las imágenes se mandan en una sola solicitud multimodal a Gemini.
4. El prompt solo solicita una clasificación y un comentario corto por imagen.
5. El backend vuelve a unir comentario y captura por su posición en el array.
6. El frontend muestra la captura original, un `textarea` con el comentario y una
   hoja de ruta; después rasteriza todo el DOM con `html2canvas` para crear el PDF.

### Por qué el resultado no puede cumplir el objetivo

- **No se extraen métricas.** El contrato actual no contiene nombre, valor,
  unidad, periodo, comparación, desglose ni serie temporal. Por tanto, el frontend
  no tiene datos con los cuales reconstruir tarjetas o gráficos.
- **La imagen sigue siendo la visualización.** El informe embebe el pantallazo; no
  existe una capa de componentes de métricas.
- **La clasificación depende del usuario.** La separación orgánico/ADS ocurre
  antes del análisis y no hay una clasificación robusta por plataforma, pantalla
  o granularidad.
- **La unión por índice es frágil.** Si el modelo omite o reordena un objeto, el
  comentario puede quedar asociado con otra captura.
- **Un único prompt mezcla cuatro trabajos:** OCR, normalización, cálculo e
  interpretación editorial. Un fallo parcial invalida toda la respuesta.
- **El “optimismo radical” puede esconder resultados reales.** Un reporte que
  evita palabras negativas pierde credibilidad. Conviene usar optimismo honesto:
  celebrar avances, explicar retrocesos sin dramatismo y proponer una acción.
- **No existe persistencia del reporte.** El resultado vive en estado React; no
  tiene borrador, versión, periodo, estado de revisión ni publicación reproducible.
- **No existe una comparación canónica.** Sin métricas normalizadas no se puede
  calcular la evolución mensual/trimestral ni validar que la narrativa coincida
  con los números.
- **La exportación es una imagen gigante dentro de un PDF.** Esto perjudica
  paginación, selección de texto, accesibilidad y consistencia entre tamaños.

## Arquitectura objetivo

```text
Capturas
  -> ingesta segura + identificador estable por fuente
  -> extracción visual estructurada (IA con visión)
  -> validación de esquema y controles matemáticos
  -> normalización de métricas
  -> agregación/comparación determinista
  -> interpretación narrativa con IA
  -> borrador persistido y editable
  -> renderer único React/HTML
  -> vista web, impresión/PDF y enlace compartido
```

### Responsabilidades

| Capa | Responsabilidad | No debe hacer |
| --- | --- | --- |
| Visión/OCR | Leer literalmente cifras, etiquetas, fechas y dimensiones | Inventar comparaciones o diseñar HTML |
| Normalizador | Mapear etiquetas a claves canónicas y unidades | Cambiar cifras para mejorar el relato |
| Motor de métricas | Calcular variaciones, ratios, totales y calidad | Redactar conclusiones subjetivas |
| IA editorial | Explicar hallazgos validados y proponer acciones | Volver a calcular cifras o emitir HTML libre |
| Renderer | Convertir el contrato en tarjetas/gráficos/tablas | Interpretar capturas |
| Exportador | Imprimir exactamente el mismo renderer | Mantener una segunda plantilla divergente |

## Contrato canónico propuesto

El modelo debe devolver JSON sujeto a un esquema estricto. Cada fuente conserva un
`sourceId` creado por el servidor; nunca se relacionan resultados por índice.

```json
{
  "schemaVersion": 1,
  "reportPeriod": {
    "kind": "MONTHLY",
    "start": "2026-06-01",
    "end": "2026-06-30",
    "comparisonStart": "2026-05-01",
    "comparisonEnd": "2026-05-31"
  },
  "sources": [
    {
      "sourceId": "src_uuid",
      "platform": "META_ADS",
      "screenType": "ACCOUNT_OVERVIEW",
      "confidence": 0.97,
      "warnings": [],
      "metrics": [
        {
          "key": "spend",
          "label": "Inversión",
          "value": 1250.5,
          "unit": "USD",
          "previousValue": 1100,
          "changePct": 13.68,
          "confidence": 0.99,
          "evidence": "Fila Total, columna Importe gastado"
        }
      ],
      "series": [],
      "breakdowns": []
    }
  ]
}
```

Las claves iniciales deberían cubrir, como mínimo:

- Orgánico: `reach`, `impressions`, `followers`, `follower_growth`,
  `engagements`, `engagement_rate`, `profile_visits`, `link_clicks`,
  `video_views` y mejores contenidos.
- Pauta: `spend`, `impressions`, `reach`, `frequency`, `clicks`, `ctr`,
  `cpc`, `cpm`, `results`, `cost_per_result`, `conversions`, `revenue` y
  `roas`.

Todo valor debe conservar unidad, moneda, periodo, procedencia y confianza. Un
valor ilegible se representa como `null` más una advertencia; jamás como cero.

## Uso recomendado de `OPENAI_API_KEY`

Sí es apropiado usar la variable en el **backend** como proveedor de visión y de
narrativa. No debe exponerse a Vite ni al navegador, y tampoco debe usarse para
generar directamente el HTML final.

La integración debe encapsularse detrás de un adaptador (`reportVisionProvider`)
para poder elegir OpenAI o Gemini por configuración sin cambiar rutas ni UI. La
solicitud de visión recibe una imagen por fuente, su `sourceId` y el esquema de
extracción. Una segunda solicitud recibe únicamente datos ya validados para crear:

- resumen ejecutivo de 3 a 5 puntos;
- logros respaldados por métricas concretas;
- explicación clara de cada variación relevante;
- oportunidades priorizadas;
- tres acciones con objetivo, responsable sugerido y métrica de éxito;
- una nota de metodología y advertencias de calidad.

El tono recomendado es **positivo, consultivo y verificable**, no optimista a
cualquier costo. Cada afirmación cuantitativa debe señalar las claves de métricas
que la sustentan. Si falta comparación, debe decir «sin periodo comparable».

## Sistema visual uniforme

Se debe reutilizar la identidad que ya emplean las exportaciones de Minutas
(Plus Jakarta Sans, violeta corporativo, fondos suaves, tarjetas neutras), pero
implementarla como componentes React reutilizables:

- `ReportCover`: cliente, periodo, tipo y estado del informe.
- `ExecutiveSummary`: titular y principales logros.
- `MetricCard`: valor, unidad, delta y explicación accesible.
- `MetricGrid`: composición estable de 2/3/4 columnas.
- `TrendChart`: serie temporal con Recharts y tabla alternativa.
- `BreakdownChart`: barras para campañas, audiencia o contenidos.
- `InsightCard`: hallazgo, evidencia y significado para negocio.
- `ActionPlan`: acción, prioridad, impacto, esfuerzo y KPI de éxito.
- `SourceAppendix`: miniatura opcional, confianza y advertencias; las capturas
  quedan como evidencia al final, no como protagonista.

Debe existir un solo árbol de componentes para vista previa y exportación. El CSS
de impresión (`@page`, saltos y `break-inside`) debe producir un PDF paginado con
texto real. Si se requiere fidelidad idéntica en producción, el backend puede
imprimir la ruta con Chromium/Playwright; `html2canvas` queda como transición, no
como arquitectura final.

## Persistencia sugerida

Antes de aplicar cambios a Prisma se debe revisar la información existente y usar
la política del proyecto (`prisma db push`, sin crear migraciones locales). El
diseño mínimo es:

- `MetricReport`: cliente, periodo, tipo, estado (`DRAFT`, `REVIEW`, `PUBLISHED`),
  versión de esquema, título, JSON normalizado, JSON narrativo y timestamps.
- `MetricReportSource`: reporte, `sourceId`, ruta GCS, plataforma, tipo de pantalla,
  extracción JSON, confianza, advertencias y hash del archivo.
- Opcional `MetricReportVersion`: snapshot inmutable al publicar.

Los números extraídos deben separarse del texto editable. Así, un editor puede
cambiar el relato sin alterar evidencia o cálculos.

## Experiencia propuesta

1. **Crear informe:** elegir cliente, mensual/trimestral y fechas reales (eliminar
   el año fijo del título).
2. **Subir fuentes:** una sola zona de carga; la IA propone plataforma y tipo. El
   usuario solo corrige una clasificación si es necesario.
3. **Revisar extracción:** pantalla de control con miniatura, métricas leídas,
   confianza y campos dudosos resaltados. No se genera narrativa hasta aprobar.
4. **Construir informe:** el servidor calcula y la IA redacta después de responder
   satisfactoriamente; entonces se muestra la notificación de éxito.
5. **Editar:** permitir editar títulos y narrativa, no números sin una acción de
   corrección explícita y auditable.
6. **Previsualizar/publicar:** vista web responsiva, PDF y enlace opcional.

## Ruta de implementación con TDD

### Fase 0 — definición y ejemplos (1–2 días)

- Reunir 3–5 capturas reales por pantalla soportada, anonimizadas.
- Definir diccionario de métricas, monedas, periodos y reglas de redondeo.
- Aprobar un wireframe basado en Minutas y criterios de aceptación.

**Salida:** fixtures y contrato JSON v1; todavía no se cambia la UI productiva.

### Fase 1 — extracción confiable (3–5 días)

- Escribir primero pruebas para validación, bloques markdown alrededor del JSON,
  valores ilegibles, porcentajes, monedas y desorden de resultados.
- Implementar proveedor OpenAI y mantener Gemini como alternativa temporal.
- Procesar cada imagen con `sourceId`, validar MIME/tamaño y limitar concurrencia.
- Añadir controles: `CTR ≈ clicks / impressions`, `CPC ≈ spend / clicks` y alertas
  cuando el dato no cuadre (sin reemplazar el dato original silenciosamente).

**Criterio:** al menos 95 % de cifras exactas en el conjunto de evaluación y 100 %
de respuestas conformes al esquema o rechazadas de forma explícita.

### Fase 2 — renderer uniforme (4–6 días)

- Escribir pruebas de componentes antes de implementar tarjetas y gráficos.
- Construir el renderer desde fixtures, independiente del proveedor de IA.
- Implementar light/dark para el editor y una hoja clara controlada para imprimir.
- Añadir pruebas de accesibilidad, responsividad y snapshots visuales.

**Criterio:** dos entradas equivalentes producen la misma jerarquía y layout, sin
capturas en el cuerpo principal.

### Fase 3 — narrativa útil (2–4 días)

- Probar que una afirmación solo referencia métricas existentes.
- Generar resumen, logros, explicación, oportunidades y plan de acción.
- Detectar contradicciones simples entre narrativa y signo de la variación.
- Permitir regenerar únicamente una sección sin volver a leer imágenes.

**Criterio:** ningún número nuevo aparece en la narrativa y toda recomendación
incluye evidencia y KPI de seguimiento.

### Fase 4 — borradores, publicación y PDF (3–5 días)

- Persistir borradores/versiones con estrategia segura de datos.
- Añadir estados de revisión y publicación.
- Sustituir la captura larga del DOM por impresión HTML paginada.
- Probar reintentos, errores del proveedor, autorización y publicación idempotente.

### Fase 5 — comparación histórica (posterior)

- Comparar informes anteriores por clave, unidad y periodo.
- Añadir tendencias trimestrales y memoria de recomendaciones.
- Priorizar conectores oficiales de Meta cuando estén disponibles; las capturas
  quedan como fallback, porque una API entrega datos más fiables que OCR.

## Pruebas imprescindibles

- Unitarias: esquema, normalización, fórmulas, redondeo y narrativa referencial.
- Contrato: respuestas válidas, JSON dentro de un bloque de código Markdown,
  rechazo de texto libre y
  recuperación parcial por fuente.
- API: autenticación, tipo/tamaño de archivo, límite de fuentes, timeout, reintento,
  error detallado y ausencia de éxito falso.
- UI: carga, revisión, corrección, estados vacíos/error, edición y publicación.
- Visuales: 1280×720, 1440×900, móvil y páginas A4; tema claro/oscuro en el editor.
- Evaluación de visión: exactitud por celda y por captura sobre fixtures reales.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| La IA confunde una cifra | confianza, evidencia, revisión humana y reglas matemáticas |
| Cambia la interfaz de Meta | clasificador por pantalla versionado y fallback `UNKNOWN` |
| Coste/latencia por muchas imágenes | una solicitud por fuente, compresión, hash/caché y cola limitada |
| Narrativa exagerada | referencias a métricas, detector de contradicciones y aprobación humana |
| Inyección contenida en una captura | tratar texto de imagen como datos no confiables; instrucciones solo del servidor |
| HTML inseguro | renderer controlado y escape de texto; nunca renderizar HTML devuelto por la IA |
| PDF distinto a la vista | un único renderer y pruebas visuales de impresión |

## Primer incremento recomendado

Construir un vertical slice para **Meta Ads / resumen de cuenta mensual** con seis
métricas (`spend`, `impressions`, `reach`, `clicks`, `ctr`, `results`): fixture,
extracción estructurada, pantalla de revisión, seis tarjetas, un gráfico, dos
insights y tres acciones. Validarlo con cinco capturas reales antes de incorporar
Instagram orgánico, audiencias y desgloses por campaña.

Este alcance pequeño demuestra lo esencial —que la captura se transforma en un
informe reconstruido y consistente— sin reescribir de una vez todo el módulo.

## Qué hacer después de aprobar este plan

### No desplegar esperando un cambio en Reportes

Este documento no modifica el comportamiento de producción. Desplegar este commit
solo publicaría documentación dentro del repositorio: el módulo seguiría usando el
flujo actual con Gemini, capturas originales y comentarios. La implementación debe
realizarse y validarse en una rama o entorno de staging antes de desplegarse.

### Material que debe aportar Brain Studio

Antes de iniciar el código se necesita un paquete pequeño de referencia:

1. Cinco capturas reales y anonimizadas de **Meta Ads / resumen de cuenta**.
2. Para cada captura, el periodo que representa y, si aplica, el periodo anterior.
3. La moneda esperada (`USD`, `COP`, etc.) y las reglas de redondeo deseadas.
4. Un PDF o captura de una Minuta cuyo estilo deba tomarse como referencia.
5. Confirmación de las seis métricas del MVP: inversión, impresiones, alcance,
   clics, CTR y resultados.

Las capturas no deben añadirse al repositorio si contienen nombres de clientes,
IDs de cuenta u otra información sensible. Deben anonimizarse o entregarse por un
canal privado y convertirse en fixtures sin datos personales.

### Orden operativo recomendado

1. **No desplegar este plan como si fuera la solución.** Se puede fusionar como
   referencia técnica, pero no cambia la experiencia del usuario.
2. **Crear una rama de implementación** para el vertical slice de Meta Ads.
3. **Escribir primero los tests y fixtures** del contrato de extracción.
4. **Implementar OpenAI en backend**, leyendo `OPENAI_API_KEY` únicamente desde el
   servidor y manteniendo el módulo actual disponible como fallback.
5. **Construir una pantalla de revisión**, donde una persona confirme las cifras
   antes de generar el relato.
6. **Construir el renderer HTML/React** con las seis tarjetas, un gráfico, insights
   y acciones; todavía sin reemplazar la ruta productiva.
7. **Comparar cinco resultados** contra las capturas y registrar cifra esperada,
   cifra extraída, confianza y error.
8. **Hacer revisión visual en staging** en desktop, móvil, light/dark y PDF.
9. **Activar con una bandera de funcionalidad** solo para usuarios internos.
10. **Publicar gradualmente** después de aprobar exactitud y diseño; conservar el
    flujo anterior durante el periodo inicial de observación.

### Puertas de salida antes de producción

El nuevo flujo puede desplegarse a producción cuando se cumplan todas:

- 100 % de las respuestas cumplen el contrato o muestran un error recuperable.
- Al menos 95 % de exactitud de cifras en el conjunto acordado.
- Ninguna narrativa contiene números que no existan en los datos validados.
- Una fuente dudosa obliga a revisión humana y no publica silenciosamente.
- La vista y el PDF fueron aprobados visualmente en resoluciones estándar.
- Los errores del proveedor muestran un mensaje útil y conservan el borrador.
- La bandera permite volver al flujo anterior sin pérdida de datos.

### Qué ocurrirá en el primer despliegue funcional

El primer despliegue no debe sustituir todo Reportes. Debe añadir una opción
interna como **«Nuevo reporte reconstruido (beta)»**. El equipo seleccionará un
cliente y periodo, subirá capturas, revisará las seis cifras detectadas y recién
entonces generará el informe. Después de comparar varios informes beta con el flujo
actual, la nueva experiencia podrá convertirse en la predeterminada.
