# Documentos de respaldo de movimientos financieros

Decisión de Rodny, 19 de septiembre de 2026: la contadora puede adjuntar a cada movimiento las facturas o soportes que lo respaldan (PDF, JPG o PNG, hasta 25 MB cada uno). Son **evidencia**: nunca se borran.

## Dónde viven

- Bucket propio en Railway: `financial-evidence` (nombre real `financial-evidence-qf1pfz`). **Nunca** el bucket `chat-evidence`, que guarda adjuntos de tareas y chat y tiene borrado automático de adjuntos de tareas terminadas. El servicio rechaza arrancar contra el mismo bucket que `AWS_S3_BUCKET_NAME`.
- Variables de entorno del servicio Intelligence (no reutilizan las de chat):
  - `FINANCIAL_EVIDENCE_BUCKET_NAME` (obligatoria)
  - `FINANCIAL_EVIDENCE_ACCESS_KEY_ID` (obligatoria)
  - `FINANCIAL_EVIDENCE_SECRET_ACCESS_KEY` (obligatoria)
  - `FINANCIAL_EVIDENCE_ENDPOINT_URL` (opcional; por defecto el endpoint S3 de Railway)
- Sin ellas, la subida y la apertura responden 503 «no configurado»; el resto del módulo sigue funcionando.
- Clave del objeto: `financial-records/<id del movimiento>/<uuid>.<pdf|jpg|png>`. El tipo se detecta por los bytes del archivo, no por el nombre ni por lo que declare el navegador; una extensión falsa o un SVG se rechazan con 415.

## Reglas

- **No existe borrado.** Ni endpoint, ni función en el servicio (`src/services/financialRecordDocumentService.js` no importa `DeleteObjectCommand`), ni cascada en la tabla: un documento sobrevive a su movimiento, incluso si el movimiento se anula.
- Un documento subido por error se **anula** con motivo obligatorio (`voidedAt`, `voidReason`, `voidedById`); el archivo y la fila se conservan y deja de mostrarse como respaldo activo. Anular dos veces es un 409.
- Cada subida y cada anulación generan un `FinancialAuditEvent` (`FinancialRecordDocument`, `CREATE`/`VOID`) con el actor.
- Los archivos se sirven **solo** por la API con permiso de Financiero (`GET /api/financials/records/:id/documents/:documentId/file`, `?download=1` para descargar), con `Content-Type` detectado al subir, `nosniff` y sin caché. Nunca por URL pública del bucket. El frontend los pide con el token y los muestra en el visor compartido de la plataforma (`components/chat/ChatFilePreview.jsx`: imágenes y PDF con pdf.js), nunca en una pestaña nueva; «Descargar» reutiliza la misma copia local. Los nombres con tildes se conservan: el nombre multipart llega en latin1 y se vuelve a decodificar solo cuando forma UTF-8 válido.
- Subir y anular requieren permiso de escritura financiera: `POST /api/financials/records/:id/documents` (multipart, campo `file`, uno por petición) y `POST /api/financials/records/:id/documents/:documentId/void` (`{ reason }`).
- La lista de movimientos incluye `documents` ordenados por fecha de subida; la fila del libro muestra los activos con un clip y el formulario los lista completos, con «Ver», «Descargar» y «Anular».
- En un movimiento nuevo los documentos se eligen antes de guardar y se suben justo después de crearlo; si alguno falla, el formulario se queda abierto sobre el movimiento ya creado, sin duplicarlo.

## Esquema y arranque

`scripts/ensure-financial-documents-schema.js` crea `FinancialRecordDocument` de forma aditiva e idempotente en `npm start`, después de los scripts de categorías y desglose. Modelo espejo en `prisma/schema.prisma`, sin `onDelete: Cascade`.

## Verificación

`tests/financialRecordDocuments.test.js`: detección de tipo por bytes, límites, bucket propio sin borrado, subida con auditoría, anulación con motivo, apertura ligada al movimiento y contratos de arranque, rutas y libro. Muestra local: `tests/fixtures/financial-search.html` → Movimientos → Registrar/Editar movimiento → «Documentos de respaldo»; la muestra simula la API en memoria y no certifica el bucket de producción. La primera subida real debe comprobarse en producción después de configurar las variables.
