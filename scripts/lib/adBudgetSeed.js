// Lo que se dijo en la reunión de pautas del 6 de noviembre de 2026, para arrancar sin digitar. Son cifras de viva voz: la
// nota de cada pauta dice lo que queda por confirmar y quien la lleva corrige lo que haga falta desde la pantalla.
// `closesOn` es el último día del ciclo que se dijo en la reunión: si el contrato del cliente da otro, el informe lo avisa.
export const MEETING_DAY = '2026-11-06';

export const MEETING_BUDGETS = Object.freeze([
    { client: 'Foobespain', brand: 'Wine & Wonder', currency: 'USD', amount: 100, objective: 'Seguidores', closesOn: '2026-11-30', spent: 7, notes: 'Son 300 dólares al mes entre las tres cuentas. Queda un saldo a favor de 181 dólares de octubre entre las tres: falta repartirlo con «Ajustar saldo anterior».' },
    { client: 'Foobespain', brand: 'Wine Summit', currency: 'USD', amount: 100, objective: 'Seguidores', closesOn: '2026-11-30', notes: 'Son 300 dólares al mes entre las tres cuentas. Saldo de octubre por repartir: ver Wine & Wonder.' },
    { client: 'Foobespain', brand: 'FoobeSpain', currency: 'USD', amount: 100, objective: 'Seguidores', closesOn: '2026-11-30', notes: 'Son 300 dólares al mes entre las tres cuentas. Saldo de octubre por repartir: ver Wine & Wonder.' },
    // Sin lectura a propósito: los 768.000 de la reunión se midieron desde el 10 de octubre, y este ciclo empieza el 19.
    { client: 'Bonsai', currency: 'COP', amount: 1000000, objective: 'Mensajes de WhatsApp', closesOn: '2026-11-18', notes: 'Rodny confirmó cierre el 18: el día de corte del contrato debe ser el 19. Los 768.000 de la reunión se midieron desde el 10 de octubre: hay que leer en Meta el gasto desde el 19 de octubre.' },
    { client: 'Promo Group', brand: 'Endova', currency: 'COP', amount: 300000, objective: 'Interacción', closesOn: '2026-11-14', spent: 91000, notes: 'Pauta de las convocatorias vigentes. El cliente pidió pautar solo en Endova.' },
    { client: 'New Pueblito', currency: 'COP', amount: 300000, objective: 'Mensajes de WhatsApp', closesOn: '2026-11-30', notes: 'En octubre se gastó como 60 mil: el saldo se suma a noviembre. Falta la cifra exacta para «Ajustar saldo anterior». Pendiente que el cliente ponga su tarjeta.' },
    { client: 'Pablo Hoff', currency: 'COP', amount: 200000, closesOn: '2026-11-30', notes: 'Pendiente que el cliente ponga su tarjeta.' },
    { client: 'Multi-K', currency: 'COP', amount: 350000, objective: 'Mensajes de WhatsApp', closesOn: '2026-11-18', notes: 'Rodny confirmó 350.000 con cierre el 18. El cierre sale del contrato: su día de corte debe ser el 19.' }
].map((row) => Object.freeze(row)));

const plain = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** La ficha del cliente que corresponde a un nombre, solo si es una: nunca se adivina entre dos. */
export const matchClient = (name, clients) => {
    const wanted = plain(name);
    const exact = clients.filter((client) => plain(client.name) === wanted);
    if (exact.length) return exact.length === 1 ? exact[0] : null;
    const close = clients.filter((client) => plain(client.name).includes(wanted) || wanted.includes(plain(client.name)));
    return close.length === 1 ? close[0] : null;
};

/** Quien lleva la pauta: el área Pauta de Equipo si hay una sola persona; si no, Keila por su nombre, con sus grafías. */
export const matchResponsible = (team, hasPautaArea) => {
    const area = team.filter(hasPautaArea);
    if (area.length === 1) return area[0];
    const named = team.filter((member) => /^k[ae][iy]?[ly]+a\b/i.test(String(member.name || '').trim()));
    return named.length === 1 ? named[0] : null;
};

/** Qué se va a crear y qué se salta, sin tocar nada. Cargar dos veces no duplica. */
export const planSeed = ({ rows = MEETING_BUDGETS, clients, existing, closeOf }) => rows.map((row) => {
    const client = matchClient(row.client, clients);
    if (!client) return { row, action: 'SIN_CLIENTE' };
    const repeated = existing.some((budget) => budget.clientId === client.id && plain(budget.brand) === plain(row.brand) && budget.platform === 'META');
    if (repeated) return { row, client, action: 'YA_EXISTE' };
    const end = closeOf(client);
    return { row, client, action: 'CREAR', end, differs: Boolean(row.closesOn) && end !== row.closesOn };
});
