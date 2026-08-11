import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { getJwtSecret } from '../config/security.js';
import {
  completePasswordReset,
  normalizeEmail,
  PasswordResetError,
  requestPasswordReset
} from '../services/passwordResetService.js';

const JWT_SECRET = getJwtSecret();
const AUTH_TOKEN_EXPIRES_IN = process.env.AUTH_TOKEN_EXPIRES_IN || '12h';
const MIN_PASSWORD_LENGTH = 8;
const ALLOWED_SYSTEM_ROLES = new Set(['ADMIN', 'PROJECT_MANAGER', 'EDITOR', 'VIEWER']);
const ALLOWED_FINANCIAL_ROLES = new Set(['NONE', 'VIEWER', 'EDITOR', 'APPROVER', 'ADMIN']);

export const login = async (req, res) => {
  try {
      const { email, password } = req.body;

      if (!email || !password) {
          return res.status(400).json({ message: 'Email y contraseña son requeridos' });
      }

      const user = await prisma.user.findUnique({
          where: { email: normalizeEmail(email) }
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
              hasFinancialAccess: user.hasFinancialAccess,
              financialRole: user.financialRole,
              modulePermissions: user.modulePermissions,
              sessionVersion: user.sessionVersion
          },
          JWT_SECRET,
          { expiresIn: AUTH_TOKEN_EXPIRES_IN }
      );

      return res.json({
          token,
          user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              hasFinancialAccess: user.hasFinancialAccess,
              financialRole: user.financialRole,
              modulePermissions: user.modulePermissions,
              mustChangePassword: user.mustChangePassword,
              sessionVersion: user.sessionVersion
          }
      });

  } catch (error) {
      console.error('Error during login:', error);
      return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const sendPasswordReset = async (req, res) => {
    try {
        const result = await requestPasswordReset({ email: req.body?.email });
        return res.json(result);
    } catch (error) {
        console.error('[PasswordReset] Request error:', error);
        const status = error instanceof PasswordResetError ? error.status : 500;
        return res.status(status).json({
            message: status === 500 ? 'No se pudo enviar el codigo de recuperacion' : error.message
        });
    }
};

export const resetPasswordWithCode = async (req, res) => {
    try {
        const result = await completePasswordReset({
            email: req.body?.email,
            code: req.body?.code,
            newPassword: req.body?.newPassword
        });

        return res.json({
            ...result,
            message: 'Contrasena actualizada correctamente. Ingresa con tu nueva clave.'
        });
    } catch (error) {
        console.error('[PasswordReset] Confirm error:', error);
        const status = error instanceof PasswordResetError ? error.status : 500;
        return res.status(status).json({
            message: status === 500 ? 'No se pudo actualizar la contrasena' : error.message
        });
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

    let createdCount = 0;
    let skippedCount = 0;

    for (const member of teamMembers) {
      const normalizedEmail = member.email.trim().toLowerCase();

      let user = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (!user || user.isActive === false) {
        const unusablePassword = randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(unusablePassword, 10);
        user = await prisma.user.create({
          data: {
            name: member.name,
            email: normalizedEmail,
            password: hashedPassword,
            role: 'EDITOR',
            mustChangePassword: true
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
        message: "Sincronización completada. Los usuarios nuevos deben usar recuperación de contraseña.",
        sincronizados: createdCount,
        omitidos_ya_existian: skippedCount
    });

  } catch (error) {
    console.error("[Sync] Error durante la sincronización:", error);
    return res.status(500).json({ success: false, error: 'No se pudo sincronizar a los usuarios' });
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

        if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
        }

        const normalizedEmail = normalizeEmail(email);
        const normalizedRole = String(role || 'EDITOR').toUpperCase();
        const hasFinancialAccess = req.body.hasFinancialAccess === true;
        const normalizedFinancialRole = hasFinancialAccess
            ? String(req.body.financialRole || 'EDITOR').toUpperCase()
            : 'NONE';

        if (!ALLOWED_SYSTEM_ROLES.has(normalizedRole)) {
            return res.status(400).json({ message: 'Rol de sistema inválido' });
        }
        if (!ALLOWED_FINANCIAL_ROLES.has(normalizedFinancialRole)) {
            return res.status(400).json({ message: 'Rol financiero inválido' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingUser) {
            return res.status(400).json({ message: 'El correo ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name: String(name).trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role: normalizedRole,
                hasFinancialAccess,
                financialRole: normalizedFinancialRole,
                mustChangePassword: true
            },
            select: { id: true, name: true, email: true, role: true, hasFinancialAccess: true, financialRole: true, mustChangePassword: true }
        });

        return res.status(201).json(newUser);
    } catch (error) {
        console.error('Error creating user:', error);
        return res.status(500).json({ message: 'Error interno al crear usuario' });
    }
};
