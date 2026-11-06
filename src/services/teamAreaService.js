// Quién está en un área del equipo, para las reglas que avisan por área (alertas comerciales, cartera…).
// Solo cuentas activas con su miembro de Equipo activo; el área la decide `memberHasArea`.
import { memberHasArea } from '../lib/teamAreas.js';
import { hasModulePermission } from '../config/security.js';

export const activeAreaUserIds = async (db, area, { module = null } = {}) => (await db.user.findMany({
    where: { isActive: true, teamMember: { is: { isActive: true } } },
    select: { id: true, role: true, modulePermissions: true, teamMember: { select: { role: true, areas: true } } }
})).filter((user) => memberHasArea(user.teamMember, area) && (!module || hasModulePermission(user, module))).map((user) => user.id);

// El área decide responsabilidad; el permiso decide qué información puede recibir.
export const userCanReceiveFinancialNotices = async (db, userId) => {
    if (typeof db.user?.findUnique !== 'function') return false;
    const user = await db.user.findUnique({ where: { id: userId }, select: {
        role: true, modulePermissions: true, isActive: true,
        teamMember: { select: { isActive: true } }
    } });
    return user?.isActive === true && user.teamMember?.isActive === true && hasModulePermission(user, 'financiero');
};

/** ¿Esta persona está en el área? Sin modelo de Equipo (dobles de prueba antiguos) no se puede saber: sí. */
export const userHasArea = async (db, userId, area) => {
    if (typeof db.teamMember?.findFirst !== 'function') return true;
    const member = await db.teamMember.findFirst({ where: { userId }, select: { role: true, areas: true } });
    return memberHasArea(member, area);
};
