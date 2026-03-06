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
      orderBy: { name: 'asc' },
    });

    res.json(teamMembers);
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Crear un nuevo miembro del equipo (y auto-crear cuenta de User)
router.post('/', async (req, res) => {
  try {
    const { name, role, email, avatarUrl } = req.body;

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and role are required' });
    }

    // Usamos una transacción para asegurar que ambas tablas se actualizan o ninguna
    const newMember = await prisma.$transaction(async (tx) => {
        // 1. Crear el TeamMember visual
        const member = await tx.teamMember.create({
            data: {
                name,
                role,
                email,
                avatarUrl,
                isActive: true
            },
        });

        // 2. Crear la cuenta de User si tiene email y no existe previamente
        if (email && email.trim() !== '') {
            const normalizedEmail = email.trim().toLowerCase();
            const existingUser = await tx.user.findUnique({
                where: { email: normalizedEmail }
            });

            if (!existingUser) {
                const defaultPassword = 'Brainstudio2026';
                const hashedPassword = await bcrypt.hash(defaultPassword, 10);

                await tx.user.create({
                    data: {
                        name,
                        email: normalizedEmail,
                        password: hashedPassword,
                        role: 'EDITOR' // Rol base para miembros del equipo
                    }
                });
            }
        }

        return member;
    });

    res.status(201).json(newMember);
  } catch (error) {
    console.error('Error creating team member and user:', error);
    res.status(500).json({ error: 'Failed to create team member and auto-provision user account.' });
  }
});

// Actualizar un miembro del equipo
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, email, avatarUrl, isActive } = req.body;

    const updatedMember = await prisma.teamMember.update({
      where: { id },
      data: {
        name,
        role,
        email,
        avatarUrl,
        isActive: isActive !== undefined ? isActive : undefined
      },
    });

    res.json(updatedMember);
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// Desactivar lógicamente (o borrar si se prefiere, pero usamos desactivación según las specs)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Prioriza desactivación lógica
    const deactivatedMember = await prisma.teamMember.update({
      where: { id },
      data: { isActive: false },
    });

    res.json(deactivatedMember);
  } catch (error) {
    console.error('Error deactivating team member:', error);
    res.status(500).json({ error: 'Failed to deactivate team member' });
  }
});

export default router;