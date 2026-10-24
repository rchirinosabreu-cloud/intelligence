import { knowledgeError } from './briaKnowledge.js';

// El destino visible, la selección y el payload nativo comparten este contrato.
export const TASK_FILE_DESTINATIONS = Object.freeze({
  INSUMO: { label: 'Insumo (archivo)', field: 'initial_inputs', folder: 'inputs' },
  REFERENCIA: { label: 'Referencia (archivo)', field: 'initial_references', folder: 'references' },
  COMENTARIO: { label: 'Adjunto del comentario', field: 'tempAttachments', folder: 'comments' }
});
export const taskFileDestination = file => TASK_FILE_DESTINATIONS[file.destination || 'INSUMO'];

export const selectTaskFiles = (selection, available) => {
  if (!Array.isArray(selection) || selection.length > 5) throw knowledgeError('Selecciona hasta cinco archivos para el pendiente.');
  const seen = new Set();
  return selection.map(row => {
    if (!row || typeof row.id !== 'string' || seen.has(row.id) || !Object.hasOwn(TASK_FILE_DESTINATIONS, row.destino)) throw knowledgeError('Cada archivo debe tener un identificador único y un destino válido.');
    const file = available.get(row.id);
    if (!file) throw knowledgeError('No encontré uno de los archivos seleccionados en esta conversación. Vuelve a adjuntarlo.');
    seen.add(row.id);
    return { id: file.id, name: file.name, destination: row.destino };
  });
};
export const taskFileLabel = file => `${taskFileDestination(file).label}: ${file.name}`;

// El inventario permite leer archivos anteriores, pero no equivale a haberlos elegido para
// este encargo. La aclaración se guarda y exige otro turno humano antes de incorporarlos.
export const applyTaskFiles = ({ target, args, inventory, attachments, selectionTurn }) => {
  const selectedBefore = target.files || [];
  const currentIds = new Set(attachments.map(file => file.id));
  const allowedIds = new Set([...selectedBefore.map(file => file.id), ...currentIds]);
  const explicit = Object.hasOwn(args, 'archivos');
  const chosen = explicit ? selectTaskFiles(args.archivos, inventory) : [...new Map([...selectedBefore, ...attachments].map(file => [file.id, { id: file.id, name: file.name, destination: file.destination || 'INSUMO' }])).values()];
  if (chosen.length > 5) throw knowledgeError('Usa hasta cinco archivos en el pendiente. No se descartó ningún insumo.');
  const historical = chosen.filter(file => !allowedIds.has(file.id));
  if (historical.length) {
    const prior = target.fileSelection;
    const selectedLater = args.confirmarArchivosAnteriores === true && selectionTurn && prior?.turn && prior.turn !== selectionTurn && historical.every(file => prior.files.some(candidate => candidate.id === file.id));
    if (!selectedLater) {
      target.files = chosen.filter(file => allowedIds.has(file.id));
      target.fileSelection = { turn: selectionTurn || null, files: historical };
      return;
    }
  }
  target.files = chosen;
  if (explicit || attachments.length) target.fileSelection = null;
};
