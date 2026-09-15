# Verificación de despliegues del módulo Reportes

## Alcance de esta versión

La versión esperada es `report-evidence-2026-09-16.1`. Incluye ingesta por
observación, revisión persistente, análisis referenciado, publicación explícita
y PDF generado en servidor. Frontend y backend deben publicarse juntos.

Los datos v2 usan las columnas JSON y los enums existentes de `MetricReport` y
`MetricReportSource`. Este cambio no requiere una migración, `db push` ni nuevas
variables obligatorias. Las credenciales existentes de PostgreSQL, autenticación,
OpenAI y almacenamiento siguen siendo necesarias. `OPENAI_MODEL_REPORT_VISION`
es la única selección de modelo de visión de Reportes. Si falta o está vacía,
se utiliza `gpt-6-astra`; el módulo ya no hereda `OPENAI_MODEL_VISION` ni
`OPENAI_MODEL`. Un cambio de este modelo requiere repetir la evaluación de capturas.

El Dockerfile instala Chromium y `fonts-liberation`, y define
`CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`, la ruta que usa el renderizador.
Un entorno que no construya ese Dockerfile debe disponer de Chromium y configurar
su ruta. Una compilación correcta no sustituye la prueba de descarga del PDF.

## Verificar el commit desplegado

`Deployment successful` confirma el arranque del commit de ese deployment.
Volver a desplegar uno anterior no incorpora automáticamente cambios posteriores.

1. Identifica el SHA completo del commit que contiene el cambio en la rama
   configurada como origen de Railway.
2. Confirma que el deployment activo se construyó desde ese mismo SHA y que el
   frontend corresponde a esa versión.
3. Con una sesión vigente y permiso de Reportes, consulta
   `GET /api/reports/pipeline-status` enviando el encabezado
   `Authorization: Bearer <token de sesión>`. El endpoint está autenticado;
   abrir la URL sin ese encabezado no es una prueba de disponibilidad del módulo.
   No compartas el token ni lo guardes en capturas o registros de verificación.
4. Comprueba la versión del pipeline y compara `commit` con el SHA completo del
   deployment y de Git. Deben coincidir exactamente.

Respuesta esperada:

```json
{
  "pipelineVersion": "report-evidence-2026-09-16.1",
  "commit": "<SHA completo del commit desplegado>"
}
```

`commit` se resuelve en este orden:

1. `REPORT_DEPLOY_COMMIT`, si tiene valor: override explícito del operador.
2. `RAILWAY_GIT_COMMIT_SHA`, metadato del deployment de Railway.
3. `development`, cuando no existe ninguna de las anteriores.

Si `REPORT_DEPLOY_COMMIT` conserva un SHA antiguo, prevalece sobre Railway y
oculta su identificación actual: corrige o retira ese override antes de dar por
verificada la versión. `development` no identifica un despliegue productivo.
La respuesta actual no incluye `legacyFilterGuard`; no uses esa comprobación
histórica. Un error de autenticación o permisos se resuelve con una sesión y un
acceso válidos, sin hacer público el endpoint.

## Comprobar el flujo completo

Usa un cliente de prueba y capturas autorizadas. Registra el SHA, identificador
del informe, versión guardada y resultado de cada paso, sin credenciales ni
imágenes privadas en los registros compartidos.

1. **Ingesta.** Selecciona cliente, período y capturas en Reportes. La respuesta
   de `POST /api/reports/extract-metrics` debe ser `201`, con `schemaVersion: 2`,
   `version: 1` y estado `DRAFT`. Comprueba los nombres de las fuentes, sus
   imágenes autenticadas, las redes por cifra y los fallos de lectura declarados.
2. **Revisión.** Compara los datos con las capturas. Comprueba ceros, valores
   aproximados, signos de variaciones y tablas. Guarda una corrección con motivo,
   vuelve a abrir el informe desde el historial y confirma que persiste. No
   marques como aceptado un conflicto pendiente ni una fuente omitida.
3. **Análisis.** Genera el análisis después de resolver los bloqueos. El resultado
   debe permanecer en `REVIEW`, con `generationMode: EVIDENCE_AI` y
   `narrative.dataVersion === normalizedMetrics.dataVersion`. Un fallo debe
   conservar los datos y permitir reintentar, sin publicar el informe.
4. **Publicación.** Tras revisar el contenido del informe de prueba, usa la acción
   explícita de publicar. Confirma la respuesta exitosa, el estado `PUBLISHED`
   y la nueva versión guardada. El análisis por sí solo no publica.
5. **PDF.** Descarga desde el informe publicado. La respuesta de
   `GET /api/reports/:reportId/pdf?version=<versión vigente>` debe tener
   `Content-Type: application/pdf` y comenzar con `%PDF-`. Abre el archivo y
   coteja portada, cifras por red, tablas, fuentes y paginación con la vista
   previa del mismo informe y versión.
6. **Versión atrasada.** Reabre el informe de prueba, corrige un dato y comprueba
   que requiere un análisis nuevo. Una descarga con la versión anterior debe
   devolver `409`; tampoco debe descargarse el PDF final mientras esté en revisión.
7. **Histórico.** Abre un informe anterior a v2 desde el historial. Debe permanecer
   legible con aviso de reingesta. No se convierte en evidencia validada ni obtiene
   publicación v2 por abrirlo; las rutas antiguas de edición y análisis rechazan
   modificaciones sobre informes v2.

La ingesta espera todas las capturas en una sola solicitud, con concurrencia
limitada; todavía no tiene una cola durable. Comprueba que el lote representativo
termina en el entorno desplegado y que sus límites de solicitud permiten esa
duración. No repitas automáticamente una carga que perdió la respuesta sin
consultar primero el historial para evitar duplicarla.

La identificación del commit, las pruebas locales y el arranque del servicio no
certifican por sí solos la lectura de una captura ni la entrega autenticada del
PDF en producción. Registra por separado la verificación técnica y la aceptación
del contenido por el responsable. Detalle y límites:
[implementación y verificación](REPORTS_IMPLEMENTATION_2026-09-15.md).

