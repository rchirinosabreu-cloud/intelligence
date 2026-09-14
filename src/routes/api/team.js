import express from 'express';
import prisma from '../../lib/prisma.js';
import { createInitialCredential, prepareInitialAccess } from '../../services/initialAccessService.js';
import { isManagerRole } from '../../config/security.js';
import { setLinkedAccountStatus } from '../../services/teamRosterService.js';

const router = express.Router();

// Obtener todos los miembros del equipo
router.get('/', async (req, res) => {
  try {
    const { includeInactive } = req.query;

    const whereClause = includeInactive === 'true' && isManagerRole(req.user?.role)
      ? {}
      : { isActive: true };

    const teamMembers = await prisma.teamMember.findMany({
      where: whereClause,
      include: {
        user: {
          select: { role: true, modulePermissions: true, hasFinancialAccess: true, financialRole: true,
            ...(req.user?.role === 'ADMIN' ? { mustChangePassword: true, passwordChangedAt: true, sessionVersion: true, isActive: true } : {}) }
        }
      },
      orderBy: { name: 'asc' },
    });

    return res.json(teamMembers);
  } catch (error) {
    console.error('Error fetching team members:', error);
    return res.status(500).json({ error: 'Failed to fetch team members', details: error.message });
  }
});

const defaultPermissions = {
    dashboard: true,
    manager: false,
    gestion: false,
    actividad: false,
    reportes: false,
    inspiracion: false,
    parrillas: false,
    minutas: false,
    cotizaciones: false,
    financiero: false,
    radar: false,
    clientes: false,
    equipo: false
};

const sanitizePermissions = (perms) => {
    const sanitized = { ...defaultPermissions };
    if (!perms) return sanitized;
    Object.keys(perms).forEach(key => {
        const lowerKey = key.toLowerCase();
        let targetKey = lowerKey;
        if (lowerKey === 'inicio') targetKey = 'dashboard';
        if (lowerKey === 'tareas') targetKey = 'gestion';

        if (targetKey in defaultPermissions) {
            sanitized[targetKey] = !!perms[key];
        }
    });
    sanitized.dashboard = true;
    return sanitized;
};

export const resolveFinancialAccessFlag = (systemRole, modulePermissions = {}) => {
    if (systemRole === 'ADMIN') return true;
    return modulePermissions.financiero === true;
};

const FINANCIAL_ROLES = new Set(['NONE', 'VIEWER', 'EDITOR', 'APPROVER', 'ADMIN']);

export const resolveFinancialRole = (systemRole, requestedRole, modulePermissions = {}) => {
    if (systemRole === 'ADMIN') return 'ADMIN';
    if (modulePermissions.financiero !== true) return 'NONE';

    const normalizedRole = String(requestedRole || '').toUpperCase();
    return FINANCIAL_ROLES.has(normalizedRole) && !['ADMIN', 'NONE'].includes(normalizedRole)
        ? normalizedRole
        : 'EDITOR';
};

// Crear un nuevo miembro del equipo (y auto-crear cuenta de User)
router.post('/', async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo los administradores pueden gestionar miembros del equipo' });
  }
  try {
    const { name, role, email, avatarUrl, systemRole, modulePermissions, financialRole } = req.body;

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and role are required' });
    }

    const sanitizedPerms = sanitizePermissions(modulePermissions);
    const hasFinancialAccess = resolveFinancialAccessFlag(systemRole || 'VIEWER', sanitizedPerms);
    const resolvedFinancialRole = resolveFinancialRole(systemRole || 'VIEWER', financialRole, sanitizedPerms);
    const credential = email?.trim() ? await createInitialCredential() : null;

    // Usamos una transacción para asegurar que ambas tablas se actualizan o ninguna
    const newMember = await prisma.$transaction(async (tx) => {
        // 1. Crear la cuenta de User si tiene email y no existe previamente
        let associatedUserId = null;
        if (email && email.trim() !== '') {
            const normalizedEmail = email.trim().toLowerCase();
            let user = await tx.user.findUnique({
                where: { email: normalizedEmail }
            });

            if (!user) {
                user = await tx.user.create({
                    data: {
                        name,
                        email: normalizedEmail,
                        password: credential.hash,
                        role: systemRole || 'VIEWER',
                        modulePermissions: sanitizedPerms,
                        hasFinancialAccess,
                        financialRole: resolvedFinancialRole,
                        mustChangePassword: true
                    }
                });
            } else {
                throw Object.assign(new Error('El correo ya tiene una cuenta. Administra su acceso o reactivación desde Equipo.'), { statusCode: 409 });
            }
            associatedUserId = user.id;
        }

        // 2. Crear el TeamMember visual vinculado al userId
        const member = await tx.teamMember.create({
            data: {
                name,
                role,
                email,
                avatarUrl,
                userId: associatedUserId,
                isActive: true
            },
        });

        return member;
    });

    res.setHeader('Cache-Control', 'no-store, private');
    return res.status(201).json({ ...newMember, ...(credential ? { initialAccess: {
        name: newMember.name, email: email.trim().toLowerCase(), temporaryPassword: credential.temporaryPassword
    } } : {}) });
  } catch (error) {
    console.error('Error creating team member and user:', { code: error.code, statusCode: error.statusCode });
    const conflict = error.statusCode === 409 || error.code === 'P2002';
    return res.status(conflict ? 409 : 500).json({ error: conflict ? 'El correo ya tiene una cuenta. Administra su acceso o reactivación desde Equipo.' : 'No se pudo crear el miembro y su cuenta. Inténtalo de nuevo.' });
  }
});

router.post('/:id/initial-access', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  try {
    const result = await prepareInitialAccess({ requester: req.user, memberId: req.params.id,
      confirmation: req.body.confirmation, expectedSessionVersion: req.body.expectedSessionVersion });
    return res.json(result);
  } catch (error) {
    console.error('[Team] Initial access failed:', { code: error.code, statusCode: error.statusCode });
    return res.status(error.statusCode || (error.code === 'P2034' ? 409 : 500)).json({ error: error.statusCode ? error.message : 'No se pudo preparar el acceso. Actualiza Equipo antes de volver a intentarlo.' });
  }
});

// Actualizar un miembro del equipo
router.put('/:id', async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo los administradores pueden gestionar miembros del equipo' });
  }
  try {
    const { id } = req.params;
    const { name, role, email, avatarUrl, isActive, systemRole, modulePermissions, financialRole } = req.body;

    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'El estado del miembro debe ser activo o inactivo.' });
    }

    const updatedMember = await prisma.$transaction(async (tx) => {
        const currentMember = await tx.teamMember.findUnique({
            where: { id },
            include: { user: true }
        });

        if (!currentMember) {
            throw new Error('Team member not found');
        }

        const member = await tx.teamMember.update({
            where: { id },
            data: {
                name,
                role,
                email,
                avatarUrl,
                isActive: isActive !== undefined ? isActive : undefined
            },
        });

        if (member.userId) {
            const nextSystemRole = systemRole || currentMember.user?.role || 'VIEWER';
            const nextPermissions = modulePermissions === undefined
                ? (currentMember.user?.modulePermissions || defaultPermissions)
                : sanitizePermissions(modulePermissions);
            const hasFinancialAccess = resolveFinancialAccessFlag(nextSystemRole, nextPermissions);
            const resolvedFinancialRole = resolveFinancialRole(
                nextSystemRole,
                financialRole ?? currentMember.user?.financialRole,
                nextPermissions
            );

            await tx.user.update({
                where: { id: member.userId },
                data: {
                    role: nextSystemRole,
                    modulePermissions: nextPermissions,
                    hasFinancialAccess,
                    financialRole: resolvedFinancialRole
                }
            });
            if (isActive !== undefined) await setLinkedAccountStatus(tx, member, isActive);
        }

        return member;
    });

    return res.json(updatedMember);
  } catch (error) {
    console.error('Error updating team member:', error);
    return res.status(500).json({ error: 'Failed to update team member', details: error.message });
  }
});

router.patch('/member/status-message', async (req, res) => {
  const statusMessage = String(req.body?.statusMessage || '').trim().slice(0, 160);
  try {
    const updatedMember = await prisma.teamMember.update({
      where: { userId: req.user.userId },
      data: { statusMessage }
    });
    res.json(updatedMember);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status message' });
  }
});

// Desactivar lógicamente (o borrar si se prefiere, pero usamos desactivación según las specs)
router.delete('/:id', async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo los administradores pueden gestionar miembros del equipo' });
  }
  try {
    const { id } = req.params;

    // Prioriza desactivación lógica
    const deactivatedMember = await prisma.$transaction(async tx => {
      const member = await tx.teamMember.update({
        where: { id },
        data: { isActive: false }
      });
      await setLinkedAccountStatus(tx, member, false);
      return member;
    });

    return res.json(deactivatedMember);
  } catch (error) {
    console.error('Error deactivating team member:', error);
    return res.status(500).json({ error: 'Failed to deactivate team member', details: error.message });
  }
});

export default router;
