# Cifras de Meta en Reportes

Decisión de Rodny, 2 de octubre de 2026: «¿no podríamos hacer eso consultando directamente el Meta
Business del cliente y obteniendo de allí las cifras?» — «sí, arranca por Instagram y pauta, pero no
eliminemos la opción que tenemos actualmente de subir los pantallazos».

## Qué cambia para quien arma el informe

En Reportes, debajo de las capturas, aparece **Cifras de Meta** al elegir el cliente:

- **Instagram**: las cuentas que el cliente ya tiene conectadas para publicar (ficha del cliente →
  «Redes conectadas»). Se marca una.
- **Pauta**: la cuenta publicitaria del cliente. Un administrador o project manager la vincula una vez
  con el «+» y queda para todos sus informes. Se marca una.

Nada viene marcado. El botón dice lo que va a hacer: «Leer capturas», «Traer cifras de Meta» o «Leer
capturas y traer cifras». **Subir capturas sigue igual** y se puede combinar (por ejemplo: Instagram y
pauta desde Meta, Facebook con capturas).

El informe que sale es el de siempre: revisión, análisis, emisión y PDF. Las fuentes de Meta se llaman
«Instagram @cuenta · cifras de Meta», «Publicaciones de @cuenta · cifras de Meta» y «Pauta «cuenta» ·
cifras de Meta», y no ofrecen «Ver captura original» porque no hay captura: su comprobante es la
respuesta de Meta, guardada tal cual.

## Qué entrega Meta y qué no

Leído en la referencia de Meta (Graph API v25.0) y comprobado con la cuenta de la propia agencia el 2 de
octubre de 2026.

| Dato | Llega | Nota |
| --- | --- | --- |
| Visualizaciones, interacciones, me gusta, comentarios, compartidos, guardados, visitas al perfil, clics al sitio | Sí | Se suman por tramos si el período pasa de 30 días |
| Alcance y cuentas que interactuaron | Solo hasta 30 días | Son personas distintas: sumar tramos contaría dos veces a la misma. Con más de 30 días **no se incluyen** y se avisa |
| Nuevos seguidores y quienes dejaron de seguir | Sí, si Meta los da | Las cuentas pequeñas no los reciben; el resto del informe sale igual |
| Total de seguidores | Sí | Es el del momento de la consulta, **no** el del cierre del período. La evidencia lo dice |
| Por formato (Reels, publicaciones, historias) | Sí | Las filas «anuncio» e «IGTV» se descartan |
| Cada publicación del período | Sí, hasta 60 | La cifra es **acumulada** desde que salió, no la del período. Las historias solo conservan cifras 24 horas |
| Comparación con el período anterior | Sí | Los mismos días justo antes, como compara Meta Business Suite |
| Pauta: inversión, impresiones, alcance, clics, clics en el enlace, CTR, CPC, CPM | Sí | En la moneda de la cuenta publicitaria, sin convertir |
| Pauta por campaña y por anuncio | Sí | Los 25 de mayor inversión; si hay más, se avisa |
| Facebook orgánico (página) | **Todavía no** | La llave no tiene el permiso `read_insights`; se sigue subiendo con capturas |
| Resultados y costo por resultado de la pauta | **Todavía no** | Dependen del objetivo de cada campaña; se añaden cuando se defina cómo leerlos |

`impressions` ya no existe en Instagram (Meta la retiró en abril de 2025): es `views`. Los nombres de las
métricas cambian con las versiones; **antes de tocar una consulta se lee la referencia, no se adivina**.

## Una cuenta publicitaria no es un cliente

La cuenta publicitaria de la agencia lleva campañas de varios clientes (en septiembre de 2026: Titanes,
New Pueblito y Pablo Hoff). Por eso el vínculo guarda, además de la cuenta, **las palabras que distinguen
las campañas del cliente** («Solo las campañas cuyo nombre contiene…», sin distinguir mayúsculas ni
tildes). Vacío cuenta la cuenta entera, que es lo correcto cuando la cuenta es solo del cliente.

Con filtro, el total **se le pide a Meta** para esas campañas (`filtering` por `campaign.id`, operador
`IN`), no se suma de las filas: el alcance de dos campañas sumado contaría dos veces a quien vio las dos.
Comprobado con datos reales el 2 de octubre de 2026 (septiembre, campañas con «Titanes» en el nombre):
Meta devolvió inversión 377.045 y alcance **57.460** para el conjunto; la suma de los alcances de sus dos
campañas daba 62.790. En la cuenta entera, 66.982 frente a 73.982 sumando filas.

Cada cifra filtrada lo dice en su evidencia («solo las campañas cuyo nombre contiene «…»»), para que un
total parcial nunca pase por el de la cuenta entera. Si ninguna campaña coincide o no hubo inversión, el
informe sale sin pauta de Meta y lo avisa; no pone una fila de ceros.

## Por dónde pasa

| Pieza | Qué hace |
| --- | --- |
| `src/lib/metaReportSources.js` | Lógica pura: tramos de 30 días, período anterior, respuestas de Meta → fuentes, mensajes de error en español |
| `src/services/metaInsightsService.js` | Las consultas a Meta. Solo lee. La llave va en la cabecera `Authorization`, nunca en la dirección |
| `src/services/metaReportService.js` | Qué cuentas tiene el cliente, vínculo de la cuenta publicitaria, y las fuentes de un período |
| `src/routes/api/reportMetaRoutes.js` | `GET /api/reports/meta/sources`, `GET /ad-accounts/available`, `POST` y `DELETE /ad-accounts` |
| `src/routes/api/reportEvidenceRoutes.js` | `POST /api/reports/extract-metrics` acepta `metaInstagramAccountId` y `metaAdAccountId`; las capturas pasan a ser opcionales cuando hay Meta |
| `src/components/reports/ReportMetaSources.jsx` | El bloque «Cifras de Meta» |
| `ClientAdAccount` | La cuenta publicitaria por cliente y su filtro. Sin llaves. Aditiva con `scripts/ensure-social-publishing-schema.js` |

- **Llaves**: Instagram se lee con la llave de la página del cliente (la misma de publicar, cifrada en
  `ClientSocialAccount`); la pauta, con `META_SYSTEM_USER_TOKEN`. Ninguna viaja al navegador ni queda en
  el comprobante.
- **Comprobante**: la respuesta de Meta se guarda como `…-cifras-de-meta.json` junto a los archivos del
  cliente y su ruta es el `storagePath` de la fuente. Si no se puede guardar, las cifras no se usan.
- **Fallos**: una cuenta que Meta niega queda en «Revisión pendiente» con su motivo (`humanizeMetaReadError`);
  la otra cuenta y las capturas siguen. Pedir la cuenta de otro cliente se rechaza (422).
- **Un informe, una cuenta de cada tipo**: dos cuentas de Instagram en el mismo informe darían dos cifras
  para el mismo indicador y la conciliación las marcaría como conflicto. Un cliente con varias cuentas
  (PromoGroup y Endova) hace un informe por cuenta.
- **Permisos**: todo bajo el permiso de Reportes; vincular o desvincular la cuenta publicitaria es de
  administradores y project managers.
- **Privacidad**: solo estadísticas agregadas; nunca seguidores, mensajes ni comentarios. Política de
  tratamiento de datos 2.3 (sección 11).

## Lo que falta

- **Facebook orgánico**: añadir `read_insights` a la llave y leer la referencia vigente de las métricas de
  página (los nombres cambiaron).
- **Resultados de la pauta** (mensajes, clientes potenciales, compras) y su costo.
- **La llave vence para datos el 30 de diciembre de 2026**: la misma renovación que necesita la publicación.
- Las cuentas de Instagram sin página de Facebook visible para la llave (Nattal) no aparecen: primero hay
  que conectarlas en la ficha del cliente.

## Pruebas

- `tests/metaReportSources.test.js`, `tests/metaInsightsService.test.js`, `tests/metaReportService.test.js`,
  `tests/reportEvidenceRoutes.test.js`, `tests/reportMetaRoutes.test.js`, `tests/reportMetaUi.test.js`.
- Recorrido en navegador con capturas, sin llamar a Meta: `node tests/browser/reportMetaSources.mjs`
  (deja `output/reportes-meta-*.png`).
- Lo comprobado con datos reales fue de solo lectura y sobre la cuenta de la propia agencia. La primera
  consulta sobre la cuenta de un cliente ocurre cuando alguien arma su informe en producción.
