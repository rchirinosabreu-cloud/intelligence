import { lookup } from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://labs.brainstudioagencia.com',
  'https://intelligence.brainstudioagencia.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173'
];

const SENSITIVE_QUERY_PARAMETERS = new Set([
  'access_token',
  'authorization',
  'code',
  'id_token',
  'jwt',
  'password',
  'refresh_token',
  'secret',
  'token'
]);

export const sanitizeUrlForLogs = (rawUrl = '') => {
  const value = String(rawUrl || '');
  const [pathname, query = ''] = value.split('?', 2);
  if (!query) return pathname;

  const params = new URLSearchParams(query);
  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_PARAMETERS.has(key.toLowerCase())) {
      params.set(key, '[REDACTED]');
    }
  }
  const sanitizedQuery = params.toString();
  return sanitizedQuery ? `${pathname}?${sanitizedQuery}` : pathname;
};

export const normalizeOrigin = (origin = '') => String(origin).trim().replace(/\/$/, '');

export const isAllowedOrigin = (origin, env = process.env) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return true;

  const configuredOrigins = String(env.CORS_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const allowedOrigins = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);

  return allowedOrigins.has(normalizedOrigin)
    || /^https:\/\/[a-z0-9-]+\.brainstudioagencia\.com$/i.test(normalizedOrigin);
};

export const validateSecurityEnvironment = (env = process.env) => {
  const missing = [];
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.JWT_SECRET || String(env.JWT_SECRET).length < 32) missing.push('JWT_SECRET (minimum 32 characters)');

  if (env.NODE_ENV === 'production' && missing.length > 0) {
    throw new Error(`Missing or insecure environment variables: ${missing.join(', ')}`);
  }

  return { missing };
};

export const getJwtSecret = (env = process.env) => {
  const secret = String(env.JWT_SECRET || '');
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  return secret;
};

export const isManagerRole = (role) => ['ADMIN', 'PROJECT_MANAGER'].includes(
  String(role || '').toUpperCase()
);

const normalizePermissions = (permissions) => {
  if (!permissions) return {};
  if (typeof permissions === 'string') {
    try {
      return JSON.parse(permissions);
    } catch {
      return {};
    }
  }
  return permissions;
};

export const hasModulePermission = (user, moduleName) => {
  if (String(user?.role || '').toUpperCase() === 'ADMIN') return true;
  const target = String(moduleName || '').toLowerCase();
  const permissions = normalizePermissions(user?.modulePermissions);
  return Object.entries(permissions).some(([key, enabled]) => (
    key.toLowerCase() === target && enabled === true
  ));
};

const getUserId = (user) => user?.userId || user?.id || null;

export const canUpdateTask = (user, task) => {
  if (isManagerRole(user?.role)) return true;
  const userId = getUserId(user);
  return Boolean(userId && (
    task?.creatorId === userId || task?.assignee?.userId === userId
  ));
};

export const canDeleteTask = (user, task) => {
  if (isManagerRole(user?.role)) return true;
  const userId = getUserId(user);
  return Boolean(userId && task?.creatorId === userId);
};

const TASK_UPDATE_FIELDS = new Set([
  'title',
  'dueDate',
  'assigneeId',
  'comments',
  'clientId',
  'status',
  'isPriority',
  'priority',
  'isSpecial',
  'referenceUrl',
  'specialType',
  'sortOrder',
  'newAttachment',
  'deleteAttachmentId',
  'returnReason',
  'reintegrateReason',
  'reopenReason',
  'reopenNote'
]);

export const pickAllowedTaskUpdates = (payload = {}) => Object.fromEntries(
  Object.entries(payload).filter(([key]) => TASK_UPDATE_FIELDS.has(key))
);

export const isPrivateIpAddress = (address) => {
  const value = String(address || '').trim().toLowerCase();
  const version = net.isIP(value);
  if (!version) return false;

  if (version === 6) {
    if (value === '::' || value === '::1') return true;
    if (value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value)) return true;
    if (value.startsWith('::ffff:')) return isPrivateIpAddress(value.slice(7));
    return false;
  }

  const [a, b] = value.split('.').map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224;
};

const validateExternalUrl = async (rawUrl, resolveHost) => {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Blocked URL protocol');
  }
  if (url.username || url.password || url.hostname.toLowerCase() === 'localhost') {
    throw new Error('Blocked private destination');
  }

  if (net.isIP(url.hostname)) {
    if (isPrivateIpAddress(url.hostname)) throw new Error('Blocked private destination');
    return url;
  }

  const resolved = await resolveHost(url.hostname, { all: true, verbatim: true });
  const addresses = Array.isArray(resolved) ? resolved : [resolved];
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new Error('Blocked private destination');
  }
  return url;
};

const readLimitedText = async (response, maxBytes) => {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error('Response size is too large');
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error('Response size is too large');
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Response size is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
};

export const safeFetchText = async (rawUrl, options = {}, dependencies = {}) => {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const resolveHost = dependencies.resolveHost || lookup;
  const maxBytes = options.maxBytes || 2 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs || 10_000;
  let currentUrl = String(rawUrl);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const safeUrl = await validateExternalUrl(currentUrl, resolveHost);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    let response;
    try {
      response = await fetchImpl(safeUrl, {
        headers: options.headers,
        redirect: 'manual',
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectCount === maxRedirects) throw new Error('Too many redirects');
      currentUrl = new URL(location, safeUrl).href;
      continue;
    }
    if (!response.ok) throw new Error(`External request failed with status ${response.status}`);

    return {
      text: await readLimitedText(response, maxBytes),
      finalUrl: safeUrl.href,
      contentType: response.headers.get('content-type') || ''
    };
  }

  throw new Error('Too many redirects');
};

export const isSafeStoragePath = (rawPath, allowedPrefixes = []) => {
  let decoded;
  try {
    decoded = decodeURIComponent(String(rawPath || ''));
  } catch {
    return false;
  }
  if (!decoded || decoded.includes('..') || decoded.startsWith('/') || decoded.includes('\\') || decoded.includes(':')) {
    return false;
  }
  return allowedPrefixes.length === 0 || allowedPrefixes.some((prefix) => decoded.startsWith(prefix));
};

const UNSAFE_UPLOAD_EXTENSIONS = new Set([
  '.bat', '.cmd', '.com', '.cpl', '.dll', '.dmg', '.exe', '.hta', '.htm', '.html',
  '.iso', '.jar', '.js', '.jse', '.lnk', '.msi', '.msp', '.pif', '.ps1', '.reg',
  '.scr', '.sh', '.svg', '.svgz', '.vbe', '.vbs', '.wsf', '.xlsm', '.xltm', '.docm',
  '.dotm', '.pptm', '.potm', '.ppam', '.sldm'
]);

const UNSAFE_UPLOAD_MIME_TYPES = new Set([
  'application/javascript',
  'application/x-executable',
  'application/x-httpd-php',
  'application/x-msdownload',
  'application/x-sh',
  'image/svg+xml',
  'text/html',
  'text/javascript'
]);

export const validateUploadFile = (file, { maxBytes = 25 * 1024 * 1024 } = {}) => {
  if (!file?.originalname || !file?.buffer && !Number.isFinite(file?.size)) {
    const error = new Error('Invalid upload');
    error.code = 'INVALID_FILE';
    throw error;
  }

  if (Number(file.size || file.buffer?.length || 0) > maxBytes) {
    const error = new Error('File is too large');
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }

  const extension = path.extname(String(file.originalname)).toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase().split(';', 1)[0].trim();
  if (UNSAFE_UPLOAD_EXTENSIONS.has(extension) || UNSAFE_UPLOAD_MIME_TYPES.has(mimeType)) {
    const error = new Error('Unsafe file type');
    error.code = 'UNSAFE_FILE_TYPE';
    throw error;
  }

  return file;
};

export const createRateLimiter = ({ windowMs = 60_000, max = 60, maxBuckets = 10_000, now = Date.now, keyGenerator } = {}) => {
  const buckets = new Map();
  const pruneBuckets = (currentTime) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) buckets.delete(key);
    }
    while (buckets.size >= maxBuckets) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey === undefined) break;
      buckets.delete(oldestKey);
    }
  };

  const middleware = (req, res, next) => {
    const currentTime = now();
    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.socket?.remoteAddress || 'unknown';
    const existing = buckets.get(key);
    if (!existing) pruneBuckets(currentTime);
    const bucket = !existing || existing.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : existing;
    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - currentTime) / 1000)));
      return res.status(429).json({ error: 'Too many requests', message: 'Intenta nuevamente más tarde' });
    }
    return next();
  };
  middleware.bucketCount = () => buckets.size;
  return middleware;
};

export const configureSecurityHeaders = (app) => app.disable('x-powered-by');

const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;

export const sanitizeErrorPayload = (payload, statusCode) => {
  if (statusCode < 400 || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const sanitized = { ...payload };
  delete sanitized.details;
  delete sanitized.stack;
  delete sanitized.meta;

  if (statusCode >= 500) {
    sanitized.error = STABLE_ERROR_CODE.test(String(sanitized.error || ''))
      ? sanitized.error
      : 'INTERNAL_SERVER_ERROR';
    sanitized.message = 'Ocurrió un error inesperado';
    if (!STABLE_ERROR_CODE.test(String(sanitized.code || ''))) delete sanitized.code;
  }
  return sanitized;
};

export const errorResponseSanitizer = (_req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (payload) => sendJson(sanitizeErrorPayload(payload, res.statusCode));
  return next();
};

export const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; '));
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return next();
};
