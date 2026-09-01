import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';
import prisma from './src/lib/prisma.js';
import { initTaskClassificationCron } from './src/services/taskClassificationService.js';
import { initGoogleCalendarSyncScheduler } from './src/services/googleCalendarSyncScheduler.js';
import { initAutomatedMinutesScheduler } from './src/services/automatedMinutesScheduler.js';
import { initBriaMemoryScheduler } from './src/services/briaMemoryScheduler.js';
import { initBriaObserverScheduler } from './src/services/briaObserverScheduler.js';
import { getAIHealth } from './src/services/aiService.js';
import { loggerMiddleware } from './src/middlewares/logger.js';
import { operationalAuditMiddleware } from './src/middlewares/operationalAuditMiddleware.js';
import apiRouter from './src/routes/index.js';
import {
  configureSecurityHeaders,
  createRateLimiter,
  errorResponseSanitizer,
  isAllowedOrigin,
  sanitizeUrlForLogs,
  securityHeaders,
  validateSecurityEnvironment
} from './src/config/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for Railway environment
app.set('trust proxy', 1);
configureSecurityHeaders(app);
app.use(securityHeaders);
app.use(errorResponseSanitizer);

const apiRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 1200 });
const authRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
const publicRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 });
const aiRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 40 });

// --- CORS CONFIGURATION ---
const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`CORS blocked unexpected origin ${origin}`);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With", "Accept", "Accept-Version", "Content-Length", "Content-MD5", "Date", "X-Api-Version"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  ai: getAIHealth()
}));
app.get('/api/health/ai', (_req, res) => {
  const health = getAIHealth();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
app.use('/api/login', authRateLimiter);
app.use('/api/password-reset', authRateLimiter);
app.use('/api/public', publicRateLimiter);
app.use('/api/quotations/public', publicRateLimiter);
app.use('/api/openai', aiRateLimiter);
app.use('/api/fireflies', aiRateLimiter);
app.use('/api', apiRateLimiter);

// --- BODY PARSING ---
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// --- LOGGING ---
app.use(loggerMiddleware);
app.use(operationalAuditMiddleware);

// --- ROUTES ---
app.use('/api', apiRouter);

// --- STATIC FILES & SPA ---
// Optimized static delivery for HTTP/2 stability and asset shielding
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Never disguise a missing build asset as index.html. Stale browser tabs can
// then detect the failed dynamic import and recover to the current deployment.
app.get('/assets/*', (_req, res) => {
    res.status(404).type('text/plain').send('Asset not found');
});

app.get('*', (req, res) => {
    if (req.originalUrl.startsWith('/api')) return res.status(404).json({ error: "API endpoint not found" });
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache');
        return res.sendFile(indexPath);
    }
    res.status(200).send("Brainstudio Intelligence Backend is running.");
});

// --- GLOBAL ERROR HANDLING ---
app.use((err, req, res, next) => {
  const isPrismaError = err.code && (err.code.startsWith('P') || err.message?.includes('Prisma'));
  console.error(`[Global Error] ${req.method} ${sanitizeUrlForLogs(req.originalUrl)}:`, { message: err.message, code: err.code });

  if (req.originalUrl.startsWith('/api')) {
    if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'FILE_TOO_LARGE') {
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: 'El archivo supera el tamaño permitido'
      });
    }
    if (err.code === 'UNSAFE_FILE_TYPE' || err.code === 'INVALID_FILE') {
      return res.status(415).json({
        error: err.code,
        message: 'El tipo de archivo no está permitido'
      });
    }
    const isProduction = process.env.NODE_ENV === 'production';
    return res.status(500).json({
      error: isPrismaError ? "Database Error" : "Internal Server Error",
      message: isProduction ? 'Ocurrió un error inesperado' : err.message,
      ...(isProduction ? {} : { code: err.code })
    });
  }
  next(err);
});

// --- RESILIENT STARTUP (BOOTSTRAP) ---
async function bootstrap() {
    console.log("--- INICIANDO BRAINSTUDIO INTELLIGENCE BACKEND ---");

    validateSecurityEnvironment(process.env);

    // 1. System Checklist & Configuration
    const ESSENTIAL_KEYS = ['DATABASE_URL', 'JWT_SECRET', 'OPENAI_API_KEY'];
    const missingKeys = ESSENTIAL_KEYS.filter(key => !process.env[key]);

    if (missingKeys.length > 0) {
        console.error(`[System Checklist] ERROR: Faltan variables de entorno esenciales: ${missingKeys.join(', ')}`);
        // We don't exit here to allow manual intervention/logs to be visible in Railway
    } else {
        console.log("[System Checklist] Configuración básica verificada.");
    }

    // 2. Database Connection
    try {
        await prisma.$connect();
        console.log("[Service: DB] Conexión a PostgreSQL exitosa.");
    } catch (dbError) {
        console.error("[Service: DB] CRITICAL: Falló la conexión a la base de datos:", dbError.message);
        process.exit(1); // Cannot run without DB
    }

    // 3. AI Service Initialization (Non-blocking)
    try {
        const { initialize } = await import('./src/services/aiService.js');
        const client = await initialize();
        if (client) {
            const health = getAIHealth();
            console.log(`[Service: AI] OpenAI operativo (${health.model}, ${health.latencyMs}ms).`);
        } else {
            const health = getAIHealth();
            console.warn(`[Service: AI] OpenAI no está operativo (${health.error || health.status}).`);
            console.info("[Service: AI] El servidor continuará sin capacidades de IA activas.");
        }
    } catch (aiError) {
        console.error("[Service: AI] ADVERTENCIA: No se pudo inicializar el servicio de IA:", aiError.message);
        console.info("[Service: AI] El servidor continuará sin capacidades de IA activas.");
    }

    // 4. Background Tasks & Cron
    try {
        initTaskClassificationCron();
        initGoogleCalendarSyncScheduler();
        initAutomatedMinutesScheduler();
        initBriaMemoryScheduler();
        initBriaObserverScheduler();
        console.log("[Service: Cron] Tareas en segundo plano inicializadas.");
    } catch (cronError) {
        console.error("[Service: Cron] Fallo al iniciar tareas programadas:", cronError.message);
    }

    // 5. Start Express Server
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 [Service: API] Servidor escuchando en puerto ${PORT} (Bound to 0.0.0.0)`);
    });

    // Aumentar el timeout global del servidor a 5 minutos para procesar análisis largos de IA
    server.timeout = 300000;
}

// --- GLOBAL PROMISE MANAGEMENT ---
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [Runtime] Promesa no controlada (Unhandled Rejection):', reason);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('❌ [Runtime] Excepción no controlada (Uncaught Exception):', error);
    process.exit(1);
});

// Run Bootstrap
bootstrap().catch(err => {
    console.error("Fallo catastrófico en el arranque:", err);
    process.exit(1);
});
