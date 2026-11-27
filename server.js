import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';
import prisma from './src/lib/prisma.js';
import { initTaskClassificationCron } from './src/services/taskClassificationService.js';
import { initFocusOverdueCron } from './src/services/taskFocusService.js';
import { startTaskAttachmentRetention } from './src/services/taskAttachmentRetentionService.js';
import { startDeliveryCleanup } from './src/services/deliveryCleanupService.js';
import { startTempUploadSweep } from './src/services/tempUploadRetentionService.js';
import { startAnnouncementImageSweep } from './src/services/announcementImageService.js';
import { initGoogleCalendarSyncScheduler } from './src/services/googleCalendarSyncScheduler.js';
import { initAutomatedMinutesScheduler } from './src/services/automatedMinutesScheduler.js';
import { initBriaMemoryScheduler } from './src/services/briaMemoryScheduler.js';
import { initBriaObserverScheduler } from './src/services/briaObserverScheduler.js';
import { initBriaContentPlanReviewScheduler } from './src/services/briaContentPlanReviewScheduler.js';
import { initSocialPublishingScheduler } from './src/services/socialPublishingScheduler.js';
import { initServiceHealthScheduler } from './src/services/serviceHealthScheduler.js';
import { initWeeklyFocusScheduler } from './src/services/weeklyFocusService.js';
import { initBriaPulseScheduler } from './src/services/briaPulseService.js';
import { initDailyCloseScheduler } from './src/services/dailyCloseService.js';
import { initMonthlyReviewScheduler } from './src/services/monthlyReviewService.js';
import { initPlatformLeagueScheduler } from './src/services/platformLeagueService.js';
import { initCaughtUpScheduler } from './src/services/caughtUpAtCloseService.js';
import { initDailyReadingScheduler } from './src/services/dailyReadingService.js';
import { initConversationLearningScheduler } from './src/services/conversationLearningService.js';
import { initCrmFollowUpAlertScheduler } from './src/services/crmFollowUpAlertService.js';
import { initCollectionAlertScheduler } from './src/services/collectionAlertService.js';
import { initFormalizationScheduler } from './src/services/projectFormalizationService.js';
import { initContractCycleAlertScheduler } from './src/services/contractCycleAlertService.js';
import { realignPendingContentItems } from './src/services/contentService.js';
import { clientOperationsService } from './src/services/clientOperationsService.js';
import { initPlanCloseNoticeScheduler } from './src/services/planCloseNoticeService.js';
import { initAdBudgetAlertScheduler } from './src/services/adBudgetNoticeService.js';
import { initAdMetaSyncScheduler } from './src/services/adBudgetMetaService.js';
import { initClientSuspensionScheduler } from './src/services/clientSuspensionService.js';
import { initProductionDayReminderScheduler } from './src/services/productionDayService.js';
import { initUnbackedWorkAlertScheduler } from './src/services/unbackedWorkAlertService.js';
import { initExternalPlanScheduler } from './src/services/externalPlanService.js';
import { getAIHealth } from './src/services/aiService.js';
import { configureS3Cors } from './src/services/s3Service.js';
import { configurePlatformStorageCors } from './src/services/platformStorageService.js';
import { loggerMiddleware } from './src/middlewares/logger.js';
import { operationalAuditMiddleware } from './src/middlewares/operationalAuditMiddleware.js';
import apiRouter from './src/routes/index.js';
import { createAuthRateLimiters } from './src/lib/authRateLimit.js';
import { assertDemoDatabase, isDemoMode } from './src/lib/demoMode.js';
import { demoFriendlyErrors } from './src/middlewares/demoFriendlyErrors.js';
import { isMediaDelivery } from './src/lib/mediaTicket.js';
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

// Un reproductor pide cada video en muchos pedazos cortos (21 de noviembre de 2026): esas lecturas llevan su
// propio cupo (`mediaRateLimiter`) para que ver videos no agote el de la plataforma ni el del portal del cliente.
const exceptMedia = limiter => (req, res, next) => (isMediaDelivery(req) ? next() : limiter(req, res, next));
const apiRateLimiter = exceptMedia(createRateLimiter({ windowMs: 15 * 60 * 1000, max: 1200 }));
const publicRateLimiter = exceptMedia(createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));
const mediaRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 6000 });
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
  ai: getAIHealth(),
  // La versión «Demo» (26 de octubre de 2026): el distintivo del header lo lee de aquí, sin sesión.
  demo: isDemoMode()
}));
app.get('/api/health/ai', (_req, res) => {
  const health = getAIHealth();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
app.use('/api', (req, res, next) => (isMediaDelivery(req) ? mediaRateLimiter(req, res, next) : next()));
app.use('/api/public', publicRateLimiter);
app.use('/api/quotations/public', publicRateLimiter);
app.use('/api/openai', aiRateLimiter);
app.use('/api/fireflies', aiRateLimiter);
app.use('/api', apiRateLimiter);

// --- BODY PARSING ---
// The Fireflies and Meta (WhatsApp) signatures cover the exact bytes they sent,
// so those two routes keep their raw body. Every other request parses as before.
app.use(express.json({
  limit: '5mb',
  verify: (req, _res, buffer) => {
    if (req.originalUrl?.startsWith('/api/minutes/fireflies/webhook') || req.originalUrl?.startsWith('/api/whatsapp/webhook')) req.rawBody = buffer;
  }
}));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Intentos de ingreso: un cupo por persona y uno alto por conexión (13 de octubre de 2026).
// Van después de leer el cuerpo porque cuentan por correo o por el pase del código.
const authRateLimiters = createAuthRateLimiters();
app.use('/api/login', authRateLimiters);
app.use('/api/password-reset', authRateLimiters);

// --- LOGGING ---
app.use(loggerMiddleware);
app.use(operationalAuditMiddleware);

// --- ROUTES ---
// En la demo, un fallo del servidor dice «depende de una conexión real» en vez de un error (fuera de la demo no hace nada).
app.use('/api', demoFriendlyErrors);
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
    // Con DEMO_MODE=true la base tiene que llamarse «demo»: producción nunca arranca en modo demo por una variable mal puesta.
    assertDemoDatabase(process.env);
    if (isDemoMode()) console.log('[Modo demo] Esta instancia enseña una agencia inventada; no es producción.');

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
        initFocusOverdueCron();
        initGoogleCalendarSyncScheduler();
        initAutomatedMinutesScheduler();
        initBriaMemoryScheduler();
        initBriaObserverScheduler();
        initBriaContentPlanReviewScheduler();
        initSocialPublishingScheduler();
        initServiceHealthScheduler();
        // La lectura semanal de Ritmo ya no tiene tarjeta (10-nov-2026): sus decisiones viven en Manager → Decisiones.
        initWeeklyFocusScheduler();
        initBriaPulseScheduler();
        initDailyCloseScheduler();
        initMonthlyReviewScheduler();
        initDailyReadingScheduler();
        initPlatformLeagueScheduler();
        initCaughtUpScheduler();
        initConversationLearningScheduler();
        initCrmFollowUpAlertScheduler();
        initCollectionAlertScheduler();
        initFormalizationScheduler();
        initContractCycleAlertScheduler();
        // Piezas sin publicar que quedaron en otra parrilla por el mes calendario: vuelven a la suya al desplegar
        // (20 de noviembre de 2026). No frena el arranque; si falla, la parrilla sigue ofreciendo el botón.
        realignPendingContentItems()
            .then(({ moved, failed }) => { if (moved || failed.length) console.log(`[Parrillas] Piezas llevadas a su parrilla: ${moved}; sin mover: ${failed.length} ${JSON.stringify(failed.slice(0, 20))}`); })
            .catch(error => console.error('[Parrillas] No se pudieron reubicar las piezas al arrancar:', error.message));
        initPlanCloseNoticeScheduler();
        // Arqueo de cortes (23 de noviembre de 2026): una línea por cuenta medida, para validar cliente por cliente.
        // Solo lee y solo escribe en el registro; si falla no frena nada.
        clientOperationsService.auditClientCuts()
            .then(rows => rows.forEach(row => console.log(`[Arqueo de cortes] ${JSON.stringify(row)}`)))
            .catch(error => console.error('[Arqueo de cortes] No se pudo leer:', error.message));
        initAdBudgetAlertScheduler();
        initAdMetaSyncScheduler();
        initClientSuspensionScheduler();
        initProductionDayReminderScheduler();
        initUnbackedWorkAlertScheduler();
        initExternalPlanScheduler();
        startTaskAttachmentRetention();
        startDeliveryCleanup();
        startTempUploadSweep();
        startAnnouncementImageSweep();
        console.log("[Service: Cron] Tareas en segundo plano inicializadas.");
    } catch (cronError) {
        console.error("[Service: Cron] Fallo al iniciar tareas programadas:", cronError.message);
    }

    // 4b. El bucket tiene que admitir PUT desde el navegador para la subida directa de piezas finales.
    // Va aquí y no en la cadena de `npm start`: un almacenamiento caído no puede impedir que el
    // servidor levante. `configureS3Cors` registra su propio fallo y no lanza.
    configureS3Cors();
    configurePlatformStorageCors();
    // Resume durable file deletion even when nobody opens Bria after a restart.
    const { getApplicationConversationService } = await import('./src/services/briaConversationApplication.js');
    getApplicationConversationService();
    // Bria en WhatsApp (20 de octubre de 2026): el puente usa ese mismo motor; sin él, el webhook responde que
    // Bria todavía no está lista en vez de perder el mensaje en silencio.
    const { connectWhatsAppBridge } = await import('./src/services/whatsappBridgeService.js');
    await connectWhatsAppBridge();

    // 5. Start Express Server
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 [Service: API] Servidor escuchando en puerto ${PORT} (Bound to 0.0.0.0)`);
    });

    // 6. Marcas (18 de noviembre de 2026): completa lo que falte de las fichas de los manuales del Drive con sus
    // logos (idempotente). Después del arranque y sin esperarla: bajar los logos no puede retrasar el servidor.
    if (process.env.DEMO_MODE !== 'true') {
        setTimeout(async () => {
            try {
                const [{ seedBrandsOnBoot }, { clientBrandService }, { default: prismaClient }, { readFile }] = await Promise.all([
                    import('./src/services/clientBrandImport.js'),
                    import('./src/services/clientBrandService.js'),
                    import('./src/lib/prisma.js'),
                    import('node:fs/promises')
                ]);
                const dataset = JSON.parse(await readFile(new URL('./data/client-brands.json', import.meta.url), 'utf8'));
                await seedBrandsOnBoot({ db: prismaClient, service: clientBrandService(), dataset });
            } catch (brandError) {
                console.error('[Brands] No se pudo preparar la carga de los manuales:', brandError.message);
            }
        }, 15_000);
    }

    // 6b. Reconocimientos (20 de noviembre de 2026): retira lo que Rodny pidió retirar (`RECOGNITION_CORRECTIONS`).
    // Idempotente: lo ya retirado cambió de tipo y no vuelve a aparecer.
    if (process.env.DEMO_MODE !== 'true') {
        setTimeout(async () => {
            try {
                const [{ applyRecognitionCorrections }, { default: prismaClient }] = await Promise.all([
                    import('./src/services/recognitionCorrections.js'),
                    import('./src/lib/prisma.js')
                ]);
                const retired = await applyRecognitionCorrections(prismaClient);
                if (retired.length) console.log('[Reconocimientos] Retirados:', JSON.stringify(retired));
                // «Parrilla terminada» (Rodny, 26 de noviembre de 2026): el primer repaso entrega las parrillas que ya
                // estaban terminadas; los siguientes, las que se terminan sin pasar por el editor (hojas de MIO).
                const { grantFinishedPlans } = await import('./src/services/recognitionService.js');
                const sweep = async () => {
                    try {
                        const granted = await grantFinishedPlans(prismaClient);
                        if (granted.length) console.log('[Reconocimientos] Parrilla terminada:', JSON.stringify(granted));
                    } catch (sweepError) {
                        console.error('[Reconocimientos] No se pudo repasar las parrillas terminadas:', sweepError.message);
                    }
                };
                await sweep();
                setInterval(sweep, 15 * 60 * 1000).unref?.();
            } catch (correctionError) {
                console.error('[Reconocimientos] No se pudo aplicar la corrección:', correctionError.message);
            }
        }, 10_000);
    }

    // 7. Parrillas (19 de noviembre de 2026): el responsable de cada parrilla abierta es el community del cliente.
    // Idempotente; corrige lo que haya quedado distinto, sin bloquear el arranque.
    setTimeout(async () => {
        try {
            const [{ syncPlanOwnersOnBoot }, { default: prismaClient }] = await Promise.all([
                import('./src/services/planOwnerService.js'),
                import('./src/lib/prisma.js')
            ]);
            await syncPlanOwnersOnBoot({ db: prismaClient });
        } catch (ownerError) {
            console.error('[Parrillas] No se pudo revisar el responsable de las parrillas:', ownerError.message);
        }
    }, 20_000);

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
