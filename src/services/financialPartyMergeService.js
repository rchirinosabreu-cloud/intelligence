import { createHash } from 'node:crypto';
import { FinancialDomainError } from './financialRecordService.js';
import { hasFinancialPermission } from '../utils/financialPermissions.js';
import { thirdPartyRoles } from '../lib/accountsPayable.js';
const clone = v => JSON.parse(JSON.stringify(v));
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function matchesSavedState(current, event) {
  if (Object.hasOwn(event.before || {}, 'receivables')) return hash(current) === event.after.revision;
  // Old events predate these nullable links. New links are subsequent changes,
  // but adding the schema alone must not invalidate an otherwise safe reversal.
  if (current.receivables.length || current.collaborators.length || current.beneficiaries.some(r => r.thirdPartyId)) return false;
  const { receivables: _receivables, collaborators: _collaborators, ...legacy } = current;
  legacy.beneficiaries = legacy.beneficiaries.map(({ thirdPartyId: _partyId, ...row }) => row);
  return hash(legacy) === event.after.revision;
}
const fail = message => new FinancialDomainError('PARTY_MERGE_REVIEW', message, 409);
async function authorize(tx, actor, permission) {
  const user = await tx.user.findUnique({ where: { id: actor?.id || actor?.userId || '' } });
  if (!hasFinancialPermission(user, permission)) throw new FinancialDomainError('FINANCIAL_ACCESS_DENIED', 'Tu permiso actual no permite esta operación.', 403);
  return user;
}
async function atomic(db, operation, read = false) {
  try { return await db.$transaction(operation, { isolationLevel: read ? 'RepeatableRead' : 'Serializable' }); }
  catch (e) { if (['P2034','P2002'].includes(e.code)) throw fail('Las fichas cambiaron. Actualiza la revisión antes de continuar.'); throw e; }
}
async function state(tx, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) throw fail('Selecciona dos fichas distintas de la misma persona o empresa.');
  const source = await tx.thirdParty.findUnique({ where: { id: sourceId } }), target = await tx.thirdParty.findUnique({ where: { id: targetId } });
  if (!source || !target) throw fail('Una ficha ya no existe. Actualiza el directorio.');
  const payables = await tx.accountsPayable.findMany({ where: { thirdPartyId: { in: [sourceId,targetId] } }, include: { payments: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } });
  const beneficiaries = await tx.accountsReceivable.findMany({ where: { beneficiaryThirdPartyId: { in: [sourceId,targetId] } }, include: { payments: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } });
  const children = await tx.thirdParty.findMany({ where: { mergedIntoId: { in: [sourceId,targetId] } }, orderBy: { id: 'asc' } });
  const receivables=await tx.accountsReceivable.findMany({where:{thirdPartyId:{in:[sourceId,targetId]}},include:{payments:{orderBy:{id:'asc'}}},orderBy:{id:'asc'}});
  const collaborators=await tx.financialCollaborator.findMany({where:{thirdPartyId:{in:[sourceId,targetId]}},include:{contracts:{orderBy:{id:'asc'},include:{transactions:{orderBy:{id:'asc'},include:{payments:{orderBy:{id:'asc'}}}}}}},orderBy:{id:'asc'}});
  return { source, target, payables, beneficiaries, children, receivables, collaborators };
}
const identity = p => ({ id:p.id, name:p.name, roles:thirdPartyRoles(p), clientId:p.clientId, teamMemberId:p.teamMemberId, documentType:p.documentType, documentNumber:p.documentNumber });
const report = s => ({ source:identity(s.source), target:identity(s.target), payables:s.payables.filter(p => p.thirdPartyId === s.source.id).map(p => ({id:p.id,concept:p.concept,amount:p.amount,status:p.status})), beneficiaries:s.beneficiaries.filter(r => r.beneficiaryThirdPartyId === s.source.id).map(r => ({id:r.id,concept:r.concept,amount:r.amount,status:r.status})), receivables:s.receivables.filter(r=>r.thirdPartyId===s.source.id).map(r=>({id:r.id,kind:r.kind,amount:r.amount})), collaborators:s.collaborators.filter(c=>c.thirdPartyId===s.source.id).map(c=>({id:c.id,name:c.displayName,contracts:c.contracts.length})), revision:hash(s) });
function validate(s) {
  if (s.source.mergedIntoId || s.target.mergedIntoId || !s.source.isActive || !s.target.isActive || s.children.length) throw fail('Revisa primero las fichas inactivas o unificadas. No se encadenan unificaciones.');
  for (const field of ['clientId','teamMemberId']) if (s.source[field] && s.target[field] && s.source[field] !== s.target[field]) throw fail('Las fichas están vinculadas a identidades distintas. Revisa primero el vínculo nativo; no se unifican por parecido de nombres.');
  const doc = p => p.documentNumber ? `${p.documentType}:${p.documentNumber.replace(/[^\w]/g,'').toUpperCase()}` : null;
  if (doc(s.source) && doc(s.target) && doc(s.source) !== doc(s.target)) throw fail('Los documentos de identidad son distintos. Corrígelos desde su origen antes de unificar.');
}
const request = input => {
  if (!input.expectedRevision || !String(input.reason || '').trim() || input.reason.length > 300 || !input.requestId || input.requestId.length > 100) throw fail('Revisa ambas fichas y explica el motivo antes de confirmar.');
};
export const reviewPartyMerge = (db, sourceId, targetId, actor) => atomic(db, async tx => { await authorize(tx, actor, 'read'); const s = await state(tx,sourceId,targetId); validate(s); return report(s); }, true);
export async function mergeParties(db, sourceId, input, actor) {
  request(input); const fingerprint = hash({sourceId,input});
  return atomic(db, async tx => {
    const user = await authorize(tx,actor,'write');
    const prior = await tx.financialAuditEvent.findFirst({ where: { entityType:'ThirdParty', entityId:sourceId, after:{path:['requestId'],equals:input.requestId} } });
    if (prior) { if (prior.actorId !== user.id || prior.after.fingerprint !== fingerprint) throw fail('Esta solicitud ya se usó con otros datos.'); const current=await state(tx,sourceId,input.targetId); if (!matchesSavedState(current,prior)) throw fail('La unificación cambió después de guardarse. Revisa el historial.'); return {eventId:prior.id,revision:prior.after.revision,replayed:true}; }
    const before = await state(tx,sourceId,input.targetId); validate(before);
    if (hash(before)!==input.expectedRevision) throw fail('Las fichas u obligaciones cambiaron. Actualiza la revisión.');
    await tx.thirdParty.update({where:{id:sourceId},data:{clientId:null,teamMemberId:null,isActive:false,mergedIntoId:input.targetId}});
    await tx.thirdParty.update({where:{id:input.targetId},data:{roles:[...new Set([...thirdPartyRoles(before.target),...thirdPartyRoles(before.source)])],clientId:before.target.clientId || before.source.clientId,teamMemberId:before.target.teamMemberId || before.source.teamMemberId}});
    await tx.accountsPayable.updateMany({where:{thirdPartyId:sourceId},data:{thirdPartyId:input.targetId}});
    await tx.accountsReceivable.updateMany({where:{beneficiaryThirdPartyId:sourceId},data:{beneficiaryThirdPartyId:input.targetId}});
    await tx.accountsReceivable.updateMany({where:{thirdPartyId:sourceId},data:{thirdPartyId:input.targetId}});
    await tx.financialCollaborator.updateMany({where:{thirdPartyId:sourceId},data:{thirdPartyId:input.targetId}});
    const after=await state(tx,sourceId,input.targetId), revision=hash(after);
    const event=await tx.financialAuditEvent.create({data:{entityType:'ThirdParty',entityId:sourceId,action:'UPDATE',actorId:user.id,before:clone(before),after:clone({operation:'PARTY_MERGED',targetId:input.targetId,revision,reason:input.reason,requestId:input.requestId,fingerprint,actorName:user.name})}});
    return {eventId:event.id,revision};
  });
}
export const readPartyMerge = (db,eventId,actor) => atomic(db,async tx => {
  await authorize(tx,actor,'read'); const event=await tx.financialAuditEvent.findUnique({where:{id:eventId}}) || await tx.financialAuditEvent.findFirst({where:{entityType:'ThirdParty',entityId:eventId,after:{path:['operation'],equals:'PARTY_MERGED'}},orderBy:{createdAt:'desc'}});
  if (event?.after?.operation!=='PARTY_MERGED') throw fail('No encontramos esa unificación.');
  const current=await state(tx,event.entityId,event.after.targetId);
  const canReverse=matchesSavedState(current,event);
  return {...report(current),revision:canReverse ? event.after.revision : hash(current),eventId:event.id,reason:event.after.reason,canReverse};
},true);
export async function reversePartyMerge(db,eventId,input,actor) {
  request(input);
  return atomic(db,async tx => {
    const user=await authorize(tx,actor,'write'), event=await tx.financialAuditEvent.findUnique({where:{id:eventId}});
    if(event?.after?.operation!=='PARTY_MERGED') throw fail('No encontramos esa unificación.');
    const prior=await tx.financialAuditEvent.findFirst({where:{entityType:'ThirdParty',entityId:event.entityId,after:{path:['reversedEventId'],equals:eventId}}});
    if(prior){if(prior.actorId!==user.id || prior.after.requestId!==input.requestId || prior.after.fingerprint!==hash(input))throw fail('La unificación ya se revirtió.');return {replayed:true};}
    const current=await state(tx,event.entityId,event.after.targetId);
    if(!matchesSavedState(current,event) || input.expectedRevision!==event.after.revision)throw fail('Hubo cambios posteriores en las fichas u obligaciones. Revisa esos cambios antes de deshacer.');
    const old=event.before;
    // Release unique source links first; never replace payment rows or audit records.
    await tx.thirdParty.update({where:{id:old.target.id},data:{clientId:old.target.clientId,teamMemberId:old.target.teamMemberId,roles:old.target.roles}});
    await tx.thirdParty.update({where:{id:old.source.id},data:{clientId:old.source.clientId,teamMemberId:old.source.teamMemberId,isActive:old.source.isActive,mergedIntoId:null}});
    await tx.accountsPayable.updateMany({where:{id:{in:old.payables.filter(p=>p.thirdPartyId===old.source.id).map(p=>p.id)}},data:{thirdPartyId:old.source.id}});
    await tx.accountsReceivable.updateMany({where:{id:{in:old.beneficiaries.filter(p=>p.beneficiaryThirdPartyId===old.source.id).map(p=>p.id)}},data:{beneficiaryThirdPartyId:old.source.id}});
    await tx.accountsReceivable.updateMany({where:{id:{in:(old.receivables||[]).filter(r=>r.thirdPartyId===old.source.id).map(r=>r.id)}},data:{thirdPartyId:old.source.id}});
    await tx.financialCollaborator.updateMany({where:{id:{in:(old.collaborators||[]).filter(r=>r.thirdPartyId===old.source.id).map(r=>r.id)}},data:{thirdPartyId:old.source.id}});
    await tx.financialAuditEvent.create({data:{entityType:'ThirdParty',entityId:event.entityId,action:'UPDATE',actorId:user.id,before:clone(report(current)),after:{operation:'PARTY_MERGE_REVERSED',reversedEventId:eventId,requestId:input.requestId,fingerprint:hash(input),reason:input.reason,actorName:user.name}}});
    return {ok:true};
  });
}
