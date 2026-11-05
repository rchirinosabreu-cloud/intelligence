# Elisa: proyectos, ficha operativa y alcance de cobros

Fecha: 4 de noviembre de 2026. Segundo bloque autorizado después de fusionar el primer bloque en PR #1257.

La transcripción y el PDF son evidencia de requisitos. Se contrastaron con la formalización, Operación y Financiero existentes; no autorizan cambios de saldos históricos ni sustituyen decisiones posteriores de AGENTS.md.

## Del alcance aprobado a la ficha operativa

Cada formalización tiene una `ProjectOperation`, independiente del `ClientContract` mensual. Al aprobar se conserva una copia de los campos operativos de la propuesta y del escenario seleccionado. La ficha se ve en «Proyectos y servicios» dentro de Operación del cliente, junto al contrato existente. La formalización pendiente es visible; completar o revisar la ficha requiere que Administración haya habilitado ese proyecto con las reglas existentes.

La fuente conserva servicios, cantidades de líneas, descripción, etapas, duración y procedencia; no incluye campos de tarifas, costos, impuestos, pagos, condiciones contractuales ni documentos financieros. Una cantidad cotizada de servicios no se convierte en cantidad de reels o diseños. Fechas, jornadas, horas e informe que no están estructurados quedan por definir. Si no existe una selección inequívoca del escenario aprobado, no se inventa su alcance y se bloquea la revisión.

El PM puede completar título, modalidad mensual/puntual/mixta, fechas, responsable, entregables/unidades, jornadas, horas totales de producción, informe y notas. Guardar un borrador conserva lo incompleto. Confirmar revisión requiere los datos operativos explícitos y registra autor, fecha y versión. Editar después exige revisar nuevamente; la copia comercial original nunca se reescribe. Esta revisión organiza la ejecución, no aprueba adicionales comerciales ni modifica la cotización.

Los cambios llevan revisión esperada y auditoría inmutable. Si otra sesión modificó la ficha, se conserva el texto local, se bloquea el reenvío y se ofrece cargar expresamente la versión actual. Los borradores usan el mecanismo compartido por persona, recurso y versión. La pantalla muestra errores de lectura; una consulta fallida no equivale a que no haya proyectos.

Preparar y habilitar son idempotentes. La habilitación y sus cambios de documentos/requisitos/anticipo releen bajo el mismo bloqueo; habilitar, preparar la ficha y auditar se confirman en la transacción. Las formalizaciones anteriores recuperan una ficha faltante desde el proceso existente, sin modificar contratos mensuales ni repetir avisos al PM. Consultar proyectos no escribe.

## Modalidad y gestión por obligación

`AccountsReceivable.metadata.collectionMode` permite declarar mensualidad, servicio puntual o cuota. El legado sin modalidad continúa sin clasificar, con la cadencia anterior y texto neutral. Una cuota creada por formalización conserva su procedencia y no puede transformarse en mensualidad desde el selector. Cambiar modalidad no cambia dinero ni regenera documentos emitidos.

Las gestiones pueden cubrir una obligación concreta o, de forma explícita, toda la cartera del cliente. Cobrar una cuota no silencia otra ni el servicio mensual. Un aviso agrupado entrega los identificadores de las obligaciones de su lectura; el seguimiento registra exactamente esa selección, revalidada por el servidor, y no incorpora deudas posteriores. Una selección ausente u obsoleta requiere actualizar la vista, sin reenvío automático. El historial declara errores y recortes.

## Alcance y continuidad

- Se conservan cotizaciones, formalización configurable, contratos mensuales, cuentas, importes, numeración, suspensión humana y autorizaciones de módulos existentes.
- Operación continúa restringida a administradores y project managers activos. Ver habilitación no concede acceso al contrato firmado ni a sus importes.
- Jornadas y horas se definen en el alcance de la ficha. Registrar su ejecución, relacionar tareas/piezas con cada entregable y ampliar informes/cierres por proyecto pertenecen al bloque posterior; la ficha revisada no prueba cumplimiento.
- No se modificaron saldos históricos ni se diagnosticaron los casos reales con Elisa. Tampoco se generaron pagos, cuentas adicionales, mensajes a clientes o publicaciones.
- El esquema es aditivo: tabla nueva e índices, script encadenado al arranque. PostgreSQL se conserva; no hay migraciones locales ni cambios de CORS.

## Verificación

Pruebas escritas antes de la implementación para rutas, reglas, persistencia y recorrido de pantalla. La corrida conjunta del alcance completó **670 pruebas aprobadas**, sin fallos ni omisiones. Otras **11 comprobaciones con PostgreSQL local aislado** validaron esquema aditivo, habilitaciones simultáneas, conflicto de revisiones, permisos revocados, idempotencia, rollback y selección de obligaciones. Cada prueba de base usa su propio esquema temporal; no utiliza tablas productivas.

Los recorridos de navegador comprueban proyectos simultáneos, lectura de fechas en Bogotá, revisión operativa, borradores tras error, conflicto entre sesiones, origen comercial ambiguo, modalidad por deuda y gestiones individuales. Se revisaron pantallas claras, oscuras y móviles. La compilación, el análisis de código sin uso y la revisión de estilo del alcance pasaron. La compilación conserva advertencias no bloqueantes de tamaño de paquetes y minificación CSS.

Los registros locales están en `output/elisa-segundo-bloque/pruebas.xml`, `pruebas.log`, `postgres.log`, `build.log` y `dead-code.log`. Las capturas están en `output/proyectos-operativos` y `output/receivable-collection-scope`.

El estado de despliegue se informa por separado: las comprobaciones locales no certifican producción.
