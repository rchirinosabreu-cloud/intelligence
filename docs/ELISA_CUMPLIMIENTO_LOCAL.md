# Revisión de alcance y cumplimiento · 5 de noviembre de 2026

El siguiente incremento se revisa en local. Las decisiones conservadas son mantener PM y community de la plataforma, abandonar la hoja como fuente operativa, conservar el historial y no deducir renovaciones, desactivaciones o cantidades por color o por una nota antigua. La renovación de cuatro contenidos indicada por el usuario prevalece sobre la referencia anterior de esa cuenta; esto es evidencia de revisión privada, no una excepción codificada en el producto.

## Cambio de producto preparado

`src/services/briaAssistantTools.js` corrige la lectura de informes pendientes o en revisión, que antes podían aparecer entregados por la sola existencia del registro. Expone estado y fecha; los registros sin estado requieren fecha válida. `ENVIADO` acredita el estado de envío, aunque una fecha inválida se entregue como desconocida.

Las lecturas `operacion_de_cliente` y `cartera_de_operacion` incorporan el alcance estructurado v1 autorizado: formatos, reglas exactas/mínimas/máximas, unidad de historias, jornadas y horas por jornada, servicios y preguntas pendientes. No cambian cupos, permisos, contratos, asignaciones ni autonomía. Una forma de datos incompatible se declara desconocida; no se reconstruye con campos anteriores. Las instrucciones específicas permanecen en las descripciones de herramientas.

Pruebas: `tests/briaOperationScope.test.js`, acompañadas de las pruebas existentes de acceso, herramientas, contexto de decisión, fuentes y capacidades. No requiere cambios de esquema.

## Muestra local para revisión

**Corrección de enfoque solicitada por Rodny:** Clientes ya obtiene el avance y su semáforo de las parrillas y piezas del cliente. El panel experimental de registro, evidencia y validación de entregas duplicaba ese recorrido. Se retira de la muestra: no es un requisito aprobado ni una etapa pendiente que deba llevarse a producción.

Los archivos de trabajo y los datos privados permanecen fuera del repositorio, en `output/elisa-cumplimiento-local/`. La vista conserva `ClientOperationPage`, `summarizeCycle` y `evaluateClientOperation` del producto, sin otro cálculo de cumplimiento ni motivos adicionales en el semáforo. Se sirve exclusivamente en `127.0.0.1:3842`, sin cargar `.env`, sin proxy y rechazando escrituras de API.

- `/revision`: revisión de solo lectura de 24 fichas a partir de capturas del 4 y 5 de noviembre; no representa una consulta en vivo. Se preservan asignaciones, contratos y renovaciones. Hay nueve cuentas con preguntas prioritarias y otras preguntas para precisar unidades o completar detalle. Sin preguntas nuevas no equivale a contrato certificado.
- `/clientes/operacion/monthly-demo`: cliente ficticio con cuatro piezas de parrilla. El avance sale de esas piezas con las funciones nativas; los campos estructurados permanecen en la ficha operativa. No hay registro de ejecución adicional.
- La muestra de seguimiento puntual manual queda retirada del menú; su dirección anterior vuelve a Clientes. No se modifica el módulo real de proyectos.

La acción nativa «Ya se publicó» conserva el mismo registro de pieza y recalcula la vista; no crea otra entrega ni pide un soporte adicional. Una pieza en revisión no se transforma en publicada por registrar una ejecución externa. El semáforo no incorpora bloqueos por formularios o comprobaciones de este prototipo.

Los datos ficticios se reinician al recargar. La revisión de las 24 fichas continúa en solo lectura. El motor experimental y sus capturas anteriores se conservan únicamente como antecedentes descartados; no se importan a la vista ni al producto.

## Pendiente después de revisar la muestra

Primero contrastar cada solicitud con el recorrido existente de Clientes, Parrillas, Gestión y proyectos. Cualquier ampliación debe reutilizar esos registros; no pedir a las personas confirmar o registrar otra vez trabajo ya representado. Solo después de identificar una carencia concreta procede proponer un cambio. Las preguntas pendientes del contrato no generan por sí mismas un control de ejecución adicional.

Antes de aplicar cantidades a clientes reales deben aclararse los acuerdos pendientes. No se completan por inferencia ni se convierte una cotización editable en una versión aceptada inmutable. La lógica existente de parrillas externas se revisará por separado donde corresponda; esta corrección no cambia fuentes ni clientes.

Para verificar la vista corregida: `native-followup-check.mjs`, `verify-client-review.mjs` y `verify-client-review-ui.mjs` en el directorio de salida. `serve.mjs` arranca la vista. Las capturas se toman en escritorio, en ambos temas.

## Revisión de alertas y clasificación (5 de noviembre)

La ficha muestra inicialmente cuatro alertas operativas, ordenadas por gravedad y con acceso al periodo, informe o tareas correspondientes. El resto se despliega por elección. El aviso contractual se desarrolla en la ficha, sin duplicar su texto completo arriba. El color sigue saliendo de la evaluación nativa, no del límite de presentación. Las fechas planificadas se describen como planificación, no como publicaciones confirmadas. Las observaciones quedan después de toda la operación, con cuatro entradas iniciales y fecha de incorporación para las importadas; dejan de aparecer como «lo más urgente» en la cartera.

Cada periodo histórico conserva el cupo, corte y requisito de informe del contrato que le corresponde. Una renovación futura no reemplaza el alcance actual antes de comenzar; lectura, guardado, suspensión y aviso de trabajo sin respaldo seleccionan el mismo contrato para el día de Bogotá. No se añade registro manual de cumplimiento. Limitaciones conservadas: dos ciclos de contratos distintos dentro del mismo mes comparten una parrilla sin vínculo de contrato, por lo que este cambio no reparte ni prorratea ese mes; editar un contrato existente tampoco crea una versión histórica. La cadencia financiera de cartera conserva sus reglas propias y no cambia en este bloque.

Los formatos de contrato distinguen Video, Reel, Carrusel, Post, Otro y Sin clasificar. Un desglose parcial conserva las categorías identificadas y la diferencia pendiente; «Otro» no sustituye automáticamente un formato desconocido. Las notas del contrato permanecen disponibles, plegadas debajo del alcance.

La preparación privada en `output/client-format-review/` contrasta las 24 filas de MIO con los registros existentes y la lectura nueva del 5 de noviembre. Hay 12 correcciones inequívocas de formato; no cambian cupos, responsables ni historia. Las excepciones humanas ya confirmadas se conservan. Los límites máximos y los textos ambiguos quedan para revisión, sin convertirlos en cantidades exactas. El manifiesto comprueba identidad de cliente/contrato y valores anteriores; no escribe en producción. Los datos operativos de la vista siguen siendo una copia fechada del 4 de noviembre: volver a leer la hoja no actualiza publicaciones ni tareas. El detalle guardado completa notas y alcance del mismo contrato, sin sustituir otros valores. Las observaciones de esa copia no coinciden en todos los casos con la captura más reciente del usuario; se identifican como históricas y no se sobrescribe producción ni se reconstruyen por inferencia.

Contratos de prueba: `clientOperationAlerts`, `clientOperationReasons`, `clientOperationContextUi`, `clientOperationRenewals`, `clientOperations`, `clientContractScopeUi` y recorrido visual `tests/browser/clientOperationAlerts.mjs`. No requiere cambio de esquema. Fusión del código autorizada el 5 de noviembre; las correcciones de datos del manifiesto privado requieren aplicación separada. Este bloque no incluye cambios al recorrido producción → pendiente de publicación, que se auditó por separado.
