// Formalización y habilitación de un proyecto (punto 3 de la solicitud de Elisa; Rodny, 29 de octubre de 2026). Una
// cotización aprobada abre su formalización: Administración carga el contrato firmado y se confirma el anticipo, o
// Dirección o Administración autorizan empezar sin él. Con las dos cosas el proyecto queda «Habilitado para iniciar» y
// el project manager recibe el aviso. La misma regla la leen la pantalla y el servidor.
//
// - Quién formaliza: las áreas Dirección y Administrativa y contable. Son las únicas que ven el contrato y las cifras.
// - El anticipo es la primera cuota del plan de pagos de la cotización; está confirmado cuando su cuenta por cobrar
//   quedó pagada. Un pago a medias no habilita.
// - La excepción no borra la deuda: el anticipo sigue en Cuentas por cobrar con la fecha de pago acordada.

export const FORMALIZATION_AREAS = Object.freeze(['DIRECCION', 'ADMINISTRATIVA']);
export const FORMALIZATION_REASON_MAX = 300;
export const FORMALIZATION_CONDITIONS_MAX = 500;
export const FORMALIZATION_NOTE_MAX = 300;

// Lo que se carga a una formalización (Rodny, 29 de octubre de 2026: el otrosí y los anexos). Solo un contrato vigente
// habilita el proyecto; un otrosí o un anexo suelto no lo dan por formalizado.
export const FORMALIZATION_DOCUMENT_KINDS = Object.freeze([
    { value: 'CONTRATO', label: 'Contrato' },
    { value: 'OTROSI', label: 'Otrosí' },
    { value: 'ANEXO', label: 'Anexo' }
]);
export const isFormalizationDocumentKind = (value) => FORMALIZATION_DOCUMENT_KINDS.some((kind) => kind.value === value);
export const formalizationDocumentKindLabel = (value) => FORMALIZATION_DOCUMENT_KINDS.find((kind) => kind.value === (value || 'CONTRATO'))?.label || 'Documento';
/** Los documentos que cuentan: los que no se anularon. */
export const currentDocuments = (documents = []) => documents.filter((document) => !document.voidedAt);
// Un otrosí también es un acuerdo firmado (Rodny, 29 de octubre de 2026): a un cliente que suma un servicio le basta.
// Un anexo, no.
const SIGNED_KINDS = new Set(['CONTRATO', 'OTROSI']);
const isCurrentContract = (document) => !document.voidedAt && SIGNED_KINDS.has(document.kind || 'CONTRATO');

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const quotationCode = (quotation) => `COT-${String(quotation?.consecutive ?? 0).padStart(4, '0')}`;

const toCents = (value) => Math.round((Number(value) || 0) * 100);

/**
 * En qué va el anticipo, leyendo su cuenta por cobrar: `SIN_CUENTA` si no hay ninguna ligada, `PAGADO` si quedó
 * cubierta, `PARCIAL` si ya entró dinero pero no todo, y `PENDIENTE` si no ha entrado nada.
 */
export const advanceState = (receivable) => {
    if (!receivable) return 'SIN_CUENTA';
    if (receivable.status === 'PAGADO' || receivable.status === 'SALDADO') return 'PAGADO';
    const paid = (receivable.payments || []).reduce((sum, payment) => (
        payment.reversedAt || (payment.kind && payment.kind !== 'PAGO') ? sum : sum + toCents(payment.amount)
    ), 0);
    if (paid >= toCents(receivable.amount) && paid > 0) return 'PAGADO';
    return paid > 0 ? 'PARCIAL' : 'PENDIENTE';
};

/**
 * Lo que tiene y lo que le falta a una formalización. `ready` es la condición para habilitar el proyecto: lo que se pide
 * en ese proyecto, cumplido. Por defecto se piden el contrato (o un otrosí) y el anticipo pagado, o la excepción
 * autorizada; Dirección o Administración pueden dejar de pedir cualquiera de los dos en un proyecto (Rodny, 29 de
 * octubre de 2026: un cliente de siempre que suma un servicio).
 */
export const formalizationState = ({ documents = [], advance = null, exceptionAt = null, requiresContract = true, requiresAdvance = true } = {}) => {
    const signed = documents.some(isCurrentContract);
    const contract = signed || requiresContract === false;
    const advanceStatus = advanceState(advance);
    const advanceCovered = requiresAdvance === false || advanceStatus === 'PAGADO' || Boolean(exceptionAt);
    const missing = [];
    if (!contract) missing.push('CONTRATO');
    if (!advanceCovered) missing.push('ANTICIPO');
    return {
        contract, signed, advance: advanceStatus, exception: Boolean(exceptionAt), advanceCovered,
        requiresContract: requiresContract !== false, requiresAdvance: requiresAdvance !== false, ready: missing.length === 0, missing
    };
};

const MISSING_TEXT = { CONTRATO: 'el contrato firmado', ANTICIPO: 'el anticipo' };

/** «Falta el contrato firmado y el anticipo», para la pantalla. Vacío si no falta nada. */
export const missingText = (missing = []) => {
    const parts = missing.map((key) => MISSING_TEXT[key]).filter(Boolean);
    if (!parts.length) return '';
    return `Falta ${parts.length === 2 ? `${parts[0]} y ${parts[1]}` : parts[0]}`;
};

/** El tipo y la nota de un documento que se sube: el tipo es obligatorio y la nota opcional. Devuelve el problema o null. */
export const documentUploadProblem = ({ kind, note } = {}) => {
    if (!isFormalizationDocumentKind(kind)) return 'Elige si es el contrato, un otrosí o un anexo.';
    if (String(note ?? '').trim().length > FORMALIZATION_NOTE_MAX) return `La nota admite como máximo ${FORMALIZATION_NOTE_MAX} caracteres.`;
    return null;
};

/** Lo que se pide en un proyecto: las dos casillas son booleanas y la nota opcional. Devuelve el problema o null. */
export const requirementsProblem = ({ requiresContract, requiresAdvance, note } = {}) => {
    if (typeof requiresContract !== 'boolean' || typeof requiresAdvance !== 'boolean') return 'Marca si se pide el contrato y si se pide el anticipo.';
    if (String(note ?? '').trim().length > FORMALIZATION_NOTE_MAX) return `La nota admite como máximo ${FORMALIZATION_NOTE_MAX} caracteres.`;
    return null;
};

/** «Se pide el contrato y el anticipo», para la tarjeta. */
export const requirementsText = ({ requiresContract = true, requiresAdvance = true } = {}) => {
    if (requiresContract && requiresAdvance) return 'Se pide el contrato firmado y el anticipo.';
    if (requiresContract) return 'Se pide el contrato firmado; el anticipo no.';
    if (requiresAdvance) return 'Se pide el anticipo; el contrato no.';
    return 'No se pide ni contrato ni anticipo.';
};

/** El motivo para anular un documento subido por error: obligatorio, porque el archivo se conserva. */
export const documentVoidProblem = (reason) => {
    const why = String(reason ?? '').trim();
    if (!why) return 'Escribe por qué se anula el documento.';
    if (why.length > FORMALIZATION_REASON_MAX) return `El motivo admite como máximo ${FORMALIZATION_REASON_MAX} caracteres.`;
    return null;
};

/** El aviso a Administración: sin cifras, porque la campana también llega al celular. */
export const formalizationRequestText = (clientName, code) => (
    `${clientName || 'Un cliente'} aprobó la ${code}: falta el contrato firmado y el anticipo para habilitar el proyecto.`
);

/** El aviso al project manager: solo que puede empezar. Nunca cifras ni condiciones. */
export const formalizationEnabledText = (clientName) => (
    `El proyecto de ${clientName || 'un cliente'} quedó habilitado para iniciar: asigna responsables y programa el inicio.`
);

/**
 * Valida la autorización para empezar sin el anticipo: motivo obligatorio, condiciones opcionales y la fecha de pago
 * acordada, que no puede quedar en el pasado. Devuelve el mensaje del primer problema o null.
 */
export const exceptionProblem = ({ reason, conditions, paymentDate } = {}, today) => {
    const why = String(reason ?? '').trim();
    if (!why) return 'Escribe el motivo de la excepción.';
    if (why.length > FORMALIZATION_REASON_MAX) return `El motivo admite como máximo ${FORMALIZATION_REASON_MAX} caracteres.`;
    if (String(conditions ?? '').trim().length > FORMALIZATION_CONDITIONS_MAX) return `Las condiciones admiten como máximo ${FORMALIZATION_CONDITIONS_MAX} caracteres.`;
    const day = String(paymentDate ?? '').trim();
    if (!day) return 'Elige la fecha de pago acordada.';
    if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T12:00:00Z`)) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) return 'La fecha de pago acordada no es válida.';
    if (today && day < today) return 'La fecha de pago acordada no puede estar en el pasado.';
    return null;
};
