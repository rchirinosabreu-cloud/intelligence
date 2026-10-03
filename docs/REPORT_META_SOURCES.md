# Cifras de Meta en Reportes

Decisión de Rodny, 2 de octubre de 2026: «¿no podríamos hacer eso consultando directamente el Meta
Business del cliente y obteniendo de allí las cifras?» — «sí, arranca por Instagram y pauta, pero no
eliminemos la opción que tenemos actualmente de subir los pantallazos».

## Qué cambia para quien arma el informe

En Reportes, debajo de las capturas, aparece **Cifras de Meta** al elegir el cliente:

- **Instagram**: las cuentas que el cliente ya tiene conectadas para publicar (ficha del cliente →
  «Redes conectadas»). Se marca una.
- **Facebook** (desde el mismo 2 de octubre: «ahora añadamos las cifras de Facebook»): la página que el
  cliente ya tiene conectada. Se marca una.
- **Pauta**: la cuenta publicitaria del cliente. Un administrador o project manager la vincula una vez
  con el «+» y queda para todos sus informes. Se marca una.

Nada viene marcado. El botón dice lo que va a hacer: «Leer capturas», «Traer cifras de Meta» o «Leer
capturas y traer cifras». **Subir capturas sigue igual** y se puede combinar con lo que llega de Meta.

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
| Facebook: visualizaciones, interacciones, reproducciones de video, visitas, clics en el contacto y el botón | Sí, con `read_insights` | Se piden día a día y se suman. Meta no cuenta en las interacciones las de los reels |
| Facebook: nuevos seguidores y quienes dejaron de seguir | Sí | Meta los marca como estimación |
| Facebook: total de seguidores | Sí | El del **último día del período** que Meta tiene, no el de hoy |
| Facebook: espectadores de la página (personas distintas) | Sí | Para el período exacto, con `period=total_over_range` (`until` exclusivo). Si Meta no lo da, se avisa; nunca se suman los días |
| Facebook: cada publicación del período | Sí, hasta 60 | Reacciones, comentarios y compartidos vienen de la publicación; visualizaciones, espectadores y clics, de sus estadísticas, acumulados |
| Resultados y costo por resultado de la pauta | **Todavía no** | Dependen del objetivo de cada campaña; se añaden cuando se defina cómo leerlos |

`impressions` ya no existe en Instagram (Meta la retiró en abril de 2025): es `views`. Los nombres de las
métricas cambian con las versiones; **antes de tocar una consulta se lee la referencia, no se adivina**.

## Facebook: lo que hay que saber

- **Permiso**: las estadísticas de una página exigen `read_insights` además de `pages_read_engagement`.
  **Sin el permiso Meta no da error: responde una lista vacía.** Por eso una página que no entrega ninguna
  cifra queda como fuente pendiente con el motivo escrito («le falta el permiso… o la página tiene menos
  de 100 "me gusta"»), nunca como un informe de ceros.
- **La llave de la página se pide a Meta en el momento** con la de la agencia (`getPageToken`). La que se
  guardó al conectar la página se emitió con los permisos de ese día; así no hay que reconectar a ningún
  cliente cuando se añade un permiso.
- **Nombres**: los de la referencia de Page Insights v26 (`page_media_view`, `page_post_engagements`,
  `page_video_views`, `page_views_total`, `page_total_actions`, `page_daily_follows_unique`,
  `page_daily_unfollows_unique`, `page_follows`; por publicación `post_media_view`,
  `post_total_media_view_unique`, `post_clicks`). `page_impressions_unique`, `page_fans` y
  `post_impressions_unique` **ya no existen**: Meta responde error 100.
- **Días**: Meta marca cada valor diario con el final de su día (medianoche del Pacífico). Se piden tramos
  de 88 días con dos de margen —el tope son 90— y solo se cuentan los días de cada tramo: el margen de un
  tramo cae dentro del siguiente y, contado dos veces, inflaría el total. Los días son los de Meta, no los
  de Bogotá: en los bordes del período puede haber unas horas de diferencia con Meta Business Suite.
- **Espectadores del período exacto**: `page_total_media_view_unique` con `period=total_over_range`, `since`
  el primer día y `until` **el día siguiente al último** (comprobado: 1→2 de septiembre devuelve el día 1;
  1→1 de octubre devuelve septiembre entero, 642 personas en la página de la agencia).
- **Una publicación trae algunas métricas dos veces**: acumulada (`lifetime`) y por día con ceros. Solo
  vale la acumulada; la segunda pisaba a la primera y 917 visualizaciones salían con 0 espectadores.
- Las páginas con menos de 100 «me gusta» no tienen estadísticas (límite de Meta).
- Comprobado con datos reales el 2 de octubre de 2026 (página de la agencia, septiembre): 1.400
  visualizaciones, 642 espectadores, 145 interacciones, 363 seguidores al cierre, 7 publicaciones con
  estadísticas; los valores diarios suman lo mismo que `total_over_range` (1.400).

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

**Muchos clientes no tienen cuenta propia y se usa la de Francisco Villa** (Rodny, 2 de octubre de 2026):
se vincula esa misma cuenta a cada cliente con su palabra. Para no adivinar, el diálogo muestra, al
escribir la palabra, qué campañas de los últimos 90 días entrarían y cuáles quedarían fuera
(`GET /api/reports/meta/ad-accounts/:id/campaigns`, `splitCampaigns`: la misma regla del informe,
sin tildes ni mayúsculas). Comprobado con la cuenta real: 13 campañas, «Titanes» entra 2, «pueblito» 3
(también «BRAIN_NEWPUEBLITO_…»), «Endova» ninguna. **Las campañas deben llevar el nombre del cliente**:
una sin él queda fuera; una de otro cliente que lo lleve entraría.

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
| `src/routes/api/reportEvidenceRoutes.js` | `POST /api/reports/extract-metrics` acepta `metaInstagramAccountId`, `metaFacebookAccountId` y `metaAdAccountId`; las capturas pasan a ser opcionales cuando hay Meta |
| `src/components/reports/ReportMetaSources.jsx` | El bloque «Cifras de Meta» |
| `ClientAdAccount` | La cuenta publicitaria por cliente y su filtro. Sin llaves. Aditiva con `scripts/ensure-social-publishing-schema.js` |

- **Llaves**: Instagram se lee con la llave de la página del cliente (la misma de publicar, cifrada en
  `ClientSocialAccount`); la pauta, con `META_SYSTEM_USER_TOKEN`. Ninguna viaja al navegador ni queda en
  el comprobante.
- **Comprobante**: la respuesta de Meta se guarda como `…-cifras-de-meta.json` junto a los archivos del
  cliente y su ruta es el `storagePath` de la fuente. Si no se puede guardar, las cifras no se usan.
- **Fallos**: una cuenta que Meta niega queda en «Revisión pendiente» con su motivo (`humanizeMetaReadError`);
  la otra cuenta y las capturas siguen. Pedir la cuenta de otro cliente se rechaza (422).
- **Un informe, una cuenta de cada tipo** (una de Instagram, una página, una de pauta): dos cuentas de Instagram en el mismo informe darían dos cifras
  para el mismo indicador y la conciliación las marcaría como conflicto. Un cliente con varias cuentas
  (PromoGroup y Endova) hace un informe por cuenta.
- **Permisos**: todo bajo el permiso de Reportes; vincular o desvincular la cuenta publicitaria es de
  administradores y project managers.
- **Privacidad**: solo estadísticas agregadas; nunca seguidores, mensajes ni comentarios. Política de
  tratamiento de datos 2.3 (sección 11).

## Lo que falta

- **Resultados de la pauta** (mensajes, clientes potenciales, compras) y su costo.
- **La llave vence para datos el 30 de diciembre de 2026**: la misma renovación que necesita la publicación.
- Las cuentas de Instagram sin página de Facebook visible para la llave (Nattal) no aparecen: primero hay
  que conectarlas en la ficha del cliente.

## Pruebas

- `tests/metaReportSources.test.js`, `tests/metaFacebookSources.test.js`, `tests/metaInsightsService.test.js`, `tests/metaReportService.test.js`,
  `tests/reportEvidenceRoutes.test.js`, `tests/reportMetaRoutes.test.js`, `tests/reportMetaUi.test.js`.
- Recorrido en navegador con capturas, sin llamar a Meta: `node tests/browser/reportMetaSources.mjs`
  (deja `output/reportes-meta-*.png`).
- Lo comprobado con datos reales fue de solo lectura y sobre la cuenta de la propia agencia. La primera
  consulta sobre la cuenta de un cliente ocurre cuando alguien arma su informe en producción.
