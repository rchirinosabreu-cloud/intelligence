// Un sí y un no dichos como los dice la gente (Rodny, 22 de octubre de 2026, por WhatsApp: Bria le mostró el pendiente,
// él respondió «dale, así está bien» y Bria volvió a mostrar el mismo resumen hasta que escribió «crear pendiente»).
//
// La regla es por palabras, no por frases fijas: la respuesta confirma si TODO lo que dice es asentimiento y relleno
// («dale», «listo», «sí, así está bien», «de una, gracias»), y no confirma si trae cualquier otra cosa: un cambio
// («dale pero ponle fecha mañana»), una cifra, una pregunta o una negación. Lo que no es un sí o un no limpio sigue
// yendo a Bria, que lo entiende como ajuste. Solo se usa sobre la acción de la respuesta inmediatamente anterior.

const fold = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const tokens = (value) => fold(value)
  .replace(/\bde una\b/g, 'deuna')
  .replace(/[.,;:!¡]+/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

// Asentimiento que vale para cualquier acción. El verbo propio de cada una («bórralo», «créalo», «despáchalo») lo pone
// quien pregunta (`verbs`), para que un «sí, créalo» nunca confirme un borrado.
const AGREE = new Set(['si', 'sip', 'sii', 'siii', 'dale', 'ok', 'okey', 'okay', 'oki', 'vale', 'va', 'listo', 'perfecto', 'correcto', 'exacto', 'claro', 'bueno', 'buenisimo', 'genial', 'excelente', 'super', 'hazlo', 'hagale', 'hagalo', 'hazle', 'adelante', 'procede', 'confirmo', 'confirma', 'confirmar', 'bien', 'eso', 'deuna', 'sale', 'venga', 'obvio', '👍', '👌', '✅', '🙌']);
const AGREE_FILLER = new Set(['asi', 'esta', 'todo', 'por', 'favor', 'porfa', 'gracias', 'muchas', 'mil', 'bria', 'que', 'el', 'la', 'lo', 'los', 'las', 'ya', 'entonces', 'mismo', 'pues', 'tal', 'como', 'queda', 'quedo', 'me', 'parece', 'ese', 'esa', 'esos', 'esas', 'este', 'esto', 'estos', 'estas', 'pendiente', 'pendientes', 'tarea', 'tareas', 'una', 'vez', 'nomas', 'ahora']);
const REFUSE = new Set(['no', 'nop', 'cancela', 'cancelar', 'cancelalo', 'cancelala', 'olvidalo', 'olvidala', 'dejalo', 'dejala', 'descartalo', 'descartala', 'nada']);
const REFUSE_FILLER = new Set(['gracias', 'mejor', 'asi', 'por', 'ahora', 'lo', 'la', 'los', 'las', 'crees', 'creas', 'hagas', 'borres', 'elimines', 'despaches', 'mandes', 'envies', 'cambies', 'muevas', 'bria', 'pues', 'entonces', 'todavia', 'aun', 'ese', 'esa', 'pendiente', 'tarea']);

const MAX_WORDS = 8;
const plain = (value, core, filler) => {
  const text = String(value || '');
  if (/[?¿\d]/.test(text)) return false;
  const words = tokens(text);
  if (!words.length || words.length > MAX_WORDS) return false;
  return words.some((word) => core.has(word)) && words.every((word) => core.has(word) || filler.has(word));
};

/**
 * «Dale», «listo», «sí, así está bien», «de una, gracias»: un sí sin nada más adentro. Con `verbs`, también el verbo de
 * la acción que se confirma, solo o acompañado: «sí, bórralo», «dale, bórralo», «bórralo».
 */
export const isPlainAgreement = (value, { verbs = [] } = {}) => plain(value, verbs.length ? new Set([...AGREE, ...verbs]) : AGREE, AGREE_FILLER);

/** El verbo de cada acción, en las formas en que se dice. Una acción sin verbo propio acepta solo el asentimiento. */
export const ACTION_VERBS = Object.freeze({
  TASK_CREATE: ['crear', 'crea', 'crealo', 'creala', 'crealos', 'crealas', 'creame', 'creamelo', 'creamela', 'registralo', 'registrala', 'agregalo', 'agregala', 'montalo', 'montala'],
  TASK_DELETE: ['borrar', 'borra', 'borralo', 'borrala', 'borralos', 'borralas', 'eliminar', 'elimina', 'eliminalo', 'eliminala', 'eliminalos', 'eliminalas', 'quitalo', 'quitala', 'quitalos', 'sacalo', 'sacala'],
  DISPATCH: ['despachar', 'despacha', 'despachalo', 'despachala', 'despachalos', 'despachalas', 'mandalo', 'mandala', 'mandalos', 'mandalas', 'envialo', 'enviala', 'envialos', 'envialas', 'pasalo', 'pasala', 'pasalos'],
  TASK_UPDATE: ['cambialo', 'cambiala', 'cambialos', 'aplicalo', 'aplicala', 'actualizalo', 'actualizala', 'muevelo', 'muevela'],
  TASKS_STATUS: ['cambialos', 'cambialas', 'aplicalo', 'aplicalos', 'muevelos', 'muevelas', 'pasalos', 'pasalas'],
  CREATE_PLAN: ['crear', 'crea', 'creala', 'crealo', 'montala', 'armala'],
  CREATE_ITEM: ['crear', 'crea', 'creala', 'crealo', 'agregala', 'agregalo', 'montala'],
  MOVE_ITEM: ['muevela', 'muevelo', 'cambiala', 'cambialo', 'pasala', 'pasalo'],
  CLIENT_NOTE: ['guardala', 'guardalo', 'anotala', 'anotalo', 'registrala', 'registralo'],
  MINUTE_TASKS: ['crear', 'crealos', 'crealas', 'crea', 'montalos', 'registralos'],
  PLAN_DRAFT: ['envialas', 'envialos', 'mandalas', 'mandalos', 'pasalas', 'pasalos', 'subelas', 'subelos', 'crealas', 'crealos'],
  PLATFORM: ['hazlo', 'aplicalo', 'aplicala', 'guardalo', 'guardala'],
  EDIT_ITEM: ['cambiala', 'cambialo', 'guardala', 'guardalo', 'hazlo', 'aplicalo', 'aplicala', 'editala'],
  FINANCIAL_RECORD: ['registralo', 'registrala', 'guardalo', 'guardala', 'anotalo', 'anotala', 'subelo', 'subela', 'hazlo'],
  FINAL_ASSET: ['subela', 'subelo', 'subelas', 'subelos', 'cargala', 'cargalo', 'cargalos', 'ponla', 'ponlo', 'ponlos', 'agregala', 'agregalo', 'agregalos', 'guardala', 'guardalo', 'hazlo']
});
/** «No», «mejor no», «no, déjalo», «olvídalo»: un no sin un cambio adentro. */
export const isPlainRefusal = (value) => plain(value, REFUSE, REFUSE_FILLER);
