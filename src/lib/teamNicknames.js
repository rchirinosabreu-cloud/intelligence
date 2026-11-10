// Cómo nombra Bria a cada quien en un botón (Rodny, 10 de noviembre de 2026: «Bria puede ser amigable»). Los apodos los
// dio Rodny; el resto del equipo va por su primer nombre, porque acortarlo no se ve bien.
const NICKNAMES = Object.freeze({
  francisco: 'Fran',
  keila: 'Kei',
  rodny: 'Rod',
  melissa: 'Meli',
  elisa: 'Eli',
  jesus: 'Jesu',
  helen: 'Hel',
  kamila: 'Kami',
  camila: 'Kami',
  mariceth: 'Mari'
});

const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** El nombre corto y amigable de una persona: su apodo si lo tiene, si no su primer nombre. */
export const nickname = (personName) => {
  const first = String(personName || '').trim().split(/\s+/)[0] || '';
  return NICKNAMES[fold(first)] || first;
};
