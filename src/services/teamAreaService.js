// Quién está en un área del equipo, para las reglas que avisan por área (alertas comerciales, cartera…).
// Solo cuentas activas con su miembro de Equipo activo; el área la decide `memberHasArea`.
import { memberHasArea } from '../lib/teamAreas.js';

export const activeAreaUserIds = async (db, area) => (await db.user.findMany({
    where: { isActive: true, teamMember: { is: { isActive: true } } },
    select: { id: true, teamMember: { select: { role: true, areas: true } } }
})).filter((user) => memberHasArea(user.teamMember, area)).map((user) => user.id);

/** ¿Esta persona está en el área? Sin modelo de Equipo (dobles de prueba antiguos) no se puede saber: sí. */
export const userHasArea = async (db, userId, area) => {
    if (typeof db.teamMember?.findFirst !== 'function') return true;
    const member = await db.teamMember.findFirst({ where: { userId }, select: { role: true, areas: true } });
    return memberHasArea(member, area);
};
