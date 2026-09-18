import path from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';
import { normalizeCompanyKey } from '../src/services/crmService.js';
import { isValidStage, isClosedStage, stageOrder } from '../src/lib/crmRules.js';

// One-time, reviewable import of CRM_Brain_Studio.xlsx into CrmLead / CrmActivity.
// Idempotent by legacyCode (LNK-001, BRN-001…). Never updates or deletes existing rows.
//
//   node scripts/import-crm-excel.js <archivo.xlsx> --dry-run
//   node scripts/import-crm-excel.js <archivo.xlsx> --confirm-target=<host> [--owner-comercial=<TeamMember id>] [--owner-francisco=<id>] [--author=<User id>]

const BOGOTA_MIDNIGHT_UTC_HOUR = 5;
const MONTHS = {
  jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5, jul: 6, aug: 7, ago: 7,
  sep: 8, sept: 8, set: 8, oct: 9, nov: 10, dec: 11, dic: 11,
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
};

const text = value => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
};

const bogotaDate = (year, month, day) => new Date(Date.UTC(year, month, day, BOGOTA_MIDNIGHT_UTC_HOUR));

/** '29-Jul-2026', '31 de agosto de 2026, a las 16:00', 'Agosto de 2026' (approximate) or a Date. */
export const parseExcelDate = value => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return bogotaDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const raw = String(value).trim().toLowerCase();
  let match = raw.match(/^(\d{1,2})-([a-z]{3,4})-(\d{4})/);
  if (match && MONTHS[match[2]] !== undefined) return bogotaDate(Number(match[3]), MONTHS[match[2]], Number(match[1]));
  match = raw.match(/^(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/);
  if (match && MONTHS[match[2].normalize('NFD').replace(/[̀-ͯ]/g, '')] !== undefined) {
    return bogotaDate(Number(match[3]), MONTHS[match[2].normalize('NFD').replace(/[̀-ͯ]/g, '')], Number(match[1]));
  }
  match = raw.match(/^([a-záéíóú]+)\s+de\s+(\d{4})$/);
  if (match && MONTHS[match[1].normalize('NFD').replace(/[̀-ͯ]/g, '')] !== undefined) {
    return Object.assign(bogotaDate(Number(match[2]), MONTHS[match[1].normalize('NFD').replace(/[̀-ͯ]/g, '')], 1), { approximate: true });
  }
  match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return bogotaDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return null;
};

const parseMoney = value => {
  const digits = String(value ?? '').replace(/[^0-9.]/g, '');
  if (!/\d/.test(digits)) return null;
  const number = Number(digits);
  return Number.isFinite(number) ? number : null;
};

const fold = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ORIGIN_RULES = [
  ['LINKEDIN', /linkedin/],
  ['REFERIDO', /referid|sobrin|amig|recomend|hermano|prim[oa]\b|familiar/],
  ['CLIENTE_ANTERIOR', /cliente anterior|cliente actual|renovaci/],
  ['WHATSAPP', /whatsapp/],
  ['FORMULARIO', /formulario|web|landing/],
  ['CONVOCATORIA', /convocatoria|rfp|licitaci/],
  ['ALIADO', /aliad|partner|alianza/],
  ['CONTACTO_DIRECTO', /contacto/]
];
const GENERIC_ORIGINS = new Set(['contacto / canal brain studio', 'prospeccion linkedin']);

export const mapOrigin = (source, channel) => {
  const label = text(channel) || text(source) || '';
  const folded = fold(label);
  const rule = ORIGIN_RULES.find(([, pattern]) => pattern.test(folded)) || ORIGIN_RULES.find(([, pattern]) => pattern.test(fold(source)));
  const origin = rule ? rule[0] : 'OTRO';
  const originDetail = GENERIC_ORIGINS.has(folded) || !label ? null : label;
  return { origin, originDetail };
};

const STAGE_RULES = [
  ['POR_GESTIONAR', /por gestionar/],
  ['CONTACTADO', /en preparacion|contactad/],
  ['CITA_SOLICITADA', /cita solicitada/],
  ['CITA_REALIZADA', /cita realizada|reunion realizada/],
  ['PROPUESTA_ENVIADA', /propuesta enviada/],
  ['NEGOCIACION', /negociaci/],
  ['ESPERANDO_CLIENTE', /esperando|pendiente aprobaci|esperando rfp/],
  ['SIN_RESPUESTA', /no respuesta|sin respuesta|estancad/],
  ['APROBADA', /^aprobad/],
  ['GANADO', /ganado|contratad/],
  ['PERDIDO', /perdido|cerrado/],
  ['DESCARTADO', /descartad/]
];

export const mapStage = label => {
  const folded = fold(label);
  if (!folded) return null;
  return STAGE_RULES.find(([, pattern]) => pattern.test(folded))?.[0] ?? null;
};

const RESULT_STAGES = { aprobado: 'APROBADA', ganado: 'GANADO', perdido: 'PERDIDO', descartado: 'DESCARTADO', abierto: 'POR_GESTIONAR' };

const ACTIVITY_RULES = [
  ['RESPUESTA_CLIENTE', /respuesta|aprobaci|acept/],
  ['PROPUESTA_ENVIADA', /propuesta|reenv|ajuste/],
  ['REUNION', /reunion|cita|visita/],
  ['LLAMADA', /llamada/],
  ['WHATSAPP', /whatsapp/],
  ['MENSAJE_LINKEDIN', /linkedin/],
  ['CORREO', /correo|email|nda|envio/]
];
const mapActivityType = label => ACTIVITY_RULES.find(([, pattern]) => pattern.test(fold(label)))?.[0] ?? 'NOTA';

const DATED_FRAGMENT = /(\d{1,2}-[A-Za-z]{3,4}-\d{4}):\s*/g;

/** "11-Aug-2026: conversación inicial. 27-Aug-2026: propuesta…" → dated NOTA entries; text without dates stays as notes. */
export const splitDatedNotes = value => {
  const source = text(value);
  if (!source) return { notes: null, entries: [] };
  const parts = source.split(DATED_FRAGMENT);
  const leading = text(parts[0]);
  const entries = [];
  for (let index = 1; index < parts.length; index += 2) {
    const occurredAt = parseExcelDate(parts[index]);
    const note = text(parts[index + 1]);
    if (occurredAt && note) entries.push({ occurredAt, note });
  }
  if (entries.length === 0) return { notes: source, entries: [] };
  return { notes: leading, entries };
};

// ---- workbook reading ------------------------------------------------------------------------------------

const readSheet = (workbook, name, requiredHeaders) => {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`La hoja "${name}" no existe en el archivo.`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  const headerIndex = rows.findIndex(row => requiredHeaders.every(header => row.some(cell => String(cell).trim() === header)));
  if (headerIndex < 0) throw new Error(`No se encontró la fila de encabezados en "${name}".`);
  const headers = rows[headerIndex].map(cell => String(cell).trim());
  return rows.slice(headerIndex + 1)
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
};

export const parseCrmWorkbook = workbook => ({
  leads: readSheet(workbook, 'CRM Maestro', ['ID', 'Etapa comercial']).filter(row => text(row.ID)),
  activities: readSheet(workbook, 'Bitácora gestiones', ['Fecha', 'Tipo de gestión']).filter(row => text(row['Empresa / cliente']))
});

// ---- plan ------------------------------------------------------------------------------------------------

const resolveOwner = (label, owners = {}) => {
  const folded = fold(label);
  if (!folded) return null;
  if (folded.includes('francisco') || folded.includes('franci')) return owners.francisco || null;
  if (folded.includes('comercial')) return owners.comercial || null;
  return owners[folded] || null;
};

const earliest = dates => dates.filter(Boolean).sort((a, b) => a - b)[0] || null;
const latest = dates => dates.filter(Boolean).sort((a, b) => b - a)[0] || null;

/**
 * Pure: rows → lead payloads (each with its activities) + a report. Nothing is written here.
 * owners: { comercial: TeamMember id, francisco: TeamMember id }.
 */
export const buildImportPlan = ({ leads: rows, activities: logRows }, { owners = {}, importedAt = new Date(), authorId = null } = {}) => {
  const report = { total: rows.length, estimatedEntryDates: 0, approximateDates: 0, unknownStages: [], unmatchedActivities: [], withoutOwner: 0, byStage: {}, byOrigin: {}, datedNotes: 0, logMatched: 0 };
  const leads = rows.map(row => {
    const legacyCode = text(row.ID);
    const { origin, originDetail } = mapOrigin(row.Fuente, row['Origen / canal']);
    const rawStage = text(row['Etapa comercial']);
    let stage = mapStage(rawStage);
    if (!stage) {
      const fromResult = RESULT_STAGES[fold(row.Resultado)] || 'POR_GESTIONAR';
      report.unknownStages.push({ legacyCode, label: rawStage, resolved: fromResult });
      stage = fromResult;
    }
    if (!isValidStage(stage)) stage = 'POR_GESTIONAR';

    const dates = {
      entered: parseExcelDate(row['Fecha ingreso al CRM']),
      published: parseExcelDate(row['Fecha publicación / emisión']),
      deadline: parseExcelDate(row['Cierre convocatoria']),
      firstContact: parseExcelDate(row['Fecha primer contacto']),
      proposal: parseExcelDate(row['Fecha propuesta']),
      lastActivity: parseExcelDate(row['Fecha última gestión']),
      nextFollowUp: parseExcelDate(row['Fecha próximo seguimiento (sugerida)'])
    };
    report.approximateDates += Object.values(dates).filter(date => date?.approximate).length;

    const { notes, entries } = splitDatedNotes(row['Observaciones / historial']);
    report.datedNotes += entries.length;
    const activities = entries.map(entry => ({ type: 'NOTA', occurredAt: entry.occurredAt, note: entry.note, authorId }));

    const enteredAt = dates.entered || earliest([dates.published, dates.firstContact, dates.proposal, dates.lastActivity, ...activities.map(item => item.occurredAt)]) || importedAt;
    if (!dates.entered) report.estimatedEntryDates += 1;

    const ownerId = resolveOwner(row.Responsable, owners);
    if (!ownerId) report.withoutOwner += 1;
    report.byStage[stage] = (report.byStage[stage] || 0) + 1;
    report.byOrigin[origin] = (report.byOrigin[origin] || 0) + 1;

    return {
      legacyCode,
      origin,
      originDetail,
      enteredAt,
      enteredAtEstimated: !dates.entered,
      contactName: text(row.Contacto),
      company: text(row['Empresa / cliente']),
      companyKey: normalizeCompanyKey(row['Empresa / cliente']),
      jobTitle: text(row['Cargo / rol']),
      phone: text(row['Teléfono']),
      email: text(row.Email)?.toLowerCase() || null,
      linkedinUrl: text(row['URL / LinkedIn']),
      serviceInterest: text(row['Servicio / oportunidad']),
      language: text(row.Idioma),
      allowedContact: text(row['Contacto permitido']),
      priority: ['ALTA', 'MEDIA', 'BAJA'].includes(fold(row.Prioridad).toUpperCase()) ? fold(row.Prioridad).toUpperCase() : 'MEDIA',
      publishedAt: dates.published,
      callDeadlineAt: dates.deadline,
      firstContactAt: dates.firstContact,
      proposalSentAt: dates.proposal,
      lastActivityAt: dates.lastActivity,
      closedAt: null,
      stage,
      nextAction: text(row['Próxima acción']),
      nextFollowUpAt: dates.nextFollowUp,
      ownerId,
      quotedValue: parseMoney(row['Valor cotizado']),
      currency: 'COP',
      lostReason: stage === 'PERDIDO' ? 'Importado del Excel sin motivo registrado.' : null,
      notes,
      createdById: authorId,
      activities
    };
  });

  // Attach the "Bitácora gestiones" rows to leads by company name.
  const byCompany = new Map();
  leads.forEach(lead => { if (lead.companyKey && !byCompany.has(lead.companyKey)) byCompany.set(lead.companyKey, lead); });
  const findLead = name => {
    const key = normalizeCompanyKey(name);
    if (!key) return null;
    if (byCompany.has(key)) return byCompany.get(key);
    return leads.find(lead => lead.companyKey && (lead.companyKey.startsWith(key) || key.startsWith(lead.companyKey))) || null;
  };
  for (const row of logRows) {
    const lead = findLead(row['Empresa / cliente']);
    const occurredAt = parseExcelDate(row.Fecha);
    if (!lead || !occurredAt) { report.unmatchedActivities.push(row); continue; }
    report.logMatched += 1;
    const kind = text(row['Tipo de gestión']);
    const type = mapActivityType(kind);
    lead.activities.push({
      type,
      occurredAt,
      note: text(row['Resultado / nota']) || kind,
      result: null,
      nextAction: text(row['Próxima acción']),
      nextFollowUpAt: null,
      authorId
    });
    // Prefix the original label when the channel had to be inferred.
    if (type === 'NOTA' && kind) lead.activities.at(-1).note = `[${kind}] ${lead.activities.at(-1).note}`;
  }

  // Milestones the log makes evident; the closed date; sort activities oldest first.
  for (const lead of leads) {
    lead.activities.sort((a, b) => a.occurredAt - b.occurredAt);
    const contactDates = lead.activities.filter(item => item.type !== 'NOTA').map(item => item.occurredAt);
    if (!lead.firstContactAt) {
      lead.firstContactAt = earliest([...contactDates, lead.proposalSentAt])
        || (stageOrder(lead.stage) >= stageOrder('CONTACTADO') && !isClosedStage(lead.stage) ? lead.lastActivityAt : null);
    }
    if (!lead.proposalSentAt) lead.proposalSentAt = earliest(lead.activities.filter(item => item.type === 'PROPUESTA_ENVIADA').map(item => item.occurredAt));
    lead.lastActivityAt = latest([lead.lastActivityAt, ...lead.activities.map(item => item.occurredAt)]);
    if (isClosedStage(lead.stage)) lead.closedAt = lead.lastActivityAt || lead.enteredAt;
    if (lead.firstContactAt && lead.firstContactAt < lead.enteredAt) lead.enteredAt = lead.firstContactAt;
  }

  return { leads, report };
};

// ---- write -----------------------------------------------------------------------------------------------

export const runImport = async (db, plan, { dryRun = false, log = () => {} } = {}) => {
  const summary = { created: 0, skipped: 0, activities: 0, dryRun };
  for (const lead of plan.leads) {
    const existing = await db.crmLead.findFirst({ where: { legacyCode: lead.legacyCode } });
    if (existing) { summary.skipped += 1; continue; }
    summary.created += 1;
    if (dryRun) continue;
    const { activities, ...data } = lead;
    const created = await db.crmLead.create({ data });
    for (const activity of activities) {
      await db.crmActivity.create({ data: { ...activity, leadId: created.id } });
      summary.activities += 1;
    }
    log(`+ ${lead.legacyCode} ${lead.company || lead.contactName || ''} (${lead.stage}) · ${activities.length} gestiones`);
  }
  return summary;
};

export const formatReport = (plan, summary) => {
  const lines = [];
  lines.push(`Leads en el Excel: ${plan.report.total}`);
  lines.push(`Por etapa: ${Object.entries(plan.report.byStage).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  lines.push(`Por origen: ${Object.entries(plan.report.byOrigin).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  lines.push(`Fecha de ingreso estimada: ${plan.report.estimatedEntryDates} (no contarán en promedios de velocidad)`);
  lines.push(`Fechas aproximadas (solo mes): ${plan.report.approximateDates}`);
  lines.push(`Notas con fecha convertidas en gestiones: ${plan.report.datedNotes}`);
  lines.push(`Filas de bitácora emparejadas: ${plan.report.logMatched} · sin emparejar: ${plan.report.unmatchedActivities.length}`);
  plan.report.unmatchedActivities.forEach(row => lines.push(`   · ${row.Fecha} ${row['Empresa / cliente']} — ${row['Tipo de gestión']}`));
  lines.push(`Sin responsable asignado: ${plan.report.withoutOwner}`);
  plan.report.unknownStages.forEach(item => lines.push(`   · etapa desconocida "${item.label}" en ${item.legacyCode} → ${item.resolved}`));
  if (summary) lines.push(`${summary.dryRun ? '[simulación] ' : ''}creados ${summary.created} · ya existían ${summary.skipped} · gestiones ${summary.activities}`);
  return lines.join('\n');
};

// ---- CLI -------------------------------------------------------------------------------------------------

const parseArgs = argv => {
  const options = { dryRun: false, owners: {}, file: null, confirmTarget: null, authorId: null };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--owner-')) { const [key, value] = arg.slice(8).split('='); options.owners[key] = value; }
    else if (arg.startsWith('--confirm-target=')) options.confirmTarget = arg.slice(17);
    else if (arg.startsWith('--author=')) options.authorId = arg.slice(9);
    else if (!arg.startsWith('--')) options.file = arg;
  }
  return options;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.file) { console.error('Uso: node scripts/import-crm-excel.js <archivo.xlsx> [--dry-run] [--confirm-target=<host>] [--owner-comercial=<id>] [--owner-francisco=<id>] [--author=<userId>]'); process.exit(1); }
  const workbook = XLSX.readFile(options.file, { cellDates: true });
  const plan = buildImportPlan(parseCrmWorkbook(workbook), { owners: options.owners, authorId: options.authorId });
  if (options.dryRun) {
    console.log(formatReport(plan, { created: plan.leads.length, skipped: 0, activities: plan.leads.reduce((sum, lead) => sum + lead.activities.length, 0), dryRun: true }));
    process.exit(0);
  }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL es obligatoria.'); process.exit(1); }
  const target = new URL(process.env.DATABASE_URL);
  if (options.confirmTarget !== target.hostname) {
    console.error(`Destino ${target.hostname}${target.pathname}. Para escribir ahí repite el comando con --confirm-target=${target.hostname}. Usa --dry-run para solo revisar.`);
    process.exit(1);
  }
  const { default: prisma } = await import('../src/lib/prisma.js');
  try {
    const summary = await runImport(prisma, plan, { log: line => console.log(line) });
    console.log(formatReport(plan, summary));
  } finally {
    await prisma.$disconnect();
  }
}
