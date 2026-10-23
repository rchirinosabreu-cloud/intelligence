# Financiero: implementación y validación

Actualizado: 2026-09-07. Basado en las reuniones Financiero 02 y 03 y en la auditoría técnica del módulo.

## Objetivo

Registrar una operación una sola vez y mantener coherencia entre movimientos, cartera, clientes, cuentas, banco y análisis. Separar flujo de caja, resultado económico y recurrencia; no tratar la pauta administrada para terceros ni los proyectos eventuales como honorarios recurrentes garantizados. Definiciones contables, fiscales y de costos requieren validación con Elisa.

## Primer bloque implementado, pendiente de validación operativa

- Clientes, Cartera y el Dashboard leen todo lo registrado del periodo: la historia que cargó el Excel en 2026 y lo de la plataforma, incluidos SYSTEM. Desde el 23 de octubre de 2026 no hay cargas de Excel ni conciliación de extractos: Financiero opera solo en la plataforma.
- Saldos después de abonos; PROMESADO no reduce deuda. Grupos por ID de cliente. Vencido, por vencer y sin vencimiento son situaciones distintas. La vista anual representa obligaciones registradas en ese año, no toda la cartera histórica ni un balance reconstruido a fecha pasada.
- Importes de cobros y obligaciones positivos, con hasta dos decimales y operaciones en centavos seguros. No se puede llevar una obligación a cero para simular pago. Estados históricos PAGADO sin abonos suficientes quedan «Saldo por verificar», excluidos de deuda confirmada y bloqueados para edición hasta revisión; no se crean pagos ni se reabren cobros automáticamente.
- Nuevo pago exige concepto explícito (fee, servicio/adicional o pauta), cuenta activa COP y cliente vinculado. El formulario mantiene un requestId para reintentos; una petición repetida con el mismo contenido/actor no crea otro ingreso.
- Se puede aplicar un ingreso ACTUAL/POSTED existente del mismo cliente, cuenta, día e importe, sin volver a registrarlo. En este bloque se aplica su importe completo a una sola obligación. El reparto entre obligaciones y las conversiones de moneda no están implementados.
- Generic CRUD no permite editar/anular movimientos SYSTEM o vinculados a pagos/nómina. Por ahora se bloquea la operación; todavía no hay una interfaz de reversión controlada.
- Saldo de cuenta desde el día contable de apertura. No se alteraron saldos iniciales existentes.
- Regla confirmada por Rodny: ADMIN accede automáticamente; para otros usuarios decide la casilla Financiero de Equipo. Desmarcarla revoca incluso con flags/niveles antiguos. Los niveles financieros limitan acciones una vez concedida la entrada; VIEWER no escribe. Casilla histórica marcada con NONE/ausente equivale a EDITOR, nunca a aprobador. No se reasignan permisos productivos.
- Paginación de Movimientos y Banco, estado Conciliado persistente, errores distintos de ausencia de datos. Invalidación compartida después de escrituras confirmadas.

## Muestra local

`tests/fixtures/financial-integrity.html` monta los componentes reales con respuestas simuladas en memoria. No usa una base de datos ni las API productivas. Es exclusivamente una muestra local; al recargar se reinicia. No importarla desde la aplicación ni desplegarla como ruta del producto.

Prueba visual: `node tests/browser/financialIntegrity.mjs` con Vite local en 127.0.0.1:3006, o `FINANCIAL_DEMO_URL` explícita. Comprueba aplicación de ingreso existente, coherencia tras refresco, error sin falso éxito, lector sin escritura, fechas civiles, paginación y tamaños/temas. Capturas en `output/financial-*-preview.png` y variantes dark/mobile.

Las pruebas de PostgreSQL usan exclusivamente `TEST_DATABASE_URL` validada por `tests/helpers/testDatabase.js`, nunca el DATABASE_URL de la aplicación. `tests/financialPaymentsPostgres.test.js` cubre concurrencia, idempotencia, abonos y aplicación de ingresos con registros de prueba propios. Sin una base aislada explícita, quedan omitidas: eso no equivale a probar la concurrencia.

### Evidencia local de este bloque

- Pruebas financieras, regla ADMIN/casilla y contrato global de color: 295 casos, 294 aprobados, 0 fallidos, 1 integración PostgreSQL omitida. Ejecutadas con `node --test --test-isolation=none --test-concurrency=1` y una conexión ficticia inaccesible; no se probó contra producción.
- Recorrido Playwright con componentes reales y API simulada: aplicación de ingreso, saldos, permisos, errores, paginación, caso PAGADO heredado y capturas claro/oscuro/móvil; aprobado.
- `npm run build`, ESLint sobre los archivos de aplicación modificados y `git diff --check`: aprobados. El build conserva avisos de tamaño de bundles y dependencias existentes.
- Suite general final: 1028 casos, 1020 aprobados, 6 omitidos y 2 fallos (el caso y su contenedor). `qualityStreakUnit.test.js`, caso DEVUELTA, intenta `taskWorkCycle.findFirst` sin simularlo. Se comprobó que el test y su grafo local no cambiaron respecto de HEAD; no se alteraron módulos de tareas para ocultar el fallo.
- Sin cambios de esquema ni datos productivos. Primer bloque enviado a `main` en `db3f8b9`; el hash del remoto se verificó después del push. Esto no certifica por sí solo que el despliegue haya terminado.

## Segundo bloque local: estado de cuenta del cliente

- Desde Clientes se abre un modal centrado con obligaciones del año y sus abonos actuales. Los ingresos registrados se consultan en una vista separada: no se descuentan dos veces ni se presume que todo ingreso sea un abono.
- API de lectura protegida por el mismo permiso Financiero. Páginas de 25 registros, cursor ligado a cliente/año/vista y lectura RepeatableRead.
- Los abonos muestran fecha, cuenta, referencia e ingreso vinculado; los soportes solo admiten enlaces HTTP(S). Un importe inválido, falta de vínculo, proyección, cliente/cuenta diferente o PAGADO sin aplicaciones suficientes deja el saldo por verificar.
- No es una cartera histórica acumulada ni un corte retroactivo. No suma monedas, reparte pagos, crea movimientos ni revierte operaciones. Esas acciones siguen pendientes del siguiente bloque.
- La invalidación compartida actualiza este detalle tras las operaciones financieras. Los lectores pueden consultarlo, pero no vincular clientes.
- Verificación local: 314 casos focales (313 aprobados, 0 fallidos, 1 integración PostgreSQL omitida), lint global y build aprobados. Recorridos `financialIntegrity.mjs` y `financialClientStatement.mjs` aprobados con API simulada; capturas claro/oscuro/móvil en `output/financial-client-statement*.png`. La limitación de PostgreSQL y el fallo general previo de `qualityStreakUnit.test.js` siguen registrados arriba; no se certifica la suite general ni concurrencia real con este recorrido.
- Segundo bloque revisado localmente; Rodny autorizó su push a `main`. Muestra: `http://127.0.0.1:3006/tests/fixtures/financial-integrity.html` → Clientes → Ver estado de cuenta. Solo datos ficticios en memoria. El push no certifica por sí solo la finalización del despliegue.

## Antes de publicar

1. Ejecutar pruebas financieras, build, lint focal y prueba visual; revisar el diff.
2. Ejecutar las pruebas PostgreSQL en base aislada/CI, incluidos conflictos entre cobros. No usar producción como entorno de pruebas.
3. Comprobar ADMIN/casilla Financiero según la regla confirmada; no conceder acceso por nombre ni por flags antiguos y no reasignar permisos automáticamente.
4. Validar con Elisa: fee + adicional + abono; ingreso preexistente aplicado una vez; promesa; error bancario; navegación hasta el último registro.
5. Confirmar una cuenta y corte inicial; revisar datos heredados sin año/vencimiento, sin sumarlos ni emparejarlos automáticamente.

## Cierres de deuda sin dinero (20 de octubre de 2026)

Pedido de Rodny en la reunión «Actualizaciones Plataforma» con Elisa: Salsipuedes (3.500.000, cerrado por mutuo acuerdo en 2.000.000 porque su negocio cerró) y Nuva (deuda cambiada por muebles que se quedó Francisco). Una cuenta por cobrar se salda por **acuerdo por menor valor, canje, compensación o condonación**: una fila de `ReceivablePayment` con `kind` distinto de `PAGO`, sin cuenta ni ingreso, con quién autorizó y el motivo. La obligación conserva su valor original; lo pagado y lo saldado se muestran aparte; el estado nuevo `SALDADO` dice que quedó en cero sin que todo entrara como dinero. Regla única en `src/lib/receivableSettlement.js`; detalle en AGENTS.md §8.

## Ajustes de cartera y pagos en dólares (20 de octubre de 2026)

La pestaña Cartera abre con «Ajustes de cartera»: lo saldado sin dinero por forma de cierre y la diferencia en cambio de las cuentas en dólares, por el año y mes de la barra, con detalle desplegable. No son movimientos. Y el pago de una cuenta en dólares ya no tiene tope: si entró más que la cartera en pesos (la TRM del día del depósito), la cartera se ajusta a lo que entró; si entró menos y la cuenta queda al día, se marca al registrar. Caso de origen: Foobspain, 19 de octubre de 2026. Detalle en AGENTS.md §8.

## Préstamos a terceros en Cartera (20 de octubre de 2026)

«Cuando registro un préstamo no se me va a cuentas por cobrar … y cuando lo paguen, se reintegre, no es un ingreso como tal». Un préstamo es una `AccountsReceivable` de clase `PRESTAMO` a un colaborador, socio, cliente, proveedor u otro (`clientId` pasó a ser opcional), ligada por `loanRecordId` al egreso que sacó el dinero (categoría `PRESTAMO`, sección `FINANCING`), creado de una vez o elegido entre los ya registrados a mano. La devolución entra por «Registrar reintegro»: ingreso `PRESTAMO`/`FINANCING`, nunca venta; el tablero lo suma en ingresos registrados y lo dice aparte. Regla única en `src/lib/receivableLoans.js`; detalle en AGENTS.md §8. Pendiente, aparte: cuentas por pagar (proveedores, equipo, arriendo) sobre el registro de terceros, y el cruce de un préstamo con la nómina del colaborador.

## Siguientes bloques

1. **Operación de cobros:** documento/obligación con conceptos y cuotas, aplicaciones repartidas, reversión/ajustes con autorización e historial, soportes y extracto interno por cuenta. Cartera histórica acumulada a un corte, distinguiendo consultas de stock y flujos.
2. **Cierres:** acordar qué significa cierre gerencial; completar cobertura bancaria y excepciones. Unificar el protocolo de concurrencia con todas las rutas (incluidas nómina, cambio de cliente y cierre). Las transacciones Serializable añadidas no prueban por sí solas exclusión global frente a caminos que aún no participan del mismo protocolo.
3. **Nómina — diferida por Rodny:** «Generar nómina» puede informar borradores sin hacerlos visibles. El pago real del equipo se realiza el **15 y el último día de cada mes**. Diseñar periodos quincenales, liquidaciones visibles y pagos diferenciados; no asumir que el flujo mensual actual resuelve este requisito. No implementado en este primer bloque.
4. **Decisiones:** caja a 13 semanas y cobranza; después recurrencia frente a estructura, margen/concentración por cliente y presupuesto. Datos y metas versionados; costos y moneda explícitos. Un cliente estratégico puede tener margen negativo: no ocultarlo con una categoría comercial.
5. **Bria:** explicaciones y escenarios reproducibles con enlaces al origen, límites de cobertura y permisos financieros. No automatizar pagos, condonaciones, mensajes de cobro ni cierres. La información financiera no es memoria editorial.

Adopción: piloto con Elisa, revisión semanal de excepciones y decisiones; medir tiempo de registrar/conciliar/cerrar y disminución de registros duplicados, no número de clics.
