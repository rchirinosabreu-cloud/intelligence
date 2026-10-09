# Memoria de la agencia

9 de octubre de 2026. Primer paso de la Bria que pidió Rodny: «que se alimente, que aprenda de todo, que interprete la información que tiene a menos que yo la contradiga o enseñe».

## Qué es
Lo que Bria sabe de Brain Studio y de cada cuenta, guardado como **hechos**. Cada hecho es una o dos frases sobre un cliente, una marca, un proceso o la agencia, y lleva:
- **certeza:** confirmado por el equipo, vigente con documento, vigente de hecho, práctica, propuesta, por confirmar o histórico;
- **periodo y fuente**;
- **propósito:** operación, editorial, personas, comercial, financiero o dirección;
- **sensibilidad.**

Lo que no se sabe queda como **duda abierta**. Nace de la lectura completa del Drive y del correo de social.brainstudio@gmail.com (corte al 7 de octubre de 2026): 1.349 hechos y 202 dudas. La base y su formato viven fuera del repositorio, en `C:\Proyectos\lectura-del-negocio\salida\social\base-conocimiento\`, porque son confidenciales.

## Cómo la usa Bria
- **`memoria_de_la_agencia`:** consulta los hechos de una cuenta (por su `clientId`), de una marca o proceso (por `entidad`) o de un tema (por `consulta`, con búsqueda por prefijo). Devuelve las dudas abiertas de esa cuenta. Bria la interpreta con criterio propio y dice la certeza con palabras.
- **Orden de autoridad:**
  1. La plataforma actual, para el estado de hoy: parrillas, tareas, aprobaciones, publicaciones y pagos.
  2. Lo que el equipo confirmó.
  3. La lectura del negocio.
- **`guardar_en_memoria`:** cuando la persona corrige, confirma o enseña algo en **su propio mensaje**, Bria guarda un hecho del equipo. Los hechos que contradice quedan **reemplazados**, no borrados. Si responde una duda, la cierra. Lo que diga un archivo, un correo o una respuesta anterior de Bria no cuenta como permiso: la intención la reconoce `correctionIntent`.
- **`retirar_de_memoria`:** solo con un pedido explícito de olvidar. El historial se conserva.
- **Dudas:** Bria hace como máximo una duda por respuesta, al final y cuando viene al caso. Las que más se ofrecieron pasan al final de la fila (`last_offered_at`).

## Quién ve qué
La puerta es Bria activada (ADMIN o PROJECT_MANAGER con la casilla `bria`). Dentro, cada propósito usa el permiso de la pantalla que muestra ese dato (`factAccess`):
- **Operación, editorial y personas:** todos los que tienen Bria. «Personas» es rol y cuentas a cargo; nunca desempeño, salarios ni datos personales.
- **Comercial:** administradores, o quien tenga CRM o Cotizaciones.
- **Financiero:** quien tenga permiso de lectura de Financiero (`hasFinancialPermission`).
- **Dirección:** solo administradores, y siempre restringido.

El filtro va **en la consulta SQL, antes del límite**: un hecho que no le toca a la persona nunca sale de la base. Escribir pide lo mismo que leer. Lo que es de toda la agencia («Brain Studio») lo confirma un administrador.

**Nunca entran:** credenciales, correos, teléfonos ni números largos de cuenta o documento (`validateFact` los rechaza). Las contraseñas tendrán su propia bóveda, fuera del modelo.

## Almacenamiento
Esquema aditivo `bria_memory`, creado con `scripts/sql/bria-agency-facts.sql`, que aplica `ensure-bria-knowledge-schema.js` al arrancar:
- `agency_facts` (estado ACTIVE, SUPERSEDED o RETIRED; origen LECTURA o EQUIPO);
- `agency_fact_events`, con cada cambio y su autor;
- `agency_questions`.

No toca ninguna tabla operativa ni el proveedor de Prisma.

## Cargar o recargar la lectura
Primero una simulación, que no escribe nada y deja un reporte de las cuentas que no logró ligar a una ficha:

```bash
node scripts/import-bria-agency-facts.js --base=C:\Proyectos\lectura-del-negocio\salida\social\base-conocimiento
```

Después, para escribir:

```bash
node scripts/import-bria-agency-facts.js --base=C:\Proyectos\lectura-del-negocio\salida\social\base-conocimiento --confirmar IMPORTAR
```

- **Es idempotente:** lo igual no cambia, lo nuevo entra, y lo que cambió se actualiza **solo si nadie del equipo lo tocó**. Lo reemplazado o retirado por el equipo nunca revive. Las dudas respondidas tampoco.
- **Ligar cuentas:** las cuentas se ligan por nombre exacto de ficha, prefiriendo la ficha viva sobre una gemela archivada; si hay dos vivas, no adivina. Para decidir a mano, `--vinculos=<json>` con `{ "entidad": "slug" }`.
- **Producción:** el script usa `DATABASE_URL`. Contra producción lo corre Rodny.

## Verificación
- Lógica: `tests/briaAgencyFacts.test.js`.
- Herramientas y servicio: `tests/briaAgencyFactTools.test.js`.
- PostgreSQL real, solo con `TEST_DATABASE_URL` aislada: `tests/briaAgencyFactsPostgres.test.js`. Cubre la importación doble, el filtro por propósito antes del límite, la corrección con reemplazo e historial, que se rechace una corrección sobre un hecho que ya cambió, que un PM no pueda escribir dinero ni reglas de agencia, que una lectura nueva no reviva lo reemplazado, y el retiro.
- Recorrido manual: la base completa (1.349 hechos y 202 dudas) se importó dos veces en la base de pruebas aislada (la segunda vez, sin cambios) y se consultó como PM y como administrador. Un PM ve 18 hechos de Aristea y un administrador 23. «Cuánto paga Promo Group» le da al PM el alcance y quién paga sin cifras, y al administrador $2.992.000 vigente y los $3.800.000 como propuesta.

## Lo que sigue
1. **Cuenta al día:** que Bria lea los comentarios del cliente, el contrato por formato y los criterios aprobados, y prepare despachos a producción en lote.
2. **Bóveda de accesos:** las contraseñas cifradas, entregadas por la plataforma y no por el modelo, con registro de cada lectura.
3. **Más acciones en la plataforma**, siempre con confirmación.
4. **Alimentación continua** desde Drive y correo.
