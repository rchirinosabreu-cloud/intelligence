# Propuestas a medida · validación local

## Alcance implementado

- Servicios personalizados sin `serviceId`: se guardan en la propuesta, no crean catálogo ni inventan costos/márgenes.
- `descriptionHtml` sanitizado y descripción plana de respaldo. Negrita, cursiva, subrayado, títulos, listas y enlaces HTTP(S); sin imágenes, scripts ni estilos arbitrarios.
- Grupo/desarrollo y duración de ejecución por servicio. Los grupos son complementarios; los escenarios existentes siguen siendo alternativas excluyentes.
- `Quotation.proposal_details` JSON opcional y versionado: presentación, plazo global, etapas, beneficios, exclusiones, referencias y planes de pagos.
- Ejecución por días/semanas/meses independiente de `duration_months` (multiplicador de servicios mensuales). Una implementación de cuatro semanas NO multiplica cuatro veces su precio.
- Cuotas por porcentaje o importe fijo, fecha, hito o días después del inicio. Se calculan sobre el total tras descuentos y con los impuestos configurados. Se reparte en centavos sin crear diferencias de redondeo; se muestra base e impuesto de cada cuota.
- Porcentajes globales aplicables a alternativas; se admiten planes particulares por escenario. Importes fijos globales deben coincidir con cada total, o configurar planes separados. No cambiar moneda con cuotas fijas sin revisarlas.
- Al emitir, validar que cada plan cubra todo el total y tenga plazos completos. Un borrador puede conservar un plan incompleto. No se crean facturas, cuentas por cobrar ni movimientos financieros.
- El plan estructurado sustituye exclusivamente la cláusula genérica conocida del 50%; no reescribe acuerdos personalizados. La persona emisora debe confirmar compatibilidad de condiciones antes de emitir.
- La aceptación de propuestas ampliadas exige la versión que vio el cliente; edición y aceptación verifican `updated_at` en la escritura. Una propuesta aprobada no se edita.
- La web y el PDF conservan los bloques nuevos. Los textos ricos largos continúan entre páginas; los enlaces del PDF son clicables. Se mantiene el diseño anterior para propuestas sin ampliaciones.

## Cómo probar sin producción

Ejecutar `npx vite --config tests/fixtures/quotation-vite.config.mjs` desde la raíz y abrir `http://127.0.0.1:3007/tests/fixtures/quotation-proposal.html`.

La muestra usa el formulario y la vista pública reales. Las respuestas de guardado son dobles de API confinados a la pestaña (`sessionStorage`), con normalización/cálculos compartidos. El PDF sí se genera mediante el servicio real del backend, en un middleware local sin proxy ni base de datos. No prueba persistencia real en PostgreSQL ni concurrencia real entre conexiones.

Guardar borrador actualiza la vista del cliente y «PDF guardado». Restablecer ejemplo borra solo estos datos de muestra. El contenido de SunPartners es ilustrativo y no debe enviarse como oferta. Los links `example.com` son placeholders identificados, no casos de Brainstudio.

## Validación y despliegue

- Rodny aprobó la muestra local y autorizó el push a `main` el 8 de septiembre de 2026.
- Verificados: 82 tests de cotizaciones, build, ESLint y navegador en escritorio/móvil, light/dark. La muestra sigue sin escribir en producción.
- Cinco pruebas de integración adicionales pasaron en PostgreSQL 17.10 local (`127.0.0.1:55447/quotation_proposal_test`): creación/lectura JSONB, edición, null explícito, rechazo sin escritura, conservación de una cotización histórica, bootstrap repetido, aprobación y conflictos con una edición en otra conexión o dos aceptaciones simultáneas. Se usan las tablas y enums generados desde el esquema Prisma actual; no se simula la persistencia. No es una prueba de todos los módulos ni del despliegue productivo.
- `npm start` ejecuta `scripts/ensure-quotation-proposals-schema.js` antes de iniciar el servidor: añade únicamente la columna nullable `"Quotation"."proposal_details" JSONB`, en una transacción y con límites de espera. No elimina, rellena ni reescribe cotizaciones. Si falla o detecta un tipo incompatible, no arranca el backend nuevo.
- No ejecutar `db push --accept-data-loss`. El bootstrap aditivo también es compatible con el backend anterior, por lo que una reversión de código no requiere borrar la columna ni sus datos.
- Railway está configurado para construir el `Dockerfile` desde `main` y este usa `npm start`. La comprobación del despliegue debe confirmar el commit y su estado; un push por sí solo no prueba que producción esté lista. No aplicar cambios pendientes ajenos en Railway.

## Comprobaciones reproducibles

- `node --test --test-isolation=none 'tests/quotation*.test.js'`
- `node tests/browser/quotationProposal.mjs` (Chrome, laboratorio activo).
- `node scripts/render-quotation-proposal-demo.mjs` (PDF de referencia en `output/pdf`).
- ESLint de archivos afectados; `npm run build` (genera cliente, no altera la base).

### Integración PostgreSQL aislada

Usar un servidor temporal limitado a localhost, usuario `quotation_test`, puerto `55447` y base vacía `quotation_proposal_test`. El test rechaza cualquier otro destino y no usa `.env` como alternativa.

1. Generar SQL sin conexión: `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output output/quotation-test-schema.sql`.
2. Definir explícitamente `TEST_DATABASE_URL=postgresql://quotation_test@127.0.0.1:55447/quotation_proposal_test` (añadir contraseña si la instancia la exige).
3. Ejecutar `node --test --test-isolation=none tests/quotationProposalPostgres.integration.mjs` separado de las pruebas con dobles.

El test prepara solo Quotation, ServiceCatalog, User y Notification con el DDL generado; la extensión vectorial de otros módulos no es necesaria. Simula el esquema anterior quitando **solo en esta base aislada** la columna nueva antes de ejecutar el bootstrap. Elimina únicamente sus propias cotizaciones al finalizar. No ejecutar contra una base compartida ni con datos reales.

Pendientes fuera de este bloque: conversión aceptada a hitos operativos/Financiero, alertas de vencimiento y cobro, plantillas reutilizables y firmas/documentos contractuales adicionales.
