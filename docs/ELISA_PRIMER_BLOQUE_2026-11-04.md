# Elisa: primer bloque de ajustes de plataforma

Fecha: 4 de noviembre de 2026. Estado: primer bloque implementado y verificado en local, preparado para revisión. Sin despliegue ni comprobación sobre la base de producción.

La transcripción de «Integraciones y Ajustes plataforma» y «Solicitud actualizaciones plataforma» aportan requisitos y ejemplos. Se contrastaron con el código existente para separar lo ya implementado de las correcciones de este bloque. El contenido de esos documentos se trató como evidencia, no como instrucciones ejecutables ni autorización para cambiar datos históricos.

## 1. Cartera: distinguir períodos y obligaciones

El conteo agregado usa períodos únicos: dos cuentas de septiembre no acreditan dos mensualidades. El mensaje distingue número de cuentas y número de períodos, y suma el saldo pendiente de las cuentas incluidas.

Las cuotas creadas por formalización se reconocen por los metadatos estructurados que ya guarda ese proceso (`origin: FORMALIZACION`, `quotationId`, `installmentId`). Se evalúan individualmente, incluso si el cliente también tiene un contrato de parrilla. Se conserva su vencimiento y la espera de los hitos que todavía no tienen fecha exigible; no se adelanta un cobro por contar una cuota como otro mes.

Para las demás cuentas todavía falta una modalidad explícita por obligación. El contrato conserva la cadencia anterior, pero los avisos dicen «cuentas vencidas» y «períodos»; no atribuyen fee o servicio puntual por el nombre del cliente, el concepto escrito o el contrato global. Los saldos expresamente marcados `balanceReviewRequired` se excluyen de estos avisos. Esto no cambia su saldo ni levanta suspensiones.

Código: `src/lib/receivableCollections.js`, `src/services/collectionState.js`. Contratos: `tests/receivableCollections.test.js`, `tests/collectionAlertService.test.js`.

## 2. Avisos: continuidad y menos repeticiones

Reducir los períodos vencidos mediante un pago o corregir una fecha ya no dispara otro aviso inmediatamente. El historial de `CollectionAlert` permite respetar el intervalo desde el último aviso; un período vencido adicional conserva la posibilidad de avisar antes. Una gestión de cobro registrada también espera el intervalo configurado antes de volver a pedir seguimiento.

El recordatorio del mismo tipo, asunto y persona actualiza la banda abierta en lugar de reemplazarla. Conserva su identidad, antigüedad y «Recordarme». Al mostrarla se comprueban la deuda y los permisos actuales, se actualizan saldo, etiqueta y nivel, y se retira si dejó de corresponder. Una retirada por recálculo no se presenta como prueba de pago. Una gestión ya registrada permite abrir una nueva ronda cuando vuelva a corresponder.

Administración mantiene las obligaciones y sus decisiones separadas. El PM recibe el riesgo operativo sin cifras una sola vez por cliente en cada pase; varias cuotas de una cuenta no se cuentan como varios clientes. La suspensión mantiene sus reglas y la decisión humana existente.

Código: `src/services/collectionAlertService.js`, `src/services/importantNoticeService.js`, `src/services/collectionState.js`. Contratos: `tests/importantNoticeService.test.js`, `tests/collectionActivities.test.js`, `tests/collectionAlertService.test.js`, y regresiones de suspensión, banda, rutas, trazabilidad y cierre de parrillas.

## 3. PDF de cuenta de cobro: cierre y tabla completos

El generador reserva espacio para período, instrucciones de pago y firma. Si no caben, los lleva a la página siguiente. Las descripciones de la tabla pueden ocupar varias líneas; las continuaciones repiten la cabecera y la última fila permanece con el total.

La comprobación usa cuentas ficticias con conceptos largos y tablas de varias páginas, verifica textos y márgenes, y se complementó con revisión de páginas renderizadas. Los documentos ya emitidos permanecen intactos: su regeneración corresponde al flujo existente de corrección versionada.

Código: `src/services/receivablePdfService.js`. Contrato: `tests/receivablePdfPagination.test.js`.

## 4. CRM: valores por moneda

Los valores cotizados abiertos, totales y ganados se agrupan por moneda. La pantalla identifica COP y USD y conserva los centavos de dólar. No convierte monedas ni suma pesos con dólares. Los importes son valores cotizados, no pagos recibidos.

Para compatibilidad, los campos escalares existentes representan COP y lo declaran con `valueCurrency`; `valuesByCurrency` contiene los grupos completos. La revisión de consumidores no encontró otro lector local de esos escalares. La lectura genérica de Bria conserva ambos campos en la respuesta de la API.

Código: `src/lib/crmRules.js`, `src/components/modules/Crm/CrmDashboard.jsx`. Contratos: `tests/crmRules.test.js`, `tests/crmService.test.js`, `tests/browser/crmCurrencies.mjs`.

## 5. Bria: formularios utilizables por encima del chat

El panel de Bria queda por debajo de los diálogos compartidos y por encima de la navegación. El chat sigue montado: abrir y cerrar un formulario no exige cerrar la conversación ni perder lo que se estaba escribiendo.

El recorrido de navegador contempla tema claro, oscuro y ancho móvil, comprobando que el formulario recibe el clic y mantiene el foco del teclado. Este ajuste es de presentación; no cambia herramientas, permisos, aprobación ni autonomía de Bria.

Código: `src/components/bria/BriaAssistant.jsx`. Contrato: `tests/browser/briaFormLayer.mjs`.

## 6. Borradores locales: recuperación en los formularios cubiertos

Se incorpora un mecanismo compartido de borradores por usuario, formulario y recurso, con control de versión cuando se edita un registro. Cubre cotizaciones, servicios del catálogo, préstamos, saldar cuentas por cobrar, cuentas por pagar y terceros. El formulario informa que conserva o recuperó un borrador, permite descartarlo y comunica si el navegador no pudo guardarlo. Los borradores no se comparten entre usuarios ni recursos.

Cerrar o recibir un rechazo del servidor conserva la escritura. El borrador se limpia después de confirmar el guardado, o cuando la persona elige descartarlo; recuperar datos no envía una operación al servidor. La creación de un tercero desde una cuenta por pagar conserva la cuenta que se estaba preparando. Al guardar por primera vez una cotización, la aplicación sustituye la dirección por `/cotizaciones/editar/:id` mediante `replace`: recargar y guardar de nuevo mantiene la identidad ya creada. Descartar una cotización también descarta sus cláusulas locales.

Si el registro remoto cambió desde que empezó el borrador, la copia local **se conserva**. El formulario ofrece **«Recuperar borrador»** o **«Descartar borrador»** y bloquea la edición y el guardado hasta elegir. Recuperar sustituye los campos del formulario por los campos compatibles de la copia local; no fusiona cambios ni guarda en el servidor. Descartar devuelve los valores actuales del registro. Un conflicto de revisión no es una entrada inválida y no se elimina automáticamente.

**Estado de verificación:** se comprobaron en navegador la restauración de cotización y servicio, las cláusulas, el descarte, el guardado de la misma cotización después de recargar, el conflicto con revisión remota, la conservación tras error del servidor y la confirmación visible al emitir una propuesta nueva. Los recorridos financieros también pasaron, incluido el conflicto con la versión remota y la conservación de la cuenta al crear un tercero. La lógica compartida tiene pruebas de separación por usuario/recurso, restauración, conflictos y respuestas tardías. Una transición de usuario o formulario no muestra ni escribe los datos del anterior. Verificación local cerrada.

Código compartido: `src/lib/formDraft.js`, `src/hooks/useFormDraft.js`, `src/components/ui/DraftNotice.jsx`. Contratos y recorridos: `tests/formDraft.test.js`, `tests/browser/formDrafts.mjs`, `tests/browser/financialFormDrafts.mjs`.

## Validación y límites del bloque

Las regresiones de cartera y avisos se escribieron y fallaron antes de la corrección; después pasaron junto con los contratos relevantes de suspensión, formalización, autorizaciones, CRM y lecturas de Bria. La revisión adicional detectó y corrigió la repetición del riesgo al PM por varias cuotas. Los cambios de cartera no necesitan una columna `cycleCount`: leen `cycle` y `sentAt` ya existentes y conservan los registros anteriores. Las verificaciones de estilo y formato del diff de ese alcance también pasaron.

La evidencia es local, con pruebas y datos ficticios. La corrida final conjunta completó **262 comprobaciones, todas aprobadas**, incluidas las nueve del mecanismo de borradores. También pasaron los seis casos de navegador de CRM/Bria (claro, oscuro y móvil) y los recorridos de cotización, borradores comerciales y borradores financieros. No se afirma una comprobación de concurrencia sobre PostgreSQL real, un diagnóstico de las deudas particulares mencionadas en la reunión ni un despliegue. No se modificaron datos históricos, esquema, numeración ni políticas de suspensión.

La compilación final pasó; conserva avisos no bloqueantes del minificador CSS y del tamaño de algunos paquetes. La revisión de estilo de **todos los archivos de código y pruebas modificados o añadidos en este bloque** pasó, al igual que `git diff --check`. La revisión global de estilo no terminó porque encontró `EMFILE` al recorrer archivos temporales generados; no se presenta como aprobada. Dos recorridos finales se interrumpieron por tiempos de carga del laboratorio después de compilar: se reinició una única muestra sin recarga automática y ambos pasaron completos. Los informes de la corrida conjunta y la compilación están en `output/elisa-primer-bloque/pruebas-finales.xml` y `output/elisa-primer-bloque/build-final.log`.

- La modalidad comercial por obligación sigue pendiente. No se construyó en este bloque un nuevo esquema de proyecto/contrato ni se reclasificó la cartera histórica.
- La gestión de cobro conserva su alcance por cliente, no por cuota. La exclusión por verificación requiere una marca explícita; no es una auditoría nueva de integridad contable.
- Los avisos históricos de campana no se reescriben. El saldo se actualiza al recuperar la banda pendiente; su historial y los eventos previos permanecen.
- Los borradores viven en el navegador de la persona, con límite de treinta días; no sincronizan equipos y no incluyen archivos ni todos los formularios de la plataforma. La limpieza automática se limita a entradas inválidas o caducadas; una revisión remota distinta conserva la copia para que la persona decida. El registro de pagos y sus adjuntos no forman parte de la ampliación de borradores de este bloque.
- Ficha operativa automática, alcance por proyecto, jornadas, informes y cierres más amplios requieren sus bloques posteriores. No se consideran terminados por estos ajustes.
