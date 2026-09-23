// La identidad con la que un tercero aparece en un documento de cobro: el nombre
// legal y su documento. No es el nombre con el que el equipo lo llama —la ficha se
// llama «Titanes» y el documento dice «CORPORACIÓN DEPORTIVA LOS TITANES»— así que
// se guarda aparte y se escribe una sola vez, no en cada cuenta de cobro.

// La etiqueta es la que ya reciben los clientes en los documentos de Word.
// Si alguna vez hay que cambiarla, se cambia aquí y en un solo sitio.
export const PARTY_DOCUMENT_TYPES = Object.freeze([
    { value: 'CC', label: 'CC.', name: 'Cédula de ciudadanía' },
    { value: 'NIT', label: 'NIT:', name: 'NIT' },
    { value: 'CE', label: 'CE.', name: 'Cédula de extranjería' },
    { value: 'PAS', label: 'Pasaporte', name: 'Pasaporte' }
]);

export const PARTY_LEGAL_NAME_MAX = 200;
export const PARTY_DOCUMENT_NUMBER_MAX = 30;
// Dígitos y los separadores que la gente escribe de verdad: «33.334.977»,
// «901378858-1». Un pasaporte admite además letras.
const NUMERIC_DOCUMENT = /^[0-9][0-9.\-\s]*[0-9]$/;
const PASSPORT_DOCUMENT = /^[A-Za-z0-9][A-Za-z0-9.\-\s]*[A-Za-z0-9]$/;

export const partyDocumentType = (value) =>
    PARTY_DOCUMENT_TYPES.find((type) => type.value === String(value || '').trim().toUpperCase()) || null;

/**
 * Valida y normaliza la identidad. El número **se guarda como lo escriben**: no se
 * reformatea un documento de identidad, porque «arreglarlo» es cómo se introducen
 * errores en un dato que después va impreso y hay que cotejar.
 */
export const normalizePartyIdentity = ({ legalName, documentType, documentNumber } = {}) => {
    const errors = {};
    const name = String(legalName ?? '').trim();
    if (!name) errors.legalName = 'Escribe el nombre completo como va en el documento.';
    else if (name.length > PARTY_LEGAL_NAME_MAX) errors.legalName = `El nombre admite como máximo ${PARTY_LEGAL_NAME_MAX} caracteres.`;

    const type = partyDocumentType(documentType);
    if (!type) errors.documentType = 'Elige el tipo de documento.';

    const number = String(documentNumber ?? '').trim();
    if (!number) errors.documentNumber = 'Escribe el número del documento.';
    else if (number.length > PARTY_DOCUMENT_NUMBER_MAX) errors.documentNumber = `El número admite como máximo ${PARTY_DOCUMENT_NUMBER_MAX} caracteres.`;
    else if (type) {
        const pattern = type.value === 'PAS' ? PASSPORT_DOCUMENT : NUMERIC_DOCUMENT;
        if (!pattern.test(number)) {
            errors.documentNumber = type.value === 'PAS'
                ? 'El pasaporte admite letras, números, puntos y guiones.'
                : 'El número admite dígitos, puntos y guiones.';
        }
    }

    if (Object.keys(errors).length) return { valid: false, errors };
    return { valid: true, identity: { legalName: name, documentType: type.value, documentNumber: number } };
};

/** Está completa cuando los tres datos existen; a medias no sirve para un documento. */
export const hasPartyIdentity = (party) => Boolean(
    party && String(party.legalName || '').trim() && partyDocumentType(party.documentType) && String(party.documentNumber || '').trim()
);

/** «CC. 33.334.977», «NIT: 901378858». Null si falta algo: mejor nada que a medias. */
export const formatPartyDocument = (party) => {
    if (!hasPartyIdentity(party)) return null;
    return `${partyDocumentType(party.documentType).label} ${String(party.documentNumber).trim()}`;
};

/** El nombre como va en el documento, en mayúsculas, con el de la ficha como respaldo. */
export const formatPartyName = (party, fallback = '') => {
    const name = String(party?.legalName || '').trim() || String(fallback || '').trim();
    return name ? name.toUpperCase() : null;
};
