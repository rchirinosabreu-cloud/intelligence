# Borrador del formulario de movimiento

Rodny, 28 de septiembre de 2026: quien tarda en registrar un movimiento perdía todo lo escrito «porque se cierra y se refresca». Causa confirmada: la sesión dura 12 horas (`AUTH_TOKEN_EXPIRES_IN`, sin refresco silencioso) y, al vencer, la primera petición que hace la página (notificaciones cada minuto, refetch al volver el foco, o el propio «Registrar movimiento») recibe 401 y el interceptor de `src/main.jsx` navega entero a `/login?expired=true`; también una recarga por un despliegue a medias (`preloadRecovery`) borra el estado. Todo el formulario vivía en memoria del componente.

## Qué hace

- `src/lib/financialMovementDraft.js` guarda el formulario **mientras se escribe**, en `localStorage`, con clave por persona (`brain.financial.movementDraft.v1.<userId>`). Contiene los once campos del formulario, los ítems del desglose y, si es una edición, qué movimiento y en qué versión (`updatedAt`) se abrió. Los archivos pendientes **no** se pueden guardar: se conservan solo sus nombres para pedir que se vuelvan a adjuntar.
- Un borrador solo cuenta si tiene contenido real (valor, descripción, contraparte, referencia, notas, cliente, cuenta o ítems); cambiar solo tipo, fecha, categoría o escenario no deja borrador.
- Al abrir «Registrar movimiento» se restaura el borrador de creación; al abrir «Editar» se restaura solo si es del mismo movimiento y de la misma versión (si alguien lo guardó entretanto, el borrador se descarta en silencio). En ambos casos sale «Borrador restaurado».
- En la cabecera de Movimientos, mientras el diálogo está cerrado, una franja avisa «Tienes un movimiento a medio registrar» con **Continuar** y **Descartar borrador**. Dentro del diálogo, el pie dice «Borrador guardado» con la opción de descartarlo.
- Se limpia **solo** después de que el servidor confirme el guardado (junto al cierre del diálogo). Cancelar o cerrar no lo borra. Si el movimiento se creó pero falló el desglose o un documento, el borrador pasa a ser de edición de ese movimiento, porque el diálogo se queda abierto sobre él.
- Un `localStorage` bloqueado o lleno nunca rompe el formulario; una entrada corrupta o de una versión anterior se descarta.
- El borrador no se borra al cerrar sesión ni al vencer la sesión: es precisamente ese caso el que cubre. Otra persona en el mismo navegador no lo ve porque la clave lleva su identificador.

## Verificación

`tests/financialMovementDraft.test.js`: contenido significativo, forma del borrador, almacenamiento por persona, tolerancia a fallos y contrato del libro. Muestra local: `tests/fixtures/financial-search.html` → Registrar movimiento → escribir → recargar la página → franja «Continuar».
