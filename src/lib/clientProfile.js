import { normalizePartialPartyIdentity, PARTY_LEGAL_NAME_MAX } from './partyIdentity.js';

// La ficha completa de un cliente (Rodny, 30 de septiembre de 2026: «necesitamos tener
// base de datos de cliente … al crear un cliente nuevo se desplieguen todos los campos
// propios de un cliente, no es solo el nombre»). Una sola regla para Clientes, el
// directorio de Financiero y la cuenta por cobrar, en el navegador y en el servidor.
//
// - El nombre es el de la ficha, con el que el equipo lo llama («Titanes»); es lo único
//   obligatorio al crear.
// - La identidad es la que va impresa en la cuenta de cobro: nombre legal suelto, y el
//   documento entero (tipo y número) o nada.
// - Contacto y ubicación: a quién se le cobra y dónde. Todo opcional.

export const CLIENT_NAME_MAX = 120;

export const CLIENT_CONTACT_FIELDS = ['contactName', 'email', 'phone', 'address', 'city', 'country'];

export const CLIENT_PROFILE_FIELDS = ['name', 'legalName', 'documentType', 'documentNumber', ...CLIENT_CONTACT_FIELDS];

const LIMITS = { contactName: 120, email: 160, phone: 40, address: 200, city: 80, country: 80 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s().-]*$/;

const MESSAGES = {
    contactName: 'la persona de contacto',
    email: 'el correo',
    phone: 'el teléfono',
    address: 'la dirección',
    city: 'la ciudad',
    country: 'el país'
};

const has = (body, key) => Object.hasOwn(body, key);

/** Un formulario de ficha en blanco: todos los campos como texto vacío. */
export const emptyClientProfile = () => Object.fromEntries(CLIENT_PROFILE_FIELDS.map((key) => [key, '']));

/** El formulario con lo que ya tiene la ficha; lo que falta, vacío. */
export const clientProfileFrom = (client = {}) => Object.fromEntries(
    CLIENT_PROFILE_FIELDS.map((key) => [key, client?.[key] === null || client?.[key] === undefined ? '' : String(client[key])])
);

/**
 * Lo que cambió entre la ficha y el formulario, recortado. Un campo vaciado viaja como ''
 * para que el servidor lo borre. El documento viaja entero si cambia cualquiera de sus
 * dos mitades, porque se valida junto.
 */
export const changedClientProfile = (original = {}, draft = {}) => {
    const changes = {};
    for (const key of CLIENT_PROFILE_FIELDS) {
        const before = String(original[key] ?? '').trim();
        const after = String(draft[key] ?? '').trim();
        if (before !== after) changes[key] = after;
    }
    if (has(changes, 'documentType') || has(changes, 'documentNumber')) {
        changes.documentType = String(draft.documentType ?? '').trim();
        changes.documentNumber = String(draft.documentNumber ?? '').trim();
    }
    return changes;
};

/**
 * Valida y limpia lo que venga de la ficha. Solo trata los campos presentes, así sirve
 * para crear (con `requireName`) y para editar: un campo enviado vacío se borra (null).
 * Devuelve `{ valid, data }` o `{ valid: false, errors }` con un mensaje por campo.
 */
export const normalizeClientProfile = (body = {}, { requireName = false } = {}) => {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const data = {};
    const errors = {};

    if (requireName || has(input, 'name')) {
        const name = String(input.name ?? '').trim();
        if (!name) errors.name = 'Escribe el nombre del cliente.';
        else if (name.length > CLIENT_NAME_MAX) errors.name = `El nombre admite como máximo ${CLIENT_NAME_MAX} caracteres.`;
        else data.name = name;
    }

    if (has(input, 'legalName')) {
        const legalName = String(input.legalName ?? '').trim();
        if (legalName.length > PARTY_LEGAL_NAME_MAX) errors.legalName = `El nombre legal admite como máximo ${PARTY_LEGAL_NAME_MAX} caracteres.`;
        else data.legalName = legalName || null;
    }

    if (has(input, 'documentType') || has(input, 'documentNumber')) {
        const document = normalizePartialPartyIdentity({ documentType: input.documentType, documentNumber: input.documentNumber });
        if (!document.valid) Object.assign(errors, document.errors);
        else {
            data.documentType = document.identity.documentType || null;
            data.documentNumber = document.identity.documentNumber || null;
        }
    }

    for (const key of CLIENT_CONTACT_FIELDS) {
        if (!has(input, key)) continue;
        let value = String(input[key] ?? '').trim();
        if (key === 'email') value = value.toLowerCase();
        if (!value) { data[key] = null; continue; }
        if (value.length > LIMITS[key]) errors[key] = `${MESSAGES[key][0].toUpperCase()}${MESSAGES[key].slice(1)} admite como máximo ${LIMITS[key]} caracteres.`;
        else if (key === 'email' && !EMAIL.test(value)) errors.email = 'Revisa el correo: debe verse como nombre@empresa.com.';
        else if (key === 'phone' && !PHONE.test(value)) errors.phone = 'Revisa el teléfono: solo números, espacios, +, guiones y paréntesis.';
        else data[key] = value;
    }

    if (Object.keys(errors).length) return { valid: false, errors };
    return { valid: true, data };
};
