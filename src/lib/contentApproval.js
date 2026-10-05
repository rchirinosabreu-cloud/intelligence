// Una aprobación es de **lo que el cliente vio**, no de la pieza para siempre (Rodny, 5 de octubre
// de 2026). El flujo real de la agencia manda primero la parrilla escrita —ideas, copies, captions—
// y el cliente aprueba eso; el material terminado, la foto o el video, llega después. Hasta ahora la
// pieza se quedaba en verde, y al reenviarle el enlace el cliente se encontraba «Pieza aprobada, ya
// pasó a producción»: sin botón para aprobar lo nuevo y sin forma de pedir un cambio. Un callejón
// sin salida justo en el momento en que más falta hace su opinión.
//
// `ContentItem.revisionRequestedAt` dice «le pedimos otra vuelta». Se pone solo cuando llega material
// a una pieza que ya estaba aprobada, y también a mano desde el editor; se borra cuando el cliente
// vuelve a decidir, apruebe o pida un cambio.

/** Estados en los que el cliente ya dio el visto bueno a lo que tenía delante. */
export const APPROVED_STATUSES = ['APROBADO', 'REALIZADO', 'PUBLICADO'];

export const isApprovedStatus = (status) => APPROVED_STATUSES.includes(status);

export const APPROVAL_STATES = {
  /** No la ha aprobado, o pidió un cambio y está en nuestras manos. */
  POR_REVISAR: 'POR_REVISAR',
  /** La aprobó, pero después cambió el material y le pedimos que la viera otra vez. */
  MATERIAL_NUEVO: 'MATERIAL_NUEVO',
  /** Aprobó exactamente lo que hay ahora. */
  APROBADA: 'APROBADA'
};

export const approvalState = (item) => {
  if (!isApprovedStatus(item?.status)) return APPROVAL_STATES.POR_REVISAR;
  return item?.revisionRequestedAt ? APPROVAL_STATES.MATERIAL_NUEVO : APPROVAL_STATES.APROBADA;
};

/** Lo que el cliente tiene pendiente: tanto lo que nunca vio como lo que cambió después de aprobarlo. */
export const needsClientReview = (item) => approvalState(item) !== APPROVAL_STATES.APROBADA;

/** Lo que ya está cerrado de verdad. Es lo que cuenta el avance del portal. */
export const isSettled = (item) => approvalState(item) === APPROVAL_STATES.APROBADA;

/**
 * Si llega material a una pieza ya aprobada, el cliente aprobó otra cosa: hay que pedirle otra vuelta.
 * Una pieza que nunca aprobó no se toca — ya está pendiente y marcarla no añadiría nada.
 */
export const shouldRequestRevisionOnNewAsset = (item) => isApprovedStatus(item?.status);

/**
 * Las piezas de una parrilla a las que tiene sentido pedirles una vuelta nueva: las que el cliente
 * ya aprobó y todavía no tienen la petición puesta. Las demás ya están en su lado del tablero.
 */
export const itemsNeedingRevisionRequest = (items = []) => items.filter(
  (item) => isApprovedStatus(item?.status) && !item?.revisionRequestedAt
);
