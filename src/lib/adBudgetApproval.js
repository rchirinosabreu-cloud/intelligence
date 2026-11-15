// La pauta aprobada por el cliente vive en su contrato, en la ficha operativa (Rodny, 13 de noviembre de 2026: «el
// presupuesto de pauta debe vivir en la ficha operativa del cliente y eso debe estar en Meta y reflejarse en pauta»).
// `ClientContract.adBudgets` es una lista: una entrada por plataforma y marca, con su moneda y su cifra por ciclo. La pauta
// de Pautas la lee de ahí: no tiene presupuesto propio y nadie lo cambia desde Pautas ni desde Meta.
//
// Lógica pura: la usan la ficha, el servidor y Pautas.
import { AD_CURRENCIES, AD_PLATFORMS } from './adBudgets.js';

export const AD_APPROVAL_MAX = 12;

const brandKey = (value) => String(value || '').trim().toLowerCase();

/** La clave con la que una pauta encuentra su entrada en el contrato: plataforma y marca, sin mayúsculas ni espacios. */
export const adApprovalKey = ({ platform, brand }) => `${String(platform || '').toUpperCase()}:${brandKey(brand)}`;

/**
 * Lo que dice el formulario de la ficha, revisado. Devuelve `{ valid, value, errors }` con errores por fila, en español, como
 * el resto de la ficha. `null` o una lista vacía retiran las pautas aprobadas del contrato.
 */
export const normalizeContractAdBudgets = (input) => {
    const errors = {};
    const error = (field, message) => { errors[`contract.adBudgets${field ? `.${field}` : ''}`] = message; };
    if (input === null || input === undefined) return { valid: true, value: [], errors };
    if (!Array.isArray(input)) { error('', 'Las pautas aprobadas deben ser una lista.'); return { valid: false, value: [], errors }; }
    if (input.length > AD_APPROVAL_MAX) error('', `Hasta ${AD_APPROVAL_MAX} pautas por contrato.`);
    const seen = new Set();
    const value = input.map((raw, index) => {
        const row = raw && typeof raw === 'object' ? raw : {};
        const platform = String(row.platform || 'META').toUpperCase();
        const brand = String(row.brand || '').trim() || null;
        const currency = String(row.currency || 'COP').toUpperCase();
        const amount = Number(row.amount);
        if (!AD_PLATFORMS.some((item) => item.value === platform)) error(`${index}.platform`, 'Elige la plataforma.');
        if (!AD_CURRENCIES.includes(currency)) error(`${index}.currency`, 'Elige la moneda.');
        if (!(amount > 0)) error(`${index}.amount`, 'Escribe la cifra aprobada.');
        if (brand && brand.length > 120) error(`${index}.brand`, 'El nombre de la marca es muy largo.');
        const key = adApprovalKey({ platform, brand });
        if (seen.has(key)) error(`${index}.brand`, 'Esa plataforma y marca ya están en la lista.');
        seen.add(key);
        return { platform, brand, currency, amount: Math.round(amount * 100) / 100 };
    });
    return { valid: Object.keys(errors).length === 0, value, errors };
};

/** El contrato que manda hoy: el de inicio más reciente que ya empezó, igual que el ciclo. */
export const currentContractOf = (contracts = [], today) => contracts
    .filter((contract) => contract.startDate && contract.startDate <= today)
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] || null;

/**
 * La pauta aprobada para una pauta de Pautas: la entrada del contrato vigente con su plataforma y marca. Sin entrada se
 * sigue con la cifra que la pauta traía (`source: 'PAUTA'`), y la pantalla pide completar la ficha.
 */
export const approvedAdBudgetFor = (budget, today) => {
    const contract = currentContractOf(budget.client?.contracts || [], today);
    const rows = Array.isArray(contract?.adBudgets) ? contract.adBudgets : [];
    const key = adApprovalKey(budget);
    const entry = rows.find((row) => adApprovalKey(row) === key) || null;
    if (entry) return { source: 'CONTRATO', amount: Number(entry.amount), currency: entry.currency, contractId: contract.id || null };
    return { source: 'PAUTA', amount: Number(budget.amount) || 0, currency: budget.currency, contractId: contract?.id || null, hasContract: Boolean(contract) };
};

/** La frase para una pauta sin entrada en el contrato. */
export const missingApprovalText = (budget) => {
    const label = [AD_PLATFORMS.find((item) => item.value === budget.platform)?.label || budget.platform, budget.brand].filter(Boolean).join(' · ');
    return `El contrato de ${budget.client?.name || 'este cliente'} no tiene pauta aprobada para ${label}: agrégala en la ficha operativa.`;
};
