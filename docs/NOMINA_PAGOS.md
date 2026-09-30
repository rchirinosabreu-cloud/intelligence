# Pagos de nómina por partes

Rodny, 30 de septiembre de 2026: «ese pago se hizo el 15 y el 30 y antes se le hicieron
adelantos, o sea aunque lo mande desde nómina yo necesito poder editar el pago para partirlo y
subir las referencias». Y después: «no pongas partir sino desglosar, o sea esta es la misma
lógica de los desgloses internos … y obviamente el poder añadir los documentos de respaldo».

## Qué había

Una liquidación admitía **un solo pago**, que generaba **un solo egreso** enlazado de forma
única (`PayrollTransaction.financialRecordId`). Ese egreso quedaba bloqueado en Movimientos
—con razón, porque lo generó la nómina—, así que no había forma de subirle el comprobante ni de
reflejar que el dinero salió en varias fechas.

## Qué hay ahora

- **Varios pagos por liquidación** (`PayrollPayment`). Cada uno con su egreso, su fecha, su
  cuenta, su referencia y sus comprobantes. La liquidación queda **Pagada** cuando los pagos
  vigentes suman el neto; mientras tanto se ve como **Pago parcial**, con lo que falta.
- **Registrar pago** acepta un valor menor que el neto (por defecto, lo que falta) y un
  comprobante opcional.
- **Aplicar un egreso ya registrado**: un adelanto que se registró a mano en Movimientos, con
  categoría Nómina, se aplica a la liquidación en vez de crear otro egreso. Así el mismo dinero
  no sale dos veces del libro. Si el adelanto tiene otra categoría, se cambia primero en
  Movimientos.
- **Desglosar un pago**: la misma forma que el desglose interno de un movimiento. Ítems con
  valor, fecha, cuenta, referencia y documento de respaldo, que tienen que sumar exactamente el
  pago («Faltan / Sobran», «Aplicar desglose»). La diferencia con el desglose interno es que
  cada ítem queda como **su propio egreso**: salió de la cuenta en su propia fecha, y así el
  libro y la conciliación bancaria lo ven igual que el extracto.
- **Revertir** un pago, con motivo. Si lo creó la plataforma, su egreso se anula; si era un
  egreso registrado a mano, se conserva intacto y queda libre para aplicarlo donde toque.
- **Editar referencia**: la referencia y la nota se corrigen sin tocar el dinero.
- **Subir comprobante** en cada pago, en cualquier momento. Se ven con el visor de la
  plataforma.

Nada se borra. El pago desglosado o revertido queda en el historial de la liquidación
(«Ver N pagos revertidos o desglosados») y su egreso, anulado con su motivo.

## Los pagos que ya existían

`scripts/ensure-payroll-payments-schema.js` crea la tabla y traslada el pago que ya tenía cada
liquidación pagada a su propia fila (`payroll-payment-legacy:<liquidación>`), sin tocar el
egreso ni la liquidación. Es idempotente: volver a correrlo no duplica nada. Desde ahí, ese pago
se desglosa, se revierte o recibe comprobantes como cualquier otro.

## Permisos

Registrar, desglosar y revertir piden el mismo permiso que antes pedía pagar (aprobación de
Financiero). Corregir la referencia y subir comprobantes piden permiso de escritura.

## Rutas

- `POST /api/financials/payroll-transactions/:id/pay` — `amount` opcional, o `financialRecordId`
  para aplicar un egreso existente.
- `GET /api/financials/payroll-transactions/:id/payment-candidates` — egresos aplicables.
- `POST /api/financials/payroll-payments/:paymentId/split` — `parts[]` que suman el pago.
- `POST /api/financials/payroll-payments/:paymentId/reverse` — `reason` obligatorio.
- `PATCH /api/financials/payroll-payments/:paymentId` — `reference`, `notes`.
- Comprobantes: los de siempre, `POST /api/financials/records/:recordId/documents`.
