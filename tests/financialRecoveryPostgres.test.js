import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { financialCorrectionDatabase } from './support/financialCorrectionDatabase.js';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import * as parties from '../src/services/thirdPartyService.js';
import { barterContext, createBarter, reverseBarter } from '../src/services/financialBarterService.js';
import * as offsets from '../src/services/financialOffsetService.js';
import pg from 'pg';
import { ensurePartyRoles } from '../scripts/ensure-party-roles-schema.js';

test('directorio completo, una ficha por origen y clasificaciones múltiples', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async t => {
  const f = await financialCorrectionDatabase({ additionalTables: ['Client', 'TeamMember', 'AccountsReceivable', 'ReceivablePayment', 'ReceivablePaymentDocument', 'ReceivableItem'] });
  t.after(f.close);
  const { db, actor } = f;
  const client = await db.client.create({ data: { name: 'Multik ficticio', slug: randomUUID() } });
  const person = await db.teamMember.create({ data: { name: 'Francisco ficticio', role: 'DIRECTOR' } });
  const ar = await db.accountsReceivable.create({ data: { clientId: client.id, amount: 1000000, year: 2026, month: 10, period: new Date('2026-10-01') } });
  const context = await barterContext(db, { receivableId: ar.id }, actor);
  assert.ok(context.parties.some(p => p.id === `team:${person.id}`), 'El equipo sin pagos debe poder elegirse');
  assert.ok(context.parties.some(p => p.id === `client:${client.id}`), 'Los clientes sin ficha de pago deben poder elegirse');
  assert.equal(await db.thirdParty.count(), 0, 'Leer no crea fichas');
  const input = { requestId: randomUUID(), expectedRevision: context.revision, amount: 100000, settledAt: '2026-10-31', reason: 'Destino acordado de muestra', goods: 'Bien de muestra', destinationMode: 'BENEFICIARIO', beneficiaryThirdPartyId: `team:${person.id}`, authorizedBy: 'Dirección' };
  const result = await createBarter(db, ar.id, input, actor);
  assert.equal((await db.thirdParty.findMany())[0].teamMemberId, person.id);
  assert.equal((await createBarter(db, ar.id, input, actor)).replayed, true);
  assert.equal(await db.thirdParty.count(), 1);
  assert.equal(Number(result.beneficiary.outstanding), 100000);
  const p = await parties.createThirdParty(db, { name: 'Brieva ficticio', kind: 'ARRENDADOR', roles: ['ARRENDADOR','PROVEEDOR'], clientId: client.id }, actor);
  assert.deepEqual(p.roles, ['ARRENDADOR','PROVEEDOR']);
  await assert.rejects(parties.createThirdParty(db, { name: p.name, kind: 'SOCIO' }, actor), { code: 'THIRD_PARTY_DUPLICATE' });
});

test('vincular una compensación histórica no vuelve a descontar Cartera', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async t => {
  assert.equal(typeof offsets.legacyOffsetOptions, 'function');
  const f = await financialCorrectionDatabase({ additionalTables: ['AccountsReceivable', 'ReceivablePayment', 'ReceivablePaymentDocument'] }); t.after(f.close);
  const { db, actor } = f;
  const c = await db.client.create({ data: { name: 'Brieva muestra', slug: randomUUID() } });
  const p = await db.thirdParty.create({ data: { name: c.name, kind: 'ARRENDADOR', clientId: c.id } });
  const ar = await db.accountsReceivable.create({ data: { clientId: c.id, amount: 960000, status: 'SALDADO', period: new Date('2026-10-01'), year: 2026, month: 10 } });
  const payment = await db.receivablePayment.create({ data: { receivableId: ar.id, kind: 'COMPENSACION', amount: 960000, paidAt: new Date('2026-10-31T12:00:00Z'), detail: { offsetAgainst: 'Arriendo', authorizedBy: 'Elisa' } } });
  const ap = await db.accountsPayable.create({ data: { thirdPartyId: p.id, concept: 'Arriendo', amount: 1000000, category: 'OPERATIVO', receivedAt: new Date('2026-10-01'), year: 2026, month: 10 } });
  const review = await offsets.legacyOffsetOptions(db, payment.id, actor);
  assert.equal(review.options[0].receivable.outstanding, 0);
  const input = { payableId: ap.id, expectedRevision: review.options[0].revision, requestId: randomUUID(), reason: 'Confirmar contrapartida histórica' };
  await assert.rejects(offsets.linkLegacyOffset(db, payment.id, { ...input, authorizedBy: 'x'.repeat(121) }, actor), { code: 'OFFSET_INVALID' });
  const closed = await db.financialPeriod.create({data:{year:2026,month:10,status:'CLOSED'}});
  await assert.rejects(offsets.linkLegacyOffset(db,payment.id,input,actor),/cerrado/i);
  assert.equal(await db.payablePayment.count(),0);
  await db.financialPeriod.delete({where:{id:closed.id}});
  const failing={$transaction:(work,opts)=>db.$transaction(tx=>work(new Proxy(tx,{get(obj,key){return key==='financialAuditEvent'?{...obj[key],create:async()=>{throw new Error('audit failure');}}:obj[key];}})),opts)};
  await assert.rejects(offsets.linkLegacyOffset(failing,payment.id,input,actor),/audit failure/);
  assert.equal(await db.payablePayment.count(),0);
  const linked = await offsets.linkLegacyOffset(db, payment.id, input, actor);
  assert.equal(linked.receivable.outstanding, 0); assert.equal(linked.payable.outstanding, 40000);
  assert.equal(await db.receivablePayment.count(), 1); assert.equal(await db.financialRecord.count(), 0);
  assert.equal((await offsets.linkLegacyOffset(db, payment.id, input, actor)).replayed, true);
  assert.equal(await db.payablePayment.count(), 1);
  await assert.rejects(parties.updateThirdParty(db, p.id, { clientId: null }, actor), { code: 'THIRD_PARTY_OFFSET_LINK_LOCKED' });
  assert.equal((await db.thirdParty.findUnique({ where: { id: p.id } })).clientId, c.id);
  const current = await offsets.readOffset(db, payment.id, actor);
  await offsets.reverseOffset(db, payment.id, { expectedRevision: current.revision, reason: 'Deshacer el acuerdo completo', requestId: randomUUID() }, actor);
  assert.equal((await offsets.readOffset(db, payment.id, actor)).receivable.outstanding, 960000);
});

test('unificar fichas conserva obligaciones, roles e historial y admite deshacer', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async t => {
  assert.equal(typeof parties.reviewPartyMerge, 'function');
  const f = await financialCorrectionDatabase({ additionalTables: ['AccountsReceivable', 'ReceivablePayment'] }); t.after(f.close);
  const { db, actor } = f;
  const client = await db.client.create({ data: { name: 'Empresa muestra', slug: randomUUID() } });
  const source = await db.thirdParty.create({ data: { name: client.name, kind: 'ARRENDADOR' } });
  const target = await db.thirdParty.create({ data: { name: client.name, kind: 'PROVEEDOR', clientId: client.id } });
  const ap = await db.accountsPayable.create({ data: { thirdPartyId: source.id, amount: 1000000, concept: 'Arriendo', category: 'OPERATIVO', receivedAt: new Date('2026-10-01'), year: 2026, month: 10 } });
  const review = await parties.reviewPartyMerge(db, source.id, target.id, actor);
  const input = { targetId: target.id, expectedRevision: review.revision, reason: 'Misma empresa confirmada', requestId: randomUUID() };
  const merged = await parties.mergeParties(db, source.id, input, actor);
  assert.equal((await db.accountsPayable.findUnique({ where: { id: ap.id } })).thirdPartyId, target.id);
  assert.equal((await db.thirdParty.findUnique({ where: { id: source.id } })).mergedIntoId, target.id);
  assert.equal(await db.thirdParty.count(), 2, 'La ficha original no se borra');
  assert.deepEqual((await db.thirdParty.findUnique({ where: { id: target.id } })).roles, ['PROVEEDOR','ARRENDADOR']);
  assert.equal((await parties.mergeParties(db, source.id, input, actor)).replayed, true);
  await parties.reversePartyMerge(db, merged.eventId, { reason: 'Revisar identidad', requestId: randomUUID(), expectedRevision: merged.revision }, actor);
  assert.equal((await db.accountsPayable.findUnique({ where: { id: ap.id } })).thirdPartyId, source.id);
  assert.equal((await db.thirdParty.findUnique({ where: { id: source.id } })).isActive, true);
});

test('la unificación rechaza revisiones obsoletas, identidades distintas y permiso revocado', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async t => {
  const f=await financialCorrectionDatabase({additionalTables:['AccountsReceivable','ReceivablePayment']});t.after(f.close);
  const {db,actor}=f;
  const source=await db.thirdParty.create({data:{name:'Origen',kind:'SOCIO'}}), target=await db.thirdParty.create({data:{name:'Destino',kind:'PROVEEDOR'}});
  const review=await parties.reviewPartyMerge(db,source.id,target.id,actor);
  const input={targetId:target.id,expectedRevision:review.revision,reason:'Identidad comprobada',requestId:randomUUID()};
  await db.thirdParty.update({where:{id:target.id},data:{notes:'Cambio simultáneo'}});
  await assert.rejects(parties.mergeParties(db,source.id,input,actor),/cambiaron/i);
  await db.user.update({where:{id:actor.id},data:{isActive:false}});
  await assert.rejects(parties.mergeParties(db,source.id,input,actor),{code:'FINANCIAL_ACCESS_DENIED'});
  await db.user.update({where:{id:actor.id},data:{isActive:true}});
  await db.thirdParty.update({where:{id:source.id},data:{documentType:'NIT',documentNumber:'123'}});
  await db.thirdParty.update({where:{id:target.id},data:{documentType:'NIT',documentNumber:'456'}});
  await assert.rejects(parties.reviewPartyMerge(db,source.id,target.id,actor),/documentos.*distintos/i);
  assert.equal((await db.thirdParty.findUnique({where:{id:source.id}})).isActive,true);
});

test('unificación atómica, concurrente y reversión bloqueada tras cambios posteriores', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async t => {
  const f=await financialCorrectionDatabase({additionalTables:['AccountsReceivable','ReceivablePayment']});t.after(f.close);const {db,actor}=f;
  const source=await db.thirdParty.create({data:{name:'Origen',kind:'SOCIO'}}), target=await db.thirdParty.create({data:{name:'Destino',kind:'PROVEEDOR'}});
  const input={targetId:target.id,expectedRevision:(await parties.reviewPartyMerge(db,source.id,target.id,actor)).revision,reason:'Identidad comprobada',requestId:randomUUID()};
  const failing={$transaction:(work,opts)=>db.$transaction(tx=>work(new Proxy(tx,{get(obj,key){return key==='financialAuditEvent'?{...obj[key],create:async()=>{throw new Error('audit failure');}}:obj[key];}})),opts)};
  await assert.rejects(parties.mergeParties(failing,source.id,input,actor),/audit failure/);
  assert.equal((await db.thirdParty.findUnique({where:{id:source.id}})).mergedIntoId,null);
  const results=await Promise.allSettled([parties.mergeParties(db,source.id,input,actor),parties.mergeParties(db,source.id,{...input,requestId:randomUUID()},actor)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const saved=results.find(r=>r.status==='fulfilled').value;
  await db.thirdParty.update({where:{id:target.id},data:{notes:'Dato corregido posteriormente'}});
  await assert.rejects(parties.reversePartyMerge(db,saved.eventId,{reason:'Volver',expectedRevision:saved.revision,requestId:randomUUID()},actor),/posteriores/i);
});

test('selección desde Equipo relee actividad y no deja fichas si el canje falla', { skip: !briaTestDatabaseUrl(), timeout: 90000 }, async t => {
  const f=await financialCorrectionDatabase({additionalTables:['AccountsReceivable','ReceivablePayment','ReceivablePaymentDocument']});t.after(f.close);const {db,actor}=f;
  const person=await db.teamMember.create({data:{name:'Persona',role:'DIRECTOR'}});
  const client=await db.client.create({data:{name:'Cliente',slug:randomUUID()}});
  const ar=await db.accountsReceivable.create({data:{clientId:client.id,amount:100000,period:new Date('2026-10-01'),year:2026,month:10}});
  const ctx=await barterContext(db,{receivableId:ar.id},actor);
  const input={amount:100000,settledAt:'2026-10-31',goods:'Bien',destinationMode:'BENEFICIARIO',beneficiaryThirdPartyId:`team:${person.id}`,authorizedBy:'Dirección',reason:'Prueba',requestId:randomUUID(),expectedRevision:ctx.revision};
  await db.teamMember.update({where:{id:person.id},data:{isActive:false}});
  await assert.rejects(createBarter(db,ar.id,input,actor),/inactiva/i);
  assert.equal(await db.thirdParty.count(),0);
  await db.teamMember.update({where:{id:person.id},data:{isActive:true}});
  const failing={$transaction:(work,opts)=>db.$transaction(tx=>work(new Proxy(tx,{get(obj,key){return key==='receivablePayment'?{...obj[key],create:async()=>{throw new Error('payment failure');}}:obj[key];}})),opts)};
  await assert.rejects(createBarter(failing,ar.id,input,actor),/payment failure/);
  assert.equal(await db.thirdParty.count(),0);
  await db.thirdParty.create({data:{name:person.name,kind:'SOCIO'}});
  await assert.rejects(createBarter(db,ar.id,input,actor),/vincul|existente/i);
  assert.equal(await db.thirdParty.count(),1,'Un perfil anterior sin vínculo no se duplica por elegir Equipo');
});

test('esquema aditivo de terceros conserva fichas legadas y es idempotente', {skip:!briaTestDatabaseUrl(),timeout:90000},async t=>{
 const f=await financialCorrectionDatabase();t.after(f.close);const {db}=f;
 const row=await db.thirdParty.create({data:{name:'Legado',kind:'ARRENDADOR'}});
 const conn=new pg.Client({connectionString:briaTestDatabaseUrl()});await conn.connect();t.after(()=>conn.end());
 await conn.query(`SET search_path TO "${new URL(f.databaseUrl).searchParams.get('schema')}"`);
 await conn.query('ALTER TABLE "ThirdParty" DROP COLUMN roles, DROP COLUMN "mergedIntoId"');
 await ensurePartyRoles(conn);await ensurePartyRoles(conn);
 const saved=await db.thirdParty.findUnique({where:{id:row.id}});
 assert.equal(saved.kind,'ARRENDADOR');assert.deepEqual(saved.roles,[]);assert.equal(saved.mergedIntoId,null);
});

test('unificar un beneficiario conserva la consulta y reversión del canje original', {skip:!briaTestDatabaseUrl(),timeout:90000},async t=>{
 const f=await financialCorrectionDatabase({additionalTables:['AccountsReceivable','ReceivablePayment','ReceivablePaymentDocument']});t.after(f.close);const {db,actor}=f;
 const client=await db.client.create({data:{name:'Cliente del canje',slug:randomUUID()}});
 const ar=await db.accountsReceivable.create({data:{clientId:client.id,amount:100000,period:new Date('2026-10-01'),year:2026,month:10}});
 const source=await db.thirdParty.create({data:{name:'Beneficiario anterior',kind:'SOCIO'}}),target=await db.thirdParty.create({data:{name:'Beneficiario vigente',kind:'COLABORADOR'}});
 const ctx=await barterContext(db,{receivableId:ar.id},actor);
 const barter=await createBarter(db,ar.id,{amount:100000,settledAt:'2026-10-31',goods:'Bien de muestra',destinationMode:'BENEFICIARIO',beneficiaryThirdPartyId:source.id,authorizedBy:'Dirección',reason:'Prueba',requestId:randomUUID(),expectedRevision:ctx.revision},actor);
 const merge=async()=>parties.mergeParties(db,source.id,{targetId:target.id,expectedRevision:(await parties.reviewPartyMerge(db,source.id,target.id,actor)).revision,reason:'Identidad revisada',requestId:randomUUID()},actor);
 const merged=await merge();
 assert.equal((await barterContext(db,{paymentId:barter.payment.id},actor)).canReverse,true);
 await parties.reversePartyMerge(db,merged.eventId,{reason:'Deshacer identidad',requestId:randomUUID(),expectedRevision:merged.revision},actor);
 assert.equal((await barterContext(db,{paymentId:barter.payment.id},actor)).canReverse,true);
 await merge();const current=await barterContext(db,{paymentId:barter.payment.id},actor);
 await reverseBarter(db,barter.payment.id,{reason:'Deshacer canje',expectedRevision:current.revision,requestId:randomUUID()},actor);
 assert.equal((await barterContext(db,{paymentId:barter.payment.id},actor)).receivable.outstanding,100000);
 assert.equal((await db.receivablePayment.findUnique({where:{id:barter.payment.id}})).detail.beneficiaryThirdPartyId,source.id,'El destino original sigue en el historial del canje');
});
