import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDemoDataset, demoDatasetText, DEMO_AGENCY, DEMO_TEAM } from '../scripts/demo/agenciaFicticia.js';
import { validateFact } from '../src/lib/briaAgencyFacts.js';
import { TASK_CATEGORIES } from '../src/services/deterministicTaskClassifier.js';
import { CRM_STAGES, CRM_ORIGINS, CRM_ACTIVITY_TYPES } from '../src/lib/crmRules.js';
import { CONTRACT_FORMATS } from '../src/lib/clientOperations.js';
import { THIRD_PARTY_KINDS } from '../src/lib/accountsPayable.js';

// La versión «Demo» (Rodny, 26 de octubre de 2026) enseña una agencia inventada. Esta prueba vigila que
// el conjunto sea ficción escrita desde cero —ni el equipo ni los clientes reales de Brain Studio— y que
// cada dato respete los valores que la plataforma entiende, para que la semilla no reviente a mitad.

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const now = new Date('2026-10-26T15:00:00.000Z'); // lunes 26 de octubre de 2026, 10:00 de Bogotá
const dataset = buildDemoDataset({ now });
const text = demoDatasetText(dataset);

test('ningún nombre real de Brain Studio, de su equipo ni de sus clientes entra en la demo', () => {
    for (const real of [
        'Brain Studio', 'Brainstudio', 'brainstudioagencia',
        'Rodny', 'Chirinos', 'Elisa', 'Francisco Villa', 'Melissa', 'Jarlan', 'Kamila', 'Camila', 'Helen', 'Claudia', 'Keila', 'Francys', 'Gema',
        'Titanes', 'Pablo Hoff', 'PromoGroup', 'Endova', 'Foobespain', 'Foobspain', 'Wine & Wonder', 'Wine Summit', 'Salsipuedes', 'Nuva', 'Fundación Grit', 'SunPartners', 'Narcobollo', 'New Pueblito', 'Elvira Utria', 'Aristea'
    ]) assert.doesNotMatch(text, new RegExp(real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `«${real}» es real y no puede estar en la demo`);
});

test('todas las cuentas del equipo están en el dominio inventado y nadie se repite', () => {
    const emails = DEMO_TEAM.map((p) => p.email);
    assert.ok(emails.every((e) => e.endsWith(`@${DEMO_AGENCY.domain}`)));
    assert.equal(new Set(emails).size, emails.length);
    assert.ok(DEMO_TEAM.some((p) => p.accountRole === 'ADMIN'), 'hace falta al menos una administradora para enseñar la plataforma entera');
    assert.ok(DEMO_TEAM.some((p) => p.accountRole === 'PROJECT_MANAGER'));
    for (const person of DEMO_TEAM) assert.ok(['ADMIN', 'PROJECT_MANAGER', 'EDITOR', 'VIEWER'].includes(person.accountRole));
});

test('los clientes llevan contrato con formatos de la parrilla y cada clave es única', () => {
    const keys = dataset.clients.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const client of dataset.clients) {
        assert.ok(['ALTA', 'MEDIA', 'BAJA'].includes(client.complexity));
        assert.ok(['PARRILLA', 'SERVICIOS'].includes(client.contract.serviceType));
        assert.ok(['ACTIVO', 'STAND_BY', 'TERMINADO'].includes(client.contract.status));
        assert.match(client.contract.startDate, /^\d{4}-\d{2}-\d{2}$/);
        for (const row of client.contract.deliverables) assert.ok(CONTRACT_FORMATS.includes(row.format), `${row.format} no es un formato del contrato`);
        assert.ok(DEMO_TEAM.some((p) => p.key === client.pm));
        if (client.cm) assert.ok(DEMO_TEAM.some((p) => p.key === client.cm));
    }
    assert.ok(dataset.clients.some((c) => c.contract.status === 'STAND_BY'), 'un cliente en stand by enseña el semáforo gris');
    assert.ok(dataset.clients.some((c) => c.contract.serviceType === 'SERVICIOS'));
});

test('cada parrilla activa tiene su mes actual, el anterior y —desde mitad de mes— el que viene, con piezas en estados reales', () => {
    const statuses = ['BORRADOR', 'EN_REVISION', 'APROBADO', 'PUBLICADO', 'REALIZADO', 'EN_PRODUCCION', 'DEVUELTO'];
    const activeParrillas = dataset.clients.filter((c) => c.contract.serviceType === 'PARRILLA' && c.contract.status === 'ACTIVO');
    assert.equal(dataset.plans.length, activeParrillas.length * 3, 'el 26 ya se planifica noviembre');
    assert.equal(buildDemoDataset({ now: new Date('2026-10-08T15:00:00.000Z') }).plans.length, activeParrillas.length * 2, 'el 8 todavía no');
    assert.ok(dataset.plans.filter((p) => p.status === 'PLANIFICACION').every((p) => p.pieces.every((piece) => ['BORRADOR', 'EN_REVISION'].includes(piece.status))));
    for (const plan of dataset.plans) {
        const client = dataset.clients.find((c) => c.key === plan.client);
        const expected = client.contract.deliverables.reduce((sum, row) => sum + row.quantity, 0);
        assert.equal(plan.pieces.length, expected, `${client.name}: tantas piezas como dice el contrato`);
        assert.ok(['ACTIVO', 'FINALIZADO', 'PLANIFICACION'].includes(plan.status));
        const days = new Set();
        for (const piece of plan.pieces) {
            assert.ok(statuses.includes(piece.status), `${piece.status} no es un estado de pieza`);
            assert.notEqual(piece.status, 'PROGRAMADO', '«Programado» lo pone solo la cola de Meta');
            assert.ok(piece.day >= 1 && piece.day <= 31);
            assert.match(piece.time, /^\d{2}:\d{2}$/);
            assert.ok(piece.copyText.length > 20 && piece.captionText.length > 20);
            assert.ok(!days.has(piece.day), `${client.name}: dos piezas el mismo día ${piece.day}`);
            days.add(piece.day);
            if (plan.status === 'ACTIVO' && piece.day > dataset.today.day + 1) assert.notEqual(piece.status, 'PUBLICADO', 'una pieza futura no puede estar publicada');
        }
    }
    // A principio de mes se ven todos los estados; a final de mes lo publicado domina, pero siempre queda algo
    // atrasado (en revisión o devuelto) para que Operación tenga qué señalar.
    const early = buildDemoDataset({ now: new Date('2026-10-08T15:00:00.000Z') }).plans.filter((p) => p.status === 'ACTIVO').flatMap((p) => p.pieces);
    for (const status of ['PUBLICADO', 'APROBADO', 'EN_REVISION', 'DEVUELTO', 'BORRADOR', 'REALIZADO']) {
        assert.ok(early.some((p) => p.status === status), `hace falta alguna pieza ${status} el día 8 para enseñar ese estado`);
    }
    const late = dataset.plans.filter((p) => p.status === 'ACTIVO').flatMap((p) => p.pieces);
    for (const status of ['PUBLICADO', 'EN_REVISION', 'DEVUELTO']) assert.ok(late.some((p) => p.status === status), `hace falta alguna pieza ${status} el día 26`);
    // Piezas atrasadas (fecha pasada sin publicar) solo en dos cuentas: el semáforo tiene rojos sin que todo arda.
    const behind = new Set(dataset.plans.filter((p) => p.status === 'ACTIVO').flatMap((p) => p.pieces.filter((piece) => piece.day < dataset.today.day - 1 && piece.status !== 'PUBLICADO').map(() => p.client)));
    assert.deepEqual([...behind].sort(), ['gimnasio-vital', 'hotel-mar-azul']);
    assert.ok(dataset.plans.filter((p) => p.status === 'FINALIZADO').every((p) => p.pieces.every((piece) => piece.status === 'PUBLICADO')), 'el mes pasado quedó cerrado');
    assert.ok(dataset.monthlyReports.length >= 3 && dataset.monthlyReports.every((r) => r.month === dataset.previous.month));
});

test('las tareas usan categorías, complejidades y estados reales, y las cerradas llevan tiempo medido', () => {
    const keys = dataset.tasks.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const task of dataset.tasks) {
        assert.ok(TASK_CATEGORIES.includes(task.category), `${task.category} no es una categoría`);
        assert.ok(['ALTA', 'MEDIA', 'BAJA'].includes(task.complexity));
        assert.ok(['PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA'].includes(task.status));
        assert.ok(['URGENTE', 'ALTA', 'NORMAL'].includes(task.priority));
        assert.ok(dataset.clients.some((c) => c.key === task.client), `${task.client} no es un cliente de la demo`);
        assert.ok(DEMO_TEAM.some((p) => p.key === task.assignee) && DEMO_TEAM.some((p) => p.key === task.creator));
        assert.ok(task.dueDate instanceof Date && task.createdAt instanceof Date);
        if (task.status === 'REALIZADA') {
            assert.ok(task.completedAt instanceof Date && task.completedAt <= now);
            assert.ok(task.work.durationMs > 0 && task.work.durationMs <= 8 * 3600000, 'más de 8 h es un reloj olvidado y Ritmo lo descarta');
            assert.ok(task.work.endedAt instanceof Date);
        }
        if (task.status === 'EN_CURSO') { assert.ok(task.startedAt < now); assert.equal(task.work.endedAt, null); }
        if (task.status === 'DEVUELTA') assert.ok(task.returnReason && task.returnNote);
    }
    const dueToday = dataset.tasks.filter((t) => t.status === 'PENDIENTE' && t.dueInDays === 0);
    const overdue = dataset.tasks.filter((t) => t.status === 'PENDIENTE' && t.dueInDays < 0);
    assert.ok(dueToday.length >= 1 && overdue.length >= 1, 'el dashboard enseña «para hoy» y «vencidas»');
    assert.ok(dataset.tasks.filter((t) => t.status === 'REALIZADA').length >= 10, 'Ritmo necesita varias cerradas con tiempo');
});

test('el CRM trae oportunidades en etapas y orígenes reales, y una propuesta que ya pide seguimiento', () => {
    const stages = CRM_STAGES.map((s) => s.value);
    const origins = CRM_ORIGINS.map((o) => o.value);
    const types = CRM_ACTIVITY_TYPES.map((t) => t.value);
    for (const lead of dataset.leads) {
        assert.ok(stages.includes(lead.stage), `${lead.stage} no es una etapa`);
        assert.ok(origins.includes(lead.origin));
        assert.ok(DEMO_TEAM.some((p) => p.key === lead.owner));
        assert.ok(lead.enteredAt instanceof Date);
        for (const activity of lead.activities) assert.ok(types.includes(activity.type), `${activity.type} no es un tipo de gestión`);
        if (lead.stage === 'PERDIDO') assert.ok(lead.lostReason && lead.closedAt);
    }
    const waiting = dataset.leads.find((l) => l.stage === 'PROPUESTA_ENVIADA' && l.proposalSentAt);
    assert.ok(waiting && (now - waiting.proposalSentAt) / 86400000 >= 10, 'una propuesta con más de 10 días sin respuesta enseña las alertas comerciales');
});

test('las finanzas cuadran con los enums y la cartera de este mes tiene deuda abierta', () => {
    for (const record of dataset.records) {
        assert.ok(['INCOME', 'EXPENSE'].includes(record.type));
        assert.ok(['MEMBRESIA', 'SERVICIO', 'PAUTA', 'NOMINA', 'LOGISTICA', 'ADMINISTRATIVO', 'TAX', 'FINANCIAL', 'OPERATIVO', 'DONACION', 'SIEMBRA', 'PRESTAMO'].includes(record.category));
        assert.ok(['REVENUE', 'ADMIN_COST', 'OPERATING_EXPENSE', 'INVESTMENT', 'FINANCING', 'RECEIVABLE', 'PAYROLL', 'OTHER'].includes(record.section));
        assert.ok(record.amount > 0 && record.date <= now, `${record.description}: nada en el futuro`);
        assert.ok(dataset.accounts.some((a) => a.key === record.account));
    }
    const numbers = dataset.receivables.map((r) => r.number);
    assert.equal(new Set(numbers).size, numbers.length, 'el consecutivo de la cuenta de cobro es único');
    for (const r of dataset.receivables) {
        assert.ok(['DEBE', 'PAGADO'].includes(r.status));
        if (r.status === 'PAGADO') assert.ok(r.payment && r.payment.paidAt <= now);
        else assert.equal(r.payment, null);
    }
    assert.ok(dataset.receivables.some((r) => r.year === dataset.current.year && r.month === dataset.current.month && r.status === 'DEBE'));
    for (const party of dataset.thirdParties) assert.ok(THIRD_PARTY_KINDS.some((k) => k.value === party.kind));
    for (const payable of dataset.payables) {
        assert.ok(dataset.thirdParties.some((p) => p.key === payable.thirdParty));
        assert.ok(['POR_PAGAR', 'PAGADA'].includes(payable.status));
        assert.notEqual(payable.category, 'PRESTAMO');
    }
});

test('los hechos de la memoria de Bria pasan la validación real y apuntan a cuentas de la demo o a la agencia', () => {
    for (const fact of dataset.facts) {
        const valid = validateFact(fact);
        assert.ok(valid.statement.length > 10);
        const isClient = dataset.clients.some((c) => c.name === fact.entidad);
        assert.ok(isClient || fact.entidad === DEMO_AGENCY.name, `${fact.entidad} no es una cuenta de la demo`);
    }
    assert.equal(new Set(dataset.facts.map((f) => f.id)).size, dataset.facts.length);
});

test('la semilla nunca carga el .env (apunta a producción) y pasa siempre por el candado', () => {
    const script = read('../scripts/seed-demo.js');
    assert.doesNotMatch(script, /dotenv/, 'el .env local apunta a producción: la semilla no lo lee');
    assert.match(script, /demoDatabaseProblem/);
    assert.match(script, /--confirmar/);
    const pkg = JSON.parse(read('../package.json'));
    assert.equal(pkg.scripts['demo:seed'], 'node scripts/seed-demo.js --confirmar SEMBRAR');
    assert.equal(pkg.scripts['demo:reset'], 'node scripts/seed-demo.js --reiniciar --confirmar SEMBRAR');
});

test('el servidor en modo demo lo dice en /api/health y se niega a arrancar sobre otra base', () => {
    const server = read('../server.js');
    assert.match(server, /assertDemoDatabase\(process\.env\)/);
    assert.match(server, /demo: isDemoMode\(\)/);
});
