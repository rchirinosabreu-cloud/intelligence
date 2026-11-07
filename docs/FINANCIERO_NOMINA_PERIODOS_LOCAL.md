# Financiero · bloque 4: períodos de nómina y descuentos de préstamos

7 de noviembre de 2026. Muestra local aprobada por Rodny y fusión del código autorizada, conservando pagos e historial. El despliegue conserva su aprobación habitual. No se consultaron ni modificaron filas productivas para construir esta muestra.

## Resultado esperado y origen

El problema de Jesu es poder liquidar un tramo adicional conservando el período anterior y sus pagos, en lugar de sustituir una única fila del mes. El caso de préstamo necesita descontar una cuota de la liquidación y del préstamo simultáneamente, sin fingir un ingreso o egreso de banco. Se reutilizan Nómina, Cartera, sus aplicaciones e historial de auditoría.

Las fechas e importes de la muestra son ficticios. Antes de corregir la ficha real de Jesu deben confirmarse las fechas exactas del tramo anterior y del adicional; una referencia a «15 o 16» no autoriza elegir una fecha automáticamente. Este bloque prepara el recorrido, no realiza esa corrección productiva.

## Recorrido visible

En **Financiero → Nómina**, cada liquidación del mes tiene su fila. «Períodos e historial» permite:

1. Precisar las fechas de una liquidación anterior sin alterar importes, pagos ni soportes.
2. Crear otro período con fechas e importe acordado, o una tarifa explícita por día calendario. La pantalla presenta el total antes de confirmar; el nuevo período queda en borrador y conserva la aprobación habitual.
3. Revertir un período sin aplicaciones vigentes, con motivo. La fila permanece como «Revertida» y no se vuelve a generar automáticamente.

«Descuentos de préstamos» presenta el neto y lo pendiente de transferencia. Se elige el préstamo, se indica valor, fecha, autorización y motivo, y se confirma el titular si el préstamo aún no tiene vínculo. La revisión muestra ambos saldos después del descuento. Desde la aplicación de Cartera se puede volver a «Ver descuento en Nómina».

Los formularios conservan borrador por usuario y recurso; cerrar con Escape no lo pierde. Un cambio del origen exige actualizar y revisar de nuevo. Un reintento de la misma confirmación no aplica otra cuota.

## Muestra y reversión

Muestra interactiva: `node scripts/preview-payroll-periods.mjs`, http://127.0.0.1:3849. Solo usa el clúster de prueba local y un esquema aislado; no recurre a `DATABASE_URL` para elegirlo.

| Ejemplo | Antes | Después | Reversión |
|---|---|---|---|
| Jesu | $750.000 pagados por el tramo anterior | Otro tramo de $750.000 en borrador; pago anterior intacto | Retira el tramo adicional de pendientes, conserva su fila y el pago anterior |
| Melissa | Nómina $750.000 y préstamo $900.000 | Descuento $300.000: neto $450.000, préstamo $600.000; ningún movimiento bancario | Neto $750.000 y préstamo $900.000 |
| Melissa con transferencia posterior | Descuento vigente y transferencia de $450.000 | Nómina cubierta | Revertir solo el descuento conserva la transferencia: quedan $300.000 por pagar |

Ejemplo de fechas: 16/09–15/10 y 16/10–31/10, ambos liquidados en octubre. El segundo comprende **16 días calendario** y tiene un importe fijo acordado de $750.000; no se calculó como una quincena de 15 días ni se presentó como regla legal.

Capturas de la interfaz real en `output/`: `payroll-period-saved.png`, `payroll-period-reversal-review.png`, `payroll-period-reversed.png`, `payroll-loan-review.png`, `payroll-loan-saved.png`, `payroll-loan-reversal-review.png`, `payroll-loan-reversed.png`, `payroll-periods-dark.png`, `payroll-periods-mobile.png`.

## Modelo e integridad

- `PayrollTransaction` conserva identidad y pagos; la clave única pasa de contrato/mes/año a contrato/mes/año/`periodKey`. Los legados usan `MONTHLY` y sus fechas permanecen desconocidas hasta precisión expresa. Los contratos de cargas reemplazadas siguen excluidos de la operación.
- El período de servicio y el mes de liquidación son distintos. Un tramo nuevo debe caber en el contrato y no superponerse con otros vigentes de la persona. Generación mensual no presupone un importe completo para contratos parciales ni ante períodos anteriores desconocidos.
- `PayrollAdjustment.receivablePaymentId` enlaza la deducción con una `ReceivablePayment` de tipo `COMPENSACION`. El préstamo se vincula a `FinancialCollaborator` por identificador, nunca por parecido del nombre. No existe otro libro de descuentos ni otra tarea de seguimiento.
- Se releen identidad, permisos actuales, nómina aprobada, saldo de nómina, saldo de préstamo y períodos abiertos. Solo COP en este incremento. Las escrituras y la auditoría nativa se confirman juntas en una transacción serializable.
- La reversión conserva pagos posteriores y soportes. No se permite corregir/revertir unilateralmente la aplicación desde Cartera, ni borrar la obligación con ese historial. Un vínculo histórico de préstamo también bloquea la sincronización destructiva desde el movimiento original.
- Un descuento completo puede dejar neto cero sin inventar fecha de pago en efectivo. El costo del servicio no disminuye por amortizar un préstamo. Las liquidaciones revertidas se excluyen de pendientes y del bloqueo de cierre mensual.
- La auditoría registra autor, fecha, motivo y estados anteriores/posteriores. Las referencias de pago y los documentos anteriores permanecen en su origen.

## Verificación

- Cálculo de importes, fechas inválidas, febrero bisiesto, centavos y límites de solapamiento.
- PostgreSQL real aislado: creación/reversión, varios períodos, legado pagado con soporte, actualización idempotente del esquema antiguo sin borrar datos, descuento/reversión, neto cero, prohibición de borrado en cascada, permisos revocados, períodos cerrados, saldo insuficiente, error de auditoría con rollback y solicitudes concurrentes.
- Navegador con la pantalla real y servicios nativos: borrador tras Escape, creación y reversión de período; descuento, pérdida de respuesta después del guardado y reintento sin duplicar; transferencia posterior y reversión que deja $300.000 pendientes; claro, oscuro y móvil sin desbordamiento horizontal del diálogo.
- Regresión financiera, análisis estático y compilación registrados en `output/payroll-block4-regression.log` y `output/payroll-block4-build.log`. El antiguo ensayo `financialPaymentsPostgres` necesita un esquema actualizado: se ejecuta por separado sobre uno aislado, no sobre el esquema público local desactualizado.

Resultado final: **609 pruebas de regresión + 5 de cobros PostgreSQL aprobadas**, sin omitidas; recorrido de navegador aprobado, ESLint sin errores, auditoría de código sin hallazgos y compilación correcta. La compilación también pasó sus 7 comprobaciones de componentes; mantiene los avisos existentes sobre tamaño de paquetes y configuración futura de Prisma.

## Límites y siguiente paso

No se dedujeron cuotas de préstamos automáticamente ni se corrigieron datos reales. No se recalculan importes históricos al editar el contrato. Este bloque no implementa intereses, cuotas recurrentes, prorrateo laboral legal, otras monedas ni reclasificación automática de préstamos antiguos. El cierre de un préstamo y su saldo se acreditan por sus aplicaciones nativas.

Rodny revisó la muestra y autorizó fusionar el bloque 4 sin modificar todavía los datos reales. El ensure está preparado en la secuencia de inicio para un despliegue futuro, pero solo se ha ejecutado en esquemas de prueba locales. La aprobación de la muestra no aplica por sí sola correcciones a Jesu, Melissa ni otras personas.
