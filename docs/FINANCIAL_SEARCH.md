# Búsqueda y filtros de Financiero

La barra superior es la única selección de año, escenario, mes y tipo de movimiento. La búsqueda se conserva al cambiar de pestaña y actualiza ingresos, egresos, resultado neto, flujo, categorías y movimientos. Se aplica antes de sumar y paginar: las tarjetas principales incluyen todas las coincidencias, mientras que los subtotales de la tabla indican expresamente «de esta página».

## Coincidencias

- Movimientos: concepto, contraparte, cliente, persona vinculada, cuenta, referencia, notas, subcategoría y nombre original de importación. Incluye el colaborador de una nómina vinculada.
- Cartera: cliente, nombre original, notas y comentarios; el saldo sigue descontando abonos. También respeta el mes de la obligación.
- Nómina: colaborador, usuario y nombre original del contrato. La liquidación usa el mes superior; con «Todo el año», el panel mensual identifica explícitamente el mes actual.
- Clientes: movimientos y obligaciones coincidentes del periodo.

La búsqueda ignora mayúsculas y espacios exteriores. Todas las palabras deben coincidir en alguno de los campos disponibles; no exige que estén en el mismo campo. El autor que digitó un movimiento no determina a quién pertenece: buscar su nombre no devuelve todos los registros que haya creado.

Los movimientos y sus indicadores comparten el alcance: todo lo registrado del periodo, estado confirmado y escenario seleccionado. La paginación añade el ID como desempate estable y vuelve a la primera página al cambiar filtros. No se modifican importes ni registros financieros.

## Alcances que conservan su significado

El escenario y el tipo describen movimientos. No transforman contratos, obligaciones o extractos en proyecciones ni eliminan deuda porque se seleccionen egresos. El saldo total de una cuenta sigue siendo su saldo real, identificado como tal.

## Verificación

- `tests/financialSearch.test.js`: lógica real de controladores y servicios con dobles de persistencia; cubre más de 25 coincidencias, totales, mes/tipo, relaciones, paginación y entrada inválida.
- `tests/financialLedgerUi.test.js` y `tests/sharedSelectContract.test.js`: contrato de interfaz y selectores compartidos.
- `tests/fixtures/financial-search.html`: interfaz real con importes ficticios y transporte en memoria; nunca consulta producción. `tests/browser/financialSearch.mjs` contiene el recorrido de búsqueda y paginación.
- Verificación visual local de escritorio y móvil, temas claro y oscuro, búsqueda sin resultados y recuperación tras error de lectura.

Las pruebas con dobles y la muestra visual no certifican una consulta contra PostgreSQL productivo. Las pruebas de base de datos requieren `TEST_DATABASE_URL` aislada y validada; nunca se usa la conexión productiva para pruebas o limpieza.
