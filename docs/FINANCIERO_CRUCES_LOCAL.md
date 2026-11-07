# Bloque 3 · cruce de obligaciones y reversión

Estado: implementación validada en local el 6–7 de noviembre de 2026. Rodny aprobó la muestra y autorizó el 7 de noviembre fusionar el bloque 3 y la retirada de botones, conservando el historial y sin modificar datos reales. El despliegue conserva su aprobación habitual. Se incorporó también su petición de retirar los cuatro accesos «Ver ingresos», «Ver egresos», «Ver movimientos del resultado» y «Ver cuentas por cobrar» de los indicadores; se conservan las cifras y los filtros inferiores.

## Diagnóstico y alcance

La compensación anterior creaba un `ReceivablePayment` de tipo `COMPENSACION` y guardaba la contrapartida en `detail.offsetAgainst`. No aplicaba nada a Cuentas por pagar. Ya existían las aplicaciones y reversiones de ambas obligaciones, los soportes propios del ajuste, `FinancialAuditEvent` inmutable y el vínculo `ThirdParty.clientId`. Se reutilizan esas fuentes; no se crea otra obligación, movimiento bancario ni seguimiento.

## Recorrido visible

1. Cuentas por cobrar → cliente → **Saldar de otra forma** → **Compensación de obligaciones**.
2. Seleccionar la cuenta por pagar del mismo tercero vinculado en Terceros. Se muestran las obligaciones originales y sus saldos actuales; se solicitan valor, fecha, autorización y motivo.
3. **Revisar cruce** presenta el antes y después de cada obligación. **Confirmar cruce** registra ambas aplicaciones juntas.
4. **Ver cruce**, desde Cartera o desde las aplicaciones de Proveedores y gastos, abre la misma operación y sus soportes. El detalle mantiene la autorización, quien registró, fecha y motivo. La auditoría completa conserva sus permisos administrativos.
5. **Revisar reversión** exige motivo y muestra ambos saldos resultantes. Confirmar marca las dos aplicaciones como revertidas en una sola transacción. Los documentos, aplicaciones originales, auditoría y pagos posteriores se conservan.

Ejemplo ficticio reproducido: 960.000 COP por cobrar y 1.000.000 COP por pagar, cruce de 960.000 → 0 y 40.000. Revertir → 960.000 y 1.000.000. Si antes de revertir se pagaron realmente los 40.000 restantes, se conserva ese egreso y el saldo por pagar vuelve a 960.000, no a 1.000.000.

## Integridad y compatibilidad

- `financialOffsetService` relee identidad y permiso financiero vigente, vínculo nativo de tercero, moneda, saldos, revisiones y períodos. Opera en `Serializable`; lectura en `RepeatableRead`. Importes en centavos seguros, sin conversiones implícitas.
- Solo obligaciones de cliente en COP con proveedor vinculado explícitamente. No unir por nombres ni por coincidencias documentales inferidas. Sin vínculo, saldo apto o moneda compatible, se explica dónde revisar.
- `PayablePayment.kind` distingue dinero y compensación. `offsetReceivablePaymentId` único y restrictivo enlaza la aplicación nativa de Cartera. `offsetRequestId` único, huella y actor evitan duplicados por reintento. Una solicitud ya revertida no vuelve a aplicarse.
- `paidAmount` y `paidInPeriod` de Proveedores excluyen compensaciones; `settledAmount` y `compensatedInPeriod` las separan. `SALDADA` significa cierre con compensación; los pagos, correcciones y reversiones ordinarios mantienen ese estado cuando corresponde. Cartera conserva su `SALDADO` nativo.
- Los accesos antiguos a corregir/revertir una sola aplicación rechazan cruces vinculados y remiten a **Ver cruce**. Una obligación que conserva un cruce, incluso revertido, no se elimina: conserva ambas fuentes y la auditoría. La FK también protege ese historial.
- Actualización/anulación de cuentas por pagar serializa sus lecturas de saldo contra aplicaciones concurrentes. No cambia por sí sola permisos ni valores.
- La reversión guarda autor, fecha, motivo y antes/después en la auditoría nativa de ambas obligaciones. Los instantes se presentan en Bogotá; la fecha contable conserva su día.
- El formulario reutiliza componentes de la plataforma y borradores por persona. La confirmación no se hereda del borrador: exige revisar de nuevo. Una respuesta perdida permite reenviar la misma solicitud. Un conflicto exige actualizar y revisar otra vez.
- Los ajustes antiguos de texto siguen visibles y reversibles por su ruta original. **No se enlazan ni se descuentan otra vez automáticamente.** Una conciliación histórica real exige revisar primero ambas obligaciones y lo que ya se aplicó.

## Esquema y despliegue posterior

`scripts/ensure-financial-offset-schema.js` agrega tres columnas a `PayablePayment`, dos índices únicos, FK restrictiva y restricción de forma: una compensación requiere vínculo y solicitud y no admite cuenta ni movimiento bancario. Es transaccional e idempotente. Está preparado en la cadena de arranque después de Cuentas por pagar; **solo se ejecutó contra esquemas locales aislados**. No cambia importes ni reclasifica aplicaciones existentes. La autorización de fusión no autoriza conciliaciones ni cambios manuales de datos reales. El despliegue conserva su aprobación habitual.

## Evidencia local

- `tests/financialOffsetsPostgres.test.js`: 7 escenarios (8 resultados contando contenedor) sobre PostgreSQL aislado: cruce y reversión, parcial, identidad/moneda/saldo, permisos y períodos, rollback al fallar auditoría, concurrencia, reintento, pago posterior, legados y soportes. Ejecuta el ensure dos veces y comprueba restricciones.
- `tests/financialCorrectionsPostgres.test.js`: 6 resultados de correcciones de nómina/proveedores siguen pasando junto con el nuevo flujo; 14 resultados combinados, sin omisiones.
- Regresión financiera: 565 pruebas aprobadas y 3 pruebas de PostgreSQL omitidas al no habilitar su conexión en esa ejecución general. Cruces y correcciones se ejecutaron aparte con conexión local explícita.
- `tests/browser/financialOffsets.mjs`: pantallas reales de Cartera y Proveedores, servidor con servicios nativos y PostgreSQL ficticio. Revisión, pérdida simulada de respuesta tras confirmar, reintento sin duplicado, consulta desde ambas pantallas, reversión e historial. Capturas en escritorio claro/oscuro y comprobación de desbordamiento en móvil. Sin errores JavaScript.
- Compilación completa (`npm run build`: 7 comprobaciones de Actividad, generación de Prisma y Vite), validación del esquema y lint de archivos del bloque aprobados. La comprobación final del 7 de noviembre incluye los últimos cambios; no se detuvieron procesos ajenos.

Muestra interactiva: `node scripts/preview-financial-offsets.mjs`, puerto 3848. Usa exclusivamente `recognition_test` en `127.0.0.1:55448` y un esquema aleatorio. No utiliza la base de aplicación. Para reiniciar el ejemplo, detener únicamente ese proceso y arrancarlo de nuevo. El navegador puede repetir nuevos cruces después de una reversión, conservando los anteriores.

Capturas en `output/financial-offset-review.png`, `financial-offset-saved.png`, `financial-offset-payables.png`, `financial-offset-reversal-review.png`, `financial-offset-reversed.png`, `financial-offset-dark.png`, `financial-offset-mobile.png` y `financial-offset-indicators.png`.

## Pendiente fuera de este bloque

Conciliación real del caso de la reunión y de compensaciones antiguas; cruces entre monedas; beneficiarios del canje de Nuva; deducciones ligadas a préstamos y liquidaciones/prorrateos de nómina. Ninguno se da por resuelto con esta muestra.
