# Categorías financieras

Desde septiembre de 2026, `DONACION` (Donaciones) y `SIEMBRA` son categorías explícitas en el registro manual, la importación de Excel y los gráficos. Se conservan las nueve categorías anteriores. Las etiquetas Donación/Donaciones y Siembra/Siembras se reconocen antes de las heurísticas de nombres de personas; no se generan movimientos para celdas sin importe.

`scripts/ensure-financial-categories-schema.js` añade ambos valores al enum PostgreSQL de forma aditiva e idempotente durante `npm start`, antes de iniciar el servidor. No modifica movimientos históricos ni requiere un `db push` general. La transacción confirma los valores antes de usarlos.

Reclasificar un movimiento histórico requiere una edición explícita autorizada desde Movimientos. Se conserva su identidad, importe, origen y fecha original cuando la fecha del formulario no cambia; queda un evento de auditoría con actor y valores anteriores/posteriores. Siguen vigentes las restricciones por periodo cerrado, pagos, nómina y conciliación aprobada. No reimportar todo el libro para corregir una categoría.

Verificación: `tests/financialCategories.test.js` cubre normalización, Excel, preservación de datos y auditoría, fechas importadas y catálogo. Las pruebas con dobles no certifican PostgreSQL; el despliegue y la lectura posterior del movimiento deben comprobarse por separado. La muestra `tests/fixtures/financial-search.html` permite revisar el selector en claro y oscuro con datos ficticios.
