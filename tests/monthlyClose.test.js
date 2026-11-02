import test from 'node:test';
import assert from 'node:assert/strict';
import { canConfirmClose, closeOpensOn, closeSnapshot, closeSummaryText, reportProblem, reportStatusLabel } from '../src/lib/monthlyClose.js';

// Punto 5 de la solicitud de Elisa (29 de octubre de 2026): los estados del informe y el cierre del mes.

test('el informe tiene cuatro estados y un enlace que tiene que ser una dirección web', () => {
    assert.equal(reportStatusLabel('EN_REVISION'), 'En revisión');
    assert.equal(reportStatusLabel(undefined), 'Pendiente');
    assert.equal(reportProblem({ status: 'ENVIADO' }), null, 'el enlace es opcional');
    assert.equal(reportProblem({ status: 'ENVIADO', link: 'https://drive.google.com/x' }), null);
    assert.match(reportProblem({ status: 'LISTO' }), /estado/);
    assert.match(reportProblem({ status: 'ENVIADO', link: 'drive.google.com/x' }), /https/);
    assert.match(reportProblem({ status: 'ENVIADO', link: 'javascript:alert(1)' }), /https/);
});

test('el cierre se confirma desde tres días antes de que termine el mes, una sola vez', () => {
    const october = { end: '2026-10-31', close: null };
    assert.equal(closeOpensOn(october), '2026-10-28');
    assert.equal(canConfirmClose(october, '2026-10-27'), false);
    assert.equal(canConfirmClose(october, '2026-10-28'), true);
    assert.equal(canConfirmClose(october, '2026-11-15'), true, 'un mes que ya pasó se puede cerrar');
    assert.equal(canConfirmClose({ ...october, close: { closedAt: '2026-10-31' } }, '2026-11-01'), false);
});

test('el cierre guarda lo que quedó pendiente y lo dice en una frase', () => {
    const cycle = { quota: 12, reached: { publicada: 10 }, overdueItems: 1, report: { status: 'EN_REVISION' } };
    const snapshot = closeSnapshot(cycle, { monthlyReport: true });
    assert.deepEqual(snapshot, { quota: 12, published: 10, missing: 2, overdue: 1, report: 'EN_REVISION' });
    assert.equal(closeSummaryText(snapshot), 'Quedaron 2 piezas por publicar y el informe en revisión. Siguen en este mes.');
    assert.equal(closeSummaryText(closeSnapshot({ quota: 4, reached: { publicada: 4 }, report: { status: 'ENVIADO' } }, { monthlyReport: true })), 'Cerró completo: 4 de 4 publicadas y el informe enviado.');
    assert.equal(closeSnapshot({ quota: 4, reached: { publicada: 4 } }).report, null, 'sin informe contratado no se habla del informe');
    assert.equal(closeSummaryText(closeSnapshot({ quota: 4, reached: { publicada: 3 } }, { monthlyReport: true })), 'Quedaron 1 pieza por publicar y el informe pendiente. Siguen en este mes.');
    assert.equal(closeSummaryText(closeSnapshot({ quota: 4, reached: { publicada: 3 } })), 'Quedó 1 pieza por publicar. Sigue en este mes.');
});
