import { FinancialDomainError } from './financialRecordService.js';
import { thirdPartyRoles } from '../lib/accountsPayable.js';

const fail = message => new FinancialDomainError('PARTY_SELECTION_CHANGED', message, 409);
// Read the existing identities, never create payment profiles merely by opening a list.
export async function financialPartyChoices(tx) {
  const [parties, clients, team, collaborators] = await Promise.all([
    tx.thirdParty.findMany({ where: { isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
    tx.client.findMany({ where: { isArchived: false }, select: { id: true, name: true } }),
    tx.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    // Quien ya no está en Equipo (cuenta desactivada) no se ofrece para préstamos, canjes ni pagos nuevos.
    tx.financialCollaborator.findMany({ where: { isActive: true, thirdPartyId: null, OR: [{ userId: null }, { user: { isActive: true } }] }, select:{id:true,displayName:true} }),
  ]);
  // An explicitly inactive profile must not be silently recreated from its source.
  const links = await tx.thirdParty.findMany({ select: { clientId: true, teamMemberId: true } });
  const linkedClients = new Set(links.map(p => p.clientId)), linkedTeam = new Set(links.map(p => p.teamMemberId));
  return [
    ...collaborators.map(c=>({id:`payroll:${c.id}`,name:c.displayName,kind:'COLABORADOR',roles:['COLABORADOR'],isActive:true})),
    ...parties.map(p => ({ id: p.id, name: p.name, kind: p.kind, roles: [...new Set([...(p.clientId ? ['CLIENTE'] : []), ...thirdPartyRoles(p)])], documentNumber: p.documentNumber, isActive: true })),
    ...clients.filter(c => !linkedClients.has(c.id)).map(c => ({ id: `client:${c.id}`, name: c.name, kind: 'CLIENTE', roles: ['CLIENTE'], isActive: true })),
    ...team.filter(m => !linkedTeam.has(m.id)).map(m => ({ id: `team:${m.id}`, name: m.name, kind: 'COLABORADOR', roles: ['COLABORADOR'], isActive: true })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
}

// Call only inside the native write transaction; a failed operation also rolls this back.
export async function resolveFinancialParty(tx, selection, actor) {
  const value = String(selection || '');
  if(value.startsWith('payroll:')){
    const collaborator=await tx.financialCollaborator.findUnique({where:{id:value.slice(8)}});
    if(!collaborator?.isActive)throw fail('Esta persona ya no está disponible.');
    if(collaborator.thirdPartyId)return resolveFinancialParty(tx,collaborator.thirdPartyId,actor);
    const duplicate=await tx.thirdParty.findFirst({where:{name:{equals:collaborator.displayName,mode:'insensitive'}}});
    if(duplicate)throw fail('Ya existe una ficha con ese nombre. Relaciona el registro de nómina desde Terceros.');
    const party=await tx.thirdParty.create({data:{name:collaborator.displayName,kind:'COLABORADOR',roles:['COLABORADOR']}});
    await tx.financialCollaborator.update({where:{id:collaborator.id},data:{thirdPartyId:party.id}});
    await tx.financialAuditEvent.create({data:{entityType:'ThirdParty',entityId:party.id,action:'CREATE',actorId:actor?.id||actor?.userId,after:{operation:'PAYROLL_PROFILE_LINKED',collaboratorId:collaborator.id}}});
    return party;
  }
  const source = value.startsWith('client:') ? 'client' : value.startsWith('team:') ? 'team' : null;
  if (!source) {
    const party = await tx.thirdParty.findUnique({ where: { id: value } });
    if (!party?.isActive) throw fail('La ficha ya no está disponible. Actualiza y selecciona la persona o empresa.');
    return party;
  }
  const id = value.slice(value.indexOf(':') + 1), link = source === 'client' ? 'clientId' : 'teamMemberId';
  const origin = source === 'client' ? await tx.client.findUnique({ where: { id } }) : await tx.teamMember.findUnique({ where: { id } });
  if (!origin || (source === 'client' ? origin.isArchived : !origin.isActive)) throw fail('La persona o empresa está inactiva o ya no existe. Actualiza el directorio.');
  const existing = await tx.thirdParty.findMany({ where: { [link]: id } });
  if (existing.length > 1 || (existing.length && !existing[0].isActive)) throw fail('Revisa las fichas vinculadas a esta identidad en Terceros antes de continuar.');
  if (existing.length) return existing[0];
  const candidate = await tx.thirdParty.findFirst({ where: { name: { equals: origin.name, mode: 'insensitive' }, isActive: true, [link]: null } });
  if (candidate) throw fail('Ya existe una ficha con ese nombre sin vincular. En Terceros, edita la ficha existente y selecciona su vínculo con Cliente o Equipo antes de continuar. No se crea una copia automáticamente.');
  const kind = source === 'client' ? 'CLIENTE' : 'COLABORADOR';
  const party = await tx.thirdParty.create({ data: { name: origin.name, kind, roles: [kind], [link]: id, createdById: actor?.id || actor?.userId } });
  await tx.financialAuditEvent.create({ data: { entityType: 'ThirdParty', entityId: party.id, action: 'CREATE', actorId: actor?.id || actor?.userId, after: { ...party, operation: 'PROFILE_LINKED', source, sourceId: id } } });
  return party;
}
