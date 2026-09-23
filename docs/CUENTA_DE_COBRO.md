# Cuenta de cobro

Lo que Elisa manda hoy al cliente en Word, hecho desde la plataforma. Sale de la
reunión del 21 de septiembre de 2026 y de las dos cuentas de cobro reales que Rodny
pasó el 22: la **No. 0366** (Elvira Utria, un solo concepto) y la **No. 0389**
(Corporación Deportiva Los Titanes, con tabla de conceptos).

## Qué es, y qué no

La firma **Francisco Villa como persona natural**, no Brain Studio como empresa. Eso es
lo que la hace cuenta de cobro y no factura, y por eso **nunca lleva IVA**. El único
sitio donde el impuesto aparece en la reunión es la pantalla de Siigo, el programa
contable de Elisa, colgando del caso «factura electrónica»: ese es el otro camino.

## De dónde sale cada dato

| En el documento | De dónde viene |
| --- | --- |
| Ciudad, quien cobra, su cédula, la cuenta bancaria, la firma | `receivableIssuer(env)` en `src/lib/receivableDocument.js`. Se puede cambiar por entorno (`RECEIVABLE_ISSUER_*`) sin tocar el código. |
| Nombre y documento del deudor | La ficha del cliente: `legalName`, `documentType`, `documentNumber`. Se escriben una vez en Clientes. |
| Número | `AccountsReceivable.number`. |
| Concepto, viñetas, periodo del servicio | Lo que se escribe al emitir; queda congelado en la obligación. |
| Conceptos y valores | `ReceivableItem`, que suman exactamente el total. |

Una cuenta de cobro con el nombre corto del equipo no sirve para cobrar, así que sin
nombre legal y documento **no se emite**. Ese dato se escribe **una sola vez**, pero
desde cualquiera de los dos lados (Rodny, 23 de septiembre de 2026):

- En **Clientes → «⋯» → Editar Cliente**, por adelantado.
- En el propio **diálogo de emitir**, cuando la ficha todavía no lo tiene: los tres
  campos aparecen arriba y **quedan guardados en la ficha** al emitir, en la misma
  transacción y con su evento de auditoría. No hay que abandonar el documento a medio
  hacer para ir a buscarlo a otra pantalla.

Si la ficha **ya está identificada**, el diálogo no la pregunta y el servidor **no la
reescribe** aunque se le mande: emitir un cobro no es el sitio para cambiarle el nombre
legal a un tercero. Sin identidad y sin escribirla, el servicio responde
`RECEIVABLE_CLIENT_IDENTITY_MISSING` nombrando al cliente y los dos sitios; una
identidad a medias o mal escrita responde `RECEIVABLE_CLIENT_IDENTITY_INVALID` y no
guarda nada.

La reciprocidad va también en el otro sentido: **una cuenta por cobrar puede crear la
ficha del cliente** en el mismo acto («Crear uno nuevo» en «Nueva cuenta por cobrar»).
La ficha se crea dentro de la transacción del cobro —o quedan las dos cosas, o
ninguna— con su evento de auditoría.

## El consecutivo

La numeración es de Elisa y **viene de fuera de la plataforma**: su última cuenta de
cobro en Word es la 392, así que la primera de aquí es la 393
(`RECEIVABLE_NUMBER_START`, por defecto `RECEIVABLE_NUMBER_START_DEFAULT`). No se usa
una secuencia de la base porque una que arranque en 1 le rompe su consecutivo en
silencio. `nextReceivableNumber` parte del número más alto ya emitido y **nunca
retrocede ni reutiliza un hueco**; la columna es `@unique` y dos procesos a la vez se
resuelven con `RECEIVABLE_NUMBER_TAKEN`, nunca duplicando.

## Emitir

`POST /api/financials/receivables/:id/issue`, con permiso de escritura de Financiero.
Dentro de una transacción `Serializable`: pone número y fecha, congela concepto, periodo
y conceptos, y **ajusta el importe de la obligación al total del documento** — lo que se
le manda al cliente y lo que queda en cartera tienen que ser la misma cifra. Una
obligación con abonos aplicados que no cuadran con ese total no se emite
(`RECEIVABLE_ALREADY_PAID_PARTIALLY`).

**Una cuenta ya emitida no se reedita.** Si el cliente pide algo después, va otra cuenta
de cobro aparte, que es como se trabaja hoy.

## El PDF

Se genera **al emitir** y se guarda en el bucket `financial-evidence`, con clave
`receivables/<id>/cuenta-de-cobro-<número>.pdf`. Así el documento queda congelado tal
como se mandó, aunque después cambie la plantilla o el nombre en la ficha del cliente.

Va **fuera de la transacción** a propósito: subir al bucket es una llamada de red y no
se tiene un candado abierto esperándola. Y **no tumba la emisión**: si el
almacenamiento falla, la cuenta de cobro ya tiene su número —que no vuelve atrás— y
decir que no se emitió sería mentira. Se avisa por consola y la descarga lo reintenta.

Con un solo concepto el documento **no lleva tabla**, como el de Elvira Utria; con dos
o más la lleva, como el de Titanes.

`GET /api/financials/receivables/:id/document` lo sirve, con permiso de lectura de
Financiero y **solo por la API autenticada**, nunca por una URL pública del bucket, como
el resto de los documentos financieros. Sirve el guardado si se puede leer; si no —no
está, o el bucket no responde— lo regenera y aprovecha para guardarlo, porque el equipo
no puede quedarse sin el documento de un cobro que ya está emitido. `?download=1` lo
baja en vez de abrirlo.

## Eliminar una obligación

Una cuenta por cobrar tecleada por error, o de prueba, **se puede eliminar** (Rodny, 23
de septiembre de 2026): no es evidencia de nada y no tiene por qué quedarse para
siempre. `DELETE /api/financials/receivables/:id`, con el mismo permiso de escritura
con que se crea, en una transacción `Serializable`.

Se borra de verdad —la fila y sus conceptos—, pero **el evento de auditoría conserva la
obligación entera** en su `before`: número, conceptos, abonos revertidos y todo, con su
actor y su motivo opcional. Si tenía cuenta de cobro emitida, **su PDF no se borra** del
bucket, que no tiene ruta de borrado, y **su número vuelve a quedar libre** para la
siguiente, porque el consecutivo se calcula desde el más alto emitido.

La única puerta cerrada es tener **abonos vigentes**: ahí sigue habiendo dinero
apuntando a la obligación y borrarla dejaría ese ingreso colgando. El error
(`RECEIVABLE_HAS_PAYMENTS`) nombra la salida: revertirlos con «Revertir», en la propia
cartera. Un abono ya revertido no impide nada.

El diálogo dice antes qué se pierde: el importe, el cliente, el periodo y, si está
emitida, su número y que el que recibió el cliente deja de existir aquí.

## La firma

La rúbrica escaneada de Francisco Villa (`src/assets/firma-francisco-villa.png`,
recortada y con fondo transparente) va sobre el nombre, y el documento sale firmado.

**Una rúbrica es de una persona concreta.** Si se cambia quién cobra con
`RECEIVABLE_ISSUER_NAME` y no se pone su propia firma en
`RECEIVABLE_ISSUER_SIGNATURE_IMAGE`, el documento sale **sin firmar**, con el hueco en
blanco para firmar a mano: estampar la firma de Francisco bajo el nombre de otro
convertiría el cobro en un documento firmado por quien no lo firmó. Una firma que no
se puede leer tampoco impide emitir; deja el mismo hueco y se avisa por consola.

## Verificación

- `tests/receivableDocumentService.test.js`: numeración, cuadre de conceptos, una sola
  emisión, periodo cerrado, concurrencia.
- `tests/receivableDocumentPdf.test.js`: el documento comprobado contra la cuenta real
  0389, la tabla solo con más de un concepto, la firma —y que un emisor cambiado por
  entorno sin la suya salga sin firmar—, el guardado al emitir, que un fallo del
  almacenamiento no tumbe la emisión, y que la descarga sirva el PDF congelado y lo
  regenere si no se puede leer.
- `npm run preview:cuenta-de-cobro` escribe en `output/` las dos muestras —con tabla y
  sin ella— para mirar la plantilla sin emitir nada. No toca la base ni el bucket.
