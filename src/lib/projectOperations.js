// La ficha de un proyecto organiza la ejecución. Su fuente comercial se conserva aparte y nunca se reescribe
// al completar responsables, fechas, entregables o jornadas. La cantidad de una línea cotizada cuenta servicios,
// no piezas; los formatos y cantidades operativas requieren revisión de una persona.
export const PROJECT_MODALITIES = Object.freeze([
  { value: 'MENSUAL', label: 'Mensual' }, { value: 'PUNTUAL', label: 'Puntual' }, { value: 'MIXTO', label: 'Mixto' },
]);

const error = message => Object.assign(new Error(message), { status: 400 });
const text = (value, max, label) => {
  if (value != null && typeof value !== 'string') throw error(`${label} debe ser texto.`);
  const result = (value || '').trim();
  if (result.length > max) throw error(`${label} admite hasta ${max} caracteres.`);
  return result;
};
const date = (value, label) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw error(`${label} no es una fecha válida.`);
  }
  return value;
};
const optionalNumber = (value, label, { integer = false, min = 0, max = 100000 } = {}) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isInteger(value)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw error(`${label} no es una cantidad válida.`);
  }
  return value;
};

export const normalizeProjectOperation = input => {
  const fields = new Set(['expectedRevision', 'title', 'modality', 'startDate', 'endDate', 'projectManagerId', 'deliverables', 'notes', 'review', 'productionDays', 'productionHours', 'reportRequired']);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.has(key))) throw error('La ficha contiene campos no permitidos.');
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw error('Falta una revisión válida de la ficha.');
  if (typeof input.review !== 'boolean') throw error('Indica si guardas el borrador o confirmas la revisión.');
  const modality = input.modality || null;
  if (modality !== null && !PROJECT_MODALITIES.some(item => item.value === modality)) throw error('Elige la modalidad del proyecto.');
  const startDate = date(input.startDate, 'El inicio'), endDate = date(input.endDate, 'El fin');
  if (startDate && endDate && endDate < startDate) throw error('El fin del proyecto no puede ser anterior al inicio.');
  if (!Array.isArray(input.deliverables) || input.deliverables.length > 100) throw error('La ficha admite hasta 100 entregables.');
  const deliverables = input.deliverables.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['id', 'label', 'description', 'quantity', 'unit'].includes(key))) throw error('Hay un entregable inválido.');
    const id = text(row.id, 100, 'El identificador'), label = text(row.label, 200, 'El entregable');
    if (!id || !label) throw error('Cada entregable necesita identificador y nombre.');
    return { id, label, description: text(row.description, 20000, 'La descripción'), quantity: optionalNumber(row.quantity, 'La cantidad', { min: 0.01 }), unit: text(row.unit, 80, 'La unidad') || null };
  });
  if (new Set(deliverables.map(row => row.id)).size !== deliverables.length) throw error('Hay entregables con el mismo identificador.');
  if (input.reportRequired != null && typeof input.reportRequired !== 'boolean') throw error('Indica si el proyecto requiere informe.');
  return {
    title: text(input.title, 200, 'El nombre'), modality, startDate, endDate,
    projectManagerId: text(input.projectManagerId, 100, 'El responsable') || null,
    deliverables, notes: text(input.notes, 4000, 'La nota'),
    productionDays: optionalNumber(input.productionDays, 'Las jornadas', { integer: true, max: 3650 }),
    productionHours: optionalNumber(input.productionHours, 'Las horas de producción'), reportRequired: input.reportRequired ?? null,
  };
};

export const projectOperationMissing = (row, { projectManagerActive = true } = {}) => {
  const missing = [];
  if (!row.title) missing.push('Nombre del proyecto');
  if (!row.modality) missing.push('Modalidad del proyecto');
  if (!row.projectManagerId || !projectManagerActive) missing.push('Project manager activo');
  if (!row.startDate) missing.push('Fecha de inicio');
  if (!row.deliverables?.length) missing.push('Entregables del proyecto');
  else if (row.deliverables.some(item => !(item.quantity > 0) || !item.unit?.trim())) missing.push('Cantidad y unidad de cada entregable');
  if (row.sourceSnapshot?.issue) missing.push('Alternativa comercial aprobada sin resolver');
  if (row.productionDays == null) missing.push('Jornadas de producción (cero si no incluye)');
  if (row.productionDays > 0 && !(row.productionHours > 0)) missing.push('Horas de producción');
  if (typeof row.reportRequired !== 'boolean') missing.push('Si requiere informe');
  return missing;
};
