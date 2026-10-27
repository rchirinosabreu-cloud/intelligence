// El modelo interpreta el cálculo; solamente una lectura autorizada de este
// turno puede producir su recibo. Ni la prosa ni un recibo del historial lo crean.
export const calculationRequirementsSchema = {
  type: 'array', maxItems: 6,
  description: 'Cada total o subtotal financiero solicitado en el mensaje actual, también al retomar o combinarlo con otra consulta. [] si no pide cálculos. Interpreta el objetivo y alcance en el diálogo; no dependas de palabras exactas. SELECCION suma un subconjunto de filas; TOTAL consulta un agregado del filtro completo. No confundir varias cifras individuales con su suma conjunta.',
  items: { type: 'object', additionalProperties: false, properties: {
    id: { type: 'string', minLength: 1, maxLength: 64 },
    objetivo: { type: 'string', minLength: 1, maxLength: 400 },
    alcance: { type: 'string', enum: ['TOTAL', 'SELECCION'] }
  }, required: ['id', 'objetivo', 'alcance'] }
};

export const validCalculationRequirements = rows => rows === undefined || Array.isArray(rows) && rows.length <= 6
  && rows.every(row => row && typeof row.id === 'string' && row.id.trim() && row.id.length <= 64
    && typeof row.objetivo === 'string' && row.objetivo.trim() && row.objetivo.length <= 400
    && ['TOTAL', 'SELECCION'].includes(row.alcance)) && new Set(rows.map(row => row.id)).size === rows.length;

export const calculationBindingSchema = {
  type: 'object', additionalProperties: false, description: 'Vincula esta lectura al cálculo pendiente del plan. El servidor comprueba campo, moneda, alcance y resultado; no basta declarar que está calculado. Omite en lecturas exploratorias.',
  properties: { id: { type: 'string' }, campo: { type: 'string', description: 'Campo exacto de evidenciaNumerica, por ejemplo outstandingTotal para el saldo de cuentas por cobrar.' }, moneda: { type: 'string', description: 'Moneda del importe calculado, no la moneda documental de la factura.' } },
  required: ['id', 'campo', 'moneda']
};

export const calculationDeclarations = (tools, requirements) => tools.map(tool => {
  if (tool.name !== 'consultar_plataforma' || !requirements.length) return tool;
  const bound = structuredClone(tool);
  bound.parameters.properties.calculo = structuredClone(calculationBindingSchema);
  bound.parameters.properties.calculo.properties.id.enum = requirements.map(row => row.id);
  return bound;
});

export const calculationReceipt = ({ requirements, call, data, now }) => {
  if (call.name !== 'consultar_plataforma' || data?.error) return null;
  const binding = call.args?.calculo, evidence = data?.evidenciaNumerica;
  const requirement = requirements.find(row => row.id === binding?.id);
  if (!requirement || !evidence || evidence.alcance?.recortada || !evidence.operacion) return null;
  let values;
  if (requirement.alcance === 'SELECCION') {
    const selection = evidence.seleccion;
    if (!selection?.completa || selection.idsNoDisponibles?.length || !selection.idsEncontrados?.length
      || !Array.isArray(call.args.idsParaSumar) || selection.idsEncontrados.length !== call.args.idsParaSumar.length
      || !call.args.idsParaSumar.every(id => selection.idsEncontrados.includes(id))) return null;
    values = selection.sumasExactas;
    if ((values || []).filter(row => row.campo === binding.campo).length !== 1) return null;
  } else {
    if (call.args.idsParaSumar !== undefined) return null;
    values = evidence.totalesFuente;
    if (evidence.diferencias?.some(row => row.campo === binding.campo && row.moneda === binding.moneda)) return null;
  }
  const matched = (values || []).filter(row => row.campo === binding.campo && row.moneda && row.moneda === binding.moneda
    && typeof row.centavos === 'string' && /^-?\d+$/.test(row.centavos) && typeof row.importe === 'string' && !row.sinImporte);
  if (matched.length !== 1) return null;
  const value = matched[0];
  return { id: requirement.id, objetivo: requirement.objetivo, alcance: requirement.alcance,
    operacion: evidence.operacion, filtros: evidence.alcance.filtrosSolicitados,
    campo: value.campo, moneda: value.moneda, importe: value.importe, centavos: value.centavos,
    ids: requirement.alcance === 'SELECCION' ? [...evidence.seleccion.idsEncontrados] : null,
    consultadoEn: now.toISOString() };
};
