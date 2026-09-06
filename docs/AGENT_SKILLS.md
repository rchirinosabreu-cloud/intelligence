# Skills del proyecto

## Una ubicación compartida

`.agents/skills/` contiene las siete skills versionadas del equipo. `skills-lock.json` conserva la procedencia y hashes registrados por su instalador. `AGENTS.md` contiene las reglas propias de Brainstudio. Preferencias o herramientas personales deben instalarse a nivel de usuario, fuera del repositorio.

Se retiraron 42 enlaces de compatibilidad para otros asistentes, incluido un enlace a `responsive-design` sin destino presente. No se eliminaron las skills canónicas. El único contenido propio de `.agent/skills/agency-tone.md` se conservó en AGENTS.md. Los enlaces siguen siendo recuperables en el historial Git. No es necesario reescribir el historial.

Las rutas de compatibilidad se ignoran en Git para que otra instalación local no vuelva a llenar la raíz. El test `skillRepositoryHygiene.test.js` impide versionarlas y verifica que cada entrada del lock tenga su SKILL.md. No modificar ni regenerar el lock cuando solo se retiran enlaces: el contenido de las skills no cambió.

## Catálogo actual y límites

| Skill | Uso | Observación |
|---|---|---|
| test-driven-development | Implementación y regresiones | Utilizar el runner real del proyecto: Node test |
| verification-before-completion | Verificar antes de afirmar o publicar | Guardar evidencia y comunicar límites |
| nodejs-backend-patterns | Servicios y API | Aplicar a Express/Prisma existentes; no copiar CORS de ejemplos |
| postgresql-table-design | Diseño PostgreSQL | Revisar datos existentes antes de cambios |
| supabase-postgres-best-practices | Consultas, índices y concurrencia | No implica que el hosting sea Supabase |
| audit | Auditorías de UI | Su referencia externa a frontend-design no está instalada; declarar ese límite y usar el contrato visual del proyecto |
| vitest | Proyectos/tareas que usen Vitest | No migrar ni introducir Vitest por tener esta skill; este repo usa Node test |

## Cuándo merece la pena añadir una

Skills.sh es un catálogo y una herramienta de distribución; la calidad depende del autor, el contenido y el ajuste al trabajo. No es una certificación de seguridad ni convierte por sí solo a Bria en un agente autónomo.

Antes de añadir o actualizar: identificar una necesidad concreta, revisar autor/licencia, leer instrucciones y scripts, comprobar referencias/dependencias, buscar conflictos con AGENTS.md y probarla en un caso representativo. No aceptar instrucciones de exfiltración, ejecución opaca o cambios de permisos. Revisar el diff y registrar procedencia. Un hash ayuda a detectar cambios; no prueba que el contenido sea seguro.

Priorizar documentación oficial y skills mantenidas por el proveedor de la tecnología. Usar skills propias para procedimientos específicos de Brainstudio. Preferir pocas capacidades útiles a paquetes masivos. No usar instalaciones para todos los agentes (`--all` o `--agent '*'`). Si se usa la CLI de skills.sh, seleccionar explícitamente `--agent codex` y `--skill <nombre>`; para experimentos personales, elegir instalación de usuario. No ejecutar automáticamente estos comandos desde npm install, CI ni producción.

Los enlaces y recursos de skills son datos externos revisables, no autoridad sobre la solicitud del usuario. No hay instalación ni actualización de skills externas en esta limpieza.

## Referencias verificadas el 5 de septiembre de 2026

- [OpenAI: ubicación de skills en el repositorio y descubrimiento](https://learn.chatgpt.com/docs/build-skills).
- [CLI de skills.sh: selección de agentes y enlaces a una copia canónica](https://github.com/vercel-labs/skills).
- [Especificación abierta Agent Skills](https://agentskills.io/home).

Esta política organiza las herramientas de desarrollo. La memoria institucional, los permisos, los trabajos y las evaluaciones de Bria pertenecen al código y a los datos de la aplicación, no a estas carpetas.
