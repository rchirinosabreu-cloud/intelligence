import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'brainstudio-secret-key-2025';

export const authenticateToken = async (req, res, next) => {
  // Bypass authentication for OPTIONS requests (CORS pre-flight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Bypass authentication for public avatar, report images, and client logos (used in <img> tags)
  if (
    req.originalUrl.includes('/avatar-image') ||
    req.originalUrl.includes('/image-proxy') ||
    /\/api\/clients\/.*\/logo-image/.test(req.originalUrl)
  ) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // Fallback to query parameter for browser-native requests (<img> tags, downloads, etc)
  if (!token && req.query.token) {
    token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  }

  if (!token) {
    console.warn(`[Auth] No token provided for ${req.method} ${req.originalUrl}`);
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication token missing (Authorization header or token query parameter)",
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
      details: err.message,
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
        hasFinancialAccess: true
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

export const requireFinancialAccess = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized", message: "Usuario no autenticado" });
  }

  try {
    const userId = req.user.userId || req.user.id;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { hasFinancialAccess: true }
    });

    if (!dbUser || dbUser.hasFinancialAccess !== true) {
      console.warn(`[Auth] Access denied for user ${req.user.email || req.user.id || userId}: hasFinancialAccess is false`);
      return res.status(403).json({
        error: "Acceso denegado. Se requiere permiso financiero explícito"
      });
    }

    next();
  } catch (error) {
    console.error("[Auth] Error validating financial access:", error);
    return res.status(500).json({ error: "Failed to validate financial access permissions" });
  }
};

export const requireModulePermission = (moduleName) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized", message: "Usuario no autenticado" });
    }

    try {
      const userId = req.user.userId || req.user.id;
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, modulePermissions: true }
      });

      if (!dbUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // ADMIN users always have access to all modules bypass
      if (dbUser.role === 'ADMIN') {
        return next();
      }

      const permissions = dbUser.modulePermissions || {};
      const key = String(moduleName || '').toLowerCase();
      if (permissions[key] !== true && permissions[moduleName] !== true) {
        console.warn(`[Auth] Access denied for user ${userId}: Module ${moduleName} is not permitted.`);
        return res.status(403).json({
          error: `No tienes permisos para acceder al módulo: ${moduleName}`
        });
      }

      next();
    } catch (error) {
      console.error("[Auth] Error checking module permissions:", error);
      return res.status(500).json({ error: "Failed to validate module permissions" });
    }
  };
};
