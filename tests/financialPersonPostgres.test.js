import test from 'node:test';
import assert from 'node:assert/strict';
import { financialCorrectionDatabase } from './support/financialCorrectionDatabase.js';
import { reviewPersonLinks, savePersonLinks, reversePersonLinks } from '../src/services/financialPersonService.js';
import { generatePayrollPeriod } from '../src/services/financialPayrollService.js';
import { readPayrollDeductions } from '../src/services/payrollLoanDeductionService.js';
import { createPayrollContract, updatePayrollContract } from '../src/services/financialPayrollContractService.js';
import { financialPartyChoices } from '../src/services/financialPartySelection.js';
import pg from 'pg';
import { ensureFinancialPerson } from '../scripts/ensure-financial-person-schema.js';
import { createHash } from 'node:crypto';
import { reviewPartyMerge, mergeParties, readPartyMerge, reversePartyMerge } from '../src/services/financialPartyMergeService.js';

test('una unificación anterior al esquema sigue reversible, salvo que tenga nuevos vínculos',async()=>{
 const f=await financialCorrectionDatabase({additionalTables:['AccountsReceivable','ReceivablePayment']});
 const {db,actor}=f;
 try{
  const source=await db.thirdParty.create({data:{name:'Persona anterior',kind:'COLABORADOR'}});
  const target=await db.thirdParty.create({data:{name:'Persona vigente',kind:'COLABORADOR'}});
  await db.accountsReceivable.create({data:{kind:'BENEFICIARIO',beneficiaryThirdPartyId:source.id,amount:50000,period:new Date('2026-11-01'),year:2026,month:11}});
  const saved=await mergeParties(db,source.id,{targetId:target.id,expectedRevision:(await reviewPartyMerge(db,source.id,target.id,actor)).revision,reason:'Identidad confirmada',requestId:'legacy-merge'},actor);
  const event=await db.financialAuditEvent.findUnique({where:{id:saved.eventId}});
  const legacy=s=>({source:s.source,target:s.target,payables:s.payables,beneficiaries:s.beneficiaries.map(({thirdPartyId: _p,...r})=>r),children:s.children});
  const current=legacy({...event.before,children:await db.thirdParty.findMany({where:{mergedIntoId:{in:[source.id,target.id]}},orderBy:{id:'asc'}}),source:await db.thirdParty.findUnique({where:{id:source.id}}),target:await db.thirdParty.findUnique({where:{id:target.id}}),beneficiaries:await db.accountsReceivable.findMany({include:{payments:{orderBy:{id:'asc'}}},orderBy:{id:'asc'}})});
  const revision=createHash('sha256').update(JSON.stringify(current)).digest('hex');
  // Simulate a historical event produced before the additive identity columns existed.
  await db.financialAuditEvent.update({where:{id:event.id},data:{before:legacy(event.before),after:{...event.after,revision}}});
  let review=await readPartyMerge(db,event.id,actor);
  assert.equal(review.canReverse,true);assert.equal(review.revision,revision);
  const added=await db.financialCollaborator.create({data:{displayName:'Persona',normalizedName:'legacy-new-link',thirdPartyId:target.id}});
  assert.equal((await readPartyMerge(db,event.id,actor)).canReverse,false);
  await assert.rejects(reversePartyMerge(db,event.id,{expectedRevision:revision,reason:'Revisión',requestId:'blocked'},actor),/posteriores/);
  await db.financialCollaborator.update({where:{id:added.id},data:{thirdPartyId:null}});
  review=await readPartyMerge(db,event.id,actor);
  await reversePartyMerge(db,event.id,{expectedRevision:review.revision,reason:'Deshacer vínculo anterior',requestId:'legacy-undo'},actor);
  assert.equal((await db.accountsReceivable.findFirst()).beneficiaryThirdPartyId,source.id);
 }finally{await f.close();}
});

test('unifica Francys y Francisco por decisión explícita, conserva pagos y revierte sin borrar', async () => {
  const f=await financialCorrectionDatabase({additionalTables:['AccountsReceivable','ReceivablePayment','PayrollAdjustment']});
  const {db,actor}=f;
  try {
    const paid=await f.createPayment('payroll','person');
    const before=await db.payrollPayment.findMany();
    const older=await db.payrollContract.findUnique({where:{id:paid.parent.contractId}});
    const newer=await db.financialCollaborator.create({data:{displayName:'Francys',normalizedName:'francys-new'}});
    const party=await db.thirdParty.create({data:{name:'Francys Caballero',kind:'COLABORADOR',roles:['COLABORADOR']}});
    const loan=await db.accountsReceivable.create({data:{kind:'PRESTAMO',counterpartyName:'Francys',amount:50000,period:new Date('2026-11-01'),year:2026,month:11}});
    const selection={collaboratorIds:[older.collaboratorId,newer.id],receivableIds:[loan.id]};
    const review=await reviewPersonLinks(db,party.id,actor);
    const input={...selection,expectedRevision:review.revision,reason:'Misma persona confirmada',requestId:'link-1'};
    const saved=await savePersonLinks(db,party.id,input,actor);
    assert.equal((await db.financialCollaborator.findUnique({where:{id:newer.id}})).thirdPartyId,party.id);
    assert.equal((await db.accountsReceivable.findUnique({where:{id:loan.id}})).thirdPartyId,party.id);
    assert.deepEqual(await db.payrollPayment.findMany(),before);
    assert.equal((await savePersonLinks(db,party.id,input,actor)).replayed,true);
    await assert.rejects(savePersonLinks(db,party.id,{...input,requestId:'stale'},actor),/cambi/);
    await reversePersonLinks(db,saved.eventId,{expectedRevision:saved.revision,reason:'Deshacer prueba',requestId:'undo'},actor);
    assert.equal((await db.financialCollaborator.findUnique({where:{id:newer.id}})).thirdPartyId,null);
    assert.deepEqual(await db.payrollPayment.findMany(),before);
    assert.equal(await db.payrollContract.count(),1);
    await assert.rejects(savePersonLinks(db,party.id,input,{id:'no-access'}),/permiso/);
    await assert.rejects(savePersonLinks(db,party.id,input,actor),/cambi/);
    const next=await reviewPersonLinks(db,party.id,actor);
    const attempts=await Promise.allSettled(['concurrent-1','concurrent-2'].map(requestId=>savePersonLinks(db,party.id,{...input,expectedRevision:next.revision,requestId},actor)));
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.deepEqual(await db.payrollPayment.findMany(),before);
  } finally {await f.close();}
});

test('el esquema aditivo se puede ejecutar dos veces y conserva pagos y comprobantes',async()=>{
 const f=await financialCorrectionDatabase({additionalTables:['AccountsReceivable','ReceivablePayment']});
 const url=new URL(f.databaseUrl),schema=url.searchParams.get('schema');url.searchParams.delete('schema');
 const sql=new pg.Client({connectionString:url.href});
 try{
  await f.createPayment('payroll','schema');const payments=await f.db.payrollPayment.findMany(),documents=await f.db.financialRecordDocument.findMany();
  await sql.connect();await sql.query(`SET search_path TO "${schema}"`);
  await sql.query('ALTER TABLE "FinancialCollaborator" DROP COLUMN "thirdPartyId"');await sql.query('ALTER TABLE "AccountsReceivable" DROP COLUMN "thirdPartyId"');
  await ensureFinancialPerson(sql);await ensureFinancialPerson(sql);
  assert.deepEqual(await f.db.payrollPayment.findMany(),payments);assert.deepEqual(await f.db.financialRecordDocument.findMany(),documents);
  assert.equal((await f.db.financialCollaborator.findFirst()).thirdPartyId,null);
 }finally{await sql.end();await f.close();}
});

test('nuevo contrato reutiliza la persona elegida y editar Francys no renombra sus identidades históricas',async()=>{
 const f=await financialCorrectionDatabase({additionalTables:['PayrollPosition','AccountsReceivable','ReceivablePayment','PayrollAdjustment']});
 try{
  const party=await f.db.thirdParty.create({data:{name:'Francys Caballero',kind:'CLIENTE',roles:['CLIENTE']}});
  await f.db.financialCollaborator.create({data:{displayName:'Francys Caballero',normalizedName:'francys-caballero',thirdPartyId:party.id}});
  const alias=await f.db.financialCollaborator.create({data:{displayName:'Francys',normalizedName:'francys',thirdPartyId:party.id}});
  const old=await f.db.payrollContract.create({data:{collaboratorId:alias.id,baseSalary:2500000,socialSecurity:0,startDate:new Date('2026-10-26'),endDate:new Date('2026-11-25')}});
  await updatePayrollContract(f.db,old.id,{name:'Francys Caballero',baseSalary:2500000},f.actor);
  assert.equal((await f.db.financialCollaborator.findUnique({where:{id:alias.id}})).normalizedName,'francys');
  const next=await createPayrollContract(f.db,{partySelection:party.id,name:party.name,startDate:'2026-11-26',endDate:'2026-12-25',baseSalary:2500000},f.actor);
  assert.ok(next.collaboratorId);assert.equal(await f.db.financialCollaborator.count(),2);
  assert.equal((await financialPartyChoices(f.db)).filter(p=>p.name.startsWith('Francys')).length,1);
  assert.ok((await f.db.thirdParty.findUnique({where:{id:party.id}})).roles.includes('COLABORADOR'));
 }finally{await f.close();}
});

test('los descuentos usan la misma identidad y no ofrecen deudas ya vinculadas a otra persona',async()=>{
 const f=await financialCorrectionDatabase({additionalTables:['AccountsReceivable','ReceivablePayment','PayrollAdjustment']});
 try{
  const fixture=await f.createPayment('payroll');
  const contract=await f.db.payrollContract.findUnique({where:{id:fixture.parent.contractId}});
  const party=await f.db.thirdParty.create({data:{name:'Francisco',kind:'SOCIO'}}),other=await f.db.thirdParty.create({data:{name:'Otra persona',kind:'COLABORADOR'}});
  await f.db.financialCollaborator.update({where:{id:contract.collaboratorId},data:{thirdPartyId:party.id}});
  const debt=await f.db.accountsReceivable.create({data:{kind:'PRESTAMO',thirdPartyId:party.id,counterpartyType:'SOCIO',amount:100000,period:new Date('2026-09-01')}});
  await f.db.accountsReceivable.create({data:{kind:'PRESTAMO',thirdPartyId:other.id,counterpartyType:'COLABORADOR',amount:100000,period:new Date('2026-09-01')}});
  const result=await readPayrollDeductions(f.db,fixture.parent.id,f.actor);
  assert.deepEqual(result.options.map(r=>r.id),[debt.id]);assert.equal(result.options[0].linked,true);
 }finally{await f.close();}
});

test('Francys: generar noviembre prepara el ciclo completo 26 oct–25 nov sin prorratear ni duplicarlo',async()=>{
 const f=await financialCorrectionDatabase({additionalTables:['PayrollAdjustment']});
 try{
  const party=await f.db.thirdParty.create({data:{name:'Francys Caballero',kind:'COLABORADOR'}});
  const old=await f.db.financialCollaborator.create({data:{displayName:'Francys Caballero',normalizedName:'old',thirdPartyId:party.id}});
  const current=await f.db.financialCollaborator.create({data:{displayName:'Francys',normalizedName:'new',thirdPartyId:party.id}});
  const contract=await f.db.payrollContract.create({data:{collaboratorId:current.id,baseSalary:2500000,socialSecurity:0,startDate:new Date('2026-10-26'),endDate:new Date('2026-11-25')}});
  const previous=await f.db.payrollContract.create({data:{collaboratorId:old.id,baseSalary:3000000,socialSecurity:0,startDate:new Date('2026-09-15'),endDate:new Date('2026-10-14')}});
  await f.db.payrollTransaction.create({data:{contractId:previous.id,year:2026,month:10,baseSalary:3000000,netAmount:3000000,status:'PAID'}});
  const result=await generatePayrollPeriod(f.db,{year:2026,month:11},f.actor);
  assert.equal(result.createdCount,1);
  const row=result.transactions[0];assert.equal(row.contractId,contract.id);
  assert.equal(row.serviceStart.toISOString().slice(0,10),'2026-10-26');assert.equal(row.serviceEnd.toISOString().slice(0,10),'2026-11-25');
  assert.equal(Number(row.netAmount),2500000);
  assert.equal((await generatePayrollPeriod(f.db,{year:2026,month:11},f.actor)).existingCount,1);
  assert.equal(await f.db.payrollTransaction.count(),2);
 }finally{await f.close();}
});
