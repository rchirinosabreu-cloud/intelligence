# Financiero, bloque 5: canjes y beneficiarios

Estado: implementado y verificado en local el 7 de noviembre de 2026. Rodny aprobó la muestra y autorizó fusionar el bloque 5 con el ajuste de los botones. No se han modificado datos reales. El despliegue conserva su aprobación habitual.

## Pedido y origen

La tercera reunión con Elisa distingue el canje de Nuva (bienes recibidos, sin ingreso bancario) de su destino: si los recibe una persona y debe reintegrar su valor, corresponde una cuenta por cobrar a esa persona. La conversación no confirma importe, autorización de cobro ni una distribución a socios. La muestra usa nombres e importes explícitamente ficticios.

Ya existía `ReceivablePayment.kind = CANJE`: reducía la deuda, conservaba soportes y escribía bienes/destino en texto. Se amplía ese origen; no se crea otro registro de seguimiento ni se reaplican canjes históricos automáticamente.

## Recorrido

1. Financiero → Cartera → cliente → Saldar de otra forma → Canje.
2. Revisar valor, fecha, bienes y destino. Opciones explícitas: uso de Brain Studio; cobrar a un beneficiario; otra disposición autorizada sin cobro.
3. Para cobrar, elegir una ficha activa de Terceros. Se usa su ID, nunca coincidencia de nombre. El importe completo del canje crea una obligación nativa `AccountsReceivable.kind = BENEFICIARIO`, con `barterPaymentId` único y `beneficiaryThirdPartyId` como claves foráneas restrictivas.
4. Antes de confirmar aparecen ambos saldos. El canje no crea `FinancialRecord`, ingreso, egreso ni préstamo.
5. Cartera separa Clientes, Préstamos y Beneficiarios de canjes. El beneficiario permite cobrar con el flujo nativo de abonos y comprobantes y abrir su canje de origen. La recuperación en dinero usa categoría `FINANCIAL`, sección `FINANCING` y descripción de recuperación de canje; no se clasifica como venta de servicios ni como préstamo. Esto es clasificación operativa de la plataforma, no una liquidación tributaria.
6. Puede compensarse contra una cuenta por pagar de la misma ficha de Terceros usando el cruce del bloque 3. Su historial y reversión continúan siendo los nativos del cruce.
7. Desde el canje de una obligación anterior, «Completar destino» conserva importe, fecha, bienes, texto/autorización anteriores y soportes. Solo registra el destino confirmado y, si se autoriza cobrar, crea la obligación del beneficiario. No vuelve a reducir la deuda del cliente.
8. El resumen de ajustes abre el mismo detalle de canje. Bria dispone del contrato del recorrido en el catálogo de rutas; no infiere decisiones del texto legado.

## Reversión y corrección

«Revisar reversión» exige motivo y muestra el saldo que recuperará el cliente y el saldo cero del beneficiario. Confirmar revierte el `ReceivablePayment` original y, si existe beneficiario, añade una aplicación nativa `REVERSO_CANJE` por su importe y cierra su obligación. La pantalla la identifica como «Anulada por reversión del canje», no como un cobro. Se conservan las dos obligaciones, la aplicación original, soportes, autores, motivos y auditoría.

No se elimina la cuenta de beneficiario ni una cuenta con canjes históricos, incluso revertidos. No se puede cambiar el importe del beneficiario, emitirlo como venta al cliente, corregir/revertir unilateralmente el canje ni quitar la aplicación de anulación. Para corregir importe o destinatario se revisa la reversión y se registra el canje correcto, conservando ambos registros.

Los cobros o compensaciones vigentes del beneficiario bloquean la reversión completa. Deben revisarse desde su origen y revertirse explícitamente si corresponde; el canje no borra esos pagos ni devuelve dinero automáticamente. Los abonos posteriores del cliente se conservan y solo se devuelve al saldo el importe del canje.

## Consistencia y acceso

- Lecturas repetibles y mutaciones serializables, revisión del estado leído y solicitud idempotente. Un reintento con la misma intención devuelve el mismo resultado; uno incompatible no sobrescribe ni duplica.
- Permisos actuales consultados en servidor antes de leer o modificar. La auditoría detallada continúa limitada a administradores.
- Se revisan los períodos de la obligación, aplicación y operación. Períodos cerrados no se reabren por este recorrido.
- Exactitud en centavos, rechazo de saldos históricos inconsistentes, importes excesivos, destinatarios inactivos, cambios concurrentes y monedas que necesitan conversión.
- Se conserva el directorio de Terceros. No se cambia la identidad de clientes, PM, community, personas de nómina ni permisos.

## Alcance

Este incremento trabaja en COP y asigna un destino/beneficiario al importe completo de cada canje. Si una entrega tiene varios destinos, registrar partes explícitas cuya suma no exceda el saldo; no repartir automáticamente. No calcula impuestos, dividendos, anticipos a socios ni inventario de activos, y no crea decisiones reales sobre Nuva o Francisco.

El ensure `scripts/ensure-barter-beneficiaries-schema.js` añade dos columnas, índices y claves foráneas; no migra ni clasifica datos existentes. Está incluido en el arranque para una eventual publicación aprobada, pero aquí solo se ha ejecutado en esquemas aislados del PostgreSQL local de pruebas.

## Muestra y verificación

Muestra: `node scripts/preview-barter-beneficiaries.mjs`, http://127.0.0.1:3850. UI real de Financiero sobre un esquema local aislado y datos ficticios. Otros módulos de la muestra son fixtures; escrituras ajenas al recorrido se rechazan. No usa conexiones productivas. Las cargas físicas de soportes no se simulan como exitosas; se verificó conservación de sus metadatos nativos.

Ejemplo: saldo ficticio del cliente $1.500.000; canje $900.000; saldo cliente $600.000 y beneficiario $900.000, sin movimiento bancario. Revertir devuelve el cliente a $1.500.000 y anula la obligación de $900.000 conservando su historia.

Evidencia:

- 632 pruebas financieras sin fallos en `output/block5-regression-final.log`, incluyendo las pruebas nuevas de canjes, esquema, permisos, períodos, atomicidad, concurrencia, homónimos y reversión encadenada del cruce.
- 5 pruebas adicionales de pagos concurrentes y movimientos existentes, ejecutadas con `output/run-payments-regression.mjs` sobre un esquema aislado actualizado.
- Navegador real: `tests/browser/barterBeneficiaries.mjs` recorre el registro, una respuesta perdida después de guardar, el reintento sin duplicación, la cuenta del beneficiario, la reversión y su historial, en escritorio claro/oscuro y móvil.
- `npm run build` y compilación final de Vite correctas; advertencias existentes de tamaño de paquetes. Lint de `src scripts tests server.js`: cero errores, 23 advertencias existentes. `npm run lint` recorre además worktrees ajenos bajo `.claude` y encontró el límite local de archivos abiertos; se verificaron los directorios del proyecto directamente.
- Auditoría de código sin uso aprobada. `git diff --check` sin errores al finalizar.
- Capturas: `output/barter-review.png`, `output/barter-saved.png`, `output/barter-beneficiary.png`, `output/barter-reversal-review.png`, `output/barter-reversed.png`, `output/barter-dark.png`, `output/barter-mobile.png`.

Rodny autorizó la fusión después de revisar la muestra. Se retiró el botón inferior «Cerrar», dejando las decisiones en una fila; se verificaron Esc y clic exterior, y se conserva la X accesible. La fusión no autoriza corregir fichas productivas ni reclasificar canjes anteriores.
