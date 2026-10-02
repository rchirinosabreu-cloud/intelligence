import prisma from '../lib/prisma.js';
import { isActiveTeamUser } from '../services/teamRosterService.js';
import bcrypt from 'bcryptjs';
import { getJwtSecret } from '../config/security.js';
import {
  completePasswordReset,
  normalizeEmail,
  PasswordResetError,
  requestPasswordReset
} from '../services/passwordResetService.js';
import { recordOperationalTrace } from '../services/operationalTraceService.js';
import { createMfaLoginHandlers } from './mfaLoginController.js';
import { mfaService } from '../services/mfa.js';

const JWT_SECRET = getJwtSecret();
const AUTH_TOKEN_EXPIRES_IN = process.env.AUTH_TOKEN_EXPIRES_IN || '12h';
const mfaLogin = createMfaLoginHandlers({
    db: prisma,
    mfa: mfaService,
    jwtSecret: JWT_SECRET,
    expiresIn: AUTH_TOKEN_EXPIRES_IN,
    trace: recordOperationalTrace
});
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
          where: { email: normalizeEmail(email) },
          include: { teamMember: { select: { isActive: true } } }
      });

      if (!user || user.isActive === false || !isActiveTeamUser(user)) {
          return res.status(401).json({ message: 'Credenciales incorrectas' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
          return res.status(401).json({ message: 'Credenciales incorrectas' });
      }

      // Con verificación en dos pasos activa, aquí solo sale el pase para pedir el código.
      return await mfaLogin.respondAfterPassword(user, res);

  } catch (error) {
      console.error('Error during login:', error);
      return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const loginWithMfa = async (req, res) => {
    try {
        return await mfaLogin.verifyLogin(req, res);
    } catch (error) {
        console.error('Error during MFA login:', error);
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
