import jwt from 'jsonwebtoken';

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
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.warn(`[Auth] No token provided for ${req.method} ${req.originalUrl}`);
    return res.status(401).json({
      error: "Unauthorized",
      message: "No bearer token provided in Authorization header",
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
