import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';
import prisma from './src/lib/prisma.js';
import { initTaskClassificationCron } from './src/services/taskClassificationService.js';
import { loggerMiddleware } from './src/middlewares/logger.js';
import apiRouter from './src/routes/index.js';
import { geminiProxy } from './src/controllers/proxyController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for Railway environment
app.set('trust proxy', 1);

// --- CORS CONFIGURATION ---
const normalizeOrigin = (origin = '') => String(origin).trim().replace(/\/$/, '');
const allowedOrigins = new Set([
  "https://labs.brainstudioagencia.com",
  "https://intelligence.brainstudioagencia.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : [])
].map(normalizeOrigin));

const isAllowedOrigin = (origin = '') => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return true;
  if (allowedOrigins.has(normalizedOrigin)) return true;
  return /^https:\/\/[a-z0-9-]+\.brainstudioagencia\.com$/i.test(normalizedOrigin);
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn(`CORS warning: allowing unexpected origin ${origin}`);
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With", "Accept", "Accept-Version", "Content-Length", "Content-MD5", "Date", "X-Api-Version"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// --- BODY PARSING ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- LOGGING ---
app.use(loggerMiddleware);

// --- ROUTES ---
// Gemini proxy must be mounted before common API router if it has special body restreaming needs
app.use('/api/gemini', geminiProxy);
app.use('/api', apiRouter);

// --- STATIC FILES & SPA ---
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    if (req.originalUrl.startsWith('/api')) return res.status(404).json({ error: "API endpoint not found" });
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    res.status(200).send("Brainstudio Intelligence Backend is running.");
});

// --- GLOBAL ERROR HANDLING ---
app.use((err, req, res, next) => {
  const isPrismaError = err.code && (err.code.startsWith('P') || err.message?.includes('Prisma'));
  console.error(`[Global Error] ${req.method} ${req.originalUrl}:`, { message: err.message, code: err.code });

  if (req.originalUrl.startsWith('/api')) {
    return res.status(500).json({
      error: isPrismaError ? "Database Error" : "Internal Server Error",
      message: err.message,
      code: err.code,
      path: req.originalUrl
    });
  }
  next(err);
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT} (Bound to 0.0.0.0)`);
    (async () => {
        try {
            await prisma.$connect();
            console.log("[Diagnostic] Database connection successful.");
            initTaskClassificationCron();
        } catch (dbError) {
            console.error("[Diagnostic] CRITICAL: Database connection failed!", dbError.message);
        }
    })();
});

// Aumentar el timeout global del servidor a 5 minutos para procesar análisis largos de IA
server.timeout = 300000;
