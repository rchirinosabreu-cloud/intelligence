// Arqueo de cortes (Rodny, 23 de noviembre de 2026: «validar cliente por cliente que los cortes, cantidades de
// contenidos y periodos estén siendo interpretados correctamente»). No cambia ninguna cifra: compara lo que Operación
// muestra de cada corte —que cuenta las piezas por la parrilla en que están— con lo que sale al contarlas por su fecha
// de publicación dentro del corte, y dice dónde no coinciden y por qué.

const dayOf = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const isStory = (item) => String(item.format || '').trim().toLowerCase() === 'historia';
const isPublished = (item) => item.status === 'PUBLICADO';

/**
 * `cycles`: los cortes que muestra Operación (`year`, `month`, `start`, `end`, `label`, `quota`, `created`,
 * `reached.publicada`, `source`). `plans`: las parrillas del cliente con sus piezas (`publishDate`, `status`, `format`).
 */
export function auditCuts({ cycles = [], plans = [], contracts = [] }) {
  const pieces = plans.flatMap((plan) => (plan.contentItems || []).map((item) => ({
    year: plan.year, month: plan.month, date: dayOf(item.publishDate), status: item.status, format: item.format,
  })));
  const rows = cycles.filter(Boolean).map((cycle) => {
    const inPlan = pieces.filter((piece) => piece.year === cycle.year && piece.month === cycle.month);
    const inDates = pieces.filter((piece) => piece.date && piece.date >= cycle.start && piece.date <= cycle.end);
    const outside = inPlan.filter((piece) => !piece.date || piece.date < cycle.start || piece.date > cycle.end);
    const elsewhere = inDates.filter((piece) => piece.year !== cycle.year || piece.month !== cycle.month);
    const row = {
      corte: cycle.label, desde: cycle.start, hasta: cycle.end, cuota: cycle.quota,
      mostrado: { piezas: cycle.created, publicadas: cycle.reached?.publicada || 0 },
      porFecha: { piezas: inDates.length, publicadas: inDates.filter(isPublished).length },
      parrillas: plans.filter((plan) => plan.year === cycle.year && plan.month === cycle.month).length,
      avisos: [],
    };
    if (cycle.source?.kind === 'HOJA_MIO') { row.hoja = true; return row; }
    if (outside.length) row.avisos.push(`${outside.length} en la parrilla con fecha fuera del corte (${outside.filter(isPublished).length} publicadas)`);
    if (elsewhere.length) row.avisos.push(`${elsewhere.length} con fecha del corte en otra parrilla (${elsewhere.filter(isPublished).length} publicadas)`);
    const stories = inPlan.filter(isStory).length;
    if (stories) row.avisos.push(`${stories} historias contadas como piezas`);
    if (row.parrillas > 1) row.avisos.push(`${row.parrillas} parrillas del mismo período`);
    if (cycle.created > cycle.quota) row.avisos.push(`${cycle.created - cycle.quota} piezas de más sobre la cuota`);
    return row;
  });
  const covered = (date) => cycles.some((cycle) => cycle && date >= cycle.start && date <= cycle.end);
  const first = rows.reduce((min, row) => (!min || row.desde < min ? row.desde : min), null);
  const last = rows.reduce((max, row) => (!max || row.hasta > max ? row.hasta : max), null);
  const orphan = pieces.filter((piece) => piece.date && first && piece.date >= first && piece.date <= last && !covered(piece.date)).length;
  const cuts = [...new Set(contracts.map((contract) => Number(contract.cutDay) || 1))];
  return {
    cortes: rows,
    sinCorte: orphan,
    cortesDeContrato: cuts,
    limpio: !orphan && cuts.length <= 1 && rows.every((row) => !row.avisos.length),
  };
}
