import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { getJwtSecret, hasModulePermission, isManagerRole } from '../config/security.js';

const JWT_SECRET = getJwtSecret();

export const authenticateToken = async (req, res, next) => {
  // Bypass authentication for OPTIONS requests (CORS pre-flight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Public media paths resolve their storage object from database records.
  if (
    req.originalUrl.includes('/avatar-image') ||
    /\/api\/clients\/.*\/logo-image/.test(req.originalUrl)
  ) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.warn(`[Auth] No token provided for ${req.method} ${req.originalUrl}`);
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication token missing",
      path: req.originalUrl
    });
  }

  let user;
  try {
    user = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.error(`[Auth] JWT Verification failed for ${req.method} ${req.originalUrl}:`, {
      message: err.message,
      name: err.name,
      expiredAt: err.expiredAt
    });

    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token",
      code: err.name === 'TokenExpiredError' ? 'TokenExpiredError' : 'TOKEN_INVALID'
    });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId || user.id },
      select: {
        id: true,
        role: true,
        isActive: true,
        sessionVersion: true,
        mustChangePassword: true,
        modulePermissions: true,
        hasFinancialAccess: true,
        financialRole: true
      }
    });

    if (!dbUser || dbUser.isActive === false) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User session is no longer active",
        code: "USER_INACTIVE"
      });
    }

    if ((user.sessionVersion ?? 0) !== dbUser.sessionVersion) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Session has been revoked",
        code: "TOKEN_REVOKED"
      });
    }

    const isPasswordChangeRoute = req.method === 'PUT' && req.originalUrl.includes('/api/user/password');
    if (dbUser.mustChangePassword && !isPasswordChangeRoute) {
      return res.status(428).json({
        error: "Password change required",
        message: "Debes actualizar tu contrasena para continuar",
        code: "PASSWORD_CHANGE_REQUIRED"
      });
    }

    req.user = {
      ...user,
      role: dbUser.role,
      modulePermissions: dbUser.modulePermissions,
      hasFinancialAccess: dbUser.hasFinancialAccess,
      financialRole: dbUser.financialRole,
      mustChangePassword: dbUser.mustChangePassword,
      sessionVersion: dbUser.sessionVersion
    };
    return next();
  } catch (error) {
    console.error("[Auth] Error validating server-side session:", error);
    return res.status(500).json({ error: "Failed to validate session" });
  }
};
export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized", message: "Usuario no autenticado" });
    }

    const userRole = String(req.user.role || '').toUpperCase();
    const targetRole = String(role || '').toUpperCase();

    if (userRole !== targetRole) {
      console.warn(`[Auth] Access denied for user ${req.user.email || req.user.id}: Role ${userRole} does not match required ${targetRole}`);
      return res.status(403).json({
        error: `Acceso denegado. Se requiere rol ${targetRole}`
      });
    }

    next();
  };
};
const FINANCIAL_PERMISSION_LEVELS = {
  NONE: 0,
  VIEWER: 1,
  EDITOR: 2,
  APPROVER: 3,
  ADMIN: 4
};

export const requireManagerRole = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Usuario no autenticado' });
  }
  if (!isManagerRole(req.user.role)) {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol ADMIN o PROJECT_MANAGER' });
  }
  return next();
};

const REQUIRED_FINANCIAL_LEVELS = {
  read: FINANCIAL_PERMISSION_LEVELS.VIEWER,
  write: FINANCIAL_PERMISSION_LEVELS.EDITOR,
  approve: FINANCIAL_PERMISSION_LEVELS.APPROVER,
  admin: FINANCIAL_PERMISSION_LEVELS.ADMIN
};

export const hasFinancialPermission = (user, permission = 'read') => {
  if (!user) return false;
  if (String(user.role || '').toUpperCase() === 'ADMIN') return true;

  const requiredLevel = REQUIRED_FINANCIAL_LEVELS[permission];
  if (!requiredLevel) return false;

  const financialRole = String(user.financialRole || 'NONE').toUpperCase();
  const roleLevel = FINANCIAL_PERMISSION_LEVELS[financialRole] || 0;
  if (roleLevel >= requiredLevel) return true;

  // Existing users keep operational access while explicit roles are assigned.
  return user.hasFinancialAccess === true && ['read', 'write'].includes(permission);
};

export const requireFinancialPermission = (permission = 'read') => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized", message: "Usuario no autenticado" });
    }

    try {
      const userId = req.user.userId || req.user.id;
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, hasFinancialAccess: true, financialRole: true }
      });

      if (!dbUser || !hasFinancialPermission(dbUser, permission)) {
        console.warn(`[Auth] Financial ${permission} access denied for user ${req.user.email || req.user.id || userId}`);
        return res.status(403).json({
          error: "Acceso denegado. No tienes el nivel de permiso financiero requerido"
        });
      }

      req.user.financialRole = dbUser.financialRole;
      req.user.hasFinancialAccess = dbUser.hasFinancialAccess;
      return next();
    } catch (error) {
      console.error("[Auth] Error validating financial access:", error);
      return res.status(500).json({ error: "Failed to validate financial access permissions" });
    }
  };
};

export const requireFinancialAccess = requireFinancialPermission('read');
export const requireFinancialWrite = requireFinancialPermission('write');
export const requireFinancialApproval = requireFinancialPermission('approve');
export const requireFinancialAdmin = requireFinancialPermission('admin');

export const requireModulePermission = (moduleName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized", message: "Usuario no autenticado" });
    }
    if (!hasModulePermission(req.user, moduleName)) {
      console.warn(`[Auth] Access denied for user ${req.user.userId || req.user.id}: Module ${moduleName} is not permitted.`);
      return res.status(403).json({
        error: `No tienes permisos para acceder al módulo: ${moduleName}`
      });
    }
    return next();
  };
};
