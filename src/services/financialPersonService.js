import { atomic, authorize, clone, hash, fail, request } from './payrollPeriodShared.js';
import { thirdPartyRoles } from '../lib/accountsPayable.js';
import { resolveFinancialParty } from './financialPartySelection.js';

// ThirdParty is the shared identity. Legacy collaborators and obligations keep their IDs.
async function state(tx, id) {
  const party = await tx.thirdParty.findUnique({where:{id}});
  if (!party || party.mergedIntoId || !party.isActive) throw fail('PERSON_UNAVAILABLE','La ficha ya no está disponible.');
  const collaborators = await tx.financialCollaborator.findMany({where:{OR:[{thirdPartyId:null},{thirdPartyId:id}]},include:{contracts:{where:{importBatchId:null},orderBy:{id:'asc'},include:{transactions:{orderBy:{id:'asc'},include:{payments:{orderBy:{id:'asc'}},adjustments:{orderBy:{id:'asc'}}}}}}},orderBy:{id:'asc'}});
  const receivables = await tx.accountsReceivable.findMany({where:{OR:[{thirdPartyId:id},{thirdPartyId:null,kind:'PRESTAMO',clientId:null,beneficiaryThirdPartyId:null,loanCollaboratorId:null}]},include:{payments:{orderBy:{id:'asc'}}},orderBy:{id:'asc'}});
  return {party,collaborators,receivables};
}
const changed=()=>fail('PERSON_CHANGED','La información cambió. Actualiza y revisa los vínculos.');
const scoped=(s,ids,debts)=>({party:s.party,collaborators:s.collaborators.filter(c=>c.thirdPartyId===s.party.id||ids.includes(c.id)),receivables:s.receivables.filter(r=>r.thirdPartyId===s.party.id||debts.includes(r.id))});
export const reviewPersonLinks=(db,id,actor)=>db.$transaction(async tx=>{
  await authorize(tx,actor,'read');const s=await state(tx,id);
  const events=await tx.financialAuditEvent.findMany({where:{entityType:'ThirdParty',entityId:id,after:{path:['operation'],string_starts_with:'PERSON_'}},orderBy:{createdAt:'desc'},take:20});
  return {...s,revision:hash(s),events:events.map(e=>({id:e.id,createdAt:e.createdAt,...e.after}))};
},{isolationLevel:'RepeatableRead'});
export const savePersonLinks=(db,id,input,actor)=>atomic(db,async tx=>{
  const user=await authorize(tx,actor,'write');const {reason,requestId}=request(input);
  for(const field of ['collaboratorIds','receivableIds'])if(input[field]!==undefined&&(!Array.isArray(input[field])||input[field].length>500||input[field].some(v=>typeof v!=='string'||!v)))throw fail('PERSON_SELECTION_REQUIRED','Selecciona los registros válidos de esta persona.',400);
  const ids=[...new Set(input.collaboratorIds||[])].sort(), debts=[...new Set(input.receivableIds||[])].sort();
  if(!ids.length&&!debts.length)throw fail('PERSON_SELECTION_REQUIRED','Selecciona los registros que pertenecen a esta persona.');
  const fingerprint=hash({id,input});
  const prior=await tx.financialAuditEvent.findFirst({where:{entityType:'ThirdParty',entityId:id,after:{path:['requestId'],equals:requestId}}});
  if(prior){if(prior.actorId!==user.id||prior.after.fingerprint!==fingerprint||hash(scoped(await state(tx,id),ids,debts))!==prior.after.revision)throw changed();return {eventId:prior.id,revision:prior.after.revision,replayed:true};}
  const before=await state(tx,id);
  if(hash(before)!==input.expectedRevision)throw changed();
  if(ids.some(key=>!before.collaborators.some(c=>c.id===key&&!c.thirdPartyId))||debts.some(key=>!before.receivables.some(r=>r.id===key&&!r.thirdPartyId)))throw changed();
  await tx.financialCollaborator.updateMany({where:{id:{in:ids}},data:{thirdPartyId:id}});
  await tx.accountsReceivable.updateMany({where:{id:{in:debts}},data:{thirdPartyId:id}});
  if(ids.length)await tx.thirdParty.update({where:{id},data:{roles:[...new Set([...thirdPartyRoles(before.party),'COLABORADOR'])]}});
  const after=await state(tx,id),revision=hash(scoped(after,ids,debts));
  const event=await tx.financialAuditEvent.create({data:{entityType:'ThirdParty',entityId:id,action:'UPDATE',actorId:user.id,before:clone(scoped(before,ids,debts)),after:clone({operation:'PERSON_LINKED',collaboratorIds:ids,receivableIds:debts,reason,requestId,fingerprint,revision,actorName:user.name})}});
  return {eventId:event.id,revision};
});
export const reversePersonLinks=(db,eventId,input,actor)=>atomic(db,async tx=>{
  const user=await authorize(tx,actor,'write');const {reason,requestId}=request(input);
  const event=await tx.financialAuditEvent.findUnique({where:{id:eventId}});
  if(event?.after?.operation!=='PERSON_LINKED')throw changed();
  const prior=await tx.financialAuditEvent.findFirst({where:{entityType:'ThirdParty',entityId:event.entityId,after:{path:['reversedEventId'],equals:eventId}}});
  if(prior){if(prior.actorId!==user.id||prior.after.fingerprint!==hash(input))throw changed();return {replayed:true};}
  const {collaboratorIds:ids,receivableIds:debts}=event.after;
  const current=await state(tx,event.entityId);
  if(hash(scoped(current,ids,debts))!==event.after.revision||input.expectedRevision!==event.after.revision)throw changed();
  await tx.financialCollaborator.updateMany({where:{id:{in:ids}},data:{thirdPartyId:null}});
  await tx.accountsReceivable.updateMany({where:{id:{in:debts}},data:{thirdPartyId:null}});
  await tx.thirdParty.update({where:{id:event.entityId},data:{roles:event.before.party.roles}});
  await tx.financialAuditEvent.create({data:{entityType:'ThirdParty',entityId:event.entityId,action:'UPDATE',actorId:user.id,before:{revision:event.after.revision},after:{operation:'PERSON_LINKS_REVERSED',reversedEventId:eventId,reason,requestId,fingerprint:hash(input)}}});
  return {ok:true};
});

export async function relatedPayrollWhere(tx,contract) {
  if(!contract.collaboratorId)return {contractId:contract.id};
  const person=await tx.financialCollaborator.findUnique({where:{id:contract.collaboratorId}});
  return {contract:{importBatchId:null,...(person?.thirdPartyId?{collaborator:{thirdPartyId:person.thirdPartyId}}:{collaboratorId:contract.collaboratorId})}};
}
export const createPersonProfile=(db,selection,actor)=>atomic(db,async tx=>{
  const user=await authorize(tx,actor,'write');
  return {thirdParty:await resolveFinancialParty(tx,selection,user)};
});

export async function withReceivablePeople(tx,rows) {
  const parties=await tx.thirdParty.findMany({where:{mergedIntoId:null},include:{collaborators:{select:{id:true}}}});
  const byId=new Map(parties.map(p=>[p.id,p])),byClient=new Map(parties.filter(p=>p.clientId).map(p=>[p.clientId,p]));
  const byCollaborator=new Map(parties.flatMap(p=>p.collaborators.map(c=>[c.id,p])));
  return rows.map(row=>{
    const person=byId.get(row.thirdPartyId)||byId.get(row.beneficiaryThirdPartyId)||byClient.get(row.clientId)||byCollaborator.get(row.loanCollaboratorId);
    return {...row,partyId:person?.id||null,partyName:person?.name||null};
  });
}
