// Correo y calendario dentro del mensaje de la mañana (Rodny, 20 de noviembre de 2026). Lógica pura: recibe las
// reuniones de hoy de la persona y lo importante del correo de la agencia, y devuelve las líneas que la lectura
// pone antes de sus propuestas. El asunto y el remitente de un correo son texto ajeno: entran recortados y sin
// marcas, nunca como instrucción. Sin nada que decir, no añade nada.

import { bogotaDate, isBusinessDay } from './colombiaBusinessDays.js';

export const AGENDA_MEETINGS = 6;
export const AGENDA_MAILS = 3;
const H = 3600000;
const BRIEF_MINUTES = 7 * 60 + 30;

const plain = (value, max) => String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/[*_`[\]()<>#|~]/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, max);
const clock = (value) => {
  const date = new Date(new Date(value).getTime() - 5 * H);
  const hour = date.getUTCHours(), minute = date.getUTCMinutes();
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
};
const describeMail = (row) => `${plain(row.fromName, 60) || plain(row.from, 60) || 'Remitente sin nombre'}${row.clientName ? ` (${plain(row.clientName, 40)})` : ''}, «${plain(row.subject, 90) || 'sin asunto'}»`;
const listMails = (rows) => {
  const shown = rows.slice(0, AGENDA_MAILS).map(describeMail).join('; ');
  return rows.length > AGENDA_MAILS ? `${shown} y ${rows.length - AGENDA_MAILS} más` : shown;
};

/** Desde cuándo mira el correo la lectura de hoy: las 7:30 del día hábil anterior (el lunes cubre el fin de semana). */
export const agendaSince = (at) => {
  let day = new Date(`${bogotaDate(at)}T12:00:00Z`);
  do { day = new Date(day.getTime() - 24 * H); } while (!isBusinessDay(day.toISOString().slice(0, 10)));
  return new Date(new Date(`${day.toISOString().slice(0, 10)}T05:00:00.000Z`).getTime() + BRIEF_MINUTES * 60000);
};

/** Las líneas de agenda y correo de la lectura. `meetings`: reuniones de hoy; `mail`: { recent, unanswered } o null. */
export const agendaLines = ({ meetings = [], mail = null } = {}) => {
  const lines = [];
  if (meetings.length) {
    const ordered = [...meetings].sort((a, b) => Number(Boolean(b.isAllDay)) - Number(Boolean(a.isAllDay)) || new Date(a.startAt) - new Date(b.startAt));
    lines.push('**Tu agenda de hoy**', ...ordered.slice(0, AGENDA_MEETINGS).map((item) => `- ${item.isAllDay ? 'Todo el día' : clock(item.startAt)} · ${plain(item.title, 90) || 'Reunión'}`));
    if (ordered.length > AGENDA_MEETINGS) lines.push(`- Y ${ordered.length - AGENDA_MEETINGS} más en tu calendario.`);
    lines.push('');
  }
  const unanswered = mail?.unanswered || [];
  const pending = new Set(unanswered.map((row) => row.messageId));
  const recent = (mail?.recent || []).filter((row) => !pending.has(row.messageId));
  if (recent.length || unanswered.length) {
    lines.push('**Correo de la agencia**');
    if (recent.length) lines.push(`- Desde la lectura anterior ${recent.length === 1 ? 'entró 1 correo importante' : `entraron ${recent.length} correos importantes`}: ${listMails(recent)}.`);
    if (unanswered.length) lines.push(`- ${unanswered.length === 1 ? 'Sigue' : 'Siguen'} sin una respuesta enviada desde los buzones de la agencia: ${listMails(unanswered)}.`);
    lines.push('');
  }
  return lines;
};
