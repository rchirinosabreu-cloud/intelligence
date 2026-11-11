// Jornadas de producción con evidencia (reunión de Rodny con su jefe, 10 de noviembre de 2026).
//
// La jornada se agenda como siempre, con un evento de Producción en el calendario de Actividad. Lo nuevo:
// el evento se liga a un cliente y la jornada **solo se da por realizada cuando alguien sube el enlace del
// Drive con las evidencias** («se pudo haber registrado en el calendario y él no haber ido»). Esta regla la
// leen la pantalla, el servidor y el reloj de recordatorios.

export const PRODUCTION_DAY_STATES = {
  AGENDADA: { label: 'Agendada', hint: 'Todavía no llega su fecha.' },
  SIN_EVIDENCIA: { label: 'Falta la evidencia', hint: 'Ya pasó la fecha y nadie subió el enlace del Drive.' },
  REALIZADA: { label: 'Realizada', hint: 'Tiene el enlace de sus evidencias.' },
};

export const EVIDENCE_NOTE_MAX = 500;
export const EVIDENCE_URL_MAX = 1000;
// Recordatorios de evidencia: el primero al día siguiente de la jornada y otro tres días después. No más:
// a partir de ahí lo dice el semáforo del cliente.
export const EVIDENCE_REMINDER_GAP_DAYS = 3;
export const EVIDENCE_REMINDERS_MAX = 2;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (dayKey, days) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** En qué va una jornada el día `today` (texto AAAA-MM-DD de Bogotá). */
export function productionDayState(day, today) {
  if (day?.evidenceUrl) return 'REALIZADA';
  if (!DAY_RE.test(String(day?.date || '')) || day.date >= today) return 'AGENDADA';
  return 'SIN_EVIDENCIA';
}

/** El motivo, en español, por el que un enlace de evidencia no sirve; `null` si sirve. */
export function evidenceProblem({ url, note } = {}) {
  const text = String(url ?? '').trim();
  if (!text) return 'Pega el enlace de la carpeta de Drive con las evidencias de la jornada.';
  if (text.length > EVIDENCE_URL_MAX) return 'El enlace es demasiado largo.';
  let parsed;
  try { parsed = new URL(text); } catch { return 'Eso no parece un enlace. Cópialo desde la barra del navegador.'; }
  if (parsed.protocol !== 'https:') return 'El enlace tiene que empezar por https://.';
  if (String(note ?? '').trim().length > EVIDENCE_NOTE_MAX) return `La nota admite ${EVIDENCE_NOTE_MAX} caracteres como máximo.`;
  return null;
}

/** Si toca recordar la evidencia de una jornada hoy. */
export function evidenceReminderDue(day, today) {
  if (productionDayState(day, today) !== 'SIN_EVIDENCIA') return false;
  const sent = Number(day.reminders) || 0;
  if (sent >= EVIDENCE_REMINDERS_MAX) return false;
  if (!sent) return today >= addDays(day.date, 1);
  const last = day.remindedAt ? new Date(day.remindedAt).toISOString().slice(0, 10) : day.date;
  return today >= addDays(last, EVIDENCE_REMINDER_GAP_DAYS);
}

const fold = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Qué clientes nombra el título del evento («Jornada de producción Multik»). Es solo una sugerencia para
 * ordenar la lista al ligar: nunca se liga sola, la decide una persona.
 */
export function suggestedClientIds(title, clients = []) {
  const haystack = ` ${fold(title)} `;
  return clients
    .map((client) => {
      const words = fold(client.name).split(' ').filter((word) => word.length >= 4);
      const hits = words.filter((word) => haystack.includes(` ${word} `)).length;
      return { id: client.id, score: words.length ? hits / words.length : 0, hits };
    })
    .filter((row) => row.hits > 0)
    .sort((a, b) => b.score - a.score || b.hits - a.hits)
    .map((row) => row.id);
}

/** Las jornadas de un ciclo y cómo van frente a las contratadas. */
export function summarizeProductionDays(days = [], cycle, { contracted = 0, today } = {}) {
  const inCycle = days
    .filter((day) => cycle && day.date >= cycle.start && day.date <= cycle.end)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({ ...day, state: productionDayState(day, today) }));
  return {
    contracted: Number(contracted) || 0,
    scheduled: inCycle.length,
    done: inCycle.filter((day) => day.state === 'REALIZADA').length,
    missingEvidence: inCycle.filter((day) => day.state === 'SIN_EVIDENCIA'),
    items: inCycle,
  };
}
