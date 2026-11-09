# Nómina: contrato, servicio y mes de liquidación

Estado: validado en local el 9 de noviembre de 2026; Rodny aprobó la interfaz y autorizó fusionar el código. Sin escrituras productivas.

## Fallos reproducidos

- Generar un mes terminaba al encontrar cualquier liquidación contabilizada en ese mes. Un tramo del 16–31 de octubre, pagado y contabilizado en noviembre, impedía generar el servicio de noviembre.
- Se exigían fechas nuevas a todas las liquidaciones anteriores, aunque la generación mensual original y el contrato de entonces estaban en la auditoría.
- La tabla editaba valores del contrato junto al neto de una liquidación distinta. Guardar no actualizaba ese neto, pero se anunciaba «Nómina actualizada».
- Generar anunciaba éxito incluso al no crear filas. Los enlaces del contrato y del historial no tenían separación.

## Corrección

La generación usa el alcance de servicio, no solo el mes contable. Conserva liquidaciones anteriores, filas revertidas y claves; un segundo intento no genera otra obligación. Los rangos superpuestos o desconocidos siguen bloqueados. La generación informa cuántos borradores creó y cuántos meses ya existían.

`withPayrollMonthlyBasis` proyecta el alcance de un mensual histórico solo si se conserva el evento nativo de generación que incluye su ID y un contrato auditado anterior a ese evento que cubría todo el mes, con los mismos importes base/seguridad. No usa el contrato actual, no cambia `serviceStart`/`serviceEnd` históricos ni declara cumplimiento. Fechas explícitas tienen prioridad. Un tramo parcial, un monto distinto o evidencia ausente siguen requiriendo identificación. La misma proyección alimenta tabla, historial y validación de solapamientos.

En la comprobación productiva de solo lectura, 30 liquidaciones tenían ese respaldo. Quedaron sin clasificación automática septiembre/octubre de Francys y octubre de Mariceth. Estas cifras son una observación puntual, no una migración.

La tabla muestra vigencia y mensual contratado separados del servicio y valores del período. Los valores del contrato se editan en su diálogo, con total calculado. «Guardar y revisar nómina» guarda el contrato y, si el borrador mensual seleccionado difiere, abre directamente la comparación anterior/nuevo. Confirmar `sync-contract` actualiza solo ese borrador: permiso vigente de escritura, revisión del contrato y todas sus liquidaciones, período abierto, sin pagos/descuentos, sin solapamientos y sin contrato histórico importado. Se releen en una transacción serializable. Conserva autor, motivo, valores previos y snapshot contractual en la auditoría nativa. Reintentos verifican solicitud, huella y actor. No actualiza liquidaciones aprobadas/pagadas ni otros meses.

El historial abre el mes elegido y permite desplegar los demás. «Nuevo período» precarga el tramo compatible con el contrato; solo precarga importe mensual cuando cubre un mes completo, sin prorratear por su cuenta. Los errores de guardar contrato aparecen dentro del diálogo.

## Validación y muestra

- `tests/payrollContractFlow.test.js`: reproducción fallida antes de corregir el caso de Jesu, mensual documentado y exclusiones.
- `tests/payrollContractFlowPostgres.test.js`: PostgreSQL aislado; conservación exacta del pago anterior, sincronización explícita, reintento, cambio concurrente del contrato, permiso revocado, período cerrado, rollback al fallar la auditoría, dos confirmaciones concurrentes y generación concurrente con mensual revertido.
- `tests/payrollPeriodsPostgres.test.js`: regresión de períodos, pagos, descuentos y reversión.
- `tests/browser/payrollContractFlow.mjs`: componentes reales `FinancialDashboard` y diálogos, servicios/controlador reales con PostgreSQL local; generar/repetir, contrato → comparación → confirmar, historial y capturas claro/oscuro/móvil. El primer recorrido falló antes de corregir la pantalla. Las llamadas ajenas a nómina usan el andamio de pruebas; no es una validación del resto de módulos ni una sesión productiva.
- `node scripts/preview-payroll-contract-flow.mjs`: http://127.0.0.1:3864. Datos de prueba y un esquema temporal en el clúster permitido `127.0.0.1:55448/recognition_test`; no lee credenciales productivas. Reiniciar el servidor prepara otra muestra limpia.
- Capturas locales: `output/payroll-contract-flow/`. Compilación Vite completada; avisos existentes de tamaño de paquetes y una declaración CSS fuera de este cambio.

No hay esquema nuevo, backfill ni corrección automática de pagos. Guardar un contrato y confirmar su borrador son actos separados y explícitos. Rodny aprobó la muestra y autorizó la fusión, incluido el ajuste de los botones de descuentos y aprobación en una sola fila, con la misma altura. El despliegue conserva su aprobación habitual; no corregir datos productivos con esta autorización.
