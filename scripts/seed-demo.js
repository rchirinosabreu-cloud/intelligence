// Siembra la agencia inventada de la versión «Demo» (Rodny, 26 de octubre de 2026). Por defecto SIMULA: dice
// a qué base iría y cuánto escribiría, sin tocar nada. Escribe solo con `--confirmar SEMBRAR`.
//
//   node scripts/seed-demo.js [--reiniciar] [--railway[=demo]] [--confirmar SEMBRAR]
//
// Dos candados, los dos a la vez (`src/lib/demoMode.js`): `DEMO_MODE=true` y una base cuyo nombre diga «demo».
// Este archivo NO carga el `.env` a propósito: el `.env` local apunta a producción. La base llega por la
// variable `DATABASE_URL` puesta a mano o, con `--railway`, leída del entorno de Railway que se nombre
// (la URL pública del Postgres de ese entorno y el `DEMO_MODE` del servicio Intelligence de ese mismo entorno).
//
// `--reiniciar` borra los tres esquemas (public, bria_memory, vault), vuelve a crear el esquema con
// `prisma db push` y los `ensure-*` de `npm start`, y siembra desde cero: la base de demo es desechable y
// así vuelve al estado limpio antes de cada presentación. Sin `--reiniciar`, la semilla se niega si la
// base ya tiene datos, para no duplicar.
import { execFileSync, execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { demoDatabaseProblem, describeDatabaseTarget } from '../src/lib/demoMode.js';
import { presetModulePermissions, sanitizeModulePermissions } from '../src/lib/platformModules.js';
import { buildDemoDataset } from './demo/agenciaFicticia.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const confirmIndex = args.indexOf('--confirmar');
const confirmed = confirmIndex >= 0 && args[confirmIndex + 1] === 'SEMBRAR';
const reset = flag('reiniciar');

const fail = (message) => { console.error(`[Demo] ${message}`); process.exit(1); };

// --railway: los dos candados salen del entorno de Railway, no de lo que haya en esta máquina.
if (flag('railway') || option('railway')) {
    const environment = option('railway') || 'demo';
    const variablesOf = (service) => {
        try {
            return JSON.parse(execFileSync('railway', ['variables', '--service', service, '--environment', environment, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
        } catch (error) {
            return fail(`No pude leer las variables de «${service}» en el entorno «${environment}» de Railway: ${String(error.stderr || error.message).trim()}`);
        }
    };
    const intelligence = variablesOf('Intelligence');
    const postgres = variablesOf('Postgres');
    process.env.DEMO_MODE = String(intelligence.DEMO_MODE ?? '');
    process.env.DATABASE_URL = postgres.DATABASE_PUBLIC_URL || '';
    if (!process.env.DATABASE_URL) fail(`El Postgres del entorno «${environment}» no expone DATABASE_PUBLIC_URL.`);
    if (intelligence.DEMO_PASSWORD) process.env.DEMO_PASSWORD = intelligence.DEMO_PASSWORD;
}

const problem = demoDatabaseProblem(process.env);
if (problem) fail(problem);
const target = describeDatabaseTarget(process.env.DATABASE_URL);
const dataset = buildDemoDataset({ now: new Date() });
const password = process.env.DEMO_PASSWORD || dataset.agency.defaultPassword;

const counts = {
    personas: dataset.team.length, clientes: dataset.clients.length, parrillas: dataset.plans.length,
    piezas: dataset.plans.reduce((n, p) => n + p.pieces.length, 0), tareas: dataset.tasks.length, oportunidades: dataset.leads.length,
    movimientos: dataset.records.length, cuentasPorCobrar: dataset.receivables.length, terceros: dataset.thirdParties.length,
    cuentasPorPagar: dataset.payables.length, hechosDeBria: dataset.facts.length
};
console.log(`[Demo] Base: ${target} · ${confirmed ? (reset ? 'REINICIA Y SIEMBRA' : 'SIEMBRA') : 'simulación'} · ${dataset.agency.name}`);
if (!confirmed) {
    console.log(JSON.stringify({ dryRun: true, reiniciaria: reset, escribiria: counts }, null, 2));
    process.exit(0);
}

// --- Reinicio: la base de demo es desechable. ---
if (reset) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
    await client.connect();
    try {
        console.log('[Demo] Borrando los esquemas public, bria_memory y vault…');
        // Borrar `public` se lleva también la extensión pgvector, que el esquema de Prisma necesita antes del push.
        await client.query('DROP SCHEMA IF EXISTS bria_memory CASCADE; DROP SCHEMA IF EXISTS vault CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS vector;');
    } finally { await client.end(); }
    const env = { ...process.env };
    console.log('[Demo] Creando el esquema con prisma db push…');
    execSync('npx prisma db push --skip-generate --accept-data-loss', { env, stdio: 'inherit' });
    // La misma cadena de `npm start`, sin el servidor ni el `prisma generate`.
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const ensureScripts = [pkg.scripts.prestart, pkg.scripts.start].join(' && ').split('&&').map((s) => s.trim()).filter((s) => s.startsWith('node scripts/ensure-')).map((s) => s.replace(/^node /, ''));
    console.log(`[Demo] Aplicando ${ensureScripts.length} scripts ensure-*…`);
    for (const script of ensureScripts) execFileSync(process.execPath, [script], { env, stdio: ['ignore', 'ignore', 'inherit'] });
}

// --- Siembra. El cliente de Prisma se crea después de fijar la base, nunca desde el singleton de la app. ---
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 15000 });
const by = (rows, key = 'key') => Object.fromEntries(rows.map((row) => [row[key], row]));

try {
    if ((await prisma.user.count()) > 0) fail('La base ya tiene datos. Para volver a empezar: npm run demo:reset');

    // Personas: cuenta y ficha de Equipo, con los módulos de su rol (y Bria para todas).
    const hash = await bcrypt.hash(password, 10);
    const users = {}; const members = {};
    for (const person of dataset.team) {
        const modules = presetModulePermissions(person.accountRole);
        for (const key of person.modules || []) modules[key] = true;
        const user = await prisma.user.create({ data: {
            name: person.name, email: person.email, password: hash, role: person.accountRole, isActive: true,
            modulePermissions: sanitizeModulePermissions({ ...modules, bria: true }),
            hasFinancialAccess: Boolean(person.financialRole), financialRole: person.financialRole || 'NONE', passwordChangedAt: dataset.now
        } });
        members[person.key] = await prisma.teamMember.create({ data: { name: person.name, role: person.role, email: person.email, isActive: true, userId: user.id, highlightedAction: person.highlightedAction } });
        users[person.key] = user;
    }
    const admin = users[dataset.team.find((p) => p.accountRole === 'ADMIN').key];

    // Clientes con su contrato y sus observaciones.
    const clients = {};
    for (const c of dataset.clients) {
        clients[c.key] = await prisma.client.create({ data: {
            name: c.name, slug: c.slug, legalName: c.legalName, documentType: c.documentType, documentNumber: c.documentNumber,
            contactName: c.contactName, email: c.email, phone: c.phone, city: c.city, country: c.country, status: 'ACTIVO',
            monthlyFee: c.monthlyFee, description: c.description, instagramUrl: c.instagramUrl || null, complexity: c.complexity,
            projectManagerId: members[c.pm].id, responsibleId: c.cm ? members[c.cm].id : null,
            contracts: { create: { serviceType: c.contract.serviceType, status: c.contract.status, startDate: c.contract.startDate, standBySince: c.contract.standBySince, cutDay: c.contract.cutDay, deliverables: c.contract.deliverables, storiesPerWeek: c.contract.storiesPerWeek, productionDays: c.contract.productionDays, monthlyReport: c.contract.monthlyReport, createdById: admin.id } },
            observations: { create: c.observations.map((text) => ({ text, source: 'MANUAL', authorId: admin.id })) }
        } });
    }

    // Parrillas y piezas. La publicación va al mediodía UTC para que el día no se corra en Bogotá.
    const items = {};
    for (const plan of dataset.plans) {
        const created = await prisma.contentPlan.create({ data: {
            clientId: clients[plan.client].id, month: plan.month, year: plan.year, status: plan.status, ownerId: members[plan.owner].id,
            strategicObjectives: plan.strategicObjectives, shareToken: randomBytes(32).toString('base64url'),
            briaReviewState: 'PENDING', briaReviewRequestedAt: null,
            contentItems: { create: plan.pieces.map((piece) => ({
                objective: piece.objective, format: piece.format, copyText: piece.copyText, captionText: piece.captionText,
                publishDate: new Date(Date.UTC(plan.year, plan.month - 1, piece.day, 12)), publishTime: piece.time, status: piece.status,
                internalNotes: piece.internalNotes, comments: piece.comments
            })) }
        }, include: { contentItems: true } });
        for (const item of created.contentItems) items[`${plan.client}:${plan.year}-${plan.month}:${item.publishDate.getUTCDate()}`] = item;
    }

    for (const r of dataset.monthlyReports) await prisma.clientMonthlyReport.create({ data: { clientId: clients[r.client].id, year: r.year, month: r.month, deliveredAt: r.deliveredAt, deliveredById: users[r.deliveredBy].id } });

    // Tareas con sus ciclos y sesiones: el tiempo medido es lo que leen Ritmo, Logros y la rentabilidad.
    for (const t of dataset.tasks) {
        const assignee = members[t.assignee]; const creator = users[t.creator];
        const task = await prisma.task.create({ data: {
            title: t.title, comments: t.description, clientId: clients[t.client].id, assigneeId: assignee.id, creatorId: creator.id,
            status: t.status, priority: t.priority, isSpecial: Boolean(t.isSpecial), aiCategory: t.category, aiComplexity: t.complexity,
            dueDate: t.dueDate, createdAt: t.createdAt, completedAt: t.completedAt || null, startedAt: t.startedAt || null,
            accumulatedWorkMs: t.work?.durationMs || 0,
            isReturned: t.status === 'DEVUELTA', returnCount: t.status === 'DEVUELTA' ? 1 : 0, returnedAt: t.returnedAt || null
        } });
        if (t.work) {
            const closed = Boolean(t.work.endedAt);
            const cycle = await prisma.taskWorkCycle.create({ data: { taskId: task.id, sequence: 1, kind: 'INITIAL', openedAt: t.work.startedAt, openedById: creator.id, closedAt: closed ? t.work.endedAt : null, closedById: closed ? assignee.userId : null, closeReason: closed ? 'COMPLETED' : null } });
            await prisma.taskWorkSession.create({ data: { taskId: task.id, cycleId: cycle.id, workerId: assignee.id, isCollaborator: false, startedById: assignee.userId, endedById: closed ? assignee.userId : null, startedAt: t.work.startedAt, endedAt: t.work.endedAt, durationMs: t.work.durationMs, closeReason: closed ? 'COMPLETED' : null } });
        } else if (t.status === 'DEVUELTA') {
            await prisma.taskWorkCycle.create({ data: { taskId: task.id, sequence: 1, kind: 'INITIAL', openedAt: t.createdAt, openedById: creator.id, closedAt: t.returnedAt, closedById: creator.id, closeReason: 'RETURNED', reason: t.returnReason, note: t.returnNote } });
        }
    }

    // CRM: oportunidades con su bitácora.
    for (const lead of dataset.leads) {
        await prisma.crmLead.create({ data: {
            company: lead.company, companyKey: lead.company.normalize('NFD').replace(/[^a-z0-9]/gi, '').toLowerCase(), contactName: lead.contactName, email: lead.email, phone: lead.phone,
            origin: lead.origin, stage: lead.stage, priority: 'MEDIA', ownerId: members[lead.owner].id, createdById: users[lead.owner].id, serviceInterest: lead.serviceInterest,
            quotedValue: lead.quotedValue, enteredAt: lead.enteredAt, proposalSentAt: lead.proposalSentAt, nextFollowUpAt: lead.nextFollowUpAt, closedAt: lead.closedAt,
            lastActivityAt: lead.lastActivityAt, lostReason: lead.lostReason || null, createdAt: lead.enteredAt,
            activities: { create: lead.activities.map((a) => ({ type: a.type, note: a.note, occurredAt: a.occurredAt, authorId: users[lead.owner].id })) }
        } });
    }

    // Finanzas: cuentas, movimientos, cartera (con su abono ligado al ingreso), terceros y cuentas por pagar.
    const accounts = {};
    for (const a of dataset.accounts) accounts[a.key] = await prisma.financialAccount.create({ data: { name: a.name, type: a.type, institution: a.institution || null, holderName: a.holderName, lastFour: a.lastFour || null, openingBalance: a.openingBalance, openingBalanceDate: a.openingBalanceDate } });
    const accountant = users[dataset.team.find((p) => p.financialRole === 'EDITOR')?.key] || admin;
    for (const r of dataset.records) {
        await prisma.financialRecord.create({ data: { type: r.type, category: r.category, section: r.section, amount: r.amount, description: r.description, date: r.date, year: r.year, month: r.month, accountId: accounts[r.account].id, clientId: r.client ? clients[r.client].id : null, counterparty: r.counterparty || null, origin: 'MANUAL', status: 'POSTED', postedAt: r.date, createdById: accountant.id } });
    }
    for (const r of dataset.receivables) {
        const client = clients[r.client];
        const receivable = await prisma.accountsReceivable.create({ data: {
            clientId: client.id, kind: 'CLIENTE', number: r.number, issuedAt: r.issuedAt, issuedById: accountant.id, concept: r.concept, servicePeriod: r.servicePeriod,
            amount: r.amount, period: new Date(Date.UTC(r.year, r.month - 1, 1)), year: r.year, month: r.month, dueDate: r.dueDate, status: r.status, origin: 'MANUAL',
            items: { create: [{ description: r.concept, amount: r.amount, sortOrder: 0 }] }
        } });
        if (r.payment) {
            const income = await prisma.financialRecord.create({ data: { type: 'INCOME', category: client.monthlyFee && r.concept.startsWith('Parrilla') ? 'MEMBRESIA' : 'SERVICIO', section: 'REVENUE', amount: r.amount, description: `Pago cuenta de cobro No. ${r.number} · ${client.name}`, date: r.payment.paidAt, year: r.year, month: r.month, accountId: accounts[r.payment.account].id, clientId: client.id, counterparty: client.name, reference: r.payment.reference, origin: 'SYSTEM', status: 'POSTED', postedAt: r.payment.paidAt, createdById: accountant.id } });
            await prisma.receivablePayment.create({ data: { receivableId: receivable.id, accountId: accounts[r.payment.account].id, financialRecordId: income.id, amount: r.amount, paidAt: r.payment.paidAt, reference: r.payment.reference, kind: 'PAGO', createdById: accountant.id } });
        }
    }
    const thirdParties = {};
    for (const p of dataset.thirdParties) thirdParties[p.key] = await prisma.thirdParty.create({ data: { kind: p.kind, name: p.name, legalName: p.legalName || null, documentType: p.documentType, documentNumber: p.documentNumber, bankName: p.bankName || null, bankAccountType: p.bankAccountType || null, bankAccountNumber: p.bankAccountNumber || null, createdById: accountant.id } });
    for (const p of dataset.payables) {
        const party = thirdParties[p.thirdParty];
        const payable = await prisma.accountsPayable.create({ data: { thirdPartyId: party.id, concept: p.concept, category: p.category, amount: p.amount, documentNumber: p.documentNumber, receivedAt: p.receivedAt, year: p.year, month: p.month, dueDate: p.dueDate, status: p.status, createdById: accountant.id } });
        if (p.status === 'PAGADA') {
            const expense = await prisma.financialRecord.create({ data: { type: 'EXPENSE', category: p.category, section: 'ADMIN_COST', amount: p.amount, description: `Pago a ${party.name}: ${p.concept}`, date: p.dueDate, year: p.year, month: p.month, accountId: accounts.banco.id, counterparty: party.name, origin: 'SYSTEM', status: 'POSTED', postedAt: p.dueDate, createdById: accountant.id } });
            await prisma.payablePayment.create({ data: { payableId: payable.id, accountId: accounts.banco.id, financialRecordId: expense.id, amount: p.amount, paidAt: p.dueDate, reference: `TRF-${p.documentNumber}`, createdById: accountant.id } });
        }
    }

    for (const a of dataset.announcements) await prisma.globalAnnouncement.create({ data: { content: a.content, type: 'DASHBOARD', authorId: users[a.author].id } });

    // La memoria de Bria: hechos sobre las cuentas inventadas, por el mismo repositorio que la carga real.
    const ready = (await pool.query("SELECT to_regclass('bria_memory.agency_facts') IS NOT NULL AS ready")).rows[0].ready;
    if (!ready) await pool.query(await readFile(new URL('./sql/bria-agency-facts.sql', import.meta.url), 'utf8'));
    const { createBriaAgencyFactRepository } = await import('../src/services/briaAgencyFactRepository.js');
    const repository = createBriaAgencyFactRepository({ pool, workspace: 'application' });
    const links = new Map(dataset.clients.map((c) => [c.name, { clientId: clients[c.key].id }]));
    const facts = await repository.importReading({ facts: [...dataset.facts], questions: [], links, asOf: dataset.now.toISOString().slice(0, 10), actor: { ref: 'demo-seed', name: 'Semilla de la demo' }, origin: 'EQUIPO', reason: 'Agencia inventada de la demo' });

    console.log(JSON.stringify({ sembrado: counts, memoria: facts }, null, 2));
    console.log(`\n[Demo] Listo. Cuentas (todas con la misma contraseña, DEMO_PASSWORD o la de scripts/demo/agenciaFicticia.js):\n${dataset.team.map((p) => `  ${p.email}  ·  ${p.name} (${p.role})`).join('\n')}`);
} finally {
    await prisma.$disconnect();
    await pool.end();
}
