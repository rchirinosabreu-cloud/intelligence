# Inventario de licencias

Dependencias de producción de la plataforma (lo que no es de desarrollo en `package-lock.json`),
con la licencia que declara cada paquete. **No se edita a mano:** se genera con `npm run licenses`
y la política que lo verifica está en `scripts/license-policy.json` (AGENTS.md, sección 21).

Incluye los binarios opcionales que npm instala según el sistema operativo (marcados «opcional»):
en producción (Linux) solo se instala el que corresponde.

**850 paquetes.**

## Resumen por licencia

| Licencia | Paquetes |
| --- | ---: |
| MIT | 669 |
| Apache-2.0 | 74 |
| ISC | 45 |
| BSD-2-Clause | 19 |
| BSD-3-Clause | 11 |
| LGPL-3.0-or-later | 10 |
| BlueOak-1.0.0 | 5 |
| MIT-0 | 4 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| (MIT AND Zlib) | 2 |
| (MIT OR EUPL-1.1+) | 1 |
| (MIT OR GPL-3.0-or-later) | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |
| 0BSD | 1 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| CC0-1.0 | 1 |
| MIT AND ISC | 1 |
| MPL-2.0 | 1 |

## Fuera de la lista permitida

Estas licencias no son permisivas y **esperan una decisión**; no se dan por aprobadas.

| Paquete | Versión | Licencia | Estado | Motivo |
| --- | --- | --- | --- | --- |
| @img/sharp-libvips-darwin-arm64 | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-darwin-x64 | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-linux-arm | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-linux-arm64 | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-linux-ppc64 | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-linux-riscv64 | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-linux-s390x | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-linux-x64 | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-linuxmusl-arm64 | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-libvips-linuxmusl-x64 | 1.3.4 | LGPL-3.0-or-later | Pendiente de decisión | Binarios de libvips que instala sharp (redimensionar y convertir imágenes) según el sistema operativo. Se enlazan de forma dinámica y no se modifican; la LGPL lo permite, pero no es una licencia permisiva. |
| @img/sharp-wasm32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | Pendiente de decisión | Versión WebAssembly de sharp con libvips dentro; opcional, no la usa Railway. |
| @img/sharp-win32-arm64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | Pendiente de decisión | Binario de sharp para Windows (solo en equipos de desarrollo) que trae libvips dentro. |
| @img/sharp-win32-ia32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | Pendiente de decisión | Binario de sharp para Windows (solo en equipos de desarrollo) que trae libvips dentro. |
| @img/sharp-win32-x64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | Pendiente de decisión | Binario de sharp para Windows (solo en equipos de desarrollo) que trae libvips dentro. |
| web-push | 3.6.7 | MPL-2.0 | Pendiente de decisión | Envía las notificaciones push. La MPL-2.0 obliga a publicar solo los cambios que se hagan a sus propios archivos; no se modifica. |

## Todos los paquetes

| Paquete | Versión | Licencia | Notas |
| --- | --- | --- | --- |
| @alloc/quick-lru | 5.2.0 | MIT |  |
| @asamuzakjp/css-color | 5.1.11 | MIT |  |
| @asamuzakjp/dom-selector | 7.1.1 | MIT |  |
| @asamuzakjp/generational-cache | 1.0.1 | MIT |  |
| @asamuzakjp/nwsapi | 2.3.9 | MIT |  |
| @aws-sdk/checksums | 3.1000.16 | Apache-2.0 |  |
| @aws-sdk/client-s3 | 3.1086.0 | Apache-2.0 |  |
| @aws-sdk/core | 3.978.1 | Apache-2.0 |  |
| @aws-sdk/credential-provider-env | 3.972.57 | Apache-2.0 |  |
| @aws-sdk/credential-provider-http | 3.972.59 | Apache-2.0 |  |
| @aws-sdk/credential-provider-ini | 3.973.1 | Apache-2.0 |  |
| @aws-sdk/credential-provider-login | 3.972.63 | Apache-2.0 |  |
| @aws-sdk/credential-provider-node | 3.972.67 | Apache-2.0 |  |
| @aws-sdk/credential-provider-process | 3.972.57 | Apache-2.0 |  |
| @aws-sdk/credential-provider-sso | 3.973.1 | Apache-2.0 |  |
| @aws-sdk/credential-provider-web-identity | 3.972.63 | Apache-2.0 |  |
| @aws-sdk/middleware-sdk-s3 | 3.972.62 | Apache-2.0 |  |
| @aws-sdk/nested-clients | 3.997.31 | Apache-2.0 |  |
| @aws-sdk/s3-request-presigner | 3.1140.0 | Apache-2.0 |  |
| @aws-sdk/signature-v4-multi-region | 3.996.47 | Apache-2.0 |  |
| @aws-sdk/token-providers | 3.1083.0 | Apache-2.0 |  |
| @aws-sdk/types | 3.974.6 | Apache-2.0 |  |
| @aws-sdk/xml-builder | 3.972.41 | Apache-2.0 |  |
| @aws/lambda-invoke-store | 0.3.0 | Apache-2.0 |  |
| @babel/runtime | 7.28.6 | MIT |  |
| @bramus/specificity | 2.4.2 | MIT |  |
| @csstools/color-helpers | 6.1.0 | MIT-0 |  |
| @csstools/css-calc | 3.3.0 | MIT |  |
| @csstools/css-color-parser | 4.1.10 | MIT |  |
| @csstools/css-parser-algorithms | 4.0.0 | MIT |  |
| @csstools/css-syntax-patches-for-csstree | 1.1.7 | MIT-0 |  |
| @csstools/css-tokenizer | 4.0.0 | MIT |  |
| @emnapi/runtime | 1.11.3 | MIT | opcional |
| @exodus/bytes | 1.15.1 | MIT |  |
| @floating-ui/core | 1.7.5 | MIT |  |
| @floating-ui/dom | 1.7.6 | MIT |  |
| @floating-ui/react | 0.27.19 | MIT |  |
| @floating-ui/react-dom | 2.1.8 | MIT |  |
| @floating-ui/utils | 0.2.11 | MIT |  |
| @google-cloud/paginator | 5.0.2 | Apache-2.0 |  |
| @google-cloud/projectify | 4.0.0 | Apache-2.0 |  |
| @google-cloud/promisify | 4.0.0 | Apache-2.0 |  |
| @google-cloud/storage | 7.22.0 | Apache-2.0 |  |
| @hello-pangea/dnd | 18.0.1 | Apache-2.0 |  |
| @hugeicons/core-free-icons | 4.2.3 | MIT |  |
| @hugeicons/react | 1.1.9 | MIT |  |
| @img/colour | 1.1.0 | MIT |  |
| @img/sharp-darwin-arm64 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-darwin-x64 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-freebsd-wasm32 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-libvips-darwin-arm64 | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-darwin-x64 | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-linux-arm | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-linux-arm64 | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-linux-ppc64 | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-linux-riscv64 | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-linux-s390x | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-linux-x64 | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-linuxmusl-arm64 | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-libvips-linuxmusl-x64 | 1.3.4 | LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-linux-arm | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-linux-arm64 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-linux-ppc64 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-linux-riscv64 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-linux-s390x | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-linux-x64 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-linuxmusl-arm64 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-linuxmusl-x64 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-wasm32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | opcional, pendiente de decisión |
| @img/sharp-webcontainers-wasm32 | 0.35.5 | Apache-2.0 | opcional |
| @img/sharp-win32-arm64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-win32-ia32 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | opcional, pendiente de decisión |
| @img/sharp-win32-x64 | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | opcional, pendiente de decisión |
| @isaacs/cliui | 8.0.2 | ISC |  |
| @jridgewell/gen-mapping | 0.3.13 | MIT |  |
| @jridgewell/resolve-uri | 3.1.2 | MIT |  |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT |  |
| @jridgewell/trace-mapping | 0.3.31 | MIT |  |
| @napi-rs/canvas | 0.1.100 | MIT | opcional |
| @napi-rs/canvas | 0.1.80 | MIT |  |
| @napi-rs/canvas-android-arm64 | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-android-arm64 | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-darwin-arm64 | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-darwin-arm64 | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-darwin-x64 | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-darwin-x64 | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-linux-arm-gnueabihf | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-linux-arm-gnueabihf | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-linux-arm64-gnu | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-linux-arm64-gnu | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-linux-arm64-musl | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-linux-arm64-musl | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-linux-riscv64-gnu | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-linux-riscv64-gnu | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-linux-x64-gnu | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-linux-x64-gnu | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-linux-x64-musl | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-linux-x64-musl | 0.1.80 | MIT | opcional |
| @napi-rs/canvas-win32-arm64-msvc | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-win32-x64-msvc | 0.1.100 | MIT | opcional |
| @napi-rs/canvas-win32-x64-msvc | 0.1.80 | MIT | opcional |
| @nodable/entities | 2.1.0 | MIT |  |
| @nodelib/fs.scandir | 2.1.5 | MIT |  |
| @nodelib/fs.stat | 2.0.5 | MIT |  |
| @nodelib/fs.walk | 1.2.8 | MIT |  |
| @pinojs/redact | 0.4.0 | MIT |  |
| @pkgjs/parseargs | 0.11.0 | MIT | opcional |
| @prisma/client | 6.19.3 | Apache-2.0 |  |
| @radix-ui/number | 1.1.1 | MIT |  |
| @radix-ui/primitive | 1.1.3 | MIT |  |
| @radix-ui/primitive | 1.1.7 | MIT |  |
| @radix-ui/react-alert-dialog | 1.1.15 | MIT |  |
| @radix-ui/react-arrow | 1.1.15 | MIT |  |
| @radix-ui/react-arrow | 1.1.7 | MIT |  |
| @radix-ui/react-collection | 1.1.7 | MIT |  |
| @radix-ui/react-compose-refs | 1.1.2 | MIT |  |
| @radix-ui/react-compose-refs | 1.1.5 | MIT |  |
| @radix-ui/react-context | 1.1.2 | MIT |  |
| @radix-ui/react-context | 1.2.2 | MIT |  |
| @radix-ui/react-dialog | 1.1.15 | MIT |  |
| @radix-ui/react-direction | 1.1.1 | MIT |  |
| @radix-ui/react-dismissable-layer | 1.1.11 | MIT |  |
| @radix-ui/react-dismissable-layer | 1.1.19 | MIT |  |
| @radix-ui/react-dropdown-menu | 2.1.16 | MIT |  |
| @radix-ui/react-focus-guards | 1.1.3 | MIT |  |
| @radix-ui/react-focus-guards | 1.1.6 | MIT |  |
| @radix-ui/react-focus-scope | 1.1.16 | MIT |  |
| @radix-ui/react-focus-scope | 1.1.7 | MIT |  |
| @radix-ui/react-id | 1.1.1 | MIT |  |
| @radix-ui/react-id | 1.1.4 | MIT |  |
| @radix-ui/react-menu | 2.1.16 | MIT |  |
| @radix-ui/react-popover | 1.1.23 | MIT |  |
| @radix-ui/react-popper | 1.2.8 | MIT |  |
| @radix-ui/react-popper | 1.3.7 | MIT |  |
| @radix-ui/react-portal | 1.1.17 | MIT |  |
| @radix-ui/react-portal | 1.1.9 | MIT |  |
| @radix-ui/react-presence | 1.1.10 | MIT |  |
| @radix-ui/react-presence | 1.1.5 | MIT |  |
| @radix-ui/react-primitive | 2.1.10 | MIT |  |
| @radix-ui/react-primitive | 2.1.3 | MIT |  |
| @radix-ui/react-roving-focus | 1.1.11 | MIT |  |
| @radix-ui/react-select | 2.2.6 | MIT |  |
| @radix-ui/react-slot | 1.2.3 | MIT |  |
| @radix-ui/react-slot | 1.2.4 | MIT |  |
| @radix-ui/react-slot | 1.3.3 | MIT |  |
| @radix-ui/react-tabs | 1.1.13 | MIT |  |
| @radix-ui/react-use-callback-ref | 1.1.1 | MIT |  |
| @radix-ui/react-use-callback-ref | 1.1.4 | MIT |  |
| @radix-ui/react-use-controllable-state | 1.2.2 | MIT |  |
| @radix-ui/react-use-controllable-state | 1.2.6 | MIT |  |
| @radix-ui/react-use-effect-event | 0.0.2 | MIT |  |
| @radix-ui/react-use-effect-event | 0.0.5 | MIT |  |
| @radix-ui/react-use-escape-keydown | 1.1.1 | MIT |  |
| @radix-ui/react-use-layout-effect | 1.1.1 | MIT |  |
| @radix-ui/react-use-layout-effect | 1.1.4 | MIT |  |
| @radix-ui/react-use-previous | 1.1.1 | MIT |  |
| @radix-ui/react-use-rect | 1.1.1 | MIT |  |
| @radix-ui/react-use-rect | 1.1.4 | MIT |  |
| @radix-ui/react-use-size | 1.1.1 | MIT |  |
| @radix-ui/react-use-size | 1.1.4 | MIT |  |
| @radix-ui/react-visually-hidden | 1.2.3 | MIT |  |
| @radix-ui/rect | 1.1.1 | MIT |  |
| @radix-ui/rect | 1.1.3 | MIT |  |
| @selderee/plugin-htmlparser2 | 0.12.0 | MIT |  |
| @smithy/core | 3.35.0 | Apache-2.0 |  |
| @smithy/credential-provider-imds | 4.4.8 | Apache-2.0 |  |
| @smithy/fetch-http-handler | 5.6.5 | Apache-2.0 |  |
| @smithy/node-http-handler | 4.9.5 | Apache-2.0 |  |
| @smithy/signature-v4 | 5.7.3 | Apache-2.0 |  |
| @smithy/types | 4.19.0 | Apache-2.0 |  |
| @tailwindcss/typography | 0.5.20 | MIT |  |
| @tanstack/query-core | 5.90.20 | MIT |  |
| @tanstack/react-query | 5.90.21 | MIT |  |
| @tiptap/core | 3.31.4 | MIT |  |
| @tiptap/extension-blockquote | 3.31.4 | MIT |  |
| @tiptap/extension-bold | 3.31.4 | MIT |  |
| @tiptap/extension-bubble-menu | 3.31.4 | MIT | opcional |
| @tiptap/extension-bullet-list | 3.31.4 | MIT |  |
| @tiptap/extension-code | 3.31.4 | MIT |  |
| @tiptap/extension-code-block | 3.31.4 | MIT |  |
| @tiptap/extension-document | 3.31.4 | MIT |  |
| @tiptap/extension-dropcursor | 3.31.4 | MIT |  |
| @tiptap/extension-floating-menu | 3.31.4 | MIT | opcional |
| @tiptap/extension-gapcursor | 3.31.4 | MIT |  |
| @tiptap/extension-hard-break | 3.31.4 | MIT |  |
| @tiptap/extension-heading | 3.31.4 | MIT |  |
| @tiptap/extension-horizontal-rule | 3.31.4 | MIT |  |
| @tiptap/extension-italic | 3.31.4 | MIT |  |
| @tiptap/extension-link | 3.31.4 | MIT |  |
| @tiptap/extension-list | 3.31.4 | MIT |  |
| @tiptap/extension-list-item | 3.31.4 | MIT |  |
| @tiptap/extension-list-keymap | 3.31.4 | MIT |  |
| @tiptap/extension-mention | 3.31.4 | MIT |  |
| @tiptap/extension-ordered-list | 3.31.4 | MIT |  |
| @tiptap/extension-paragraph | 3.31.4 | MIT |  |
| @tiptap/extension-placeholder | 3.31.4 | MIT |  |
| @tiptap/extension-strike | 3.31.4 | MIT |  |
| @tiptap/extension-text | 3.31.4 | MIT |  |
| @tiptap/extension-underline | 3.31.4 | MIT |  |
| @tiptap/extensions | 3.31.4 | MIT |  |
| @tiptap/pm | 3.31.4 | MIT |  |
| @tiptap/react | 3.31.4 | MIT |  |
| @tiptap/starter-kit | 3.31.4 | MIT |  |
| @tiptap/suggestion | 3.31.4 | MIT |  |
| @tootallnate/once | 2.0.1 | MIT |  |
| @types/caseless | 0.12.5 | MIT |  |
| @types/d3-array | 3.2.2 | MIT |  |
| @types/d3-color | 3.1.3 | MIT |  |
| @types/d3-ease | 3.0.2 | MIT |  |
| @types/d3-interpolate | 3.0.4 | MIT |  |
| @types/d3-path | 3.1.1 | MIT |  |
| @types/d3-scale | 4.0.9 | MIT |  |
| @types/d3-shape | 3.1.8 | MIT |  |
| @types/d3-time | 3.0.4 | MIT |  |
| @types/d3-timer | 3.0.2 | MIT |  |
| @types/debug | 4.1.12 | MIT |  |
| @types/estree | 1.0.8 | MIT |  |
| @types/estree-jsx | 1.0.5 | MIT |  |
| @types/hast | 3.0.4 | MIT |  |
| @types/mdast | 4.0.4 | MIT |  |
| @types/ms | 2.1.0 | MIT |  |
| @types/node | 20.19.30 | MIT |  |
| @types/pako | 2.0.4 | MIT |  |
| @types/prop-types | 15.7.15 | MIT |  |
| @types/raf | 3.4.3 | MIT | opcional |
| @types/react | 18.3.27 | MIT |  |
| @types/react-dom | 18.3.7 | MIT |  |
| @types/request | 2.48.13 | MIT |  |
| @types/tough-cookie | 4.0.5 | MIT |  |
| @types/trusted-types | 2.0.7 | MIT | opcional |
| @types/unist | 2.0.11 | MIT |  |
| @types/unist | 3.0.3 | MIT |  |
| @types/use-sync-external-store | 0.0.6 | MIT |  |
| @ungap/structured-clone | 1.3.0 | ISC |  |
| @xmldom/xmldom | 0.8.15 | MIT |  |
| @zone-eu/mailsplit | 5.4.20 | (MIT OR EUPL-1.1+) |  |
| abort-controller | 3.0.0 | MIT |  |
| accepts | 1.3.8 | MIT |  |
| adler-32 | 1.3.1 | Apache-2.0 |  |
| agent-base | 6.0.2 | MIT |  |
| agent-base | 7.1.4 | MIT |  |
| ansi-regex | 5.0.1 | MIT |  |
| ansi-regex | 6.2.2 | MIT |  |
| ansi-styles | 4.3.0 | MIT |  |
| ansi-styles | 6.2.3 | MIT |  |
| any-promise | 1.3.0 | MIT |  |
| anymatch | 3.1.3 | ISC |  |
| append-field | 1.0.0 | MIT |  |
| arg | 5.0.2 | MIT |  |
| argparse | 1.0.10 | MIT |  |
| aria-hidden | 1.2.6 | MIT |  |
| array-flatten | 1.1.1 | MIT |  |
| arrify | 2.0.1 | MIT |  |
| asn1.js | 5.4.1 | MIT |  |
| async-retry | 1.3.3 | MIT |  |
| asynckit | 0.4.0 | MIT |  |
| atomic-sleep | 1.0.0 | MIT |  |
| attr-accept | 2.2.5 | MIT |  |
| axios | 1.20.0 | MIT |  |
| bail | 2.0.2 | MIT |  |
| balanced-match | 1.0.2 | MIT |  |
| base64-arraybuffer | 1.0.2 | MIT | opcional |
| base64-js | 1.5.1 | MIT |  |
| bcryptjs | 3.0.3 | BSD-3-Clause |  |
| bidi-js | 1.0.3 | MIT |  |
| bignumber.js | 9.3.1 | MIT |  |
| binary-extensions | 2.3.0 | MIT |  |
| bn.js | 4.12.5 | MIT |  |
| body-parser | 1.20.8 | MIT |  |
| boolbase | 1.0.0 | ISC |  |
| boring-avatars | 2.0.4 | MIT |  |
| bowser | 2.14.1 | MIT |  |
| brace-expansion | 2.1.7 | MIT |  |
| braces | 3.0.3 | MIT |  |
| buffer-equal-constant-time | 1.0.1 | BSD-3-Clause |  |
| buffer-from | 1.1.2 | MIT |  |
| busboy | 1.6.0 | MIT | declara «MIT» |
| bytes | 3.1.2 | MIT |  |
| call-bind-apply-helpers | 1.0.2 | MIT |  |
| call-bound | 1.0.4 | MIT |  |
| camelcase | 5.3.1 | MIT |  |
| camelcase-css | 2.0.1 | MIT |  |
| canvas-confetti | 1.9.4 | ISC |  |
| canvg | 3.0.11 | MIT | opcional |
| ccount | 2.0.1 | MIT |  |
| cfb | 1.2.2 | Apache-2.0 |  |
| character-entities | 2.0.2 | MIT |  |
| character-entities-html4 | 2.1.0 | MIT |  |
| character-entities-legacy | 3.0.0 | MIT |  |
| character-reference-invalid | 2.0.1 | MIT |  |
| cheerio | 1.2.0 | MIT |  |
| cheerio-select | 2.1.0 | BSD-2-Clause |  |
| chokidar | 3.6.0 | MIT |  |
| class-variance-authority | 0.7.1 | Apache-2.0 |  |
| cliui | 6.0.0 | ISC |  |
| clsx | 2.1.1 | MIT |  |
| codepage | 1.15.0 | Apache-2.0 |  |
| color-convert | 2.0.1 | MIT |  |
| color-name | 1.1.4 | MIT |  |
| combined-stream | 1.0.8 | MIT |  |
| comma-separated-tokens | 2.0.3 | MIT |  |
| commander | 4.1.1 | MIT |  |
| concat-stream | 1.6.2 | MIT |  |
| content-disposition | 0.5.4 | MIT |  |
| content-type | 1.0.5 | MIT |  |
| cookie | 0.7.2 | MIT |  |
| cookie | 1.1.1 | MIT |  |
| cookie-signature | 1.0.7 | MIT |  |
| core-js | 3.48.0 | MIT | opcional |
| core-util-is | 1.0.3 | MIT |  |
| cors | 2.8.6 | MIT |  |
| crc-32 | 1.2.2 | Apache-2.0 |  |
| cross-spawn | 7.0.6 | MIT |  |
| css-box-model | 1.2.1 | MIT |  |
| css-line-break | 2.1.0 | MIT | opcional |
| css-select | 5.2.2 | BSD-2-Clause |  |
| css-tree | 3.2.1 | MIT |  |
| css-what | 6.2.2 | BSD-2-Clause |  |
| cssesc | 3.0.0 | MIT |  |
| csstype | 3.2.3 | MIT |  |
| d3-array | 3.2.4 | ISC |  |
| d3-color | 3.1.0 | ISC |  |
| d3-ease | 3.0.1 | BSD-3-Clause |  |
| d3-format | 3.1.2 | ISC |  |
| d3-interpolate | 3.0.1 | ISC |  |
| d3-path | 3.1.0 | ISC |  |
| d3-scale | 4.0.2 | ISC |  |
| d3-shape | 3.2.0 | ISC |  |
| d3-time | 3.1.0 | ISC |  |
| d3-time-format | 4.1.0 | ISC |  |
| d3-timer | 3.0.1 | ISC |  |
| data-uri-to-buffer | 4.0.1 | MIT |  |
| data-urls | 7.0.0 | MIT |  |
| date-fns | 4.1.0 | MIT |  |
| debug | 2.6.9 | MIT |  |
| debug | 4.4.3 | MIT |  |
| decamelize | 1.2.0 | MIT |  |
| decimal.js | 10.6.0 | MIT |  |
| decimal.js-light | 2.5.1 | MIT |  |
| decode-named-character-reference | 1.3.0 | MIT |  |
| deepmerge-ts | 8.0.2 | BSD-3-Clause |  |
| delayed-stream | 1.0.0 | MIT |  |
| depd | 2.0.0 | MIT |  |
| dequal | 2.0.3 | MIT |  |
| destroy | 1.2.0 | MIT |  |
| detect-libc | 2.1.2 | Apache-2.0 |  |
| detect-node-es | 1.1.0 | MIT |  |
| devlop | 1.1.0 | MIT |  |
| didyoumean | 1.2.2 | Apache-2.0 |  |
| dijkstrajs | 1.0.3 | MIT |  |
| dingbat-to-unicode | 1.0.1 | BSD-2-Clause |  |
| dlv | 1.1.3 | MIT |  |
| dom-helpers | 5.2.1 | MIT |  |
| dom-serializer | 2.0.0 | MIT |  |
| domelementtype | 2.3.0 | BSD-2-Clause |  |
| domhandler | 5.0.3 | BSD-2-Clause |  |
| dompurify | 3.4.17 | (MPL-2.0 OR Apache-2.0) |  |
| domutils | 3.2.2 | BSD-2-Clause |  |
| dotenv | 17.4.2 | BSD-2-Clause |  |
| duck | 0.1.12 | BSD-2-Clause | declara «BSD» |
| dunder-proto | 1.0.1 | MIT |  |
| duplexify | 4.1.3 | MIT |  |
| eastasianwidth | 0.2.0 | MIT |  |
| ecdsa-sig-formatter | 1.0.11 | Apache-2.0 |  |
| ee-first | 1.1.1 | MIT |  |
| emoji-regex | 8.0.0 | MIT |  |
| emoji-regex | 9.2.2 | MIT |  |
| encodeurl | 2.0.0 | MIT |  |
| encoding-japanese | 2.4.0 | MIT |  |
| encoding-sniffer | 0.2.1 | MIT |  |
| end-of-stream | 1.4.5 | MIT |  |
| entities | 4.5.0 | BSD-2-Clause |  |
| entities | 6.0.1 | BSD-2-Clause |  |
| entities | 7.0.1 | BSD-2-Clause |  |
| entities | 8.0.0 | BSD-2-Clause |  |
| es-define-property | 1.0.1 | MIT |  |
| es-errors | 1.3.0 | MIT |  |
| es-object-atoms | 1.1.1 | MIT |  |
| es-set-tostringtag | 2.1.0 | MIT |  |
| escape-html | 1.0.3 | MIT |  |
| escape-string-regexp | 5.0.0 | MIT |  |
| estree-util-is-identifier-name | 3.0.0 | MIT |  |
| etag | 1.8.1 | MIT |  |
| event-target-shim | 5.0.1 | MIT |  |
| eventemitter3 | 4.0.7 | MIT |  |
| express | 4.22.3 | MIT |  |
| extend | 3.0.2 | MIT |  |
| fast-equals | 5.4.0 | MIT |  |
| fast-glob | 3.3.3 | MIT |  |
| fast-png | 6.4.0 | MIT |  |
| fast-xml-builder | 1.2.0 | MIT |  |
| fast-xml-parser | 5.7.2 | MIT |  |
| fastq | 1.20.1 | ISC |  |
| fdir | 6.5.0 | MIT |  |
| fetch-blob | 3.2.0 | MIT |  |
| fflate | 0.8.3 | MIT |  |
| file-selector | 2.1.2 | MIT |  |
| fill-range | 7.1.1 | MIT |  |
| finalhandler | 1.3.2 | MIT |  |
| find-up | 4.1.0 | MIT |  |
| follow-redirects | 1.16.0 | MIT |  |
| foreground-child | 3.3.1 | ISC |  |
| form-data | 2.5.6 | MIT |  |
| form-data | 4.0.6 | MIT |  |
| formdata-polyfill | 4.0.10 | MIT |  |
| forwarded | 0.2.0 | MIT |  |
| frac | 1.1.2 | Apache-2.0 |  |
| framer-motion | 11.18.2 | MIT |  |
| fresh | 0.5.2 | MIT |  |
| fsevents | 2.3.3 | MIT | opcional |
| function-bind | 1.1.2 | MIT |  |
| gaxios | 6.7.1 | Apache-2.0 |  |
| gaxios | 7.1.3 | Apache-2.0 |  |
| gcp-metadata | 6.1.1 | Apache-2.0 |  |
| gcp-metadata | 8.1.2 | Apache-2.0 |  |
| get-caller-file | 2.0.5 | ISC |  |
| get-intrinsic | 1.3.0 | MIT |  |
| get-nonce | 1.0.1 | MIT |  |
| get-proto | 1.0.1 | MIT |  |
| glob | 10.5.0 | ISC |  |
| glob-parent | 5.1.2 | ISC |  |
| glob-parent | 6.0.2 | ISC |  |
| goober | 2.1.18 | MIT |  |
| google-auth-library | 10.5.0 | Apache-2.0 |  |
| google-auth-library | 9.15.1 | Apache-2.0 |  |
| google-logging-utils | 0.0.2 | Apache-2.0 |  |
| google-logging-utils | 1.1.3 | Apache-2.0 |  |
| googleapis | 171.4.0 | Apache-2.0 |  |
| googleapis-common | 8.0.1 | Apache-2.0 |  |
| gopd | 1.2.0 | MIT |  |
| gtoken | 7.1.0 | MIT |  |
| gtoken | 8.0.0 | MIT |  |
| has-symbols | 1.1.0 | MIT |  |
| has-tostringtag | 1.0.2 | MIT |  |
| hasown | 2.0.4 | MIT |  |
| hast-util-to-jsx-runtime | 2.3.6 | MIT |  |
| hast-util-whitespace | 3.0.0 | MIT |  |
| he | 1.2.0 | MIT |  |
| html-encoding-sniffer | 6.0.0 | MIT |  |
| html-entities | 2.6.0 | MIT |  |
| html-to-text | 10.0.1 | MIT |  |
| html-url-attributes | 3.0.1 | MIT |  |
| html2canvas | 1.4.1 | MIT | opcional |
| htmlparser2 | 10.1.0 | MIT |  |
| http_ece | 1.2.0 | MIT |  |
| http-errors | 2.0.1 | MIT |  |
| http-proxy-agent | 5.0.0 | MIT |  |
| https-proxy-agent | 5.0.1 | MIT |  |
| https-proxy-agent | 7.0.6 | MIT |  |
| iconv-lite | 0.4.24 | MIT |  |
| iconv-lite | 0.6.3 | MIT |  |
| iconv-lite | 0.7.3 | MIT |  |
| imapflow | 2.4.0 | MIT |  |
| immediate | 3.0.6 | MIT |  |
| inherits | 2.0.4 | ISC |  |
| inline-style-parser | 0.2.7 | MIT |  |
| internmap | 2.0.3 | ISC |  |
| iobuffer | 5.4.0 | MIT |  |
| ip-address | 10.7.3 | MIT |  |
| ipaddr.js | 1.9.1 | MIT |  |
| is-alphabetical | 2.0.1 | MIT |  |
| is-alphanumerical | 2.0.1 | MIT |  |
| is-binary-path | 2.1.0 | MIT |  |
| is-core-module | 2.16.1 | MIT |  |
| is-decimal | 2.0.1 | MIT |  |
| is-extglob | 2.1.1 | MIT |  |
| is-fullwidth-code-point | 3.0.0 | MIT |  |
| is-glob | 4.0.3 | MIT |  |
| is-hexadecimal | 2.0.1 | MIT |  |
| is-number | 7.0.0 | MIT |  |
| is-plain-obj | 4.1.0 | MIT |  |
| is-potential-custom-element-name | 1.0.1 | MIT |  |
| is-stream | 2.0.1 | MIT |  |
| isarray | 1.0.0 | MIT |  |
| isexe | 2.0.0 | ISC |  |
| isomorphic-dompurify | 3.19.0 | MIT |  |
| jackspeak | 3.4.3 | BlueOak-1.0.0 |  |
| jiti | 1.21.7 | MIT |  |
| js-tokens | 4.0.0 | MIT |  |
| jsdom | 29.1.1 | MIT |  |
| json-bigint | 1.0.0 | MIT |  |
| jsonwebtoken | 9.0.3 | MIT |  |
| jspdf | 4.2.1 | MIT |  |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) |  |
| jwa | 2.0.1 | MIT |  |
| jws | 4.0.1 | MIT |  |
| leac | 0.7.0 | MIT |  |
| libbase64 | 1.3.2 | MIT |  |
| libmime | 5.4.7 | MIT |  |
| libqp | 2.1.2 | MIT |  |
| lie | 3.3.0 | MIT |  |
| lilconfig | 3.1.3 | MIT |  |
| lines-and-columns | 1.2.4 | MIT |  |
| linkify-it | 5.0.2 | MIT |  |
| linkifyjs | 4.3.3 | MIT |  |
| locate-path | 5.0.0 | MIT |  |
| lodash | 4.18.1 | MIT |  |
| lodash.includes | 4.3.0 | MIT |  |
| lodash.isboolean | 3.0.3 | MIT |  |
| lodash.isinteger | 4.0.4 | MIT |  |
| lodash.isnumber | 3.0.3 | MIT |  |
| lodash.isplainobject | 4.0.6 | MIT |  |
| lodash.isstring | 4.0.1 | MIT |  |
| lodash.once | 4.1.1 | MIT |  |
| longest-streak | 3.1.0 | MIT |  |
| loose-envify | 1.4.0 | MIT |  |
| lop | 0.4.2 | BSD-2-Clause |  |
| lru-cache | 10.4.3 | ISC |  |
| lru-cache | 11.5.2 | BlueOak-1.0.0 |  |
| mailparser | 3.9.38 | MIT |  |
| mammoth | 1.13.0 | BSD-2-Clause |  |
| markdown-table | 3.0.4 | MIT |  |
| math-intrinsics | 1.1.0 | MIT |  |
| mdast-util-find-and-replace | 3.0.2 | MIT |  |
| mdast-util-from-markdown | 2.0.2 | MIT |  |
| mdast-util-gfm | 3.1.0 | MIT |  |
| mdast-util-gfm-autolink-literal | 2.0.1 | MIT |  |
| mdast-util-gfm-footnote | 2.1.0 | MIT |  |
| mdast-util-gfm-strikethrough | 2.0.0 | MIT |  |
| mdast-util-gfm-table | 2.0.0 | MIT |  |
| mdast-util-gfm-task-list-item | 2.0.0 | MIT |  |
| mdast-util-mdx-expression | 2.0.1 | MIT |  |
| mdast-util-mdx-jsx | 3.2.0 | MIT |  |
| mdast-util-mdxjs-esm | 2.0.1 | MIT |  |
| mdast-util-phrasing | 4.1.0 | MIT |  |
| mdast-util-to-hast | 13.2.1 | MIT |  |
| mdast-util-to-markdown | 2.1.2 | MIT |  |
| mdast-util-to-string | 4.0.0 | MIT |  |
| mdn-data | 2.27.1 | CC0-1.0 |  |
| media-typer | 0.3.0 | MIT |  |
| merge-descriptors | 1.0.3 | MIT |  |
| merge2 | 1.4.1 | MIT |  |
| methods | 1.1.2 | MIT |  |
| micromark | 4.0.2 | MIT |  |
| micromark-core-commonmark | 2.0.3 | MIT |  |
| micromark-extension-gfm | 3.0.0 | MIT |  |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT |  |
| micromark-extension-gfm-footnote | 2.1.0 | MIT |  |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT |  |
| micromark-extension-gfm-table | 2.1.1 | MIT |  |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT |  |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT |  |
| micromark-factory-destination | 2.0.1 | MIT |  |
| micromark-factory-label | 2.0.1 | MIT |  |
| micromark-factory-space | 2.0.1 | MIT |  |
| micromark-factory-title | 2.0.1 | MIT |  |
| micromark-factory-whitespace | 2.0.1 | MIT |  |
| micromark-util-character | 2.1.1 | MIT |  |
| micromark-util-chunked | 2.0.1 | MIT |  |
| micromark-util-classify-character | 2.0.1 | MIT |  |
| micromark-util-combine-extensions | 2.0.1 | MIT |  |
| micromark-util-decode-numeric-character-reference | 2.0.2 | MIT |  |
| micromark-util-decode-string | 2.0.1 | MIT |  |
| micromark-util-encode | 2.0.1 | MIT |  |
| micromark-util-html-tag-name | 2.0.1 | MIT |  |
| micromark-util-normalize-identifier | 2.0.1 | MIT |  |
| micromark-util-resolve-all | 2.0.1 | MIT |  |
| micromark-util-sanitize-uri | 2.0.1 | MIT |  |
| micromark-util-subtokenize | 2.1.0 | MIT |  |
| micromark-util-symbol | 2.0.1 | MIT |  |
| micromark-util-types | 2.0.2 | MIT |  |
| micromatch | 4.0.8 | MIT |  |
| mime | 1.6.0 | MIT |  |
| mime | 3.0.0 | MIT |  |
| mime-db | 1.52.0 | MIT |  |
| mime-types | 2.1.35 | MIT |  |
| minimalistic-assert | 1.0.1 | ISC |  |
| minimatch | 9.0.9 | ISC |  |
| minimist | 1.2.8 | MIT |  |
| minipass | 7.1.3 | BlueOak-1.0.0 |  |
| mkdirp | 0.5.6 | MIT |  |
| motion-dom | 11.18.1 | MIT |  |
| motion-utils | 11.18.1 | MIT |  |
| ms | 2.0.0 | MIT |  |
| ms | 2.1.3 | MIT |  |
| multer | 1.4.5-lts.2 | MIT |  |
| mz | 2.7.0 | MIT |  |
| nanoid | 3.3.20 | MIT |  |
| negotiator | 0.6.3 | MIT |  |
| node-domexception | 1.0.0 | MIT |  |
| node-fetch | 2.7.0 | MIT |  |
| node-fetch | 3.3.2 | MIT |  |
| nodemailer | 10.1.0 | MIT-0 |  |
| nodemailer | 9.1.1 | MIT-0 |  |
| normalize-path | 3.0.0 | MIT |  |
| nth-check | 2.1.1 | BSD-2-Clause |  |
| object-assign | 4.1.1 | MIT |  |
| object-hash | 3.0.0 | MIT |  |
| object-inspect | 1.13.4 | MIT |  |
| on-exit-leak-free | 2.1.2 | MIT |  |
| on-finished | 2.4.1 | MIT |  |
| once | 1.4.0 | ISC |  |
| option | 0.2.4 | BSD-2-Clause |  |
| orderedmap | 2.1.1 | MIT |  |
| p-limit | 2.3.0 | MIT |  |
| p-limit | 3.1.0 | MIT |  |
| p-locate | 4.1.0 | MIT |  |
| p-try | 2.2.0 | MIT |  |
| package-json-from-dist | 1.0.1 | BlueOak-1.0.0 |  |
| pako | 1.0.11 | (MIT AND Zlib) |  |
| pako | 2.1.0 | (MIT AND Zlib) |  |
| parse-entities | 4.0.2 | MIT |  |
| parse5 | 7.3.0 | MIT |  |
| parse5 | 8.0.1 | MIT |  |
| parse5-htmlparser2-tree-adapter | 7.1.0 | MIT |  |
| parse5-parser-stream | 7.1.2 | MIT |  |
| parseley | 0.13.1 | MIT |  |
| parseurl | 1.3.3 | MIT |  |
| path-exists | 4.0.0 | MIT |  |
| path-expression-matcher | 1.5.0 | MIT |  |
| path-key | 3.1.1 | MIT |  |
| path-parse | 1.0.7 | MIT |  |
| path-scurry | 1.11.1 | BlueOak-1.0.0 |  |
| path-to-regexp | 0.1.13 | MIT |  |
| pdf-parse | 2.4.5 | Apache-2.0 |  |
| pdfjs-dist | 5.4.296 | Apache-2.0 |  |
| pdfjs-dist | 5.7.284 | Apache-2.0 |  |
| peberminta | 0.10.0 | MIT |  |
| performance-now | 2.1.0 | MIT | opcional |
| pg | 8.20.0 | MIT |  |
| pg-cloudflare | 1.3.0 | MIT | opcional |
| pg-connection-string | 2.12.0 | MIT |  |
| pg-int8 | 1.0.1 | ISC |  |
| pg-pool | 3.13.0 | MIT |  |
| pg-protocol | 1.13.0 | MIT |  |
| pg-types | 2.2.0 | MIT |  |
| pgpass | 1.0.5 | MIT |  |
| picocolors | 1.1.1 | ISC |  |
| picomatch | 2.3.2 | MIT |  |
| picomatch | 4.0.7 | MIT |  |
| pify | 2.3.0 | MIT |  |
| pino | 10.3.1 | MIT |  |
| pino-abstract-transport | 3.0.0 | MIT |  |
| pino-std-serializers | 7.1.0 | MIT |  |
| pirates | 4.0.7 | MIT |  |
| playwright-core | 1.62.1 | Apache-2.0 |  |
| pngjs | 5.0.0 | MIT |  |
| postcss | 8.5.29 | MIT |  |
| postcss-import | 15.1.0 | MIT |  |
| postcss-js | 4.1.0 | MIT |  |
| postcss-load-config | 6.0.1 | MIT |  |
| postcss-nested | 6.2.0 | MIT |  |
| postcss-selector-parser | 6.0.10 | MIT |  |
| postcss-selector-parser | 6.1.4 | MIT |  |
| postcss-value-parser | 4.2.0 | MIT |  |
| postgres-array | 2.0.0 | MIT |  |
| postgres-bytea | 1.0.1 | MIT |  |
| postgres-date | 1.0.7 | MIT |  |
| postgres-interval | 1.2.0 | MIT |  |
| process-nextick-args | 2.0.1 | MIT |  |
| process-warning | 5.1.1 | MIT |  |
| prop-types | 15.8.1 | MIT |  |
| property-information | 7.1.0 | MIT |  |
| prosemirror-changeset | 2.4.1 | MIT |  |
| prosemirror-commands | 1.7.1 | MIT |  |
| prosemirror-dropcursor | 1.8.3 | MIT |  |
| prosemirror-gapcursor | 1.4.1 | MIT |  |
| prosemirror-history | 1.5.0 | MIT |  |
| prosemirror-inputrules | 1.5.1 | MIT |  |
| prosemirror-keymap | 1.2.3 | MIT |  |
| prosemirror-model | 1.25.12 | MIT |  |
| prosemirror-schema-list | 1.5.1 | MIT |  |
| prosemirror-state | 1.4.4 | MIT |  |
| prosemirror-tables | 1.8.5 | MIT |  |
| prosemirror-transform | 1.12.0 | MIT |  |
| prosemirror-view | 1.42.6 | MIT |  |
| proxy-addr | 2.0.8 | MIT |  |
| proxy-from-env | 2.1.0 | MIT |  |
| punycode | 2.3.1 | MIT |  |
| punycode.js | 2.3.1 | MIT |  |
| qrcode | 1.5.4 | MIT |  |
| qs | 6.16.0 | BSD-3-Clause |  |
| queue-microtask | 1.2.3 | MIT |  |
| quick-format-unescaped | 4.0.4 | MIT |  |
| raf | 3.4.1 | MIT | opcional |
| raf-schd | 4.0.3 | MIT |  |
| range-parser | 1.2.1 | MIT |  |
| raw-body | 2.5.3 | MIT |  |
| react | 18.3.1 | MIT |  |
| react-datepicker | 9.1.0 | MIT |  |
| react-dom | 18.3.1 | MIT |  |
| react-dropzone | 15.0.0 | MIT |  |
| react-hot-toast | 2.6.0 | MIT |  |
| react-is | 16.13.1 | MIT |  |
| react-is | 18.3.1 | MIT |  |
| react-markdown | 9.1.0 | MIT |  |
| react-redux | 9.2.0 | MIT |  |
| react-remove-scroll | 2.7.2 | MIT |  |
| react-remove-scroll-bar | 2.3.8 | MIT |  |
| react-router | 7.18.4 | MIT |  |
| react-router-dom | 7.18.4 | MIT |  |
| react-smooth | 4.0.4 | MIT |  |
| react-style-singleton | 2.2.3 | MIT |  |
| react-transition-group | 4.4.5 | BSD-3-Clause |  |
| read-cache | 1.0.0 | MIT |  |
| readable-stream | 2.3.8 | MIT |  |
| readable-stream | 3.6.2 | MIT |  |
| readdirp | 3.6.0 | MIT |  |
| real-require | 0.2.0 | MIT |  |
| real-require | 1.0.0 | MIT |  |
| recharts | 2.15.4 | MIT |  |
| recharts-scale | 0.4.5 | MIT |  |
| redux | 5.0.1 | MIT |  |
| regenerator-runtime | 0.13.11 | MIT | opcional |
| remark-gfm | 4.0.1 | MIT |  |
| remark-parse | 11.0.0 | MIT |  |
| remark-rehype | 11.1.2 | MIT |  |
| remark-stringify | 11.0.0 | MIT |  |
| require-directory | 2.1.1 | MIT |  |
| require-from-string | 2.0.2 | MIT |  |
| require-main-filename | 2.0.0 | ISC |  |
| resolve | 1.22.11 | MIT |  |
| retry | 0.13.1 | MIT |  |
| retry-request | 7.0.2 | MIT |  |
| reusify | 1.1.0 | MIT |  |
| rgbcolor | 1.0.1 | MIT | opcional, declara «MIT OR SEE LICENSE IN FEEL-FREE.md» |
| rimraf | 5.0.10 | ISC |  |
| rope-sequence | 1.3.4 | MIT |  |
| rrule | 2.8.1 | BSD-3-Clause |  |
| run-parallel | 1.2.0 | MIT |  |
| safe-buffer | 5.1.2 | MIT |  |
| safe-buffer | 5.2.1 | MIT |  |
| safe-stable-stringify | 2.5.0 | MIT |  |
| safer-buffer | 2.1.2 | MIT |  |
| saxes | 6.0.0 | ISC |  |
| scheduler | 0.23.2 | MIT |  |
| selderee | 0.12.0 | MIT |  |
| semver | 7.7.4 | ISC |  |
| semver | 7.8.5 | ISC |  |
| send | 0.19.2 | MIT |  |
| serve-static | 1.16.3 | MIT |  |
| set-blocking | 2.0.0 | ISC |  |
| set-cookie-parser | 2.7.2 | MIT |  |
| setimmediate | 1.0.5 | MIT |  |
| setprototypeof | 1.2.0 | ISC |  |
| sharp | 0.35.5 | Apache-2.0 |  |
| shebang-command | 2.0.0 | MIT |  |
| shebang-regex | 3.0.0 | MIT |  |
| side-channel | 1.1.1 | MIT |  |
| side-channel-list | 1.0.1 | MIT |  |
| side-channel-map | 1.0.1 | MIT |  |
| side-channel-weakmap | 1.0.2 | MIT |  |
| signal-exit | 4.1.0 | ISC |  |
| smart-buffer | 4.2.0 | MIT |  |
| socks | 2.8.10 | MIT |  |
| sonic-boom | 4.2.1 | MIT |  |
| source-map-js | 1.2.2 | BSD-3-Clause |  |
| space-separated-tokens | 2.0.2 | MIT |  |
| split2 | 4.2.0 | ISC |  |
| sprintf-js | 1.0.3 | BSD-3-Clause |  |
| ssf | 0.11.2 | Apache-2.0 |  |
| stackblur-canvas | 2.7.0 | MIT | opcional |
| statuses | 2.0.2 | MIT |  |
| stream-events | 1.0.5 | MIT |  |
| stream-shift | 1.0.3 | MIT |  |
| streamsearch | 1.1.0 | MIT | declara «MIT» |
| string_decoder | 1.1.1 | MIT |  |
| string_decoder | 1.3.0 | MIT |  |
| string-width | 4.2.3 | MIT |  |
| string-width | 5.1.2 | MIT |  |
| stringify-entities | 4.0.4 | MIT |  |
| strip-ansi | 6.0.1 | MIT |  |
| strip-ansi | 7.1.2 | MIT |  |
| strnum | 2.3.0 | MIT |  |
| stubs | 3.0.0 | MIT |  |
| style-to-js | 1.1.21 | MIT |  |
| style-to-object | 1.0.14 | MIT |  |
| sucrase | 3.35.1 | MIT |  |
| supports-preserve-symlinks-flag | 1.0.0 | MIT |  |
| svg-pathdata | 6.0.3 | MIT | opcional |
| symbol-tree | 3.2.4 | MIT |  |
| tabbable | 6.4.0 | MIT |  |
| tailwind-merge | 2.6.0 | MIT |  |
| tailwindcss | 3.4.19 | MIT |  |
| tailwindcss-animate | 1.0.7 | MIT |  |
| teeny-request | 9.0.0 | Apache-2.0 |  |
| text-segmentation | 1.0.3 | MIT | opcional |
| thenify | 3.3.1 | MIT |  |
| thenify-all | 1.6.0 | MIT |  |
| thread-stream | 4.2.0 | MIT |  |
| tiny-invariant | 1.3.3 | MIT |  |
| tinyglobby | 0.2.17 | MIT |  |
| tlds | 1.261.0 | MIT |  |
| tldts | 7.4.9 | MIT |  |
| tldts-core | 7.4.9 | MIT |  |
| to-regex-range | 5.0.1 | MIT |  |
| toidentifier | 1.0.1 | MIT |  |
| tough-cookie | 6.0.2 | BSD-3-Clause |  |
| tr46 | 0.0.3 | MIT |  |
| tr46 | 6.0.0 | MIT |  |
| trim-lines | 3.0.1 | MIT |  |
| trough | 2.2.0 | MIT |  |
| ts-interface-checker | 0.1.13 | Apache-2.0 |  |
| tslib | 2.8.1 | 0BSD |  |
| type-is | 1.6.18 | MIT |  |
| typedarray | 0.0.6 | MIT |  |
| uc.micro | 2.1.0 | MIT |  |
| underscore | 1.13.8 | MIT |  |
| undici | 7.30.0 | MIT |  |
| undici-types | 6.21.0 | MIT |  |
| unified | 11.0.5 | MIT |  |
| unist-util-is | 6.0.1 | MIT |  |
| unist-util-position | 5.0.0 | MIT |  |
| unist-util-stringify-position | 4.0.0 | MIT |  |
| unist-util-visit | 5.1.0 | MIT |  |
| unist-util-visit-parents | 6.0.2 | MIT |  |
| unpipe | 1.0.0 | MIT |  |
| url-template | 2.0.8 | BSD-3-Clause | declara «BSD» |
| use-callback-ref | 1.3.3 | MIT |  |
| use-sidecar | 1.1.3 | MIT |  |
| use-sync-external-store | 1.6.0 | MIT |  |
| util-deprecate | 1.0.2 | MIT |  |
| utils-merge | 1.0.1 | MIT |  |
| utrie | 1.0.2 | MIT | opcional |
| uuid | 13.0.2 | MIT |  |
| uuid | 9.0.1 | MIT |  |
| vary | 1.1.2 | MIT |  |
| vfile | 6.0.3 | MIT |  |
| vfile-message | 4.0.3 | MIT |  |
| victory-vendor | 36.9.2 | MIT AND ISC |  |
| w3c-keyname | 2.2.8 | MIT |  |
| w3c-xmlserializer | 5.0.0 | MIT |  |
| web-push | 3.6.7 | MPL-2.0 | pendiente de decisión |
| web-streams-polyfill | 3.3.3 | MIT |  |
| webidl-conversions | 3.0.1 | BSD-2-Clause |  |
| webidl-conversions | 8.0.1 | BSD-2-Clause |  |
| whatwg-encoding | 3.1.1 | MIT |  |
| whatwg-mimetype | 4.0.0 | MIT |  |
| whatwg-mimetype | 5.0.0 | MIT |  |
| whatwg-url | 16.0.1 | MIT |  |
| whatwg-url | 5.0.0 | MIT |  |
| which | 2.0.2 | ISC |  |
| which-module | 2.0.1 | ISC |  |
| wmf | 1.0.2 | Apache-2.0 |  |
| word | 0.3.0 | Apache-2.0 |  |
| wrap-ansi | 6.2.0 | MIT |  |
| wrap-ansi | 7.0.0 | MIT |  |
| wrap-ansi | 8.1.0 | MIT |  |
| wrappy | 1.0.2 | ISC |  |
| xlsx | 0.18.5 | Apache-2.0 |  |
| xml-name-validator | 5.0.0 | Apache-2.0 |  |
| xml-naming | 0.1.0 | MIT |  |
| xmlbuilder | 10.1.1 | MIT |  |
| xmlchars | 2.2.0 | MIT |  |
| xtend | 4.0.2 | MIT |  |
| y18n | 4.0.3 | ISC |  |
| yargs | 15.4.1 | MIT |  |
| yargs-parser | 18.1.3 | ISC |  |
| yocto-queue | 0.1.0 | MIT |  |
| zwitch | 2.0.4 | MIT |  |
