# Equipo oficial y cuentas de acceso

## Fuente y contrato

`TeamMember.isActive` determina la pertenencia vigente a Equipo. `User` conserva la identidad de acceso y las referencias históricas, pero no constituye un segundo directorio de integrantes.

- `readParticipationRoster` lee Equipo y conserva miembros sin cuenta, nombres y avatares oficiales.
- `activeTeamUserWhere` exige cuenta activa y relación con un miembro activo para filtros y destinatarios.
- `isActiveTeamUser` protege login, sesiones y recuperación de contraseña.
- `setLinkedAccountStatus`, en la transacción de Equipo, sincroniza baja/reactivación, revoca sesiones y apaga dispositivos al dar de baja. Reactivar no restaura dispositivos.
- `assertActiveTeamMembers` valida selecciones nuevas; una asignación histórica sin cambios sigue siendo válida para consultar/editar otros campos.

Consumidores ajustados: participación y denominador de adopción, selector del historial, anuncios generales/personales, menciones y respuestas mediante el servicio de notificaciones, entrega push, notificaciones de cotizaciones aprobadas, creación/reasignación de tareas nativas, responsables de clientes y cambios de responsable de parrilla. La interfaz de participación muestra todos los miembros, sin límite silencioso de ocho.

No se filtran los autores de acontecimientos históricos. Las consultas de importación financiera y las referencias históricas por identidad no son un directorio de integrantes y no se eliminan. Se retiró una constante de nombres antiguos sin uso de `ClientTasksWidget`.

## Intervención autorizada del 14 de septiembre de 2026

La comprobación productiva encontró diez miembros oficiales, tres cuentas activas sin pertenencia (Claudia Muñoz, `admin` y `Test User`) y otras dos cuentas anteriores ya desactivadas. Las tres cuentas tenían rol VIEWER, no ADMIN.

Con autorización explícita se desactivaron exclusivamente esos tres IDs, comprobando nombre, rol, versión de sesión y ausencia de relación con Equipo dentro de una transacción breve. `sessionVersion` pasó de 2 a 3. No había dispositivos activos. Se conservó el estado de los diez miembros oficiales y todos los registros históricos comprobados: 528 tareas creadas y 46 notificaciones de esas cuentas (sin comentarios de su autoría). No se borraron registros ni se modificó el esquema.

Se registraron tres evidencias `ACCOUNT_ACCESS_REVOKED`, con sujeto e indicación de mantenimiento autorizado, sin inventar un actor autenticado. Son evidencias administrativas, no un evento nuevo del catálogo público del historial.

Esta intervención de datos ya fue aplicada. Los cambios de código requieren publicación; no confundir capturas locales o compilación con despliegue confirmado.

## Comprobaciones

- `tests/officialTeamRoster.test.js`: regresión de cuentas huérfanas, bajas/reactivación, sesiones, recuperación, destinatarios y asignaciones. Sustituye Prisma antes de importar servicios y fuerza una conexión local imposible; no usa producción.
- `tests/teamRosterPostgres.integration.mjs`: consultas reales, baja/reactivación, revocación de tokens/dispositivos, rollback, concurrencia y conservación de historial. Exige el clúster de prueba validado: `127.0.0.1:55448/recognition_test`, usuario `recognition_test`; no carga `.env`.
- `tests/browser/teamRoster.mjs`: renderiza el componente real con datos simulados, APIs interceptadas, diez integrantes, escritorio claro y móvil oscuro. Capturas en `output/team-roster`.
- Regresión relacionada: autorización, recuperación de contraseña, notificaciones/push, dashboard, calendario e historial. Lint y build.

La corrida completa también detectó fallos ajenos a este cambio: contrato de color destructivo en `ProposalDetailsEditor.jsx` y una prueba de `qualityStreakUnit.test.js` que intenta acceder a una base de datos desde una suite unitaria. Se mantienen identificados, sin modificar esos módulos ni habilitar una conexión productiva para satisfacer la prueba.
