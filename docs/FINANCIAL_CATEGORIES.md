# Categorías financieras

Desde septiembre de 2026, `DONACION` (Donaciones), `SIEMBRA` y `PRESTAMO` (Préstamo, pedido por Rodny el 19 de septiembre de 2026) son categorías explícitas en el registro manual, la importación de Excel y los gráficos. Se conservan las nueve categorías anteriores. Las etiquetas Donación/Donaciones, Siembra/Siembras y Préstamo/Préstamos se reconocen antes de las heurísticas de nombres de personas; no se generan movimientos para celdas sin importe.

`scripts/ensure-financial-categories-schema.js` añade los valores al enum PostgreSQL de forma aditiva e idempotente durante `npm start`, antes de iniciar el servidor. No modifica movimientos históricos ni requiere un `db push` general. La transacción confirma los valores antes de usarlos.

Una categoría nueva se declara en seis lugares que `tests/financialCategories.test.js` vigila: el enum de `prisma/schema.prisma`, el script de arranque, `FINANCIAL_CATEGORIES` en `financialRecordService.js`, el selector de `FinancialLedger.jsx`, etiquetas y colores de `FinancialDashboard.jsx`, la semilla del gráfico en `financialController.js` y el enum inicial de `scripts/pre-push-enum.js`.

## Desglose interno de un movimiento

Un movimiento sigue siendo un solo hecho de dinero (una transferencia, una cuenta, una fecha, un importe). Desde el 19 de septiembre de 2026, desde Movimientos se puede **desglosar** en partidas internas (`FinancialRecordAllocation`: valor, categoría y concepto) para explicar qué pagó; por ejemplo, 600.000 repartidos en Claude, Eleven Labs e inversión en la plataforma. Reglas:

- Las partidas suman exactamente el importe del movimiento, comparado en centavos; mínimo dos partidas, máximo veinte, cada una con concepto y valor mayor que cero. Una lista vacía retira el desglose.
- El desglose no crea, mueve ni oculta dinero: el saldo de cuentas, el flujo de caja, la cartera y las páginas del libro siguen leyendo el movimiento. Solo la distribución por categoría del dashboard (`categoriesDistribution`) toma las partidas cuando existen y el movimiento cuando no.
- Se reemplaza completo en una transacción serializable con evento de auditoría (`before`/`after` incluyen las partidas). Movimientos anulados, generados por el sistema (nómina) o en periodo cerrado no se desglosan. Anular el movimiento conserva las partidas en la bitácora; borrarlo las elimina en cascada.
- API: `PUT /api/financials/records/:id/allocations` con `{ allocations: [{ amount, category, description, counterparty? }] }`, permiso de escritura financiera. La lista de movimientos incluye `allocations` ordenadas.
- Arranque: `scripts/ensure-financial-allocations-schema.js` crea la tabla de forma aditiva después del script de categorías, porque la columna usa ese enum.

Verificación: `tests/financialRecordAllocations.test.js` (normalización, transacción, auditoría, indicadores y contrato de arranque). Muestra local: `tests/fixtures/financial-search.html` → Movimientos → icono de capas en el egreso de IA; la muestra simula la API en memoria y no certifica PostgreSQL.

Reclasificar un movimiento histórico requiere una edición explícita autorizada desde Movimientos. Se conserva su identidad, importe, origen y fecha original cuando la fecha del formulario no cambia; queda un evento de auditoría con actor y valores anteriores/posteriores. Siguen vigentes las restricciones por periodo cerrado, pagos, nómina y conciliación aprobada. No reimportar todo el libro para corregir una categoría.

Verificación: `tests/financialCategories.test.js` cubre normalización, Excel, preservación de datos y auditoría, fechas importadas y catálogo. Las pruebas con dobles no certifican PostgreSQL; el despliegue y la lectura posterior del movimiento deben comprobarse por separado. La muestra `tests/fixtures/financial-search.html` permite revisar el selector en claro y oscuro con datos ficticios.
