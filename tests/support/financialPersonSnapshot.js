import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { financialCorrectionDatabase } from './financialCorrectionDatabase.js';
import { createPersonProfile, reviewPersonLinks, savePersonLinks } from '../../src/services/financialPersonService.js';
import { updateThirdParty } from '../../src/services/thirdPartyService.js';

// Private, read-only export is deliberately excluded from Git. Never connects to production.
export async function financialPersonSnapshot(file='output/financial-person/snapshot.json') {
 const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));
 const f=await financialCorrectionDatabase({additionalTables:['PayrollPosition','PayrollAdjustment','AccountsReceivable','ReceivablePayment','ReceivableItem','ReceivablePaymentDocument']});
 const {db,actor}=f;
 try{
  const specs=[['financialAccount',snapshot.accounts.map(r=>({...r,openingBalanceDate:new Date('2026-01-01'),openingBalance:0}))],['client',snapshot.clients],['teamMember',snapshot.team],['thirdParty',snapshot.parties],['financialCollaborator',snapshot.collaborators],['payrollContract',snapshot.contracts],['financialRecord',snapshot.records],['payrollTransaction',snapshot.transactions],['accountsReceivable',[...snapshot.origins,...snapshot.receivables].map(r=>({...r,barterPaymentId:null}))],['receivablePayment',snapshot.payments],['payrollPayment',snapshot.payrollPayments],['payrollAdjustment',snapshot.adjustments],['financialRecordDocument',snapshot.documents],['financialAuditEvent',snapshot.audit]];
  const users=new Set();
  for(const [model,rows] of specs){
   const shape=Prisma.dmmf.datamodel.models.find(m=>m.name.toLowerCase()===model.toLowerCase());
   for(const field of shape.fields.filter(f=>f.type==='User')) for(const key of field.relationFromFields)for(const row of rows)if(row[key])users.add(row[key]);
  }
  await db.user.createMany({data:[...users].filter(id=>id!==actor.id).map(id=>({id,name:'Usuario del historial',email:`${id}@local.invalid`,password:'LOCAL-NO-LOGIN',role:'VIEWER'}))});
  const positions=[...new Set(snapshot.contracts.map(c=>c.positionId).filter(Boolean))];
  await db.payrollPosition.createMany({data:positions.map(id=>({id,title:`Cargo ${id.slice(0,6)}`}))});
  for(const [model,rows] of specs)if(rows.length)await db[model].createMany({data:rows.map(r=>Object.fromEntries(Object.entries(r).filter(([,v])=>v!==null))),skipDuplicates:true});
  for(const row of snapshot.receivables.filter(r=>r.barterPaymentId))await db.accountsReceivable.update({where:{id:row.id},data:{barterPaymentId:row.barterPaymentId}});
  const fingerprint=async()=>createHash('sha256').update(JSON.stringify({payments:await db.payrollPayment.findMany({orderBy:{id:'asc'}}),cash:await db.receivablePayment.findMany({orderBy:{id:'asc'}}),documents:await db.financialRecordDocument.findMany({orderBy:{id:'asc'}})})).digest('hex');
  const before=await fingerprint();
  const francisco=snapshot.parties.find(p=>p.name==='Francisco Villa');
  const francysOld=snapshot.collaborators.find(c=>c.displayName==='Francys Caballero');
  const francys=(await createPersonProfile(db,`payroll:${francysOld.id}`,actor)).thirdParty;
  const jesuOld=snapshot.collaborators.find(c=>c.displayName==='Jesús Arnedo');
  const jesu=(await createPersonProfile(db,`payroll:${jesuOld.id}`,actor)).thirdParty;
  for(const [party,names] of [[francisco,['Francisco Villa']],[francys,['Francys']]]){
   const review=await reviewPersonLinks(db,party.id,actor);
   await savePersonLinks(db,party.id,{expectedRevision:review.revision,requestId:`local-${party.id}`,reason:'Validación local solicitada: misma persona, conservar registros',collaboratorIds:snapshot.collaborators.filter(c=>names.includes(c.displayName)).map(c=>c.id),receivableIds:party.id===francisco.id?snapshot.receivables.filter(r=>r.kind==='PRESTAMO').map(r=>r.id):[]},actor);
  }
  for(const party of [francisco,francys,jesu]){
   const member=snapshot.team.find(m=>m.name===party.name);
   if(member)await updateThirdParty(db,party.id,{teamMemberId:member.id},actor);
  }
  const after=await fingerprint();
  if(before!==after)throw new Error('Los pagos o comprobantes cambiaron al relacionar las identidades.');
  return {...f,snapshot,francisco,francys,jesu,fingerprint,before};
 }catch(e){await f.close();throw e;}
}
