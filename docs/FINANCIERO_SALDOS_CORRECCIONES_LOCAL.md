# Financiero: saldos explicables y corrección de pagos

Estado: implementado y revisado en local. Rodny aprobó la muestra y autorizó fusionar el código de los bloques 1 y 2, conservando el historial. **No autorizó todavía cambios en datos reales.** No se modificaron datos productivos; el despliegue conserva su aprobación habitual.

## Alcance y fuentes

Se contrastaron `Financiero 2da Parte.docx` y `Financiero 3ra Parte.docx` con el código existente. Las transcripciones son evidencia de necesidades, no autorización para ejecutar cambios sobre clientes o pagos. Se conserva la pantalla de Financiero y sus rutas nativas.

### Bloque 1: entender una cifra y llegar a su origen

- Los indicadores abren ingresos, egresos, resultado o cuentas por cobrar. Conservan año, mes, búsqueda y demás filtros aplicables. Un filtro local de cuenta se retira al abrir un indicador para no mostrar un subconjunto de su cifra. Cartera retira sus filtros locales de tipo y antigüedad al abrir su indicador.
- Los filtros compartidos quedan debajo de los indicadores.
- Cada cuenta ofrece «Ver composición del saldo»: apertura, ingresos, egresos, saldo registrado y movimientos con saldo acumulado; 50 por página, con total de todo el alcance.
- Tarjeta y detalle usan el mismo cálculo: movimientos contabilizados, ejecutados y no proyectados desde el día contable de apertura, inclusive, de todos los años. Se conserva la convención de fechas civiles existente, con importes en centavos y aperturas negativas válidas.
- Se distingue este saldo del resultado del período y del saldo confirmado por un banco. Leerlo no concilia ni modifica movimientos. Canjes y compensaciones nativos no crean entradas de dinero.
- Un error de lectura no se presenta como cero. La tabla desplaza horizontalmente su contenido en móvil; el resto del cuadro permanece dentro de la pantalla.

### Bloque 2: corregir desde el pago original

- Nómina: «Corregir pago» en sus acciones y en el panel que ya abre Movimientos. Proveedores: misma acción y cuadro en el pago de la cuenta por pagar.
- Cuenta, fecha, importe, referencia y notas, con motivo obligatorio y revisión del antes/después antes de confirmar.
- Se actualizan el mismo pago y movimiento vinculado; se recalculan pendiente y estado de la obligación. Se conservan identidad, documentos, creación e historial previo. No se hacen transferencias ni se crea otro pago.
- La transacción serializable incluye la auditoría nativa `FinancialAuditEvent`: autor, fecha, motivo, antes/después y revisión. Un fallo del historial revierte la operación completa.
- Los permisos se releen del servidor: aprobación financiera para corregir dinero de nómina; escritura financiera para proveedores. El historial de auditoría continúa limitado a administradores. Quien solo puede escribir conserva la edición de referencia/notas de nómina ya existente.
- Se comprueban períodos cerrados de origen y destino; en nómina, también el período de liquidación. Se rechazan excedentes de la obligación, cuentas inactivas o incompatibles y pantallas desactualizadas. Una revisión obsoleta obliga a recargar explícitamente; no se descarta silenciosamente el borrador.
- Los reintentos de la misma petición no duplican eventos. Una corrección posterior invalida ese reintento; no puede volver a aplicar datos antiguos.
- Un egreso manual/importado previamente aplicado, un pago revertido, una incoherencia entre pago y movimiento, un desglose o un vínculo de conciliación bancaria exigen revisión en su origen. No se sobrescriben para hacer pasar la corrección.
- La corrección de pagos de cartera ya existente se conserva. No se sustituye por otra operación ni se amplían permisos.

No se requieren tablas, migraciones, notificaciones, seguimientos o permisos nuevos.

## Muestra y recorridos

Iniciar el clúster de pruebas local existente en `127.0.0.1:55448/recognition_test` y ejecutar:

```powershell
node scripts/preview-financial-corrections.mjs
```

Abrir `http://127.0.0.1:3847`. La muestra usa los componentes reales y, para saldos y correcciones, los servicios reales sobre un esquema PostgreSQL aleatorio con datos ficticios. Las demás vistas son las muestras preexistentes; las escrituras ajenas a estos dos bloques se rechazan. No lee la base productiva. Reiniciar el proceso crea otra muestra; al cerrarlo normalmente elimina solo su propio esquema.

Recorridos:

1. Movimientos → cuenta → «Ver composición del saldo».
2. Indicador → movimientos; se conservan filtros y se retira el filtro local de cuenta.
3. Movimientos → lápiz del pago de nómina → «Corregir pago» → revisar → confirmar.
4. Cuentas por pagar → Proveedores y gastos → proveedor → ver pago → «Corregir pago».
5. Volver a abrir el pago → historial, disponible para administración.

Capturas web en `output/financial-blocks-dashboard.png`, `financial-blocks-balance.png`, `financial-blocks-correction-form.png`, `financial-blocks-correction-review.png` y `financial-blocks-correction-history.png`. Se comprobaron también oscuro y móvil.

## Verificación

- Pruebas unitarias de corrección, saldos, rutas, integración de pantalla, precisión y permisos; regresión financiera de cartera, pagos, nómina, cuentas y catálogo.
- `tests/financialCorrectionsPostgres.test.js`: esquema actual aislado; ambas clases de pago, documentos conservados, saldos, concurrencia, reintentos, reversión completa ante fallo de auditoría, período cerrado y permiso revocado.
- `tests/financialPaymentsPostgres.test.js`: se ejecutó sobre un esquema aislado con tablas actuales preparado mediante `financialCorrectionDatabase({ additionalTables: [...] })`. La primera ejecución contra el antiguo esquema público local falló por una columna `Client.legalName` ausente; no se alteró ese esquema. En el esquema actual pasaron sus cinco pruebas, incluidas concurrencia y aplicación de ingresos existentes.
- `tests/browser/financialCorrections.mjs`: pantalla real en Chrome; período y filtros, detalle de cuenta, cambio persistido de nómina, proveedor con respuesta perdida después de guardar y reintento sin duplicación, historial, oscuro y móvil. La muestra espera la sesión antes de montar la pantalla, igual que el contenedor autenticado real.
- Compilación y revisión estática. Los registros están en `output/financial-blocks-*.log`; no acreditan un despliegue productivo.

Resultado final: 388 pruebas de regresión aprobadas; los dos grupos PostgreSQL omitidos en esa ejecución general se ejecutaron separadamente sobre esquemas aislados y actuales (6 y 5 pruebas aprobadas). La compilación completó; conserva el aviso de paquetes grandes. Revisión estática sin errores, con tres advertencias preexistentes de dependencias de efectos. El recorrido de navegador pasó con los cuatro indicadores, correcciones, conservación de documentos/historial y respuesta interrumpida. No se probó carga masiva ni conciliación contra extractos bancarios reales.

## Límites y siguientes bloques

No se reconciliaron ni se corrigieron registros reales de Brieva, Nuva, Jesús o Melissa. Sus menciones en las reuniones deben cotejarse con pagos, documentos y acuerdos nativos antes de cambiar datos.

- Brieva: conectar la compensación con ambos lados y verificar por separado el eventual pago de $40.000 pertenece al bloque 3. Una nota de compensación no prueba el pago.
- Jesús y Melissa: ajustes de liquidación/prorrateo y vínculo de descuentos con préstamos corresponden al bloque 4. Este bloque corrige pagos, no cambia el importe debido por un contrato.
- Nuva: definir y registrar el beneficiario y la obligación del canje corresponde al bloque 5.
- Los anuncios importantes y sus acuses corresponden al bloque 6; se conserva el protocolo global de alertas existente.

El detalle de cuentas pagina lo que entrega al navegador, pero calcula sobre la proyección mínima de todos los movimientos elegibles, como la lectura de saldos existente. Cada página tiene una lectura consistente; no representa una conciliación bancaria ni un extracto congelado entre páginas.
