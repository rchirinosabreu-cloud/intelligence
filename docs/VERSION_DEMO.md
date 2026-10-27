# La versión «Demo» de Intelligence

26 de octubre de 2026. Rodny: «¿Cómo puedo crear toda mi aplicación de Intelligence pero versión Demo para presentarla a un cliente y que no sean los datos de mi empresa?».

La respuesta no es otro código: es **el mismo código desplegado otra vez, con otra base de datos y una agencia inventada**. Un cliente navega la plataforma entera, crea tareas, rompe lo que quiera, y antes de la siguiente presentación la base vuelve al estado limpio con un comando.

## Qué es y qué no es

- **Es** un segundo despliegue de `main` (entorno `demo` en Railway) con su propio Postgres, su propio `JWT_SECRET` y `ENCRYPTION_KEY`, y los datos de `scripts/demo/agenciaFicticia.js`: la **Agencia Faro**, ocho personas, siete cuentas, parrillas de tres meses, tareas con tiempo medido, un CRM con propuestas que esperan, tres meses de movimientos, cartera, terceros, cuentas por pagar y once hechos en la memoria de Bria.
- **No es** una copia anonimizada de producción. Todo se escribió desde cero: anonimizar deja rastros (montos, fechas, formatos que identifican a un cliente). `tests/demoSeed.test.js` falla si entra un nombre real de Brain Studio, de su equipo o de sus clientes.
- **No publica, no transcribe, no escribe a nadie.** En el entorno demo no existen las llaves de Meta, WhatsApp, Fireflies, Google ni los buzones IMAP; el semáforo de servicios los muestra en gris «sin configurar», que es lo correcto. Solo `OPENAI_API_KEY` tiene sentido ponerla, para que Bria conteste.
- Las muestras locales (`scripts/preview-*.js`) siguen siendo otra cosa: una pantalla con una API ficticia en memoria, de solo lectura. La demo es la plataforma real.

## Los dos candados

La semilla y el reinicio escriben y borran una base entera. El `.env` local apunta a producción, así que un `npm run demo:reset` distraído tiene que negarse solo; eso no se le confía a la atención de nadie. La regla vive en `src/lib/demoMode.js` (`demoDatabaseProblem`) y exige las dos cosas a la vez:

1. `DEMO_MODE=true`.
2. Una `DATABASE_URL` de PostgreSQL cuyo **nombre de base** lleve la palabra «demo» (`intelligence_demo`, `railway_demo`…).

El mismo candado protege el servidor: con `DEMO_MODE=true` sobre una base que no se llame «demo», `server.js` no arranca (`assertDemoDatabase`). Así producción nunca puede quedar en modo demo por una variable mal puesta. Sin `DEMO_MODE`, el servidor no comprueba nada y producción arranca como siempre.

`scripts/seed-demo.js` **no carga el `.env`** (hay una prueba que lo vigila). La base llega por la variable puesta a mano o, con `--railway`, leída del entorno de Railway.

## Comandos

| Comando | Qué hace |
|---|---|
| `node scripts/seed-demo.js` | Simula: dice a qué base iría y cuánto escribiría. No toca nada. |
| `npm run demo:seed` | Siembra sobre una base vacía. Si ya tiene datos, se niega (para no duplicar). |
| `npm run demo:reset` | **Borra los esquemas `public`, `bria_memory` y `vault`**, vuelve a crear el esquema con `prisma db push` y los `ensure-*` de `npm start`, y siembra desde cero. Es lo que se corre antes de cada presentación. |

Los tres leen `DEMO_MODE` y `DATABASE_URL` del entorno. En PowerShell:

```powershell
$env:DEMO_MODE='true'; $env:DATABASE_URL='postgresql://demo:demo@127.0.0.1:55450/intelligence_demo'; npm run demo:reset
```

Con `--railway` (o `--railway=<entorno>`, por defecto `demo`) el script le pide a la CLI de Railway las variables del Postgres (`--postgres=<servicio>`) y del servicio de la aplicación (`--service=<servicio>`) de ese entorno: del Postgres toma el **host público** (su `DATABASE_PUBLIC_URL` o, si no la tiene, su proxy TCP), y de Intelligence el **nombre de la base** y el `DEMO_MODE` (y `DEMO_PASSWORD`, si está). Si la base no existe en ese servidor —el Postgres de Railway nace solo con `railway`— la crea desde la base de mantenimiento `postgres`, y después pasa por los mismos candados:

```powershell
node scripts/seed-demo.js --railway --service=Intelligence-demo --postgres=Postgres-LNoV --reiniciar --confirmar SEMBRAR
```

Tarda unos tres minutos por el proxy (`prisma db push` solo, minuto y medio).

Las cuentas comparten una contraseña: la de `DEMO_AGENCY.defaultPassword` en `scripts/demo/agenciaFicticia.js`, o la variable `DEMO_PASSWORD` si existe. **En Railway hay que ponerla**: el enlace de la demo es público y Bria gasta créditos de OpenAI.

## Verla en local

Hace falta un Postgres con pgvector (el esquema usa el tipo `vector`):

```powershell
docker run -d --name intelligence-demo-db -e POSTGRES_USER=demo -e POSTGRES_PASSWORD=demo -e POSTGRES_DB=intelligence_demo -p 55450:5432 pgvector/pgvector:pg17
```

Después de sembrar, `scripts/demo-local-server.mjs --base=<url>` arranca el servidor en modo demo con las integraciones vacías (`JWT_SECRET` y `ENCRYPTION_KEY` aleatorios por corrida, `MFA_REQUIRED_ROLES` vacío) y `npm run dev` sirve el frontend en el 3000, que reenvía `/api` al 8080. Las dos configuraciones están en `.claude/launch.json` (`demo-backend`, `demo-frontend`). Si el cliente de Prisma de `node_modules` es anterior al esquema (una pantalla responde 500 con «reading 'findMany'»), `npx prisma generate`.

## El entorno en Railway (creado el 26 de octubre de 2026)

En el proyecto «Brainstudio Lab», el entorno **`demo`** con dos servicios: **`Intelligence-demo`** (la aplicación) y **`Postgres-LNoV`** (su base). Dominio: `https://intelligence-demo-demo.up.railway.app`. Tres cosas que no se ven a simple vista:

- **Se creó vacío, no duplicado.** «Duplicar» el entorno de producción copia **todas** las variables, incluidos el `DATABASE_URL` de producción, los tokens de Meta y WhatsApp y las llaves de los buckets.
- **El servicio no se llama `Intelligence`** porque los servicios son del proyecto y ese nombre ya es el de producción (sin instancia en demo). `railway add --service Intelligence` choca; por eso `Intelligence-demo`.
- **El Postgres nace con la base `railway`** aunque se le pase `POSTGRES_DB`; la base `intelligence_demo` (el candado exige «demo» en el nombre) la crea el script de semilla. Su proxy TCP (`tokaido.proxy.rlwy.net:51311`) se creó con `railway api` (`tcpProxyCreate`), porque la plantilla no lo trae.

Variables de `Intelligence-demo`:

| Variable | Valor |
|---|---|
| `DEMO_MODE` | `true` |
| `DATABASE_URL` | `postgresql://${{Postgres-LNoV.PGUSER}}:${{Postgres-LNoV.POSTGRES_PASSWORD}}@${{Postgres-LNoV.RAILWAY_PRIVATE_DOMAIN}}:5432/intelligence_demo` |
| `JWT_SECRET`, `ENCRYPTION_KEY` | Nuevos, nunca los de producción: con la misma llave una sesión de un lado valdría en el otro |
| `NODE_ENV` | `production` |
| `DEMO_PASSWORD` | **Pendiente de Rodny**: la contraseña de las ocho cuentas; sin ella vale la del archivo |
| `OPENAI_API_KEY` | **Pendiente de Rodny**, solo si quiere a Bria viva (gasta de la cuenta de Brain Studio) |

`MFA_REQUIRED_ROLES` no existe en demo (vacío = nadie obligado). Y **nada** de Fireflies, Meta, WhatsApp, Google, IMAP, push ni SMTP. El dominio `*.up.railway.app` ya pasa el CORS del servidor (la regex de despliegues de Railway); `labs.brainstudioagencia.com` sigue siendo solo producción.

**Desplegar:** GitHub está desconectado en Railway, así que el código sube desde el checkout con `railway up -s Intelligence-demo -e demo --detach` (sube el árbol de trabajo tal como está). La cadena de `npm start` crea el esquema lateral al arrancar, pero el esquema de Prisma no: la primera vez, y en cada reinicio, se corre la semilla con `--railway` desde una máquina con la CLI enlazada al proyecto. El servicio se puede apagar entre demos y volver a encender.

**Al pasar variables por la CLI:** `railway add --variables` **imprime en pantalla** cada variable que recibe. Un secreto va con la salida suprimida o con `railway variable set CLAVE --stdin`.

## Qué se ve en la pantalla

- Un distintivo **Demo** en el header (`src/components/layout/DemoBadge.jsx`), amarillo de la marca, con la explicación al pasar el ratón. Lo decide el servidor (`/api/health` → `demo`), nunca una variable de compilación: el mismo build sirve para las dos instancias. En producción no se dibuja.
- Bria viva: el pulso, el cierre del día, la lectura de la mañana y las alertas comerciales corren solos en horario hábil sobre la agencia inventada.
- Operación con tres cuentas en rojo (piezas atrasadas en Hotel Mar Azul y Gimnasio Vital), una en stand by y el resto al día; una propuesta con 12 días sin respuesta en el CRM; cartera con dos cuentas por cobrar abiertas.

## Lo que no cubre

WhatsApp, la publicación en redes y las minutas no se enseñan en vivo (no hay cuentas conectadas): se enseñan con las capturas de producción. Los hechos de Bria se siembran por el repositorio real (`importReading`), así que un reinicio los vuelve a crear idénticos.

Contratos: `tests/demoMode.test.js`, `tests/demoSeed.test.js`, `tests/demoBadgeUi.test.js`.
