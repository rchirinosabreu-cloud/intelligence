import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readExcelClients, planImport } from '../src/lib/clientOperationsImport.js';
import { bogotaDate } from '../src/lib/colombiaBusinessDays.js';

// Carga única del Excel «PENDIENTES BRAIN STUDIO 2026» a la Operación de clientes (2 de octubre de 2026).
// La plataforma manda: el Excel solo llena huecos, no crea clientes y nada se pisa. Por defecto SOLO
// MUESTRA lo que haría y deja un informe; escribe únicamente con `--confirm IMPORTAR`.
//
//   node scripts/import-client-operations-excel.js "<ruta al Excel>"                       (simulación)
//   node scripts/import-client-operations-excel.js "<ruta al Excel>" --confirm IMPORTAR     (escribe)
//   … --crear-tareas --creador correo@brainstudio.com   (además crea tareas con las observaciones de la hoja MIO)
//
// Las observaciones («Comentario» de INDICADORES y «OBSERVACIONES» de MIO) se cargan siempre a la sección
// Observaciones de cada cliente, y la «Acción destacada» de cada colaborador a su ficha del equipo.
//
// Cada cliente se guarda en su propia transacción: o queda completo o no queda. Volver a correrlo no
// duplica nada: los campos ya llenos no se tocan, quien tiene contrato no recibe otro y una tarea con el
// mismo título para el mismo cliente no se repite.

const require = createRequire(import.meta.url);
const TASK_TITLE = 'Pendientes que venían del Excel';

export function readWorkbook(file) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(file);
  const rows = (name) => {
    if (!wb.Sheets[name]) throw new Error(`El Excel no tiene la hoja «${name}».`);
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
  };
  return { indicadores: rows('INDICADORES 2026'), mio: rows('MIO - BRAIN STUDIO') };
}

export function renderReport(plan, { confirmed, withTasks }) {
  const lines = [`# Carga del Excel a Operación de clientes`, '', confirmed ? 'Modo: **escritura** (`--confirm IMPORTAR`).' : 'Modo: **simulación**. No se escribió nada.', ''];
  const updates = plan.updates.filter((u) => Object.keys(u.data).length || u.contract);
  lines.push(`## Clientes que reciben datos (${updates.length})`, '');
  for (const u of updates) {
    const parts = [];
    for (const [field, value] of Object.entries(u.data)) parts.push(`${field}: ${String(value).slice(0, 80)}`);
    if (u.contract) parts.push(`contrato ${u.contract.serviceType === 'PARRILLA' ? `${u.contract.deliverables.map((d) => `${d.quantity} ${d.format}`).join(', ')}` : 'de servicios'} desde ${u.contract.startDate}${u.contract.endDate ? ` hasta ${u.contract.endDate}` : ''}${u.contract.status === 'STAND_BY' ? ' (stand by)' : ''}`);
    lines.push(`- **${u.client}**: ${parts.join(' · ')}`);
  }
  lines.push('', `## Observaciones que pasan a cada cliente (${plan.observations.length})`, '');
  for (const o of plan.observations) lines.push(`- **${o.client}** (${o.label}): ${o.text.replace(/\n/g, ' ')}`);
  lines.push('', `## Acción destacada del equipo (${plan.teamHighlights.length})`, '');
  for (const h of plan.teamHighlights) lines.push(`- **${h.name}**: ${h.text}`);
  lines.push('', `## Tareas de las observaciones de la hoja MIO (${plan.tasks.length})${withTasks ? '' : ' — no se crean sin `--crear-tareas`'}`, '');
  for (const t of plan.tasks) lines.push(`- **${plan.updates.find((u) => u.clientId === t.clientId)?.client}**: ${t.comments.replace(/\n/g, ' ')}`);
  lines.push('', `## Diferencias: la plataforma dice otra cosa y se dejó lo de la plataforma (${plan.differences.length})`, '');
  for (const d of plan.differences) lines.push(`- **${d.client}**: ${d.text}`);
  lines.push('', `## Dudas para revisar (${plan.doubts.length})`, '');
  for (const d of plan.doubts) lines.push(`- ${d}`);
  lines.push('', `## En el Excel pero no en la plataforma: no se crearon (${plan.notFound.length})`, '');
  for (const name of plan.notFound) lines.push(`- ${name}`);
  lines.push('', `## Archivados en la plataforma: no se tocaron (${plan.archived.length})`, '');
  for (const name of plan.archived) lines.push(`- ${name}`);
  return `${lines.join('\n')}\n`;
}

/** Aplica el plan. Solo escribe lo que el plan dice, cliente por cliente y cada uno en su transacción. */
export async function applyPlan(db, plan, { withTasks = false, creatorUserId = null } = {}) {
  const result = { clients: 0, contracts: 0, tasks: 0, observations: 0, highlights: 0 };
  for (const update of plan.updates) {
    const task = withTasks ? plan.tasks.find((t) => t.clientId === update.clientId) : null;
    const notes = (plan.observations || []).filter((o) => o.clientId === update.clientId);
    if (!Object.keys(update.data).length && !update.contract && !task && !notes.length) continue;
    await db.$transaction(async (tx) => {
      if (Object.keys(update.data).length) {
        await tx.client.update({ where: { id: update.clientId }, data: update.data });
        result.clients += 1;
      }
      if (update.contract) {
        // Se vuelve a comprobar dentro de la transacción: si alguien cargó un contrato entretanto, manda el suyo.
        const existing = await tx.clientContract.count({ where: { clientId: update.clientId } });
        if (!existing) {
          await tx.clientContract.create({ data: { ...update.contract, clientId: update.clientId, source: 'EXCEL', createdById: creatorUserId, updatedById: creatorUserId } });
          result.contracts += 1;
        }
      }
      // Una observación con el mismo texto para el mismo cliente no se repite al volver a correrlo.
      for (const note of notes) {
        const exists = await tx.clientObservation.count({ where: { clientId: update.clientId, text: note.text } });
        if (!exists) {
          await tx.clientObservation.create({ data: { clientId: update.clientId, text: note.text, source: 'EXCEL', sourceLabel: note.label, authorId: creatorUserId } });
          result.observations += 1;
        }
      }
      if (task) {
        const exists = await tx.task.count({ where: { clientId: task.clientId, title: TASK_TITLE } });
        if (!exists) {
          await tx.task.create({ data: { title: TASK_TITLE, comments: task.comments, clientId: task.clientId, assigneeId: task.assigneeId, creatorId: creatorUserId, status: 'PENDIENTE' } });
          result.tasks += 1;
        }
      }
    });
  }
  // La acción destacada solo se escribe si la persona todavía no tiene una (la plataforma manda).
  for (const highlight of plan.teamHighlights || []) {
    const { count } = await db.teamMember.updateMany({ where: { id: highlight.memberId, highlightedAction: null }, data: { highlightedAction: highlight.text } });
    result.highlights += count;
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--confirm' && args[args.indexOf(a) - 1] !== '--creador');
  const confirmed = args.includes('--confirm') && args[args.indexOf('--confirm') + 1] === 'IMPORTAR';
  const withTasks = args.includes('--crear-tareas');
  const creatorEmail = args.includes('--creador') ? args[args.indexOf('--creador') + 1] : null;
  if (!file) throw new Error('Falta la ruta del Excel. Uso: node scripts/import-client-operations-excel.js "<ruta>" [--confirm IMPORTAR] [--crear-tareas --creador correo]');
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL: el script necesita saber qué base leer.');
  if (withTasks && !creatorEmail) throw new Error('Para crear tareas hace falta --creador <correo> de quien las firma.');

  const { default: prisma } = await import('../src/lib/prisma.js');
  try {
    console.log(`Base: ${new URL(process.env.DATABASE_URL).host}`);
    const today = bogotaDate();
    const { clients: excelClients, generalDoubts, teamHighlights } = readExcelClients({ ...readWorkbook(file), year: Number(today.slice(0, 4)) });
    const platformClients = await prisma.client.findMany({
      select: { id: true, name: true, slug: true, isArchived: true, description: true, instagramUrl: true, agency: true, complexity: true, responsibleId: true, projectManagerId: true, contracts: { select: { id: true } } },
    });
    const team = await prisma.teamMember.findMany({ select: { id: true, name: true, isActive: true, highlightedAction: true } });
    const plan = planImport({ excelClients, platformClients, team, today, doubts: generalDoubts, teamHighlights });

    let creatorUserId = null;
    if (withTasks) {
      const creator = await prisma.user.findUnique({ where: { email: creatorEmail }, select: { id: true, isActive: true } });
      if (!creator?.isActive) throw new Error(`No hay una cuenta activa con el correo ${creatorEmail}.`);
      creatorUserId = creator.id;
    }

    const report = renderReport(plan, { confirmed, withTasks });
    const reportPath = path.resolve(`informe-carga-operacion-${today}.md`);
    writeFileSync(reportPath, report);
    console.log(report);
    console.log(`Informe guardado en ${reportPath}`);

    if (!confirmed) {
      console.log('\nSimulación terminada: no se escribió nada. Para escribir, vuelve a correrlo con --confirm IMPORTAR.');
      return;
    }
    const result = await applyPlan(prisma, plan, { withTasks, creatorUserId });
    console.log(`\nListo: ${result.clients} fichas completadas, ${result.contracts} contratos cargados, ${result.observations} observaciones, ${result.highlights} acciones destacadas y ${result.tasks} tareas creadas.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`No se pudo completar la carga: ${error.message}`);
    process.exitCode = 1;
  });
}
