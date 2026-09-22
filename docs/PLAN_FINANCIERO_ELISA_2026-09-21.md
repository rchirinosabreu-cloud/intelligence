# Financiero: lo que pidió Elisa — reunión del 21 de septiembre de 2026

**Origen:** transcripción `Reunión Financiero.json` (Fireflies), 21-sep-2026 11:00 Bogotá, 34 minutos.
Participantes: Rodny Chirinos y Elisa (aparece como «Social Brain Studio» en la transcripción).

Esta reunión ocurrió **una hora y media antes** de la reunión con dirección. Es decir: la condición que puso dirección —*«antes de avanzar cualquier cosa cerremos financiero»* (36:50)— ya tiene su insumo. Este documento es el bloque 0 de [PLAN_REUNION_DIRECCION_2026-09-21.md](PLAN_REUNION_DIRECCION_2026-09-21.md).

---

## 1. Lo que Elisa dijo, en una frase

> «Lo que no quiero hacer es un doble trabajo, como hacerlo, venir a digitar acá y después hacerlo allá» (29:44)

Todo lo demás cuelga de ahí. Hoy ella hace la cuenta de cobro en Word, la manda al cliente, y después vuelve a la plataforma a registrar el movimiento. Quiere hacerlo una sola vez.

Y el segundo tema, igual de claro:

> «Los movimientos no me dicen mucho. Yo necesito ver cerrado al mes, o cuánto me gasto en la oficina, o cuánto me entró por este cliente» (06:33)

La plataforma hoy es un **diario de movimientos**. Ella necesita, además, **vistas cerradas**: por cliente, por mes y por categoría.

---

## 2. Hay que limpiar producción antes de seguir

Durante la reunión se hicieron pruebas sobre datos reales. Quedaron dos cosas mal, y una de ellas **no se puede deshacer desde la plataforma**:

1. **Un abono de prueba mal escrito.** Rodny registró `500` en vez de `500.000` (16:44) e intentó borrarlo: *«no puedo, no sé por qué no puedo»* (16:21). Por el hilo de la conversación parece haber sido sobre la cuenta por cobrar real que estaban mirando, no sobre el cliente de prueba — **hay que confirmar cuál antes de limpiar**. No es un fallo: el ingreso que genera un abono nace con `origin: 'SYSTEM'`, y [financialRecordService.js:290](src/services/financialRecordService.js:290) rechaza anularlo con el mensaje *«requiere una corrección controlada de la operación de origen»*. **Esa corrección no existe.** No hay ningún endpoint para revertir un abono — en [financials.js:96](src/routes/api/financials.js:96) solo está el `POST` que lo crea.

2. **El abono de 500 mil de Elvira Utria quedó como ingreso suelto.** Elisa intentó registrarlo como pago, no se guardó, y lo registró a mano en Movimientos (14:02). Resultado: la plata está contada en Movimientos pero la cuenta por cobrar **sigue mostrando la deuda completa**. Los números no cuadran hasta que eso se arregle.

**Esto va primero.** Sin una forma de revertir, cada error de Elisa se vuelve permanente, y ella es quien más va a usar el módulo.

### 2.1 Estado: la reversión ya está construida (22-sep-2026)

`POST /api/financials/receivable-payments/:paymentId/reverse`, con motivo obligatorio y el mismo permiso con que se registra el abono. En la cartera, cada obligación ahora lista sus abonos y cada uno tiene un botón **Revertir**.

Qué hace, en una sola transacción:

- El abono **no se borra**: deja de descontar saldo y queda tachado con su motivo. En la cartera **se oculta por defecto** tras un «Ver 1 abono revertido», para que la vista diaria sea la de lo vigente.
- Si el ingreso lo había creado el propio abono, **se anula**. Si el abono se aplicó sobre un ingreso que ya estaba registrado, **ese ingreso se conserva** y vuelve a quedar disponible para aplicarlo donde corresponda.
- La obligación vuelve a `DEBE` y recupera su saldo.
- Todo queda en la bitácora de auditoría, incluido el vínculo original.

Regla documentada en `AGENTS.md` §8. Contrato en `tests/receivablePaymentReversal.test.js` y en el recorrido de navegador `tests/browser/financialIntegrity.mjs`.

**Lo que sigue pendiente es la limpieza de producción**, que sí requiere decidir con Elisa: cuál era el saldo real de Elvira Utria, y qué hacer con el ingreso suelto de 500 mil que ella registró a mano.

### 2.2 Informe para ver qué quedó mal, antes de tocar nada

`scripts/report-receivable-cleanup.js` (o `npm run financial:cartera-report`) es de **solo lectura**: no corrige, no anula y no marca nada. Lo corre Rodny contra producción y saca una lista para revisar con Elisa.

```bash
npm run financial:cartera-report -- --year 2026 --client "Elvira"
```

Sin argumentos revisa todos los años y todos los clientes. `--abono-minimo` cambia el umbral de «abono sospechosamente pequeño» (por defecto $10.000).

Qué busca:

| Hallazgo | Qué significa |
|---|---|
| **Abonos con importe muy pequeño** | El caso del `500` en vez de `500.000`. Muestra cómo se leería con tres ceros más, sin afirmar que sea eso |
| **Ingresos sin aplicar** | Un ingreso de membresía, servicio o pauta registrado a mano cuyo cliente tiene deuda abierta: el caso de Elvira Utria. Si algún saldo coincide exacto con el importe, lo dice |
| **Cartera descuadrada** | Obligaciones marcadas PAGADO sin abonos suficientes, cubiertas pero todavía en DEBE, o con abonos de más |
| **Ingresos del sistema huérfanos** | Un ingreso que creó un abono que ya no existe: suma como ingreso sin descontar cartera |
| **Posibles duplicados** | Mismo cliente, mismo día, mismo importe. Puede ser legítimo; hay que comparar con el extracto |

El informe **no propone correcciones automáticas**: cada hallazgo dice qué se vio y qué decisión hace falta. La corrección se hace a mano desde la plataforma, con «Revertir» o aplicando el ingreso existente desde «Registrar pago».

Se puede correr **antes** de desplegar la reversión: detecta si las columnas todavía no existen y avisa.

---

## 3. Qué pasó con «registrar pago no se guardó»

Elisa: *«le di registrar pago, pero no se me guardó nunca»* (14:02). Rodny probó en vivo y a él **sí** le guardó (16:00). Entonces no es que el flujo esté roto; es que a ella la rechazó por algo y no quedó claro qué.

El diálogo sí muestra el error ([ReceivablePaymentDialog.jsx:45](src/components/modules/financial/ReceivablePaymentDialog.jsx:45)), así que lo más probable es que sí lo mostró y no se interpretó. Causas posibles, en orden:

| Causa | Qué la dispara |
|---|---|
| `RECEIVABLE_OVERPAYMENT` | El abono de 500.000 supera el saldo que la plataforma tiene registrado para ese cliente |
| `RECEIVABLE_PAYMENT_ACCOUNT_REQUIRED` | No seleccionó la cuenta donde entró la plata |
| Período cerrado | `assertOpenFinancialPeriod` rechaza si el mes está cerrado |
| `RECEIVABLE_PAYMENT_CATEGORY_INVALID` | No eligió si era membresía, servicio o pauta |

**Cómo salir de dudas:** reproducirlo con ella en pantalla, o buscar el error en los logs de Railway a la hora de su intento. No hay que adivinar.

Independiente de la causa: **los mensajes de error de cartera están escritos para un desarrollador, no para una contadora.** «El pago supera el saldo pendiente de la cuenta por cobrar» no le dice qué hacer. Vale la pena reescribirlos.

---

## 4. La cuenta de cobro: lo que hay que construir

Es la pieza central. Rodny se comprometió en la reunión: *«ese como el que está más breve se lo puedo montar hoy»* (29:17).

### 4.1 Lo que hay hoy

`AccountsReceivable` ([schema.prisma](prisma/schema.prisma)) guarda: cliente, monto, periodo, fecha de vencimiento, estado, notas. Se crea desde «Nueva cuenta por cobrar» con exactamente esos campos (19:11). Sirve como registro de deuda, **no como documento**.

### 4.2 Lo que falta

| Campo / función | Por qué | De dónde sale |
|---|---|---|
| **Número consecutivo** | Ella ya lleva una numeración propia de cuentas de cobro | 20:05, 29:06 |
| **Conceptos / líneas** | Fee mensual, y si piden adicionales va como tabla: fee + adicional | 22:06 |
| **IVA sí/no** | *«si se le está cobrando IVA o no a esa persona»* | 20:05 |
| **Generar el PDF** | *«que me arroje el PDF para yo mandarlo al cliente»* | 13:24 |
| **Fecha de emisión libre** | No hay fecha única: unos el 15, otros el 19, otros el 28 o el 30 | 21:17 |
| **Que la cuenta creada se vuelva cartera pendiente** y que los abonos le resten | *«si me debe 2 millones y registro un abono de 1 millón, queda exacto 1 millón»* | 18:51 |

Lo último ya funciona así en el código — `createReceivablePayment` descuenta y cambia el estado a PAGADO cuando llega a cero. Lo que falta es que la **cuenta de cobro** sea la que cree la obligación.

### 4.3 Reglas que dejó claras

- **Ella la crea cada mes, a mano.** No pidió automatización: *«yo creo la factura... lo que cambio es la fecha, el periodo, pero se mantiene el mismo concepto»* (22:44).
- **No le molesta escribir los servicios a mano** (29:34). No hay que construir un catálogo para esto.
- **Si ya mandó la cuenta y piden un adicional, va una cuenta de cobro aparte** solo por el adicional (22:06).
- **Consecutivo:** hay que arrancar desde el número donde ella va. Rodny: *«una vez lo monte, cuadramos para que siga usando el consecutivo»* (29:17). **Si esto se hace mal, se le dañan los números del mes.**

### 4.4 Cotización aprobada → cuenta por cobrar

Rodny lo propuso (22:27). Elisa aceptó **con una condición dura**:

> «Tampoco se puede cobrar sin antes haber firmado el contrato» (23:59)

O sea: la cuenta de cobro **no nace de una cotización aprobada, nace de un contrato firmado**. Si se construye el atajo, tiene que pedir la confirmación de firma. Esto se puede dejar para después; no bloquea nada.

---

## 5. Las vistas que le faltan

### 5.1 «¿Cuántos meses me debe este cliente?»

> «Mi Pueblito me ha pagado hasta junio. Yo entraba al Excel e inmediatamente veía julio y agosto y decía: OK, me deben estos dos meses» (04:48)

Hoy eso no se puede responder de un vistazo. Existe el estado de cuenta por cliente ([financialClientStatementService.js](src/services/financialClientStatementService.js)), pero es un modal paginado detrás de Clientes, y **solo muestra obligaciones que alguien creó**. Si nadie creó la de agosto, agosto no aparece.

**Lo que hace falta:** por cliente, los meses del año con su estado (pagado / debe / parcial) y el total adeudado, visible sin abrir nada.

### 5.2 Cartera: que aparezcan todos

> «Esos no son todos los clientes, esos son los que aparecían en la cartera morosa» / «Deberían aparecerme todos» (13:10, 13:22)

Tiene razón, y la razón de fondo es de diseño: **una cuenta por cobrar solo existe si alguien la creó**. `Client.monthlyFee` existe en la base pero nada genera la obligación mensual a partir de él. Un cliente al día simplemente no aparece.

Esto se resuelve solo si la cuenta de cobro del punto 4 se vuelve la fuente de la obligación, o si se generan las obligaciones del mes a partir del fee.

### 5.3 Edades de cartera: 30 / 60 / 90 días

> «Mira que lo tienen discriminado: a 30 días, a 60, a 90. Cuando un cliente me debe dos o tres meses, ya tengo que hacer recuperación de cartera, no es un cobro normal» (12:52, 12:02)

Hoy `ReceivableStatus` solo tiene `DEBE`, `PAGADO`, `PROMESADO`. No hay antigüedad. Con `dueDate` ya presente se puede calcular; hace falta exponerlo.

### 5.4 Filtro por categoría

> «¿Cómo puedo ver cuáles son mis clientes por fee, cuáles mis ingresos por servicios adicionales, cuáles mis egresos administrativos? ¿Dónde los puedo ver?» (07:50)
> «Que yo pueda escoger qué categoría quiero ver y arriba me muestre el ingreso, el egreso, la bolsa de esa categoría» (10:44)

**Estado: construido el 22-sep-2026.** Las categorías ya existían en la base y cada movimiento ya la llevaba; el backend incluso ya aceptaba el parámetro. Lo único que faltaba era la pantalla.

Cómo quedó:

- Dos desplegables —**Categoría** y **Cuenta**— dentro de la pestaña Movimientos, más un botón «Quitar filtros».
- Arriba de la tabla, cuatro cifras: **ingresos, egresos, saldo y número de movimientos de la selección**. Las suma el servidor sobre toda la selección, no sobre la página: filtrar por «Administrativo» dice cuánto suma esa bolsa completa aunque en pantalla se vean 25 de 62 registros.
- Los indicadores y las gráficas de la parte superior **siguen describiendo el periodo completo**, a propósito: si el gráfico de distribución por categoría se filtrara por una categoría dejaría de tener sentido.

Rodny también pidió filtrar por cuenta, *«pero principalmente categoría»* (10:54): ambos están.

### 5.5 Resumen mensual

> «Cuánto me gasté en la oficina al mes, cuánto me entró por este cliente» (06:33)

Ingresos, egresos y saldo del mes, abiertos por categoría. Existe `FinancialMonthlySummary` pero está atado a un lote de importación, no a los movimientos de la plataforma.

### 5.6 Documentos en un solo lugar

> «Ya toca hacer para que uno, si quiere, pueda verlos todos también en un solo lugar» (03:47)

Los adjuntos por movimiento ya funcionan y Elisa lo confirmó. Falta la vista que los junte.

---

## 6. Lo que pidió y no es del módulo financiero

Estos dos salieron al final y se cruzan con lo que pidió dirección. **Conviene hacerlos con el bloque de cliente, no aquí.**

### 6.1 Fecha de inicio y fin del contrato, con aviso

> «Un cliente de tres meses inició el 20 de septiembre y finaliza el 30 de diciembre. Que nos pueda notificar: miren, faltan 15 días para que terminemos con este cliente» (32:46)

Para qué: renovar, proponer, o hacer el informe de cierre. Y *«para ir organizando los entregables por el periodo contratado»* (32:14).

**Es el mismo campo que pidió dirección** en su reunión: *«la fecha, una definición en la fecha de inicio»* (05:40). Dos personas pidieron lo mismo el mismo día. Va en la ficha de cliente.

### 6.2 Ruta de ingreso de un cliente nuevo

> «Sería chévere que apareciera: ingresó un nuevo cliente y este es el primer paso, y que todos pudiéramos ver... vamos por aquí, falta esto» (30:14)

Un checklist por pasos, visible para proyecto y para administración, que también aplica a renovaciones: contrato nuevo, propuesta, firma. Y la regla: *«no podemos continuar si no firma el contrato»* (31:10). Elisa lo reconoce como una debilidad de la agencia: *«somos muy flexibles en ese sentido»*.

Es un módulo, no un campo. Se parece mucho a los «proyectos especiales» que pidió dirección. **Conviene decidir si son la misma cosa** antes de construir dos.

---

## 7. Decidido: contabilidad formal queda fuera

Elisa explicó el plan único de cuentas (1305 cuentas por cobrar, 4135 ingresos, 24 IVA) y preguntó si hacía falta para configurar la plataforma. Cerraron el tema entre los dos:

> Elisa: «Entonces no nos metamos con eso» (28:44)
> Rodny: «Eso podría ser un final final, cuando todo en la plataforma funcione perfectamente» (28:47)

Ella lleva la contabilidad oficial en **Siigo Contador**, y eso es lo que le mostraría a la DIAN. La plataforma no la reemplaza.

**Nota:** la queja de las reversiones —*«todos los movimientos después son como una reversión, eso da un valor enorme»* (26:14)— es sobre **Siigo**, no sobre la plataforma. Verificado: no hay lógica de reversión en el módulo financiero. No hay nada que arreglar de nuestro lado.

---

## 8. Orden de trabajo

| # | Qué | Por qué en ese orden | Tamaño |
|---|-----|---|---|
| 1 | ✅ **Revertir un abono** — construido el 22-sep. Falta limpiar los dos registros malos de producción | Sin esto cada error de Elisa era permanente | Medio |
| 2 | ✅ **Filtro por categoría y cuenta** en Movimientos, con totales de la selección — construido el 22-sep | El más barato de la lista y ella lo pidió dos veces | **Pequeño** |
| 3 | **Cuenta de cobro con PDF y consecutivo** | Es lo que quita el doble trabajo y lo que dirección llama «cerrar financiero». Rodny ya lo prometió | **Grande** |
| 4 | **Cartera: todos los clientes + meses adeudados + edades 30/60/90** | Se resuelve casi solo si el 3 queda bien | Medio |
| 5 | **Resumen mensual por categoría** | La segunda mitad de «los movimientos no me dicen mucho» | Medio |
| 6 | Mensajes de error en lenguaje de contadora | Barato, evita el próximo «no se me guardó» | Pequeño |
| 7 | Todos los documentos en una vista | Lo pidió de paso, no urge | Pequeño |
| 8 | Fecha inicio/fin de contrato + aviso a 15 días | Va con la ficha de cliente (bloque 1 de dirección) | Pequeño |
| 9 | Ruta de ingreso del cliente | Módulo aparte. Decidir antes si es lo mismo que «proyectos especiales» | Grande |
| 10 | Cotización aprobada → cuenta por cobrar, con contrato firmado | No bloquea a nadie | Pequeño |

---

## 9. Lo que hace falta pedirle a Elisa

Sin esto el punto 3 no arranca:

1. **El modelo de cuenta de cobro.** Dijo *«te voy a pasar el modelo»* (20:35) y luego preguntó si Rodny ya había visto el PDF que mandó (28:19); el ejemplo que revisaron es **la cuenta de cobro de Elvira Utria**. Confirmar que ese es el formato definitivo.
2. **En qué número va el consecutivo hoy**, para arrancar desde ahí y no dañarle la numeración del mes.
3. **Qué clientes llevan IVA y cuáles no.**
4. **La conciliación pendiente.** Ella cargó la información pero *«realmente no verifiqué si era la mía»* (03:23). Hasta que compare contra su Excel, no se sabe si los saldos de la plataforma son correctos. Esto es el paso 4 de «Antes de publicar» en [FINANCIAL_ROADMAP.md](docs/FINANCIAL_ROADMAP.md) y sigue abierto.
5. **Confirmar el caso Elvira Utria**: cuál era el saldo real y por qué la rechazó el sistema.

Hay una urgencia de calendario: ella dijo *«todavía no he mandado las cuentas de cobro de septiembre»* (06:01) y *«para mandar las cuentas de cobro de este mes»* (29:29). Si la funcionalidad no está a tiempo, las de septiembre salen en Word otra vez y el consecutivo se mueve.
