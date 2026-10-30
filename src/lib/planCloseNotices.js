// Avisos de parrilla en la banda de abajo (Rodny, 30 de octubre de 2026: «me gustaría tener notificaciones de banda
// para poder cerrar correctamente las parrillas»).
//
// Lo que impide cerrar un mes son las piezas que **pasaron su fecha y siguen sin publicar**: la parrilla las muestra en
// rojo y «Ya se publicó» está ahí, pero nadie se entera hasta que entra a mirar. Reglas que salen de esa conversación:
//
// - **Un aviso por cuenta y mes, nunca uno por pieza.** Tres piezas atrasadas son un aviso, no tres.
// - **Le llega al community manager y al project manager de la cuenta**, porque las dos son responsables. No hay
//   «reenviárselo a la otra»: cuando cualquiera marca las piezas, el aviso se le cae sola a la otra.
// - **Verde mientras quede mes; salmón desde que se puede confirmar el cierre** (tres días antes de que termine el
//   ciclo, el mismo umbral de `canConfirmClose`). El salmón se reserva para lo que de verdad lo amerita.
// - **Más de tres cuentas se dicen en un solo aviso.** Quien lleva diez cuentas no puede recibir diez bandas.
//
// Lógica pura: la usan el reloj que reparte los avisos, la banda y las pruebas.
import { closeOpensOn } from './monthlyClose.js';

export const PLAN_NOTICE_KIND = 'PARRILLA_SIN_PUBLICAR';
export const PLAN_DIGEST_KIND = 'PARRILLA_RESUMEN';
/** A partir de aquí se resume: cuatro cuentas o más salen en un solo aviso. */
export const PLAN_DIGEST_THRESHOLD = 3;
export const PLAN_DIGEST_URL = '/clientes?tab=operacion';

export const isPlanNotice = (notice) => String(notice?.kind || '').startsWith('PARRILLA_');

const pad = (value) => String(value).padStart(2, '0');

/** El asunto de un aviso: la cuenta y el mes, para que cada mes tenga el suyo y no se pisen. */
export const planSubjectId = (clientId, cycle) => `${clientId}:${cycle.year}-${pad(cycle.month)}`;

export const parsePlanSubject = (subjectId) => {
    const match = /^([^:]+):(\d{4})-(\d{2})$/.exec(String(subjectId || ''));
    if (!match || match[1] === 'RESUMEN') return null;
    return { clientId: match[1], year: Number(match[2]), month: Number(match[3]) };
};

/** El resumen es de la persona y del mes en curso: uno solo, aunque sean diez cuentas. */
export const digestSubjectId = (today) => `RESUMEN:${String(today).slice(0, 7)}`;

/** Si el mes ya está en su ventana de cierre: lo mismo que habilita «Confirmar cierre». */
export const isClosing = (cycle, today) => Boolean(cycle?.end) && today >= closeOpensOn(cycle);

const pieces = (count) => (count === 1 ? '1 pieza pasó su fecha y sigue sin publicar' : `${count} piezas pasaron su fecha y siguen sin publicar`);
const dayOf = (key) => Number(String(key).slice(8, 10));

/** Lo que dice el aviso de una cuenta. Sin la orden del final: el botón ya dice qué hacer. */
export const planNoticeText = ({ clientName, cycle, overdue, closing }) => ({
    level: closing ? 'IMPORTANTE' : 'SEGUIMIENTO',
    label: closing
        ? `${cycle.label} cierra el ${dayOf(cycle.end)} · ${clientName}`
        : `Parrilla de ${String(cycle.label).toLowerCase()} · ${clientName}`,
    message: pieces(overdue)
});

/** Lo que dice el resumen de varias cuentas. Siempre salmón: son varias y el mes avanza. */
export const planDigestText = (count, { closing, monthLabel }) => ({
    level: 'IMPORTANTE',
    label: closing ? `Cierre de ${String(monthLabel).toLowerCase()} · ${count} cuentas` : `Parrillas · ${count} cuentas`,
    message: closing
        ? `${count} cuentas tienen piezas sin publicar antes de cerrar el mes`
        : `${count} cuentas tienen piezas que pasaron su fecha y siguen sin publicar`
});

const same = (notice, wanted) => notice.subjectId === wanted.subjectId && notice.message === wanted.message && notice.level === wanted.level;

/**
 * Qué avisos de parrilla crear y cuáles cerrar para una persona en este pase.
 *
 * `pending` son sus cuentas con piezas atrasadas (`{ clientId, clientName, slug, cycle, overdue }`) y `open` los avisos
 * de parrilla que ya tiene abiertos. Un aviso que ya dice exactamente lo mismo **no se vuelve a crear**: recrearlo
 * borraría el «Recordarme» de la persona.
 */
export const planNoticePlan = ({ pending = [], open = [], today }) => {
    const digest = pending.length > PLAN_DIGEST_THRESHOLD;
    const closing = pending.some((row) => isClosing(row.cycle, today));
    const wanted = digest
        ? [{
            kind: PLAN_DIGEST_KIND,
            subjectId: digestSubjectId(today),
            url: PLAN_DIGEST_URL,
            ...planDigestText(pending.length, { closing, monthLabel: pending[0]?.cycle?.label || '' })
        }]
        : pending.map((row) => ({
            kind: PLAN_NOTICE_KIND,
            subjectId: planSubjectId(row.clientId, row.cycle),
            url: row.slug ? `/clientes/operacion/${row.slug}` : PLAN_DIGEST_URL,
            ...planNoticeText({ ...row, closing: isClosing(row.cycle, today) })
        }));

    const create = wanted.filter((item) => !open.some((notice) => same(notice, item)));
    const keep = new Set(open.filter((notice) => wanted.some((item) => same(notice, item))).map((notice) => notice.id));
    const close = open.filter((notice) => !keep.has(notice.id)).map((notice) => ({ id: notice.id, resolution: 'YA_ATENDIDO' }));
    return { create, close };
};
