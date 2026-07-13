import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'brainstudio-secret-key-2025';

export const login = async (req, res) => {
  try {
      const { email, password } = req.body;

      if (!email || !password) {
          return res.status(400).json({ message: 'Email y contraseña son requeridos' });
      }

      const userCount = await prisma.user.count();
      if (userCount === 0) {
          console.log("[Bootstrapping] No users found in database. Creating default admin user.");
          const defaultAdminEmail = process.env.ADMIN_USER || 'admin@brainstudio.com';
          const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'password123';
          const hashedAdminPassword = await bcrypt.hash(defaultAdminPassword, 10);

          await prisma.user.create({
              data: {
                  name: 'System Admin',
                  email: defaultAdminEmail,
                  password: hashedAdminPassword,
                  role: 'ADMIN',
                  hasFinancialAccess: true
              }
          });
      }

      const user = await prisma.user.findUnique({
          where: { email }
      });

      if (!user) {
          return res.status(401).json({ message: 'Credenciales incorrectas' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
          return res.status(401).json({ message: 'Credenciales incorrectas' });
      }

      const token = jwt.sign(
          {
              userId: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              hasFinancialAccess: user.hasFinancialAccess
          },
          JWT_SECRET,
          { expiresIn: '30d' }
      );

      return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, hasFinancialAccess: user.hasFinancialAccess } });

  } catch (error) {
      console.error('Error during login:', error);
      return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
  }
};

export const syncUsers = async (req, res) => {
  console.log("[Sync] Iniciando sincronización de TeamMembers a Users...");

  try {
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        isActive: true,
        email: { not: null, not: '' }
      }
    });

    if (teamMembers.length === 0) {
      return res.json({ success: true, message: "No se encontraron TeamMembers con email para sincronizar." });
    }

    const defaultPassword = 'Brainstudio2026';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    let createdCount = 0;
    let skippedCount = 0;

    for (const member of teamMembers) {
      const normalizedEmail = member.email.trim().toLowerCase();

      let user = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: member.name,
            email: normalizedEmail,
            password: hashedPassword,
            role: 'EDITOR'
          }
        });
        createdCount++;
      } else {
        skippedCount++;
      }

      await prisma.teamMember.update({
        where: { id: member.id },
        data: { userId: user.id }
      });
    }

    return res.json({
        success: true,
        message: "Sincronización completada",
        sincronizados: createdCount,
        omitidos_ya_existian: skippedCount
    });

  } catch (error) {
    console.error("[Sync] Error durante la sincronización:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createUser = async (req, res) => {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ message: 'No tienes permisos para crear usuarios' });
    }

    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Nombre, email y contraseña son obligatorios' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'El correo ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role || 'EDITOR',
                hasFinancialAccess: req.body.hasFinancialAccess || false
            },
            select: { id: true, name: true, email: true, role: true, hasFinancialAccess: true }
        });

        return res.status(201).json(newUser);
    } catch (error) {
        console.error('Error creating user:', error);
        return res.status(500).json({ message: 'Error interno al crear usuario', details: error.message });
    }
};
