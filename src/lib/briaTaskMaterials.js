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
