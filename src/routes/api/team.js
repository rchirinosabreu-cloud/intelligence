import express from 'express';
import prisma from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Obtener todos los miembros del equipo
router.get('/', async (req, res) => {
  try {
    const { includeInactive } = req.query;

    const whereClause = includeInactive === 'true' ? {} : { isActive: true };

    const teamMembers = await prisma.teamMember.findMany({
      where: whereClause,
      include: {
        user: {
          select: { role: true, modulePermissions: true, hasFinancialAccess: true, financialRole: true }
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
    return FINANCIAL_ROLES.has(normalizedRole) && normalizedRole !== 'ADMIN'
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
                const defaultPassword = 'Brainstudio2026';
                const hashedPassword = await bcrypt.hash(defaultPassword, 10);

                user = await tx.user.create({
                    data: {
                        name,
                        email: normalizedEmail,
                        password: hashedPassword,
                        role: systemRole || 'VIEWER',
                        modulePermissions: sanitizedPerms,
                        hasFinancialAccess,
                        financialRole: resolvedFinancialRole
                    }
                });
            } else {
                user = await tx.user.update({
                    where: { id: user.id },
                    data: {
                        role: systemRole || undefined,
                        modulePermissions: sanitizedPerms,
                        hasFinancialAccess,
                        financialRole: resolvedFinancialRole
                    }
                });
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

    return res.status(201).json(newMember);
  } catch (error) {
    console.error('Error creating team member and user:', error);
    return res.status(500).json({ error: 'Failed to create team member and auto-provision user account.', details: error.message });
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
  const { memberId, statusMessage } = req.body;
  try {
    const updatedMember = await prisma.teamMember.update({
      where: { id: memberId },
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
    const deactivatedMember = await prisma.teamMember.update({
      where: { id },
      data: { isActive: false },
    });

    return res.json(deactivatedMember);
  } catch (error) {
    console.error('Error deactivating team member:', error);
    return res.status(500).json({ error: 'Failed to deactivate team member', details: error.message });
  }
});

export default router;
