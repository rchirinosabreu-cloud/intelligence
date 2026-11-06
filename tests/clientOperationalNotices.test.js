import test from 'node:test';
import assert from 'node:assert/strict';
import * as notices from '../src/lib/importantNotices.js';

const client = (changes = {}) => ({ id: 'c', name: 'Faro', slug: 'faro', contracts: [{ id: 'k', status: 'ACTIVO', startDate: '2026-10-15', endDate: '2026-12-14', cutDay: 15, monthlyReport: true }], monthlyReports: [], monthlyCloses: [], ...changes });
const plan = (c, day, options = {}) => {
  assert.equal(typeof notices.clientOperationalNotices, 'function', 'falta conectar los hitos operativos a la banda');
  return notices.clientOperationalNotices(c, day, { isPm: true, ...options });
};
test('mitad de ciclo usa el corte del cliente, sin afirmar 50% de cumplimiento', () => {
  const rows = plan(client(), '2026-10-30');
  assert.ok(rows.some(n => n.kind === 'OPERACION_CICLO' && n.subjectId.includes('MITAD')));
  assert.ok(!rows.some(n => /50%|vencid|incumpl/.test(n.message)));
});
test('precierre reúne informe y revisión; un cierre registrado no vuelve a pedir cierre', () => {
  const rows = plan(client(), '2026-11-12');
  assert.equal(rows.filter(n => n.kind === 'OPERACION_CICLO').length, 1);
  assert.match(rows.find(n => n.kind === 'OPERACION_CICLO').message, /informe/);
  const closed = plan(client({monthlyCloses:[{year:2026,month:10}]}), '2026-11-12');
  assert.ok(!closed.some(n => n.kind === 'OPERACION_CICLO'));
});
test('informe enviado no vuelve a pedirse y no acredita jornadas o todos los servicios', () => {
  const rows = plan(client({monthlyReports:[{year:2026,month:10,status:'ENVIADO'}]}), '2026-11-12');
  assert.doesNotMatch(rows.find(n => n.kind === 'OPERACION_CICLO').message, /informe pendiente|todo cumplido/);
});
test('renovación aprobada que cubre el siguiente período retira la advertencia de renovación', () => {
  const c = client(); c.contracts.push({id:'new',status:'ACTIVO',startDate:'2026-12-15',endDate:'2027-03-14',cutDay:15});
  assert.ok(!plan(c,'2026-11-20').some(n=>n.kind==='OPERACION_RENOVACION'));
});
test('inicio se resuelve por revisión de proyecto, no por cerrar la notificación', () => {
  const projects=[{id:'p',status:'HABILITADO',operation:{reviewStatus:'PENDIENTE'}}];
  assert.ok(plan(client(),'2026-11-06',{projects}).some(n=>n.kind==='OPERACION_INICIO'));
  projects[0].operation.reviewStatus='REVISADO';
  assert.ok(!plan(client(),'2026-11-06',{projects}).some(n=>n.kind==='OPERACION_INICIO'));
});
test('riesgo operativo no expone cifras ni da una suspensión por decidida', () => {
  const row=plan(client(),'2026-11-06',{riskOn:'2026-11-20'}).find(n=>n.kind==='OPERACION_CONTINUIDAD');
  assert.match(row.message,/podría/);
  assert.doesNotMatch(JSON.stringify(row),/cartera|deuda|saldo|\$/i);
});

test('un riesgo administrativo no cambia la vigencia ni afirma suspensión aplicada', () => {
  const row=plan(client(),'2026-11-06',{riskOn:'2026-11-06'}).find(n=>n.kind==='OPERACION_CONTINUIDAD');
  assert.match(row.message,/operación no está suspendida/i);
  assert.match(row.message,/vigencia del contrato/i);
  assert.match(row.message,/riesgo administrativo/i);
});

test('la renovación distingue el año del vencimiento y una corrección futura retira el aviso', () => {
  const c=client(); c.contracts[0].startDate='2025-08-01'; c.contracts[0].endDate='2026-07-31';
  assert.match(plan(c,'2026-11-06').find(n=>n.kind==='OPERACION_RENOVACION').message,/2026/);
  c.contracts[0].endDate='2027-07-31';
  assert.ok(!plan(c,'2026-11-06').some(n=>n.kind==='OPERACION_RENOVACION'));
});
test('suspensión confirmada prevalece sobre riesgo y tiene decisión de recibido', () => {
  const rows=plan(client(),'2026-11-06',{riskOn:'2026-11-20',suspension:{id:'s',fromCycle:'2026-12',liftedAt:null}});
  assert.ok(!rows.some(n=>n.kind==='OPERACION_CONTINUIDAD'));
  assert.equal(rows.find(n=>n.kind==='OPERACION_SUSPENSION').acknowledge,true);
});
test('cliente archivado no tiene avisos y community no recibe renovación ni inicio', () => {
  assert.deepEqual(plan(client({isArchived:true}),'2026-11-20'),[]);
  assert.ok(!plan(client(),'2026-11-20',{isPm:false}).some(n=>n.kind==='OPERACION_RENOVACION'));
});

test('una suspensión del próximo mes conserva el trabajo del mes actual', () => {
  const row=plan(client(),'2026-11-06',{suspension:{id:'s',fromCycle:'2026-12',liftedAt:null}}).find(n=>n.kind==='OPERACION_SUSPENSION');
  assert.match(row.message,/mes actual se termina/);
  assert.doesNotMatch(row.message,/operación está suspendida/);
});

test('reactivaciones usan el día de Bogotá y nunca anticipan un levantamiento futuro', () => {
  const options={suspension:{id:'s',fromCycle:'2026-10',liftedAt:'2026-11-01T02:00:00Z'}};
  assert.ok(!plan(client(),'2026-11-08',options).some(n=>n.kind==='OPERACION_REACTIVACION'));
  options.suspension.liftedAt='2026-11-10T15:00:00Z';
  assert.ok(!plan(client(),'2026-11-08',options).some(n=>n.kind==='OPERACION_REACTIVACION'));
});
test('sin contrato activo iniciado no se propone un riesgo de continuidad automático',()=>{
  const c=client();c.contracts[0].status='STAND_BY';
  assert.ok(!plan(c,'2026-11-06',{riskOn:'2026-11-20'}).some(n=>n.kind==='OPERACION_CONTINUIDAD'));
  c.contracts[0].status='ACTIVO';c.contracts[0].startDate='2026-12-01';
  assert.ok(!plan(c,'2026-11-06',{riskOn:'2026-11-20'}).some(n=>n.kind==='OPERACION_CONTINUIDAD'));
});
