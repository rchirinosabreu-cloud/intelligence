# Brainstudio Intelligence

Plataforma interna de Brain Studio Agencia Creativa. Reúne en un solo lugar la operación diaria de la agencia:

- **Gestión**: tablero Kanban de tareas, compromisos con hora, pendientes privados y reconocimientos del equipo.
- **Parrillas**: planeación de contenido por cliente, portal público de aprobación y publicación en redes.
- **Clientes**: directorio, ficha, enlaces y archivos; para administradores y PM, la operación del mes de cada cliente.
- **Financiero**: movimientos, cartera, cuentas de cobro, nómina y conciliación.
- **CRM**: oportunidades comerciales, seguimientos y formulario público de solicitud.
- **Minutas**: reuniones de Fireflies analizadas automáticamente y memoria de la agencia.
- **Bria**: el asistente de IA que revisa parrillas, propone criterios editoriales y detecta señales en las minutas.

## Tecnología

- Frontend: React 18 + Vite, Tailwind CSS, TanStack Query.
- Backend: Express (`server.js`, rutas en `src/routes`), Prisma sobre PostgreSQL.
- Despliegue: Railway.

## Antes de tocar nada

- Lee **`AGENTS.md`**: reúne las reglas del proyecto (base de datos, CORS, diseño, componentes compartidos, integridad financiera, Bria). Son de obligatorio cumplimiento.
- **`ARCHITECTURE.md`** describe la arquitectura general y **`docs/`** guarda el detalle de cada módulo (por ejemplo `docs/CUENTA_DE_COBRO.md`, `docs/SOCIAL_PUBLISHING.md`, `docs/FIREFLIES_WEBHOOK.md`).

> **Cuidado:** el archivo `.env` local apunta a la base de datos y los servicios de **producción**. No ejecutes scripts de escritura, semillas ni limpiezas con esa configuración. Las pruebas que necesitan base de datos usan exclusivamente `TEST_DATABASE_URL`, apuntando a una base aislada.

## Ejecutar en local

```bash
npm install          # instala dependencias y genera el cliente de Prisma
npm run dev          # frontend (Vite) en el puerto 3000
node server.js       # backend (requiere las variables de entorno; ver .env.example)
```

Varios módulos tienen una muestra local sin backend (`npm run preview:crm`, `npm run preview:mfa`, `npm run preview:cuenta-de-cobro`, y los archivos de `tests/fixtures/*-preview.html`).

## Pruebas

```bash
npm test             # node --test "tests/**/*.test.js"
```

Los recorridos reales con navegador viven en `tests/browser/` y se ejecutan uno a uno con `node`.
