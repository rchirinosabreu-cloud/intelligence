# Publicación automática en Instagram y Facebook

Rodny, 29 de septiembre de 2026: «quiero reemplazar el trabajo de un community manager en el sentido de publicar: el diseñador diseñó, las piezas están aprobadas, y que se publique en la cuenta de ese cliente con su caption en las fechas y horas establecidas».

## Cómo funciona

1. Un administrador conecta la página de Facebook del cliente (y su Instagram profesional vinculado) desde **Clientes → ficha del cliente → Redes conectadas**. No pega ningún token: el servidor lista las páginas que administra el usuario del sistema de Meta de Brain Studio y guarda el token de página cifrado (`ClientSocialAccount`).
2. En la parrilla, cada pieza tiene ahora **Hora** (reloj de Bogotá, `ContentItem.publishTime`) junto a la fecha. Al pie de la tarjeta está la banda **Publicación en redes**: una fila por red conectada y el botón **Programar**. Nada sale solo por estar aprobado.
3. Programar crea una fila de `SocialPublication` por red, `SCHEDULED` para el día de la pieza a esa hora. Antes comprueba todo lo que impide salir (`schedulingProblems` en `src/lib/socialPublishing.js`, la misma regla en la pantalla y en el servidor) y lo dice de una vez: pieza no aprobada, sin hora, hora pasada, sin pieza final, enlace de Drive, archivo fuera de los límites de Meta, red sin conectar, texto de más de 2.200 caracteres, historia hacia Facebook.
4. Un cron (`initSocialPublishingScheduler`, cada minuto) reclama las filas vencidas por **compare-and-set** (`leaseToken`, como las revisiones de Bria: dos réplicas nunca publican la misma pieza), firma una URL de lectura del archivo (una hora; Meta descarga desde ahí) y pide a Meta que publique (`metaGraphService.js`, Graph API v25.0). La fila queda `PUBLISHED` con el enlace; cuando a la pieza no le queda ninguna red pendiente **ni fallida**, pasa a `PUBLICADO` (una red `CANCELLED` sí deja pasar: fue una decisión, no un fallo). El lease dura 30 minutos porque un carrusel con videos espera a Meta hasta ocho minutos por archivo.
5. Un fallo transitorio (5xx, 429, límite de Meta, red) vuelve a la cola con espera de 2, 4 minutos y al tercero queda `FAILED`. Un fallo permanente (token vencido, permiso, archivo rechazado) queda `FAILED` de inmediato con su motivo en español (`humanizeMetaError`); un token vencido además apaga la cuenta conectada para que la ficha pida reconectar. Quien programó recibe `SOCIAL_PUBLICATION_PUBLISHED` o `SOCIAL_PUBLICATION_FAILED`.
6. **Nunca dos veces.** Justo antes de la llamada que publica de verdad (`media_publish` en Instagram; la foto, el video o el post del feed en Facebook) se escribe `publishRequestedAt` (`beforePublish` del cliente de Meta). Si después de esa marca la respuesta se pierde, no se sabe si Meta publicó: la fila queda `FAILED` con «Meta recibió la orden de publicar pero no confirmó el resultado. Revisa la cuenta antes de reintentar» y nadie la repite sola; lo mismo si otra réplica recoge una fila con lease vencido que ya había mandado publicar. Crear contenedores y esperar a que Meta los procese sí se repite sin consecuencias.
7. Cambiar el día o la hora de la pieza mueve sus filas programadas; quitar la hora, o ponerla en el pasado, las cancela diciendo por qué (mover al pasado no puede publicar en el acto). Desconectar una cuenta cancela lo programado en ella; lo ya publicado no se toca. Conectar una página **sin** Instagram apaga el Instagram de la página anterior y cancela lo suyo: si siguiera vivo, la parrilla lo ofrecería y una pieza saldría en el perfil equivocado.

## Qué le pedimos a Meta según el formato

| Formato | Meta (`media_type`) | Archivos |
|---|---|---|
| Post con una imagen | imagen del feed | 1 JPG/PNG ≤ 8 MB, proporción 4:5 a 1.91:1 |
| Post con varios archivos, Carrusel | `CAROUSEL` | 2 a 10 imágenes o videos |
| Reel, Video, Post con un video | `REELS` | 1 MP4/MOV ≤ 300 MB, 3 s a 15 min |
| Historia | `STORIES` (solo Instagram) | 1 imagen o video ≤ 100 MB (video ≤ 60 s) |

En Facebook: foto → `/{page}/photos`, video → `/{page}/videos`, varias fotos → fotos sin publicar + `/{page}/feed` con `attached_media`. Facebook no publica historias por la API.

## PNG y proporción: la plataforma hace lo que hace Business Suite (Rodny, 30 de septiembre de 2026)

El equipo exporta en PNG y publica desde Meta Business Suite, que convierte a JPEG por dentro sin decirlo. La API de Instagram no: solo acepta JPEG ([referencia](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)) y a un PNG contesta «Only photo or video can be accepted as media type»; en el feed rechaza además lo que se sale de 4:5–1.91:1. Facebook sí acepta PNG.

Por eso, justo antes de publicar en Instagram, `socialImageDerivativeService.js` prepara **una copia** (`…/final-assets/derived/<id>-instagram.jpg`, junto al original): PNG → JPEG sRGB de calidad 92 con la transparencia en blanco, y si la proporción del feed se sale del rango, **margen blanco hasta el borde más cercano, nunca recorte** (`instagramImagePlan`, regla pura en `src/lib/socialPublishing.js`). Las historias solo cambian de formato. La copia se escribe una vez y se reutiliza; el original de la parrilla no se toca y Facebook recibe el original. Lo hace `sharp`, con binarios precompilados que `npm ci --ignore-scripts` instala sin compilar. Contrato: `tests/socialImageDerivative.test.js` (incluye una conversión real con `sharp`).

## Facebook, auditado contra la referencia de Meta (1 de octubre de 2026)

La frase de arriba «Facebook sí acepta PNG» era media verdad. `/{page-id}/photos` acepta JPEG, BMP, PNG, GIF y TIFF, pero **ningún archivo de más de 4 MB**, y recomienda PNG de hasta 1 MB. Por eso Facebook recibe también su propia copia (`derived/<id>-facebook.jpg`, `facebookImagePlan`), comprimida por pasos hasta caber; la de Instagram se comprime igual hasta 8 MB, así que **el peso de una imagen ya no bloquea la programación**. Y **un post de varias fotos no lleva video**: un carrusel mixto sale en Facebook solo con las fotos (`facebookMedia`), y la banda lo avisa antes de programar (`schedulingNotices`); un carrusel de solo videos hacia Facebook se bloquea. Contrato: `tests/socialFacebookMedia.test.js`.

**El calendario de Meta.** Instagram no tiene programación por API (la referencia de `POST /{ig-user-id}/media` no trae ningún parámetro para ello), así que nada programado aquí aparece en el planificador de Business Suite antes de salir. Facebook sí la tiene (`published=false` + `scheduled_publish_time`, entre 10 minutos y 30 días según la guía de la API de páginas; la referencia de `/feed` dice 75). Se decidió **no** usarla todavía: daría un calendario a medias, con Facebook y sin Instagram. El calendario cierto es el de la parrilla.

## El orden de los archivos es el orden del carrusel (Rodny, 1 de octubre de 2026)

El publicador lee los archivos de la pieza por `position` en el momento de publicar: lo que la tarjeta muestra es lo que sale. Un archivo nuevo entra al final, así que al reemplazar una lámina del medio quedaba de última. Ahora cada miniatura lleva su número de puesto y, al editar, **se arrastra a su sitio**: una línea cian marca de qué lado va a quedar, y al soltar se queda ahí, atenuada, mientras el servidor guarda; si el servidor dice que no, vuelve a donde estaba y sale el motivo. El orden se guarda con `PUT /api/content/items/:id/final-assets/order` (`reorderContentItemFinalAssets`: exige la lista completa, sin repetidos ni ajenos, y reescribe todas las posiciones en una transacción). Contrato: `tests/finalAssetOrder.test.js`.

La primera versión traía dos botones por miniatura («Mover antes» / «Mover después») y Rodny la devolvió el mismo día: «no me gusta así, prefiero drag and drop». Es el arrastre del navegador (`FinalAssetGrid` en `ContentPlanDetail.jsx`) y no `@hello-pangea/dnd`, que solo ordena listas en una dirección y esto es una rejilla que da la vuelta. Soltar sobre una miniatura ocupa su puesto y corre las demás (`moveAssetToIndex`). Quien no puede arrastrar enfoca el número de puesto y usa las flechas (`moveAssetId`).

Cambiar un archivo **no** exige cancelar la programación: basta con que el correcto esté cargado a la hora. Para ganar tiempo se mueve la hora de la pieza (la cola la sigue) o se pulsa «Cancelar» en la fila de la red.

Lo que Meta **no** deja hacer por API, y sigue siendo manual: música del catálogo de Instagram, stickers de historias (enlace, encuesta), etiquetar productos. Meta tampoco guarda publicaciones programadas: por eso la hora vive aquí. Límite: 100 publicaciones por cuenta de Instagram cada 24 horas.

## Lo que hay que configurar fuera de la plataforma

- Business Manager de Brain Studio verificado, con una **app de tipo Business** y un **usuario del sistema** con los permisos `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` y `business_management`.
- Cada cliente da a Brain Studio acceso de socio sobre su página y su Instagram profesional (que debe estar vinculado a esa página).
- El token del usuario del sistema (sin vencimiento) va en `META_SYSTEM_USER_TOKEN` en Railway. Sin él, «Conectar página» explica que falta y nada publica.
- El bucket de piezas finales sigue privado: Meta descarga por URL firmada (`createSignedDownload`), nunca por una URL pública.

## Lo que todavía no hace (siguiente fase)

- Un **enlace de Drive** como pieza final no se publica solo: Meta no puede descargar de Drive. `schedulingProblems` lo dice al programar. Falta copiar el archivo al almacenamiento justo antes de publicar.
- Programar un mes entero de una vez; hoy es pieza por pieza, a propósito, hasta ver el primer mes publicado.
- Un interruptor general para pausar el publicador sin tocar el código.

## Verificación

Contratos: `tests/socialPublishing.test.js` (regla pura), `tests/metaGraphClient.test.js` (qué se le pide a Meta), `tests/socialPublishingService.test.js` (cola, lease, reintentos, `PUBLICADO`), `tests/socialAccountService.test.js`, `tests/socialPublishingRoutes.test.js`, `tests/socialPublishingUi.test.js`. Muestra local sin backend: `tests/fixtures/social-publishing-preview.html` (configuración `social-preview` en `.claude/launch.json`). Esquema: `scripts/ensure-social-publishing-schema.js`, encadenado en `start`.
