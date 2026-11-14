// Cierre de mes y renovación en la banda de Administrativa (Elisa, 13 de noviembre de 2026: «que me invadan la
// pantalla, en la campanita si no entro no lo veo»). Protocolo: fuente ClientContract/ContractCycleAlert; destinataria
// Administrativa con Financiero; respuestas abrir, «Ya la revisé» y «Recordarme»; se cae solo cuando el contrato deja
// de estar vigente, se renueva o el cliente no continúa. Nada acredita que la cuenta de cobro se emitió.
import test from 'node:test';
import assert from 'node:assert/strict';
import { operationalNoticeMemory } from './helpers/operationalNoticeMemory.js';
import { currentImportantNotice, acknowledgeNotice, snoozeNotice } from '../src/services/importantNoticeService.js';
import { cycleBandNotice, cycleBandDigest, parseCycleSubject, isCycleNotice } from '../src/lib/contractCycleAlerts.js';
import { NOTICE_RESPONSE_POLICIES, noticeAllows } from '../src/lib/alertResponsePolicy.js';
import { noticeTraceDescription, NOTICE_TRACE_EVENTS } from '../src/lib/importantNoticeTrace.js';

const now = new Date('2026-11-13T15:00:00Z');
const contract = { id: 'k-1', clientId: 'c-1', status: 'ACTIVO', startDate: '2026-01-01', endDate: '2026-12-15', cutDay: 1, renewalDecision: 'PENDIENTE' };

function fixture({ kind = 'CICLO_FACTURACION', subjectId = 'CICLO:k-1' } = {}) {
    const f = operationalNoticeMemory();
    f.actor.modulePermissions.financiero = true;
    f.actor.teamMember.areas = ['ADMINISTRATIVA'];
    f.data.teamMember[0].areas = ['ADMINISTRATIVA'];
    f.data.clientContract.push({ ...contract, client: { name: 'Bonsai', isArchived: false } });
    f.data.importantNotice.push({ id: 'ciclo', userId: f.actor.id, kind, subjectId, level: 'IMPORTANTE', label: 'Facturación · Bonsai',
        message: 'El mes de Bonsai cierra el 30 de noviembre: revisa su facturación.', url: '/financiero?tab=cartera', resolvedAt: null, createdAt: new Date('2026-11-12') });
    return f;
}

test('la regla: facturación en coral, renovación verde a 30 y coral a 15, el contrato como asunto', () => {
    const billing = cycleBandNotice({ step: 'FACTURACION', close: '2026-11-30' }, contract, { clientName: 'Bonsai' });
    assert.deepEqual(billing, { kind: 'CICLO_FACTURACION', level: 'IMPORTANTE', subjectId: 'CICLO:k-1', label: 'Facturación · Bonsai',
        message: 'El mes de Bonsai cierra el 30 de noviembre: revisa su facturación.', url: '/financiero?tab=cartera' });
    const thirty = cycleBandNotice({ step: 'RENOVACION_30', endDate: '2026-12-15' }, contract, { clientName: 'Bonsai', operationUrl: '/clientes/operacion/bonsai' });
    const fifteen = cycleBandNotice({ step: 'RENOVACION_15', endDate: '2026-12-15' }, contract, { clientName: 'Bonsai', operationUrl: '/clientes/operacion/bonsai' });
    assert.equal(thirty.level, 'SEGUIMIENTO'); assert.equal(fifteen.level, 'IMPORTANTE');
    assert.equal(thirty.subjectId, fifteen.subjectId, 'el de los 15 días reemplaza al de los 30');
    assert.equal(fifteen.url, '/clientes/operacion/bonsai');
    assert.equal(cycleBandNotice({ step: 'REVISION' }, contract, {}), null, 'lo del project manager ya está en la banda por los avisos operativos');
    assert.deepEqual(parseCycleSubject('RENOV:k-1'), { contractId: 'k-1', renewal: true });
    assert.equal(parseCycleSubject(cycleBandDigest('FACTURACION', 5, '2026-11-29').subjectId), null, 'el resumen lo decide la persona');
    assert.ok(isCycleNotice({ kind: 'CICLO_RENOVACION' }) && !isCycleNotice({ kind: 'CARTERA_MENSUAL' }));
});

test('el protocolo está declarado: abrir, acuse personal y posponer; sin gestión ni cierre de oportunidad', () => {
    for (const kind of ['CICLO_FACTURACION', 'CICLO_RENOVACION']) {
        assert.equal(NOTICE_RESPONSE_POLICIES[kind].family, 'CYCLE');
        assert.deepEqual([...NOTICE_RESPONSE_POLICIES[kind].actions], ['open', 'acknowledge', 'snooze']);
        assert.match(NOTICE_RESPONSE_POLICIES[kind].explanation, /acuse personal/);
        assert.equal(noticeAllows({ kind }, 'follow-up'), false);
    }
    assert.match(noticeTraceDescription(NOTICE_TRACE_EVENTS.CLOSED, { outcome: 'REVISADO', subject: 'Bonsai' }, { actor: 'Elisa' }), /Elisa anotó desde la banda que revisó Bonsai/);
    assert.match(noticeTraceDescription(NOTICE_TRACE_EVENTS.CLEARED, { kind: 'CICLO_RENOVACION', reason: 'CONTRATO_ACTUALIZADO', subject: 'Bonsai' }, { subject: 'Elisa' }), /se renovó o el cliente no continúa/);
});

test('solo Administrativa con Financiero lo ve; «Ya la revisé» es un acuse y queda en la traza, no en el contrato', async () => {
    const { db, data, actor } = fixture();
    const before = JSON.stringify(data.clientContract);
    const { notice } = await currentImportantNotice(db, actor.id, now);
    assert.equal(notice?.kind, 'CICLO_FACTURACION');
    await acknowledgeNotice(db, 'ciclo', actor, { now });
    assert.equal(data.importantNotice[0].resolution, 'REVISADO');
    assert.equal(JSON.stringify(data.clientContract), before, 'el acuse no toca el contrato ni emite nada');
    assert.equal(data.accountsReceivable.length, 0);

    const other = fixture();
    other.data.teamMember[0].areas = ['PROJECT_MANAGEMENT'];
    assert.equal((await currentImportantNotice(other.db, other.actor.id, now)).notice, null, 'a quien no es Administrativa no se le muestra');
    await assert.rejects(acknowledgeNotice(other.db, 'ciclo', other.actor, { now }), { statusCode: 403 });

    const noFinance = fixture();
    noFinance.actor.modulePermissions.financiero = false;
    assert.equal((await currentImportantNotice(noFinance.db, noFinance.actor.id, now)).notice, null, 'el área sin el permiso no recibe avisos financieros');
});

test('se cae solo cuando el contrato deja de estar vigente o se renovó; posponer lo conserva', async () => {
    const ended = fixture();
    ended.data.clientContract[0].status = 'TERMINADO';
    assert.equal((await currentImportantNotice(ended.db, ended.actor.id, now)).notice, null);
    assert.equal(ended.data.importantNotice[0].resolution, 'YA_ATENDIDO');

    const renewed = fixture({ kind: 'CICLO_RENOVACION', subjectId: 'RENOV:k-1' });
    renewed.data.clientContract.push({ id: 'k-2', clientId: 'c-1', status: 'ACTIVO', startDate: '2026-12-16', endDate: null });
    assert.equal((await currentImportantNotice(renewed.db, renewed.actor.id, now)).notice, null, 'el contrato siguiente retira el aviso de renovación');

    const declined = fixture({ kind: 'CICLO_RENOVACION', subjectId: 'RENOV:k-1' });
    declined.data.clientContract[0].renewalDecision = 'NO_RENOVAR';
    assert.equal((await currentImportantNotice(declined.db, declined.actor.id, now)).notice, null, 'no renovar confirmado retira el aviso');

    const stillBilling = fixture();
    stillBilling.data.clientContract.push({ id: 'k-2', clientId: 'c-1', status: 'ACTIVO', startDate: '2026-12-16', endDate: null });
    assert.equal((await currentImportantNotice(stillBilling.db, stillBilling.actor.id, now)).notice?.kind, 'CICLO_FACTURACION', 'un contrato siguiente no exime de facturar el mes vigente');

    const snoozed = fixture();
    const { snoozedUntil } = await snoozeNotice(snoozed.db, 'ciclo', { option: '7d' }, snoozed.actor, { now });
    assert.equal(snoozedUntil.toISOString(), '2026-11-20T13:00:00.000Z');
    assert.equal(snoozed.data.importantNotice[0].resolvedAt, null);
    const digest = fixture({ subjectId: 'CICLO:RESUMEN:2026-11' });
    assert.equal((await currentImportantNotice(digest.db, digest.actor.id, now)).notice?.id, 'ciclo', 'el resumen no se cae solo');
});
