# Publicación automática en Instagram y Facebook

Rodny, 29 de septiembre de 2026: «quiero reemplazar el trabajo de un community manager en el sentido de publicar: el diseñador diseñó, las piezas están aprobadas, y que se publique en la cuenta de ese cliente con su caption en las fechas y horas establecidas».

## Cómo funciona

1. Un administrador conecta la página de Facebook del cliente (y su Instagram profesional vinculado) desde **Clientes → ficha del cliente → Redes conectadas**. No pega ningún token: el servidor lista las páginas que administra el usuario del sistema de Meta de Brain Studio y guarda el token de página cifrado (`ClientSocialAccount`).
2. En la parrilla, cada pieza tiene ahora **Hora** (reloj de Bogotá, `ContentItem.publishTime`) junto a la fecha. Al pie de la tarjeta está la banda **Publicación en redes**: una fila por red conectada y el botón **Programar**. Nada sale solo por estar aprobado.
3. Programar crea una fila de `SocialPublication` por red, `SCHEDULED` para el día de la pieza a esa hora. Antes comprueba todo lo que impide salir (`schedulingProblems` en `src/lib/socialPublishing.js`, la misma regla en la pantalla y en el servidor) y lo dice de una vez: pieza no aprobada, sin hora, hora pasada, sin pieza final, enlace de Drive, archivo fuera de los límites de Meta, red sin conectar, texto de más de 2.200 caracteres, historia hacia Facebook.
4. Un cron (`initSocialPublishingScheduler`, cada minuto) reclama las filas vencidas por **compare-and-set** (`leaseToken`, como las revisiones de Bria: dos réplicas nunca publican la misma pieza), firma una URL de lectura del archivo (una hora; Meta descarga desde ahí) y pide a Meta que publique (`metaGraphService.js`, Graph API v25.0). La fila queda `PUBLISHED` con el enlace; cuando a la pieza no le queda ninguna red pendiente, pasa a `PUBLICADO`.
5. Un fallo transitorio (5xx, 429, límite de Meta, red) vuelve a la cola con espera de 2, 4 minutos y al tercero queda `FAILED`. Un fallo permanente (token vencido, permiso, archivo rechazado) queda `FAILED` de inmediato con su motivo en español (`humanizeMetaError`); un token vencido además apaga la cuenta conectada para que la ficha pida reconectar. Quien programó recibe `SOCIAL_PUBLICATION_PUBLISHED` o `SOCIAL_PUBLICATION_FAILED`.
6. Cambiar el día o la hora de la pieza mueve sus filas programadas; quitar la hora las cancela diciendo por qué. Desconectar una cuenta cancela lo programado en ella; lo ya publicado no se toca.

## Qué le pedimos a Meta según el formato

| Formato | Meta (`media_type`) | Archivos |
|---|---|---|
| Post con una imagen | imagen del feed | 1 JPG/PNG ≤ 8 MB, proporción 4:5 a 1.91:1 |
| Post con varios archivos, Carrusel | `CAROUSEL` | 2 a 10 imágenes o videos |
| Reel, Video, Post con un video | `REELS` | 1 MP4/MOV ≤ 300 MB, 3 s a 15 min |
| Historia | `STORIES` (solo Instagram) | 1 imagen o video ≤ 100 MB (video ≤ 60 s) |

En Facebook: foto → `/{page}/photos`, video → `/{page}/videos`, varias fotos → fotos sin publicar + `/{page}/feed` con `attached_media`. Facebook no publica historias por la API.

Lo que Meta **no** deja hacer por API, y sigue siendo manual: música del catálogo de Instagram, stickers de historias (enlace, encuesta), etiquetar productos. Meta tampoco guarda publicaciones programadas: por eso la hora vive aquí. Límite: 100 publicaciones por cuenta de Instagram cada 24 horas.

## Lo que hay que configurar fuera de la plataforma

- Business Manager de Brain Studio verificado, con una **app de tipo Business** y un **usuario del sistema** con los permisos `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` y `business_management`.
- Cada cliente da a Brain Studio acceso de socio sobre su página y su Instagram profesional (que debe estar vinculado a esa página).
- El token del usuario del sistema (sin vencimiento) va en `META_SYSTEM_USER_TOKEN` en Railway. Sin él, «Conectar página» explica que falta y nada publica.
- El bucket de piezas finales sigue privado: Meta descarga por URL firmada (`createSignedDownload`), nunca por una URL pública.

## Lo que todavía no hace (siguiente fase)

- Un **enlace de Drive** como pieza final no se publica solo: Meta no puede descargar de Drive. `schedulingProblems` lo dice al programar. Falta copiar el archivo al almacenamiento justo antes de publicar.
- Convertir una imagen que no cumpla la proporción del feed o un PNG a JPG; hoy se rechaza antes de gastar la publicación.
- Programar un mes entero de una vez; hoy es pieza por pieza, a propósito, hasta ver el primer mes publicado.
- Un interruptor general para pausar el publicador sin tocar el código.

## Verificación

Contratos: `tests/socialPublishing.test.js` (regla pura), `tests/metaGraphClient.test.js` (qué se le pide a Meta), `tests/socialPublishingService.test.js` (cola, lease, reintentos, `PUBLICADO`), `tests/socialAccountService.test.js`, `tests/socialPublishingRoutes.test.js`, `tests/socialPublishingUi.test.js`. Muestra local sin backend: `tests/fixtures/social-publishing-preview.html` (configuración `social-preview` en `.claude/launch.json`). Esquema: `scripts/ensure-social-publishing-schema.js`, encadenado en `start`.
