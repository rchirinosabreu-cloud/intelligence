import { knowledgeError } from './briaKnowledge.js';

// Contenido publicable, separado de las instrucciones que modifican campos de la tarea.
export const TASK_COMMENT_SCHEMA = {
  type: 'object',
  description: 'Operación sobre el comentario inicial que verá el equipo. Omite para conservarlo. LITERAL: la persona dicta el contenido; texto contiene únicamente ese contenido, copiado sin envolverlo en instrucciones. PROPUESTA: redactas contenido para que lo revise; no narres los cambios de configuración. RETIRAR: elimina el comentario del borrador, sin quitar archivos ni otros campos. Un archivo no exige inventar un comentario.',
  properties: {
    tipo: { type: 'string', enum: ['LITERAL', 'PROPUESTA', 'RETIRAR'] },
    texto: { type: 'string', description: 'Contenido que se publicará, no explicación de lo que harás. Obligatorio para LITERAL y PROPUESTA; omítelo para RETIRAR. LITERAL conserva exactamente las palabras y puntuación dictadas. Las menciones @Nombre completo pertenecen al comentario, no asignan colaboradores.' }
  }, required: ['tipo'], additionalProperties: false
};

export const readTaskComment = (operation, humanEvidence) => {
  if (!operation || Array.isArray(operation) || typeof operation !== 'object' || Object.keys(operation).some(key => !['tipo', 'texto'].includes(key))) throw knowledgeError('El comentario necesita su tipo y contenido por separado.');
  if (operation.tipo === 'RETIRAR') {
    if (operation.texto !== undefined && operation.texto !== '') throw knowledgeError('Retirar el comentario no puede incluir un texto nuevo.');
    return '';
  }
  if (!['LITERAL', 'PROPUESTA'].includes(operation.tipo) || typeof operation.texto !== 'string' || !operation.texto.trim() || operation.texto.length > 8000) throw knowledgeError('El comentario necesita contenido válido de hasta 8.000 caracteres.');
  // Comprueba procedencia sin decidir por palabras clave qué pidió la persona. La semántica
  // selecciona el tipo; un literal no puede añadir una paráfrasis ni tomar texto de archivos.
  if (operation.tipo === 'LITERAL' && !String(humanEvidence || '').includes(operation.texto)) throw knowledgeError('El comentario literal debe copiar solo el contenido dictado en la conversación, sin añadir instrucciones ni reformularlo.');
  return operation.texto;
};
