// La modalidad pertenece a la obligación. El contrato del cliente no clasifica una cuenta histórica.
export const RECEIVABLE_COLLECTION_MODES = Object.freeze([
    { value: 'MENSUAL', label: 'Mensualidad' },
    { value: 'PUNTUAL', label: 'Servicio puntual' },
    { value: 'CUOTA', label: 'Cuota' }
]);

export const isFormalizationInstallment = (receivable) => receivable?.metadata?.origin === 'FORMALIZACION'
    && Boolean(receivable.metadata.quotationId && receivable.metadata.installmentId);

export const isReceivableCollectionMode = (value) => RECEIVABLE_COLLECTION_MODES.some((mode) => mode.value === value);

export const receivableCollectionMode = (receivable) => {
    if (receivable?.kind === 'PRESTAMO') return null;
    if (isFormalizationInstallment(receivable)) return 'CUOTA';
    const value = receivable?.metadata?.collectionMode;
    return isReceivableCollectionMode(value) ? value : null;
};

export const collectionModeLabel = (value) => RECEIVABLE_COLLECTION_MODES.find((mode) => mode.value === value)?.label || 'Sin clasificar';
