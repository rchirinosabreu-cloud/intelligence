import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'brainstudio-secret-key-2025';

export const authenticateToken = (req, res, next) => {
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

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
        console.error(`[Auth] JWT Verification failed for ${req.method} ${req.originalUrl}:`, {
          message: err.message,
          name: err.name,
          expiredAt: err.expiredAt
        });

        return res.status(403).json({
          error: "Forbidden",
          message: "Invalid or expired token",
          details: err.message,
          code: err.name === 'TokenExpiredError' ? 'TokenExpiredError' : 'TOKEN_INVALID'
        });
    }
    req.user = user;
    next();
  });
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
