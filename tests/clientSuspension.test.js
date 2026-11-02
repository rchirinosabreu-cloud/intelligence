import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SUSPENSION_REASON_MAX, cycleKey, firstSuspendedCycle, isCycleSuspended, isDecisionDay, liftProblem,
    suspendedTaskReason, suspensionBlockReason, suspensionCandidate, suspensionCandidateBellText,
    suspensionCandidateNoticeText, suspensionProblem, suspensionStartedText, suspensionThresholdDay
} from '../src/lib/clientSuspension.js';

// Una cuenta de cliente con su vencimiento puesto a mano y un abono opcional.
const cuenta = (id, dueDate, amount = 1_000_000, payments = []) => ({
    id, kind: 'CLIENTE', status: 'DEBE', amount, dueDate, period: null, issuedAt: null, number: null, metadata: null, payments
});

test('el umbral son dos meses y quince días de calendario, contados hacia atrás desde hoy', () => {
    assert.equal(suspensionThresholdDay('2026-10-15'), '2026-07-31');
    assert.equal(suspensionThresholdDay('2026-01-15'), '2025-10-31');
    // Un 31 que no existe en el mes de destino cae en su último día, como contaría cualquiera a mano.
    assert.equal(suspensionThresholdDay('2026-05-31'), '2026-03-16');
    assert.equal(suspensionThresholdDay('2026-04-30'), '2026-02-13');
    assert.equal(suspensionThresholdDay('no es un día'), null);
});

test('cumple la condición quien tenga una cuenta vencida desde antes del umbral, y no quien la tenga un día después', () => {
    const justo = suspensionCandidate({ receivables: [cuenta('a', '2026-07-31')], today: '2026-10-15' });
    assert.equal(justo.since, '2026-07-31');
    assert.equal(justo.days, 76);
    assert.equal(justo.balanceCents, 100_000_000);
    assert.deepEqual(justo.receivableIds, ['a']);

    assert.equal(suspensionCandidate({ receivables: [cuenta('a', '2026-08-01')], today: '2026-10-15' }), null);
});

test('manda la cuenta más vieja, y las demás vencidas suman al saldo', () => {
    const candidato = suspensionCandidate({
        receivables: [cuenta('sep', '2026-09-30', 500_000), cuenta('jul', '2026-07-20', 1_000_000)],
        today: '2026-10-15'
    });
    assert.equal(candidato.since, '2026-07-20');
    assert.equal(candidato.count, 2);
    assert.equal(candidato.balanceCents, 150_000_000);
});

test('lo pagado, lo saldado y lo que no tiene plazo no cuentan: no se llama mora a una deuda sin vencimiento', () => {
    const pagada = { ...cuenta('a', '2026-07-01'), status: 'PAGADO' };
    assert.equal(suspensionCandidate({ receivables: [pagada], today: '2026-10-15' }), null);

    const saldada = { ...cuenta('b', '2026-07-01'), status: 'SALDADO' };
    assert.equal(suspensionCandidate({ receivables: [saldada], today: '2026-10-15' }), null);

    // Una cuota que espera un hito todavía no vence (formalización): no puede suspender a nadie.
    const sinPlazo = { ...cuenta('c', null), metadata: { waitsForMilestone: true } };
    assert.equal(suspensionCandidate({ receivables: [sinPlazo], today: '2026-10-15' }), null);

    // Y un préstamo no es una mensualidad.
    const prestamo = { ...cuenta('d', '2026-01-10'), kind: 'PRESTAMO' };
    assert.equal(suspensionCandidate({ receivables: [prestamo], today: '2026-10-15' }), null);
});

test('un abono que deja la cuenta en cero la saca, y uno revertido no', () => {
    const conAbono = cuenta('a', '2026-07-01', 1_000_000, [{ amount: 1_000_000, reversedAt: null, kind: 'PAGO' }]);
    assert.equal(suspensionCandidate({ receivables: [conAbono], today: '2026-10-15' }), null);

    const revertido = cuenta('a', '2026-07-01', 1_000_000, [{ amount: 1_000_000, reversedAt: new Date(), kind: 'PAGO' }]);
    assert.ok(suspensionCandidate({ receivables: [revertido], today: '2026-10-15' }));
});

test('el mes en curso se termina: la suspensión empieza en el siguiente', () => {
    assert.equal(firstSuspendedCycle({ year: 2026, month: 10 }), '2026-11');
    assert.equal(firstSuspendedCycle({ year: 2026, month: 12 }), '2027-01');
    assert.equal(firstSuspendedCycle({}), null);

    const suspension = { fromCycle: '2026-11' };
    assert.equal(isCycleSuspended(suspension, { year: 2026, month: 10 }), false, 'octubre se termina');
    assert.equal(isCycleSuspended(suspension, { year: 2026, month: 11 }), true);
    assert.equal(isCycleSuspended(suspension, { year: 2027, month: 3 }), true, 'y todo lo que venga después');
    assert.equal(isCycleSuspended({ fromCycle: null }, { year: 2026, month: 11 }), false);
});

test('el motivo del bloqueo dice el cliente, desde cuándo, quién lo autorizó y qué mes', () => {
    const suspension = { fromCycle: '2026-11', suspendedOn: '2026-10-15', authorizedBy: 'Francisco Villa' };
    const texto = suspensionBlockReason(suspension, { year: 2026, month: 11 }, 'Café Altura');
    assert.match(texto, /Café Altura/);
    assert.match(texto, /15 de octubre/);
    assert.match(texto, /Francisco Villa/);
    assert.match(texto, /noviembre de 2026/);
    assert.equal(suspensionBlockReason(suspension, { year: 2026, month: 10 }, 'Café Altura'), null);

    const pendiente = suspendedTaskReason(suspension, { year: 2026, month: 11 }, 'Café Altura');
    assert.match(pendiente, /pendiente/);
    assert.match(pendiente, /noviembre de 2026/);
});

test('suspender exige quién lo autorizó y por qué; levantar a mano, solo el motivo', () => {
    assert.match(suspensionProblem({ reason: 'No ha pagado desde julio.' }), /quién autorizó/);
    assert.match(suspensionProblem({ authorizedBy: 'Francisco Villa' }), /por qué/);
    assert.equal(suspensionProblem({ authorizedBy: 'Francisco Villa', reason: 'No ha pagado desde julio.' }), null);
    assert.match(suspensionProblem({ authorizedBy: 'Francisco Villa', reason: 'x'.repeat(SUSPENSION_REASON_MAX + 1) }), /máximo/);

    assert.match(liftProblem({}), /por qué/);
    assert.equal(liftProblem({ reason: 'Acuerdo de pago a tres cuotas.' }), null);
});

test('la propuesta del día 15 lleva cifras solo en la banda; la campana nunca', () => {
    const candidato = suspensionCandidate({ receivables: [cuenta('a', '2026-07-31', 3_150_000)], today: '2026-10-15' });
    const banda = suspensionCandidateNoticeText(candidato, 'Café Altura', '2026-11');
    assert.equal(banda.level, 'IMPORTANTE');
    assert.equal(banda.kind, 'CARTERA_SUSPENSION');
    assert.match(banda.message, /\$3\.150\.000/);
    assert.match(banda.message, /noviembre de 2026/);

    for (const audiencia of ['ADMINISTRATIVA', 'PM']) {
        const campana = suspensionCandidateBellText('Café Altura', audiencia);
        assert.doesNotMatch(campana, /\$/, 'la campana llega al celular: nunca cifras');
        assert.match(campana, /Café Altura/);
    }
    assert.match(suspensionCandidateBellText('Café Altura', 'PM'), /no empieces/);

    const aviso = suspensionStartedText('Café Altura', { fromCycle: '2026-11' });
    assert.doesNotMatch(aviso, /\$/);
    assert.match(aviso, /noviembre de 2026/);
});

test('se decide desde el día 15, que es cuando se empieza la parrilla del mes siguiente', () => {
    assert.equal(isDecisionDay('2026-10-14'), false);
    assert.equal(isDecisionDay('2026-10-15'), true);
    assert.equal(isDecisionDay('2026-10-31'), true);
    assert.equal(cycleKey(2026, 3), '2026-03');
});
