# Health score de la plataforma

Rodny, 14 de noviembre de 2026: «un plan y procedimiento para que ese Health Score nos dé 10 de 10 en todo». El objetivo es poder ofrecer plataformas como Intelligence a otras agencias con la tranquilidad de que la base es sólida.

**10 de 10 no significa «perfecta».** Significa cumplir un estándar que se puede medir. Por eso la nota la da un medidor, no una opinión: cada área tiene criterios que se cumplen o no, y lo que se puede leer del código se lee del código.

## Cómo se mide

```bash
npm run health
```

Muestra la nota de cada una de las siete áreas (criterios cumplidos sobre el total, de 0 a 10) y, de cada criterio pendiente, qué falta. Lee además las vulnerabilidades (`npm audit`) y las rutas de la API; `npm run health -- --rapido` se salta esas dos y `-- --json` lo entrega como datos.

Hay tres clases de criterio:

- **Lo que ya se tiene.** Verificación en dos pasos, bóveda cifrada, auditoría inmutable, pruebas en cada cambio. Cuenta mientras la pieza siga en el código, en el arranque o en la revisión automática; si alguien la quita, la nota baja.
- **Lo que se lee del código.** Archivos de más de 800 líneas, archivos que escriben la marca o la zona horaria a mano, tamaño de `AGENTS.md`, scripts que arreglan la base al arrancar, vulnerabilidades, rutas que solo piden sesión.
- **Lo que confirma una persona.** Una restauración probada, una revisión de seguridad externa, un vigilante externo. Se anota en `scripts/health-score-manual.json` con la fecha, quién y una nota, y algunos vencen (la restauración a los 90 días, la revisión externa al año). No se anota nada que no se haya hecho de verdad.

La nota del medidor es más estricta que una apreciación general: solo cuenta lo demostrado.

## Lo que se frena desde hoy

`npm run health:check` corre en cada cambio y falla si, frente a `scripts/health-score-baseline.json`, aparece:

1. un archivo nuevo de más de 800 líneas;
2. un archivo nuevo que escribe la marca a mano («Brain Studio», «Francisco Villa» o el dominio);
3. un archivo nuevo que escribe la zona horaria a mano («America/Bogota»).

Solo se leen `src/` y `server.js`, y los comentarios no cuentan: una regla escrita en un comentario no es texto que vea un cliente.

Lo que ya existía quedó anotado en la línea base (18 archivos grandes, 104 con la marca y 80 con la zona horaria al crearla) y se va sacando por fases. Un archivo grande de la lista que sigue creciendo **avisa pero todavía no frena**: frenará cuando empiece la fase de partirlos, para no bloquear el trabajo en curso.

Cuando algo mejora, `npm run health:update` encoge la línea base. **Nunca se le añade a mano para que un cambio pase**: eso es bajar la nota, y es decisión de Rodny.

## El plan

| Fase | Qué | Áreas que sube |
|---|---|---|
| 0 | Este medidor y su puerta en la revisión automática | Todas (deja de ser opinión) |
| 1 | Prisma 7 (cierra la vulnerabilidad anotada), chequeo de salud, vigilante externo, despliegue automático, entorno de pruebas, restauración probada | Seguridad, Operación |
| 2 | Empresa, datos legales, firma, moneda, zona horaria y festivos en una configuración; paquetes por país; plantilla de cliente nuevo | Lista para otro cliente, Producto |
| 3 | Migraciones con versión, procesos automáticos en su propio servidor, dos servidores | Organización del código, Operación |
| 4 | Partir los archivos grandes, cobertura de pruebas, prueba de permiso por ruta, `AGENTS.md` como índice, revisión de seguridad externa | Organización del código, Pruebas, Permisos, Seguridad |

### Fase 1, lo hecho (15 de noviembre de 2026)

- **La vulnerabilidad anotada se cerró sin saltar a Prisma 7.** El aviso era de `deepmerge-ts`, una librería que usa la herramienta de Prisma para leer su configuración. Prisma lo arregló en su versión 7.10.1 cambiando solo esa librería a la 8.0.2, así que aquí se fija esa misma versión en `overrides` de `package.json`. La lista de excepciones quedó vacía. Cuando se suba Prisma a la 7, se quita el `overrides`.
- **Chequeo de salud.** Railway pregunta a `/api/health` y solo le pasa la gente a una versión nueva cuando responde; si no responde en cinco minutos, se queda la anterior. Se pone en los ajustes del servicio en Railway (`healthcheckPath`), **no en un archivo del código**: `railway.json` deja de leerse el 1 de diciembre de 2026. Por eso el medidor lo trata como algo que confirma una persona. Probado primero en la demo.

- **Vigilante externo.** `.github/workflows/uptime.yml` corre en GitHub, fuera de Railway, cada 10 minutos: pide `/api/health` (la dirección es la variable `UPTIME_URL` del repositorio) y, si no responde en tres intentos, abre un aviso que le llega por correo al dueño del repositorio; cuando vuelve, lo cierra. Se prueba a mano desde GitHub → Actions → «Vigilante externo» → «Run workflow», escribiendo una dirección que no exista. **Se ve en la plataforma**: el semáforo de Salud operativa tiene la luz «Vigilante externo», que lee su última corrida (variable `UPTIME_WATCHER_REPO` en Railway, y `UPTIME_WATCHER_TOKEN` solo si el repositorio es privado) y se pone amarilla si lleva más de 45 minutos sin revisar o si no obtuvo respuesta desde fuera. Límites: GitHub puede retrasar una corrida programada varios minutos, y en un repositorio privado estas corridas gastan minutos de Actions (unas 4.300 al mes cada 10 minutos); ahí conviene un servicio dedicado.

Decisiones que son de Rodny antes de cada fase: pasar a migraciones con versión (hoy las reglas del proyecto dicen `db push`), el servidor aparte para los procesos automáticos (sube el costo mensual) y contratar la revisión de seguridad externa.

## Cómo se mantiene

- La puerta corre en cada cambio y frena lo que empeora.
- Una vez al mes se corre `npm run health` y se revisan los criterios que vencen.
- Un criterio nuevo se añade en `AREAS` de `scripts/health-score.mjs` con su prueba en `tests/healthScore.test.js`. Añadir un criterio que ya se cumple para subir la nota sin que algo haya mejorado no vale.

## Dónde se ve

En **Salud operativa**, debajo del semáforo de servicios y solo para administradores: la nota general, un recuadro por área y, al abrir un área, lo cumplido y lo pendiente. Lee `GET /api/platform-health`. La medición viaja con cada versión: el Dockerfile corre `node scripts/health-score.mjs --snapshot` al construir (incluye las vulnerabilidades consultadas en ese momento) y el servidor añade las rutas que de verdad tiene montadas y lo que haya confirmado una persona. En local, sin esa medición, se lee el código al primer pedido.

En la **demo** no se muestra: quien la abre es un cliente potencial y la tarjeta es la lista de pendientes internos de la plataforma.
