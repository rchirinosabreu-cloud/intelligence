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

/**
 * Lo que se haya escrito de la identidad, validado, sin exigir nada (Rodny, 30 de
 * septiembre de 2026: emitir ya no pide el documento del cliente). El nombre legal va
 * solo si se escribió; el documento va entero —tipo y número— o no va, porque a medias
 * no identifica a nadie. Devuelve solo los campos escritos.
 */
export const normalizePartialPartyIdentity = ({ legalName, documentType, documentNumber } = {}) => {
    const errors = {};
    const identity = {};
    const name = String(legalName ?? '').trim();
    if (name.length > PARTY_LEGAL_NAME_MAX) errors.legalName = `El nombre admite como máximo ${PARTY_LEGAL_NAME_MAX} caracteres.`;
    else if (name) identity.legalName = name;

    const typeText = String(documentType ?? '').trim();
    const number = String(documentNumber ?? '').trim();
    if (typeText || number) {
        const type = partyDocumentType(typeText);
        if (!typeText) errors.documentType = 'Elige el tipo de documento, o borra el número.';
        else if (!type) errors.documentType = 'Elige el tipo de documento.';
        if (!number) errors.documentNumber = 'Escribe el número del documento, o deja el tipo sin elegir.';
        else if (number.length > PARTY_DOCUMENT_NUMBER_MAX) errors.documentNumber = `El número admite como máximo ${PARTY_DOCUMENT_NUMBER_MAX} caracteres.`;
        else if (type) {
            const pattern = type.value === 'PAS' ? PASSPORT_DOCUMENT : NUMERIC_DOCUMENT;
            if (!pattern.test(number)) {
                errors.documentNumber = type.value === 'PAS'
                    ? 'El pasaporte admite letras, números, puntos y guiones.'
                    : 'El número admite dígitos, puntos y guiones.';
            }
        }
        if (!errors.documentType && !errors.documentNumber) {
            identity.documentType = type.value;
            identity.documentNumber = number;
        }
    }

    if (Object.keys(errors).length) return { valid: false, errors };
    return { valid: true, identity };
};

/** Está completa cuando los tres datos existen; a medias no sirve para un documento. */
export const hasPartyIdentity = (party) => Boolean(
    party && String(party.legalName || '').trim() && partyDocumentType(party.documentType) && String(party.documentNumber || '').trim()
);

/**
 * «CC. 33.334.977», «NIT: 901378858». Null si falta el tipo o el número: mejor nada que
 * a medias. Ya no depende del nombre legal: un documento sin él sigue identificando.
 */
export const formatPartyDocument = (party) => {
    const type = partyDocumentType(party?.documentType);
    const number = String(party?.documentNumber || '').trim();
    if (!type || !number) return null;
    return `${type.label} ${number}`;
};

/** El nombre como va en el documento, en mayúsculas, con el de la ficha como respaldo. */
export const formatPartyName = (party, fallback = '') => {
    const name = String(party?.legalName || '').trim() || String(fallback || '').trim();
    return name ? name.toUpperCase() : null;
};
