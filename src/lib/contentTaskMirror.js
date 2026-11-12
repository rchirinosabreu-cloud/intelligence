// Qué estado toma una pieza de parrilla cuando cambia el estado de su tarea en Gestión. Una sola regla para el
// cambio de una tarea y para el estado conjunto de las compartidas.
//
// Rodny, 12 de noviembre de 2026: una pieza realizada volvió a «En producción» porque se guardó su pendiente
// «[Publicar]». Que la publicación esté pendiente o en curso no devuelve la pieza a producción: la pieza ya
// está hecha. Solo si se reabre la publicación de una pieza publicada, la pieza vuelve a «Realizado».
// `null` significa no tocar la pieza.
export const contentItemStatusFromTask = ({ newStatus, isPublication = false, itemStatus = null }) => {
    if (newStatus === 'REALIZADA') return isPublication ? 'PUBLICADO' : 'REALIZADO';
    if (newStatus === 'DEVUELTA') return 'DEVUELTO';
    if (newStatus === 'PENDIENTE' || newStatus === 'EN_CURSO') {
        if (!isPublication) return 'EN_PRODUCCION';
        return itemStatus === 'PUBLICADO' ? 'REALIZADO' : null;
    }
    return null;
};
