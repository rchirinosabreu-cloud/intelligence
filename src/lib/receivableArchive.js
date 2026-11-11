// Archivar una cuenta del cobro (Elisa y Rodny, 11 de noviembre de 2026: «esas deudas que se vienen
// arrastrando de periodos anteriores no eliminarlas, sino que no aparezcan en las notificaciones»).
//
// Una cuenta archivada sigue existiendo con su saldo, sus abonos y su historia: solo deja de cobrarse.
// No genera avisos de cartera, no cuenta para suspender al cliente ni en la antigüedad de lo vencido.
// Desarchivarla la devuelve al cobro tal cual. La marca vive en `metadata.collectionArchive`.

export const ARCHIVE_REASON_MAX = 300;

/** Archivada del cobro: la marca de la base (`metadata`) o la de la respuesta ya serializada. */
export const isCollectionArchived = (receivable) => Boolean(
    receivable?.collectionArchive?.archivedAt || receivable?.metadata?.collectionArchive?.archivedAt
);

/** Qué falta para archivar, en palabras; `null` si está completo. */
export const collectionArchiveProblem = ({ reason } = {}) => {
    const text = String(reason ?? '').trim();
    if (!text) return 'Escribe por qué se archiva esta cuenta del cobro.';
    if (text.length > ARCHIVE_REASON_MAX) return `El motivo admite como máximo ${ARCHIVE_REASON_MAX} caracteres.`;
    return null;
};
