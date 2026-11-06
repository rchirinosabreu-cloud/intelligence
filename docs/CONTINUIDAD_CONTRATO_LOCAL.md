# Decisión de no renovar — revisión local, 6 de noviembre de 2026

Rodny señaló que Desarrollo Económico ya confirmó que no continuará. La plataforma debe registrar esa decisión, dejar de pedir renovación/continuidad y conservar los pendientes de publicación, entrega, informe y cobro. El vencimiento señalado es el 18 de noviembre; no se adelanta la finalización ni se cambia el estado del cliente por inferencia.

## Resultado

- La banda ofrece **El cliente no renovará** cuando hay una fecha de fin y revisión del contrato. Abre una confirmación con la fecha, las consecuencias y una nota opcional; cancelar no atiende el aviso.
- El PM asignado o un administrador activo con acceso a Clientes puede confirmar. Identidad, asignación, permisos y revisión se verifican nuevamente en el servidor.
- `ClientContract.renewalDecision` guarda el estado común, con autor, nombre, fecha y nota. `ClientContractDecision` conserva un historial inmutable, incluso al corregir la decisión. No es un seguimiento adicional.
- El contrato sigue conservando estado, fechas, alcance, PM y community. No se cancela ni completa ninguna pieza, tarea, informe, cobro o suspensión existente.
- La banda resuelve los avisos de renovación y continuidad del mismo contrato para todas las personas. Las campanas individuales de esos asuntos quedan leídas sin borrar el historial. Las campanas agrupadas históricas no se reescriben porque pueden incluir otras cuentas.
- Los relojes de renovación y riesgo operativo dejan de generar esos avisos; cierre, informe y cartera administrativa conservan sus reglas. Los pendientes posteriores al vencimiento piden resolver el trabajo, no renovar de nuevo.
- La ficha muestra la decisión y permite **Corregir decisión**, con motivo obligatorio. Una nueva renovación registrada usa un contrato nuevo y no hereda la decisión anterior.
- Una confirmación de un contrato cambiado se rechaza; dos confirmaciones simultáneas solo guardan una. La vigencia de un contrato con no renovación confirmada requiere corregir primero la decisión para editarse.
- Bria recibe la decisión en el detalle y la cartera operativa, como dato del contrato. La confirmación contractual se realiza en pantalla, no por una acción inferida de Bria.

## Verificación

Pruebas de reglas, servicios y permisos: `contractContinuity`, `contractContinuityPostgres`, `contractCycleAlerts`, `collectionAlertService`, `clientOperations`, `clientOperationsService`, `clientOperationsRoutes`, avisos operativos/importantes, `notificationVisibilityPostgres`, `briaOperationScope`, `briaDecisionContext`, `auditImmutability`, catálogo y límites de autorización. La prueba de PostgreSQL usa esquemas aleatorios en la base local aislada; comprueba concurrencia, historial, permisos, datos conservados e instalación aditiva repetible.

Navegador: `browser/contractContinuity.mjs` valida confirmar/cancelar/corregir, recarga, colores, teclado, escritorio y móvil. `browser/noticeCard.mjs` y `browser/noticeAccessibility.mjs` conservan el recorrido de la banda. `browser/clientContractScope.mjs` incluye una cuenta que finalizó sin renovar y mantiene sus pendientes.

Capturas y resultados locales en `output/continuidad-local` y `output/continuity-*.log`. La generación de Prisma se validó con una salida aislada: otra muestra local usa el motor compartido de Windows y bloquea su sustitución. La compilación web se valida con `vite build`; conserva las advertencias existentes de tamaño de paquetes y una clase CSS detectada en otro servicio.

## Estado y límites

Solo local. No fusionado ni desplegado. No se guardó todavía la decisión de Desarrollo Económico en producción. El despliegue necesita el ensure aditivo `ensure-contract-continuity-schema.js`, ya encadenado antes de proteger el historial. No se ejecutó contra producción.

La muestra `node scripts/preview-operational-notices.mjs` usa datos ficticios y memoria local; sus decisiones sobreviven a la recarga, no al reinicio del proceso. La persistencia real se verifica por separado en PostgreSQL local. El envío push previo no puede retirarse del dispositivo; la decisión detiene la generación posterior y conserva el historial.
