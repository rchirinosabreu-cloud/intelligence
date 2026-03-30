import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import prisma from './src/lib/prisma.js';
import { VertexAI, FunctionDeclarationSchemaType } from '@google-cloud/vertexai';
import { SearchServiceClient } from '@google-cloud/discoveryengine';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import * as cheerio from 'cheerio';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { getUpcomingEvents } from './src/services/calendarService.js';
import { getClients, getClientByIdentifier, getClientGuidelines, createClient, getClientLinks, addClientLink, removeClientLink } from './src/services/clientService.js';
import { getClientTasks, createClientTask, updateTaskStatus as updateClientTaskStatus, deleteTask } from './src/services/clientTaskService.js';
import { getClientAnnouncements, createClientAnnouncement } from './src/services/clientAnnouncementService.js';
import { getFlowMessages, createFlowMessage } from './src/services/flowService.js';
import { getGeneralChatMessages, createGeneralChatMessage } from './src/services/generalChatService.js';
import { getUnreadNotificationCount, createNotification, getNotifications, markAsRead, markAllNotificationsAsRead } from './src/services/notificationService.js';
import { getGlobalAnnouncements, createGlobalAnnouncement, deleteGlobalAnnouncement } from './src/services/globalAnnouncementService.js';
import { getTasks, createTask, updateTask, deleteTask as deleteNativeTask, getCompletedTasks, getDashboardMetrics, getQualityStreak, auditAndDeleteTask } from './src/services/nativeTaskService.js';
import teamRouter from './src/routes/api/team.js';
import userRouter from './src/routes/api/user.js';
import feedbackRouter from './src/routes/api/feedback.js';
import integrationsRouter from './src/routes/api/integrations.js';
import contentRouter from './src/routes/api/content.js';
import dbRouter from './src/routes/api/db.js';
import clientFileRouter from './src/routes/api/clientFiles.js';
import talentRadarRouter from './src/routes/api/talentRadar.js';

dotenv.config();

// Global Crash Handler
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    // Keep alive if possible, or let Railway restart it with a log
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

console.log("Server script starting...");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for Railway environment to get correct protocol (x-forwarded-proto)
app.set('trust proxy', 1);

const normalizeOrigin = (origin = '') => String(origin).trim().replace(/\/$/, '');

const allowedOrigins = new Set([
  "https://intelligence.brainstudioagencia.com",
  "https://intelligence.brainstudioagencia.com/",
  "https://api.brainstudioagencia.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : [])
].map(normalizeOrigin));

const isAllowedOrigin = (origin = '') => {
  const normalizedOrigin = normalizeOrigin(origin);

  if (!normalizedOrigin) return true;
  if (allowedOrigins.has(normalizedOrigin)) return true;

  // Allow all HTTPS subdomains for our production domain.
  if (/^https:\/\/[a-z0-9-]+\.brainstudioagencia\.com$/i.test(normalizedOrigin)) {
    return true;
  }

  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (como Postman o apps móviles)
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    // Fallback: avoid breaking frontend due to strict origin mismatches.
    // Log it for review but still allow the request.
    console.warn(`CORS warning: allowing unexpected origin ${origin}`);
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-CSRF-Token",
    "X-Requested-With",
    "Accept",
    "Accept-Version",
    "Content-Length",
    "Content-MD5",
    "Date",
    "X-Api-Version"
  ],
};

// CORS configuration (allow all by default; restrict via CORS_ORIGINS env)
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Apply global body-parser limits BEFORE any routes or proxies as requested
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- LOGGING MIDDLEWARE ---
app.use((req, res, next) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const method = req.method;
  const url = req.originalUrl;

  console.log(`[${new Date().toISOString()}] ${method} ${url} (Proto: ${proto}, Secure: ${req.secure})`);

  // Fase 1: Detectar transformación de POST a GET por redirección HTTPS (Railway)
  if (method === 'GET' && url.includes('/api/login')) {
    console.warn(`[CRITICAL AUDIT] Received GET on Login route! This suggests a POST-to-GET transformation due to HTTP->HTTPS redirect.`);
    console.warn(`[DEBUG HEADERS] ${JSON.stringify(req.headers)}`);
  }

  next();
});

// --- AUTHENTICATION SETUP & MIDDLEWARE ---
const JWT_SECRET = process.env.JWT_SECRET || 'brainstudio-secret-key-2025';

const authenticateToken = (req, res, next) => {
  // Bypass authentication for OPTIONS requests (CORS pre-flight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Bypass authentication for public avatar images (used in <img> tags)
  if (req.originalUrl.includes('/avatar-image')) {
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


app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'brainstudio-intelligence-api',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'brainstudio-intelligence-api',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 8080;

// --- LOGIN & AUTHENTICATION MIDDLEWARE ---
console.log(`[Auth] JWT_SECRET ${process.env.JWT_SECRET ? 'configured from env' : 'using fallback secret'}.`);

app.post('/api/login', async (req, res) => {
  // --- FASE 1: TEST DE SHORT-CIRCUIT (PRIORIDAD CRÍTICA) ---
  // Si esta ruta devuelve HTML en producción, el problema es de ruteo o redirección.
  // Insertamos este res.json() en la PRIMERA LÍNEA para diagnóstico absoluto.
  return res.json({ test: 'ok', reached: true, method: req.method, protocol: req.headers['x-forwarded-proto'] || req.protocol });

  try {
      const { email, password } = req.body;

      if (!email || !password) {
          return res.status(400).json({ message: 'Email y contraseña son requeridos' });
      }

      // 0. Bootstrapping: If the User table is completely empty, auto-seed the first Admin.
      const userCount = await prisma.user.count();
      if (userCount === 0) {
          console.log("[Bootstrapping] No users found in database. Creating default admin user.");
          const defaultAdminEmail = process.env.ADMIN_USER || 'admin@brainstudio.com';
          const defaultAdminPassword = process.env.ADMIN_PASSWORD || 'password123';
          const hashedAdminPassword = await bcrypt.hash(defaultAdminPassword, 10);

          await prisma.user.create({
              data: {
                  name: 'System Admin',
                  email: defaultAdminEmail,
                  password: hashedAdminPassword,
                  role: 'ADMIN'
              }
          });
      }

      // 1. Buscar usuario por email
      const user = await prisma.user.findUnique({
          where: { email }
      });

      if (!user) {
          return res.status(401).json({ message: 'Credenciales incorrectas' });
      }

      // 2. Verificar contraseña con bcrypt
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
          return res.status(401).json({ message: 'Credenciales incorrectas' });
      }

      // 3. Generar JWT con Payload extendido
      const token = jwt.sign(
          {
              userId: user.id,
              name: user.name,
              email: user.email,
              role: user.role
          },
          JWT_SECRET,
          { expiresIn: '30d' }
      );

      return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });

  } catch (error) {
      console.error('Error during login:', error);
      return res.status(500).json({ message: 'Error interno del servidor', details: error.message });
  }
});


// User Profile & Notes
app.use('/api/user', authenticateToken, userRouter);

// Team & Management
app.use('/api/team', authenticateToken, teamRouter);

// Feedback & Performance
app.use('/api/feedback', authenticateToken, feedbackRouter);

// Integrations (Meta, etc.)
app.use('/api/integrations', authenticateToken, integrationsRouter);

// Content & Grids Routes
app.use('/api/content', authenticateToken, contentRouter);

// DB Modular Routes
app.use('/api/db', authenticateToken, dbRouter);

// Client Files Routes (Deliverables)
app.use('/api/clients/:clientId', authenticateToken, clientFileRouter);

// Talent Radar Routes (IA Analytics)
app.use('/api/talent-radar', authenticateToken, talentRadarRouter);

// User Management Endpoints
app.post('/api/users', authenticateToken, async (req, res) => {
    // Only allow Admins to create users (optional but recommended)
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ message: 'No tienes permisos para crear usuarios' });
    }

    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Nombre, email y contraseña son obligatorios' });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'El correo ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: role || 'EDITOR'
            },
            select: { id: true, name: true, email: true, role: true } // Don't return password
        });

        return res.status(201).json(newUser);
    } catch (error) {
        console.error('Error creating user:', error);
        return res.status(500).json({ message: 'Error interno al crear usuario', details: error.message });
    }
});

// --- TEMPORARY SYNC ENDPOINT ---
// Used to bootstrap existing TeamMembers into Users because Railway terminal is inaccessible.
app.get('/api/sync-users', async (req, res) => {
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

    const defaultPassword = 'Brainstudio2026';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    let createdCount = 0;
    let skippedCount = 0;

    for (const member of teamMembers) {
      const normalizedEmail = member.email.trim().toLowerCase();

      let user = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: member.name,
            email: normalizedEmail,
            password: hashedPassword,
            role: 'EDITOR'
          }
        });
        createdCount++;
      } else {
        skippedCount++;
      }

      // Update TeamMember with userId link
      await prisma.teamMember.update({
        where: { id: member.id },
        data: { userId: user.id }
      });
    }

    return res.json({
        success: true,
        message: "Sincronización completada",
        sincronizados: createdCount,
        omitidos_ya_existian: skippedCount
    });

  } catch (error) {
    console.error("[Sync] Error durante la sincronización:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Protect core intelligence API endpoints
app.use('/api', authenticateToken);

// --- MINUTES PROXY ROUTES ---
const openaiApiKey = process.env.OPENAI_API_KEY;
const firefliesApiKey = process.env.FIREFLIES_API_KEY;

// --- OPENAI DIRECT STREAMING ROUTE ---
app.post('/api/openai/v1/chat/completions', authenticateToken, async (req, res) => {
    try {
        if (!openaiApiKey) {
            console.error("[OpenAI API] Missing OPENAI_API_KEY");
            return res.status(500).json({ error: "Missing OpenAI API Key" });
        }

        // Force stream to true
        const requestBody = {
            ...req.body,
            stream: true
        };

        console.log("[OpenAI API] Forwarding request to OpenAI with streaming enabled...");

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`,
                'User-Agent': 'BrainStudioIntelligence/2.0'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OpenAI API] HTTP Error ${response.status}:`, errorText);
            return res.status(response.status).send(errorText);
        }

        // Set Headers for SSE (Server-Sent Events)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Pipe the fetch response body directly to the Express response
        if (response.body) {
             const reader = response.body.getReader();

             const pump = async () => {
                 try {
                     while (true) {
                         const { done, value } = await reader.read();
                         if (done) break;
                         res.write(value);
                     }
                     res.end();
                 } catch (err) {
                     console.error("[OpenAI API] Stream reading error:", err);
                     res.end();
                 }
             };

             pump();

             // Handle client disconnects to prevent memory leaks
             req.on('close', () => {
                 reader.cancel();
             });

        } else {
             // Fallback for Node environments where response.body isn't a streamable standard ReadableStream
             // In Node 18+, fetch bodies are web streams, but just in case:
             const text = await response.text();
             res.send(text);
        }

    } catch (error) {
        console.error("[OpenAI API] Critical Fetch Error:", error.message);
        res.status(504).json({ error: "Failed to connect to OpenAI API", details: error.message });
    }
});

// --- FIREFLIES GRAPHQL ROUTE (Direct Fetch instead of Proxy for better error handling) ---
app.post('/api/fireflies/graphql', authenticateToken, async (req, res) => {
    try {
        const apiKey = process.env.FIREFLIES_API_KEY;

        if (!apiKey) {
            console.error("[Fireflies API] Missing FIREFLIES_API_KEY in environment");
            return res.status(500).json({ error: "Missing Fireflies API Key configuration" });
        }

        console.log("[Fireflies API] Forwarding GraphQL request...");

        const response = await fetch('https://api.fireflies.ai/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'BrainStudioIntelligence/2.0'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.text(); // Read as text first to handle non-JSON error pages safely

        if (!response.ok) {
            console.error(`[Fireflies API] HTTP Error ${response.status}:`, data);
            return res.status(response.status).send(data);
        }

        try {
            const jsonData = JSON.parse(data);
            if (jsonData.errors) {
                 console.error("[Fireflies API] GraphQL Errors returned:", JSON.stringify(jsonData.errors, null, 2));
            }
            return res.json(jsonData);
        } catch (parseError) {
            console.error("[Fireflies API] Failed to parse response as JSON:", data);
            res.status(502).json({ error: "Invalid JSON response from Fireflies", raw: data });
        }

    } catch (error) {
        console.error("[Fireflies API] Critical Fetch Error:", error.message);
        res.status(504).json({ error: "Failed to connect to Fireflies API", details: error.message });
    }
});


// --- AUTHENTICATION SETUP ---
let credentials;
try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        if (credentials && credentials.private_key) {
            // Sanitize private key: replace literal \n with actual newlines
            credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
        }
        console.log("Credentials parsed and sanitized successfully for project:", credentials?.project_id);
        if (credentials?.client_email) {
            console.log("Service Account Email:", credentials.client_email);
        }
    } else {
        console.error("CRITICAL: GOOGLE_APPLICATION_CREDENTIALS_JSON is missing");
    }
} catch (e) {
    console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON", e);
}

// Use explicit project ID 'brainstudio-intelligence' if not found in credentials
const PROJECT_ID = credentials?.project_id || 'brainstudio-intelligence';
// Force 'global' location explicitly as requested
const LOCATION = 'global';
const MODEL_NAME = process.env.GEMINI_MODEL || process.env.VERTEX_MODEL || "gemini-2.5-pro";

// Engine ID for the App (Brainstudio Intelligence)
const ENGINE_ID = process.env.ENGINE_ID || process.env.DISCOVERY_ENGINE_ENGINE_ID || "brainstudio-intelligence-v_1769659564733";
// Data Store IDs for reference/logs (Brainstudio Unstructured Docs)
const DATA_STORE_ID = process.env.DATA_STORE_ID || "brainstudio-unstructured-v2_1769659124702";
const DATA_STORE_ENTITY_ID = process.env.DATA_STORE_ENTITY_ID || "brainstudio-unstructured-v2_1769659124702_gcs_store";

// Ensure Discovery Engine also uses the global location derived above
const DISCOVERY_ENGINE_LOCATION = process.env.DISCOVERY_ENGINE_LOCATION || LOCATION;
const DISCOVERY_ENGINE_API_ENDPOINT = 'discoveryengine.googleapis.com';

console.log(`[VertexAI] Initializing with Project ID: ${PROJECT_ID || 'UNDEFINED'}, Location: ${LOCATION}, Model: ${MODEL_NAME}`);
console.log(`[DiscoveryEngine] Selected Engine ID: ${ENGINE_ID} (DataStores: ${DATA_STORE_ID}, ${DATA_STORE_ENTITY_ID})`);

// Initialize Clients safely
let vertexAI;
try {
    if (!PROJECT_ID) throw new Error("Project ID is missing from credentials");
    vertexAI = new VertexAI({
        project: PROJECT_ID,
        location: LOCATION,
        apiEndpoint: 'aiplatform.googleapis.com', // Explicitly force global endpoint for Vertex AI
        googleAuthOptions: { credentials }
    });
    console.log("[VertexAI] Client initialized successfully.");
} catch (e) {
    console.error("[VertexAI] Failed to initialize client:", e);
}

// Initialize Discovery Engine Client
let searchClient;
try {
    if (!PROJECT_ID) throw new Error("Project ID is missing from credentials");
    if (!credentials?.client_email || !credentials?.private_key) {
        throw new Error("Missing service account credentials for Discovery Engine client initialization");
    }

    // Explicitly configure JWT auth with the correct scope for Service Account
    const authClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    searchClient = new SearchServiceClient({
        authClient: authClient,
        projectId: PROJECT_ID,
        apiEndpoint: 'discoveryengine.googleapis.com' // Explicitly force global endpoint
    });
    console.log("[DiscoveryEngine] Client initialized successfully.");
} catch (e) {
     console.error("[DiscoveryEngine] Failed to initialize client:", e);
}

// --- LOGGING HELPER ---
const log = (context, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logPrefix = `[${timestamp}] [${context}]`;
    if (data) {
        console.log(`${logPrefix} ${message}`, JSON.stringify(data, null, 2));
    } else {
        console.log(`${logPrefix} ${message}`);
    }
};

const logError = (context, message, error) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [${context}] ERROR: ${message}`, error?.message || error);
    if (error?.stack) console.error(error.stack);
};

// Helper: Find column index by keywords (case-insensitive)
function findColumnIndex(headers, keywords) {
    if (!headers || !Array.isArray(headers)) return -1;
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    return headers.findIndex(h => {
        const header = String(h || "").toLowerCase().trim();
        return lowerKeywords.includes(header);
    });
}

async function fetchClientHealth() {
    log('ClientHealth', `Fetching client health indicators...`);
    const SHEET_ID = process.env.AGENCY_TASKS_SHEET_ID;

    if (!SHEET_ID || !credentials) {
        throw new Error("Missing SHEET_ID or credentials.");
    }

    try {
        const authClient = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SHEET_ID, authClient);
        await doc.loadInfo();

        const sheetTitle = "INDICADORES 2026";
        const sheet = doc.sheetsByTitle[sheetTitle];

        if (!sheet) {
            // DEBUG: List available sheets to help diagnose
            const available = doc.sheetsByIndex.map(s => s.title).join(', ');
            console.error(`[ClientHealth] Sheet "${sheetTitle}" not found. Available: ${available}`);
            throw new Error(`Sheet "${sheetTitle}" not found.`);
        }

        // Load Header Row (Row 3, Index 2)
        // This sets the header row, so getRows() will fetch everything after it.
        await sheet.loadHeaderRow(3);
        const headers = sheet.headerValues;

        log('ClientHealth', `Headers found: ${headers.join(', ')}`);

        // Dynamic Column Detection
        // Default to B (Index 1) and K (Index 10) if not found by name
        let colNameIndex = findColumnIndex(headers, ['cliente', 'nombre', 'marca', 'cuenta']);
        if (colNameIndex < 0) colNameIndex = 1; // Fallback to B

        let colStatusIndex = findColumnIndex(headers, ['estado', 'status', 'estatus', 'semáforo', 'semaforo', 'indicador', 'situación', 'situacion']);
        if (colStatusIndex < 0) colStatusIndex = 10; // Fallback to K

        log('ClientHealth', `Using columns: Name=${colNameIndex}, Status=${colStatusIndex}`);

        const rows = await sheet.getRows();

        const clients = [];

        for (const row of rows) {
             const data = row._rawData || [];

             // Use dynamic indices
             const name = String(data[colNameIndex] || "").trim();
             const statusText = String(data[colStatusIndex] || "").trim();

             if (!name) continue;

             let status = 'neutral';
             let priority = 5; // Default low priority

             const lowerStatus = statusText.toLowerCase();

             // Strict Mapping & Priority:
             // 1. Crítico / Atención / Riesgo / Urgente -> ROJO
             // 2. Al día -> VERDE
             // 3. Servicios -> AMARILLO
             // 4. Sin parrilla -> NARANJA

             // Expanded Critical list based on potential variations
             if (lowerStatus.includes('crítico') || lowerStatus.includes('critico') ||
                 lowerStatus.includes('atención') || lowerStatus.includes('atencion') ||
                 lowerStatus.includes('riesgo') || lowerStatus.includes('urgente') ||
                 lowerStatus.includes('demora') || lowerStatus.includes('retraso')) {
                 status = 'critical';
                 priority = 1;
             } else if (lowerStatus.includes('al día') || lowerStatus.includes('al dia') || lowerStatus.includes('ok')) {
                 status = 'ok';
                 priority = 2;
             } else if (lowerStatus.includes('servicios') || lowerStatus.includes('servicio')) {
                 status = 'services';
                 priority = 3;
             } else if (lowerStatus.includes('sin parrilla') || lowerStatus.includes('no grid')) {
                 status = 'no_grid';
                 priority = 4;
             } else {
                 status = 'neutral';
                 priority = 5;
             }

             clients.push({
                 name: name,
                 status: status,
                 status_text: statusText || "Sin estado", // Raw value for debugging
                 priority: priority,
                 _debug_col_status: colStatusIndex // Debugging
             });
        }

        // Sort strictly by Priority (1 -> 5)
        clients.sort((a, b) => a.priority - b.priority);

        log('ClientHealth', `Found ${clients.length} clients.`);
        return clients;

    } catch (error) {
        logError('ClientHealth', "Error fetching client health", error);
        throw error;
    }
}

// --- WEBSITE AUDIT TOOL (Cheerio) ---
async function analyzeWebsiteDna(url) {
    console.log(`[Audit] Starting DNA analysis for: ${url}`);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Brainstudio-Intelligence-Bot/1.0 (Audit)'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch URL. Status: ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Technical Health
        const title = $('title').text().trim() || "Sin título";
        const description = $('meta[name="description"]').attr('content') ||
                            $('meta[property="og:description"]').attr('content') ||
                            "Sin descripción";

        const h1s = [];
        $('h1').each((i, el) => {
            const text = $(el).text().trim();
            if (text) h1s.push(text);
        });

        // Branding DNA (Hex Colors)
        // Regex to find 6-digit hex codes in the raw HTML (simple scan)
        const colorRegex = /#([0-9a-fA-F]{6})\b/g;
        const colorMatches = html.match(colorRegex) || [];

        // Count frequency to find dominant colors
        const colorCounts = {};
        for (const color of colorMatches) {
            const normalized = color.toLowerCase();
            colorCounts[normalized] = (colorCounts[normalized] || 0) + 1;
        }

        // Sort by frequency and take top 5
        const topColors = Object.entries(colorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([color, count]) => `${color} (${count})`);

        return JSON.stringify({
            url: url,
            status: "Success",
            technical: {
                title: title,
                meta_description: description,
                h1_tags: h1s
            },
            branding_dna: {
                top_colors_detected: topColors.length > 0 ? topColors : ["None detected"]
            }
        }, null, 2);

    } catch (error) {
        console.error(`[Audit] Error analyzing ${url}:`, error.message);
        return JSON.stringify({
            url: url,
            status: "Error",
            error: error.message
        });
    }
}

// --- DISCOVERY ENGINE SEARCH (Cloud Storage / Unstructured) ---
async function searchCloudStorage(query) {
    if (!searchClient) {
        return { text: "Error: Discovery Engine client no está inicializado.", inlineDataParts: [] };
    }

    // HELPER: Desempaquetador de respuestas de Vertex AI (Maneja Protobuf structValue)
    function extractGoogleContent(result) {
      try {
        const derived = result.document?.derivedStructData;
        if (!derived) return "";

        // Accesor seguro para navegar la estructura "fields" -> "structValue" -> "stringValue"
        // Esto funciona tanto si llega anidado como si llega plano (por seguridad)
        const getDeepValue = (obj, key) => {
          if (!obj) return null;
          // Intenta ruta Protobuf
          if (obj.fields && obj.fields[key]) return obj.fields[key];
          // Intenta ruta normal
          return obj[key];
        };

        let combinedText = "";

        // 1. Intentar Extraer Extractive Answers (Prioridad)
        let answers = getDeepValue(derived, 'extractive_answers');
        if (answers) {
          // Manejar array (listValue)
          const list = answers.listValue ? answers.listValue.values : answers;
          if (Array.isArray(list) && list.length > 0) {
             const answerTexts = list.map(item => {
                 const struct = item.structValue ? item.structValue.fields : item;
                 const contentObj = getDeepValue(struct, 'content');
                 return contentObj?.stringValue || contentObj;
             }).filter(t => typeof t === 'string' && t);

             if (answerTexts.length > 0) {
                 combinedText += "Respuestas extractivas:\n" + answerTexts.map(t => `- ${t}`).join("\n") + "\n\n";
             }
          }
        }

        // 2. Fallback: Intentar Extraer Snippets
        let snippets = getDeepValue(derived, 'snippets');
        if (snippets) {
          const list = snippets.listValue ? snippets.listValue.values : snippets;
          if (Array.isArray(list) && list.length > 0) {
              const snippetTexts = list.map(item => {
                 const struct = item.structValue ? item.structValue.fields : item;
                 const snippetObj = getDeepValue(struct, 'snippet');
                 return snippetObj?.stringValue || snippetObj;
              }).filter(t => typeof t === 'string' && t);

              if (snippetTexts.length > 0) {
                 combinedText += "Contexto (Snippets):\n" + snippetTexts.map(t => `...${t}...`).join("\n") + "\n\n";
              }
          }
        }

        return combinedText;

      } catch (e) {
        console.error("Error parseando resultado de Vertex:", e);
      }

      return ""; // Retorna vacío si falla todo
    }

    // Helper to format results
    const formatResults = (results, sourceName) => {
        let combinedContent = `Encontré ${results.length} documentos relevantes en el repositorio (${sourceName}) para "${query}":\n\n`;

        const linkEntries = [];

        for (const result of results) {
            const doc = result.document;
            const derived = doc.derivedStructData || doc.structData || {};

            const title = derived.title || doc.title || doc.name || "Documento sin título";
            const link = derived.link || (derived.sourceLink ? derived.sourceLink : (doc.uri || "Sin enlace"));

            const text = extractGoogleContent(result);

            combinedContent += `--- DOCUMENTO: ${title} ---\n`;
            combinedContent += `Enlace: ${link}\n`;
            if (text) {
                combinedContent += `${text}`;
            } else {
                 combinedContent += " [Contenido no legible automáticamente] \n\n";
            }

            linkEntries.push(`- ${title}: ${link}`);
        }

        if (linkEntries.length) {
            combinedContent += `\n=== ENLACES ===\n${linkEntries.join('\n')}\n`;
        }
        return combinedContent;
    };

    try {
        console.log(`[Discovery] Searching Cloud Storage (Engine: ${ENGINE_ID}) for: ${query}`);

        // 1. Try Searching via Engine ID (App)
        // Updated path to 'default_search' (standard for Search Apps) instead of 'default_config'
        const engineServingConfig = `projects/${PROJECT_ID}/locations/${DISCOVERY_ENGINE_LOCATION}/collections/default_collection/engines/${ENGINE_ID}/servingConfigs/default_search`;

        const engineRequest = {
            servingConfig: engineServingConfig,
            query: query,
            pageSize: 10,
            contentSearchSpec: {
                extractiveContentSpec: { maxExtractiveAnswerCount: 5 },
                snippetSpec: { returnSnippet: true }
            }
        };

        let results = [];
        let usedSource = "Engine";
        let summary = null;

        try {
            const [engineResults, , engineRawResponse] = await searchClient.search(engineRequest, { autoPaginate: false });

            if (engineResults && engineResults.length > 0) {
                results = engineResults;
                summary = engineRawResponse.summary;
                console.log(`[Discovery] Engine returned ${results.length} results.`);
                // DEBUG URGENTE: Ver estructura del primer resultado
                if (results[0]) {
                    console.log("[DEBUG] First result structure:", JSON.stringify(results[0], null, 2));
                }
            } else {
                console.log(`[Discovery] Engine returned 0 results.`);
            }
        } catch (engineError) {
            console.warn(`[Discovery] Engine search failed: ${engineError.message}`);
        }

        // 2. Fallback: Try Searching via Data Store IDs if Engine failed or returned 0
        if (results.length === 0) {
            // Prioritize DATA_STORE_ID (Collection ID) over DATA_STORE_ENTITY_ID (Entity ID)
            // Also include the hardcoded ID as a safety net in case env vars are set incorrectly
            const dataStoreIds = Array.from(
                new Set([
                    DATA_STORE_ID,
                    DATA_STORE_ENTITY_ID,
                    "brainstudio-unstructured-v2_1769659124702"
                ].filter(Boolean))
            );
            console.log(`[Discovery] Engine yielded no results. Starting Data Store fallback. IDs to try: ${dataStoreIds.join(', ')}`);

            for (const dataStoreId of dataStoreIds) {
                console.log(`[Discovery] Attempting fallback to Data Store (${dataStoreId})...`);

                // Note: DataStore path uses 'dataStores' collection. We keep 'default_search' here as it's standard for DataStores.
                const dataStoreServingConfig = `projects/${PROJECT_ID}/locations/${DISCOVERY_ENGINE_LOCATION}/collections/default_collection/dataStores/${dataStoreId}/servingConfigs/default_search`;

                const dataStoreRequest = {
                    servingConfig: dataStoreServingConfig,
                    query: query,
                    pageSize: 10,
                    contentSearchSpec: {
                        extractiveContentSpec: { maxExtractiveAnswerCount: 5 },
                        snippetSpec: { returnSnippet: true }
                    }
                };

                try {
                    const [dsResults, , dsRawResponse] = await searchClient.search(dataStoreRequest, { autoPaginate: false });

                    if (dsResults && dsResults.length > 0) {
                        results = dsResults;
                        summary = dsRawResponse.summary;
                        usedSource = `DataStore:${dataStoreId}`;
                        console.log(`[Discovery] Data Store returned ${results.length} results.`);
                        if (results[0]) {
                             console.log("[DEBUG] First result structure (DataStore):", JSON.stringify(results[0], null, 2));
                        }
                        break;
                    } else {
                        console.log(`[Discovery] Data Store returned 0 results for ${dataStoreId}.`);
                    }
                } catch (dsError) {
                    console.error(`[Discovery] Data Store fallback failed (${dataStoreId}): ${dsError.message}`);
                }
            }
        }

        if (!results || results.length === 0) {
            return {
                text: `No se encontraron documentos relevantes en Cloud Storage para: "${query}" (intentado en Engine y DataStore).`,
                inlineDataParts: []
            };
        }

        const formattedText = formatResults(results, usedSource);
        return { text: formattedText, inlineDataParts: [] };

    } catch (error) {
        console.error("Discovery Search Error:", error);
        if (error?.code === 5 && typeof error?.message === 'string' && error.message.includes('DataStore')) {
            return {
                text:
                    `Error al buscar en Discovery Engine: no se encontró el Engine/DataStore. ` +
                    `Verifica ENGINE_ID, DISCOVERY_ENGINE_LOCATION o credenciales.`,
                inlineDataParts: []
            };
        }
        return { text: `Error al buscar en Discovery Engine: ${error.message}`, inlineDataParts: [] };
    }
}

const systemPrompt = `Eres Bria, la Copywriter Senior y Analista de Datos experta de Brainstudio (Brain OS).
Tu misión es transformar datos crudos, documentos y lineamientos de marca en contenido que convierta, operando con omnisciencia sobre los clientes de la agencia.

1. PROTOCOLO DE CONSCIENCIA DE PLATAFORMA (CLIENTES)
Estás conectada a la base de datos de la agencia.

INYECCIÓN DE CONTEXTO OBLIGATORIA: SIEMPRE que el usuario te pida crear contenido, analizar a un cliente o proponer ideas para una marca, TU PRIMER PASO ABSOLUTO DEBE SER ejecutar la herramienta get_client_guidelines.
Nunca asumas el tono o el idioma de un cliente sin antes consultar esta herramienta. Aplica estas reglas de forma estricta en todo lo que redactes.

2. REGLAS GLOBALES DE REDACCIÓN Y COPYWRITING
Estas reglas son el ADN de Brainstudio y aplican para TODOS los clientes, sumadas a sus reglas específicas:
- Cero Redundancia: Sé directa. Elimina el "fluff". Si puedes decirlo en 5 palabras, no uses 10. Prohibidos los muros de texto.
- Hook y CTA Siempre: Todo copy DEBE tener un "Gancho" atrapante en la primera línea y un Call To Action (CTA) claro al final.
- Formatos Limpios: Usa párrafos muy cortos (1-2 líneas). Usa el mínimo de emojis posible (1 o 2 por post máximo).
- Guiones de Video: Para Reels o TikTok, el guion debe ser hiper-directo, visual y al grano.
- Formato de Parrilla Obligatorio: Cuando se te pida una parrilla de contenidos, entrégala SIEMPRE en formato de tabla Markdown con las siguientes columnas exactas: | Fecha | Pilar de Contenido | Gancho (Hook) | Texto del Post (Copy) | Sugerencia Visual/Video | CTA |.

3. PROTOCOLO DE ANÁLISIS DE DATOS Y DOCUMENTOS (STORAGE)
Tienes acceso a buscar y leer documentos (PDFs, CSVs) en nuestro Storage a traves de la herramienta search_cloud_storage.
- Análisis de Métricas (CSVs): Cuando leas un reporte (ej. Meta Ads), tu objetivo es matemático y estratégico. Encuentra patrones: ¿Qué tipo de ganchos generaron más CTR? ¿Qué formato funcionó mejor? Aplica estos hallazgos inmediatamente al crear nuevo contenido.
- El "So What?": Nunca des un dato sin explicar su impacto. (MAL: "El post tuvo más clics". BIEN: "El post con la palabra 'Travel-proof' aumentó el CTR un 40%; usaremos este ángulo de dolor en la nueva parrilla").
- Corrección Fonética: Si el usuario escribe mal un cliente (ej. "trupik"), corrígelo mentalmente a "TruPeak" antes de buscar en el Storage.

4. PROTOCOLO DE AUDITORÍA WEB
Usa la herramienta analyze_website_dna cuando se te pida revisar una web.
- NO muestres el JSON crudo en tu respuesta.
- Redacta un informe evaluando la Salud Técnica (SEO, H1s) y el ADN de Marca (colores, emociones).
- Conecta los Puntos: Si la web dice una cosa y los documentos internos (PDFs) dicen otra, señala la incoherencia. Tu valor está en la verdad, no en la complacencia.

5. PROCESO DE PENSAMIENTO (CHAIN OF THOUGHT)
Antes de responder, DEBES realizar un análisis interno profundo y estructurado usando la etiqueta <thinking>. No hables con el usuario aquí, organiza tus ideas:
<thinking>
- Análisis de intención
- Análisis de datos
- Estrategia de respuesta
</thinking>
[Respuesta Final]

6. REGLAS DE FORMATO VISUAL ESTRICTAS
- Prohibido usar comillas invertidas/backticks (\`) en el cuerpo del texto para resaltar palabras o nombres de archivos. Usa negritas para resaltar marcas o documentos.
- Usa código (\`\`\`) ÚNICAMENTE para lenguajes de programación reales (JSON, Python, etc.).
- Usa jerarquía Markdown (##, ###, listas) para estructurar la lectura.

7. PROTOCOLO DE SUGERENCIAS PROACTIVAS (SKILLS)
Al finalizar CADA respuesta, actúa como facilitadora de la plataforma. Genera 3 sugerencias de acciones que el usuario podría ejecutar a continuación, basándote en el contexto de la conversación.
La ÚNICA excepción a la regla de los backticks es esta sección. Aquí SÍ DEBES usar el formato de código inline para que visualmente parezcan botones en la interfaz.
Genera el texto en Español neutro.

Formato de Salida Obligatorio:
💡 **Sugerencias:**
* \`[🔍 Auditar sitio web de X]\`
* \`[✍️ Generar ideas para Reels de X]\`
* \`[📄 Analizar reporte de métricas de X]\``;

const tools = [
    {
        functionDeclarations: [
            {
                name: "get_client_guidelines",
                description: "Obtiene las reglas de redacción (brand guidelines y ai_instructions) de un cliente específico directamente desde la base de datos. DEBE llamarse SIEMPRE antes de generar contenido para asegurar el tono de la marca.",
                parameters: {
                    type: FunctionDeclarationSchemaType.OBJECT,
                    properties: {
                        identifier: {
                            type: FunctionDeclarationSchemaType.STRING,
                            description: "Nombre de la marca o slug del cliente (ej. 'TruPeak' o 'trupeak')."
                        }
                    },
                    required: ["identifier"]
                }
            },
            {
                name: "search_cloud_storage",
                description: "Busca en el 'cerebro' de Brainstudio (Google Cloud Storage) documentos no estructurados (PDFs, CSVs, reportes de métricas) de clientes. Usa esto para consultas sobre información interna, manuales o para analizar resultados de campañas pasadas.",
                parameters: {
                    type: FunctionDeclarationSchemaType.OBJECT,
                    properties: {
                        query: {
                            type: FunctionDeclarationSchemaType.STRING,
                            description: "Término de búsqueda (ej. 'Estrategia Sunpartners', 'Métricas Meta TruPeak')."
                        }
                    },
                    required: ["query"]
                }
            },
            {
                name: "analyze_website_dna",
                description: "Scrapes a website to extract branding DNA (colors, fonts) and technical health (H1, meta).",
                parameters: {
                    type: FunctionDeclarationSchemaType.OBJECT,
                    properties: {
                        url: {
                            type: FunctionDeclarationSchemaType.STRING,
                            description: "The full URL to audit (e.g. https://artyzza.com)"
                        }
                    },
                    required: ["url"]
                }
            },
            {
                name: "fetch_agency_tasks",
                description: "Connects to the Agency Google Sheet to retrieve pending tasks filtered by responsible person.",
                parameters: {
                    type: FunctionDeclarationSchemaType.OBJECT,
                    properties: {
                        responsible_name: {
                            type: FunctionDeclarationSchemaType.STRING,
                            description: "Name of the responsible person (default: Rodny)."
                        }
                    },
                    required: []
                }
            }
        ]
    }
];

function extractTextFromParts(parts = []) {
    return parts
        .filter(part => typeof part.text === 'string')
        .map(part => part.text)
        .join('');
}

function getChunkParts(chunk) {
    return chunk?.candidates?.[0]?.content?.parts || [];
}

function isVertexRateLimitError(error) {
    const code = error?.code || error?.status || error?.response?.status;
    if (code === 429) {
        return true;
    }
    const message = error?.message || '';
    return message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
}

async function sendMessageStreamWithRetry(chat, payload, maxAttempts = 3) {
    let attempt = 0;
    let lastError;
    while (attempt < maxAttempts) {
        attempt += 1;
        try {
            return await chat.sendMessageStream(payload);
        } catch (error) {
            lastError = error;
            if (!isVertexRateLimitError(error) || attempt >= maxAttempts) {
                throw error;
            }
            const delayMs = 500 * Math.pow(2, attempt - 1);
            console.warn(`[VertexAI] Rate limited. Retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastError;
}

/**
 * Filter text to suppress <thinking>...</thinking> blocks.
 * Maintains state across chunks to handle split tags.
 */
function createThinkingFilter() {
    let buffer = "";
    let insideThinking = false;

    // Process a chunk of text
    // Returns: The text to be emitted to the user
    return (chunkText) => {
        if (!chunkText) return "";

        let output = "";
        let scanIndex = 0;

        // Append new text to any existing buffer
        const fullText = buffer + chunkText;
        buffer = ""; // consumed

        const len = fullText.length;

        while (scanIndex < len) {
            if (insideThinking) {
                // Look for closing tag </thinking>
                const closeTagIndex = fullText.indexOf("</thinking>", scanIndex);
                if (closeTagIndex !== -1) {
                    // Found closing tag. Skip past it.
                    scanIndex = closeTagIndex + "</thinking>".length;
                    insideThinking = false;
                } else {
                    // No closing tag yet.
                    // Check if we have a partial closing tag at the end
                    // </thinking> is 11 chars.
                    const tail = fullText.slice(scanIndex);
                    // Minimal check: if the tail matches the beginning of the tag
                    let match = false;
                    for (let i = 1; i < 11; i++) {
                         if ("</thinking>".startsWith(tail.slice(-i))) {
                             // potential partial match, keep in buffer
                             buffer = tail;
                             match = true;
                             break;
                         }
                    }
                    if (!match) {
                        // The whole tail is inside thinking, discard it?
                        // Actually, we just discard everything since we are inside thinking
                        // and didn't find the end.
                    }
                    // Since we are inside thinking, we consume everything remaining
                    // effectively suppressing it.
                    // BUT: if there is a partial tag at the end, we technically "buffer" it?
                    // No need to buffer inside thinking mode, unless we suspect the tag is split.
                    // Wait, if we are inside thinking, we output NOTHING until we find </thinking>.
                    // So we just consume scanIndex to end.
                    scanIndex = len;
                }
            } else {
                // Not inside thinking. Look for opening tag <thinking>
                const openTagIndex = fullText.indexOf("<thinking>", scanIndex);

                if (openTagIndex !== -1) {
                    // Found opening tag.
                    // Emit everything before it.
                    output += fullText.slice(scanIndex, openTagIndex);
                    // Switch state
                    insideThinking = true;
                    // Move past the tag
                    scanIndex = openTagIndex + "<thinking>".length;
                } else {
                    // No opening tag found.
                    // Need to check for partial opening tag at the end
                    // <thinking> is 10 chars.
                    let partialFound = false;
                    // We check if the end of string matches start of <thinking>
                    // Only need to check if length is sufficient or if it's very short
                    const remaining = fullText.slice(scanIndex);

                    // Optimization: check from end
                    for (let i = 1; i < 10; i++) {
                        if (remaining.length >= i && "<thinking>".startsWith(remaining.slice(-i))) {
                             // Found partial match at the very end
                             // Output everything up to that partial match
                             output += remaining.slice(0, remaining.length - i);
                             buffer = remaining.slice(-i);
                             partialFound = true;
                             break;
                        }
                    }

                    if (!partialFound) {
                        // Safe to emit all
                        output += remaining;
                    }
                    scanIndex = len; // Done
                }
            }
        }

        return output;
    };
}


app.get('/api/calendar/upcoming', async (req, res) => {
    try {
        console.log("[API] /api/calendar/upcoming called");
        const events = await getUpcomingEvents();
        return res.json(events);
    } catch (error) {
        console.error("[API] /api/calendar/upcoming error:", error);
        res.status(500).json({
            error: "Failed to fetch calendar events",
            details: error.message
        });
    }
});


app.post('/api/db/clients', async (req, res) => {
    try {
        console.log("[API] /api/db/clients (POST) called");
        const client = await createClient(req.body);
        return res.json(client);
    } catch (error) {
        console.error("[API] /api/db/clients (POST) error:", error);
        res.status(500).json({ error: "Failed to create client", details: error.message });
    }
});

// Handle PATCH /api/clients/:id (Update Client Name/Slug)
app.patch('/api/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug } = req.body;
        log('API', `/api/clients/${id} (PATCH) called`);

        const updatedClient = await prisma.client.update({
            where: { id },
            data: { name, slug }
        });

        return res.json(updatedClient);
    } catch (error) {
        logError('API', `/api/clients/${req.params.id} (PATCH) error`, error);
        return res.status(500).json({ error: "Failed to update client", details: error.message });
    }
});

// --- NATIVE TASKS ENDPOINTS (Fase 1 Prisma Kanban) ---

app.get('/api/metrics/tasks', async (req, res) => {
    try {
        log('API', 'Fetching dashboard task metrics');
        const metrics = await getDashboardMetrics();
        return res.json(metrics);
    } catch (error) {
        logError('API', 'Failed to fetch dashboard metrics', error);
        return res.status(500).json({ error: "Failed to fetch metrics", details: error.message });
    }
});

app.get('/api/metrics/quality-streak', async (req, res) => {
    try {
        log('API', 'Fetching quality streak metrics');
        const streak = await getQualityStreak();
        return res.json(streak);
    } catch (error) {
        logError('API', 'Failed to fetch quality streak', error);
        return res.status(500).json({ error: "Failed to fetch quality streak", details: error.message });
    }
});

app.get('/api/tasks/completed', async (req, res) => {
    try {
        const { date } = req.query;
        log('API', `Fetching completed native tasks for date: ${date || 'today'}`);
        const tasks = await getCompletedTasks(date);
        return res.json(tasks);
    } catch (error) {
        logError('API', 'Failed to fetch completed native tasks', error);
        return res.status(500).json({ error: "Failed to fetch completed tasks", details: error.message });
    }
});

app.get('/api/tasks', async (req, res) => {
    try {
        const { clientId } = req.query;
        log('API', `Fetching native tasks ${clientId ? `for client: ${clientId}` : 'globally'}`);
        const tasks = await getTasks(clientId);
        return res.json(tasks);
    } catch (error) {
        logError('API', "Failed to fetch native tasks", error);
        return res.status(500).json({ error: "Failed to fetch native tasks", details: error.message });
    }
});

app.get('/api/debug/task-status-count', async (req, res) => {
    try {
        const statuses = ['PENDIENTE', 'EN_CURSO', 'REALIZADA', 'DEVUELTA'];
        const counts = {};

        for (const status of statuses) {
            counts[status] = await prisma.task.count({ where: { status } });
        }

        console.log('[Audit] Task Status Counts:', JSON.stringify(counts, null, 2));
        return res.json(counts);
    } catch (error) {
        logError('API', "Debug status count failed", error);
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
    try {
        log('API', `Creating new native task`);
        const taskData = {
            ...req.body,
            creatorId: req.user.userId
        };
        if (!taskData.title || !taskData.clientId) {
            return res.status(400).json({ error: "Missing required fields (title, clientId)" });
        }
        const task = await createTask(taskData);

        // --- Notificaciones iniciales de Prioridad o Especial ---
        if (task.assigneeId && (task.isPriority || task.isSpecial)) {
            try {
                const assigneeTeamMember = await prisma.teamMember.findUnique({
                    where: { id: task.assigneeId },
                    select: { email: true }
                });

                if (assigneeTeamMember && assigneeTeamMember.email) {
                    const assigneeUser = await prisma.user.findUnique({
                        where: { email: assigneeTeamMember.email.trim().toLowerCase() },
                        select: { id: true }
                    });

                    if (assigneeUser && assigneeUser.id !== req.user.userId) {
                        let message = "";
                        if (task.isPriority && task.isSpecial) {
                            message = `Se te ha asignado una tarea PRIORITARIA y ESPECIAL: ${task.title}`;
                        } else if (task.isPriority) {
                            message = `Se te ha asignado una tarea PRIORITARIA: ${task.title}`;
                        } else {
                            message = `Se te ha asignado una tarea ESPECIAL: ${task.title}`;
                        }

                        await createNotification({
                            userId: assigneeUser.id,
                            message,
                            type: 'TASK_ASSIGNED',
                            relatedId: task.id
                        });
                    }
                }
            } catch (err) {
                console.error("Error sending initial task notification:", err);
            }
        }

        return res.status(201).json(task);
    } catch (error) {
        logError('API', "Failed to create native task", error);
        return res.status(500).json({ error: "Failed to create native task", details: error.message });
    }
});

app.patch('/api/tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        log('API', `Updating native task: ${taskId}`, req.body);
        const updatedTask = await updateTask(taskId, req.body, req.user?.userId);
        return res.json(updatedTask);
    } catch (error) {
        logError('API', `Failed to update native task ${req.params.taskId}`, error);
        return res.status(500).json({ error: "Failed to update native task", details: error.message });
    }
});

app.delete('/api/tasks/:taskId', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { reason } = req.body; // Deletion reason now expected in body
        const deletedById = req.user?.userId;

        if (!reason) {
            return res.status(400).json({ error: "Missing deletion reason" });
        }

        log('API', `Hard deleting native task with audit: ${taskId}`, { reason });
        await auditAndDeleteTask(taskId, reason, deletedById);
        return res.json({ success: true });
    } catch (error) {
        logError('API', `Failed to delete native task ${req.params.taskId}`, error);
        return res.status(500).json({ error: "Failed to delete native task", details: error.message });
    }
});

// --- CLIENT TASKS ENDPOINTS ---

app.get('/api/db/clients/:clientId/tasks', async (req, res) => {
    try {
        const { clientId } = req.params;
        console.log(`[API] Fetching tasks for client: ${clientId}`);
        const tasks = await getClientTasks(clientId);
        return res.json(tasks);
    } catch (error) {
        console.error("Error fetching tasks:", error);
        return res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
    }
});

app.post('/api/db/clients/:clientId/tasks', async (req, res) => {
    try {
        const { clientId } = req.params;
        console.log(`[API] Creating task for client: ${clientId}`);
        const { text, dueDate, assigneeId } = req.body;
        if (!text) return res.status(400).json({ error: "Missing text" });

        const task = await createClientTask({ clientId, text, dueDate, assigneeId });
        return res.json(task);
    } catch (error) {
        console.error("Error creating task:", error);
        return res.status(500).json({ error: "Failed to create task", details: error.message });
    }
});

app.patch('/api/db/tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        // Pass the entire body to support updating multiple fields (completed, dueDate, assigneeId)
        const task = await updateClientTaskStatus(taskId, req.body);
        return res.json(task);
    } catch (error) {
        console.error("Error updating task:", error);
        return res.status(500).json({ error: "Failed to update task", details: error.message });
    }
});

app.delete('/api/db/tasks/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        await deleteTask(taskId);
        return res.json({ success: true });
    } catch (error) {
        console.error("Error deleting task:", error);
        return res.status(500).json({ error: "Failed to delete task", details: error.message });
    }
});

// --- CLIENT LINKS ENDPOINTS ---

app.get('/api/db/clients/:clientId/links', async (req, res) => {
    const { clientId } = req.params;
    try {
        console.log(`[API] Fetching links for client: ${clientId}`);
        const links = await getClientLinks(clientId);
        return res.json(links);
    } catch (error) {
        console.error("[API] Failed to fetch links:", error);
        res.status(500).json({ error: "Error al obtener enlaces" });
    }
});

app.post('/api/db/clients/:clientId/links', async (req, res) => {
    const { clientId } = req.params;
    const { title, url } = req.body;

    if (!title || !url) {
        return res.status(400).json({ error: "Faltan campos requeridos (title, url)" });
    }

    try {
        console.log(`[API] Adding link for client: ${clientId}`);
        const link = await addClientLink(clientId, title, url);
        return res.json(link);
    } catch (error) {
        console.error("[API] Failed to add link:", error);
        if (error.message === "MAX_LINKS_REACHED") {
            return res.status(400).json({ error: "Límite de 5 enlaces alcanzado." });
        }
        res.status(500).json({ error: "Error al crear enlace" });
    }
});

app.delete('/api/db/links/:linkId', async (req, res) => {
    const { linkId } = req.params;
    try {
        console.log(`[API] Deleting link: ${linkId}`);
        await removeClientLink(linkId);
        return res.json({ success: true });
    } catch (error) {
        console.error("[API] Failed to delete link:", error);
        res.status(500).json({ error: "Error al eliminar enlace" });
    }
});

const handleClientsHealthRequest = async (req, res, routeLabel) => {
    try {
        console.log(`[API] ${routeLabel} called`);
        const clients = await fetchClientHealth();
        return res.json(clients);
    } catch (error) {
        console.error(`[API] ${routeLabel} error:`, error);
        return res.status(500).json({
            error: "Failed to fetch client health indicators",
            details: error.message
        });
    }
};


// Handle GET /api/clients (Health Indicators)
app.get('/api/clients', async (req, res) => handleClientsHealthRequest(req, res, '/api/clients'));
app.get('/api/clients/health', async (req, res) => handleClientsHealthRequest(req, res, '/api/clients/health'));

// Handle POST /api/clients (Create Client in DB) - Matches user request
app.post('/api/clients', async (req, res) => {
    try {
        log('API', "/api/clients (POST) called");
        const client = await createClient(req.body);
        return res.json(client);
    } catch (error) {
        logError('API', "/api/clients (POST) error", error);
        return res.status(500).json({ error: "Failed to create client", details: error.message });
    }
});

// --- GLOBAL ANNOUNCEMENTS ENDPOINTS (Dashboard) ---

app.get('/api/global-announcements', async (req, res) => {
    try {
        log('API', "Fetching global announcements");
        const announcements = await getGlobalAnnouncements();
        return res.json(announcements);
    } catch (error) {
        logError('API', "Failed to fetch global announcements", error);
        return res.status(500).json({ error: "Failed to fetch global announcements", details: error.message });
    }
});

app.post('/api/global-announcements', authenticateToken, async (req, res) => {
    const { content, type } = req.body;
    if (!content) return res.status(400).json({ error: "Missing content" });

    try {
        log('API', "Creating global announcement");
        const announcement = await createGlobalAnnouncement({ content, type });

        // --- MENTIONS LOGIC ---
        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const mentionedUserIds = new Set();
        while ((match = mentionRegex.exec(content)) !== null) {
            mentionedUserIds.add(match[2]);
        }

        for (const mentionedId of mentionedUserIds) {
            const targetTeamMember = await prisma.teamMember.findUnique({ where: { id: mentionedId } });
            if (targetTeamMember && targetTeamMember.email) {
                const targetUser = await prisma.user.findUnique({
                    where: { email: targetTeamMember.email.trim().toLowerCase() }
                });
                if (targetUser && targetUser.id !== req.user.userId) {
                    await createNotification({
                        userId: targetUser.id,
                        message: `${req.user.name} te mencionó en un anuncio global`,
                        type: 'ANNOUNCEMENT_GLOBAL',
                        relatedId: announcement.id
                    });
                }
            }
        }

        return res.json(announcement);
    } catch (error) {
        logError('API', "Failed to create global announcement", error);
        return res.status(500).json({ error: "Failed to create global announcement", details: error.message });
    }
});

app.delete('/api/global-announcements/:id', async (req, res) => {
    const { id } = req.params;
    try {
        log('API', `Deleting global announcement: ${id}`);
        await deleteGlobalAnnouncement(id);
        return res.json({ success: true });
    } catch (error) {
        logError('API', "Failed to delete global announcement", error);
        return res.status(500).json({ error: "Failed to delete global announcement", details: error.message });
    }
});

// --- CLIENT ANNOUNCEMENTS ENDPOINTS ---

app.get('/api/clients/:clientId/announcements', async (req, res) => {
    const { clientId } = req.params;
    try {
        log('API', `Fetching announcements for client: ${clientId}`);
        const announcements = await getClientAnnouncements(clientId);
        return res.json(announcements);
    } catch (error) {
        logError('API', "Failed to fetch client announcements", error);
        return res.status(500).json({ error: "Failed to fetch announcements", details: error.message });
    }
});

app.post('/api/clients/:clientId/announcements', authenticateToken, async (req, res) => {
    const { clientId } = req.params;
    const { content, type } = req.body;

    if (!content) {
        return res.status(400).json({ error: "Missing content" });
    }

    try {
        log('API', `Creating announcement for client: ${clientId}`);
        const announcement = await createClientAnnouncement({ clientId, content, type });

        // --- MENTIONS LOGIC ---
        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const mentionedUserIds = new Set();
        while ((match = mentionRegex.exec(content)) !== null) {
            mentionedUserIds.add(match[2]);
        }

        for (const mentionedId of mentionedUserIds) {
            const targetTeamMember = await prisma.teamMember.findUnique({ where: { id: mentionedId } });
            if (targetTeamMember && targetTeamMember.email) {
                const targetUser = await prisma.user.findUnique({
                    where: { email: targetTeamMember.email.trim().toLowerCase() }
                });
                if (targetUser && targetUser.id !== req.user.userId) {
                    const client = await prisma.client.findUnique({ where: { id: clientId } });
                    const clientName = client ? client.name : "un cliente";

                    await createNotification({
                        userId: targetUser.id,
                        message: `${req.user.name} te mencionó en un anuncio de ${clientName}`,
                        type: 'ANNOUNCEMENT_CLIENT',
                        relatedId: clientId
                    });
                }
            }
        }

        return res.json(announcement);
    } catch (error) {
        logError('API', "Failed to create client announcement", error);
        return res.status(500).json({ error: "Failed to create announcement", details: error.message });
    }
});

// --- FLOW ENDPOINTS (Immutable Chat) ---

app.get('/api/clients/:clientId/flow', authenticateToken, async (req, res) => {
    const { clientId } = req.params;
    try {
        log('API', `Fetching flow messages for client: ${clientId}`);
        const messages = await getFlowMessages(clientId);
        return res.json(messages);
    } catch (error) {
        logError('API', "Failed to fetch flow messages", error);
        return res.status(500).json({ error: "Failed to fetch messages", details: error.message });
    }
});

app.post('/api/clients/:clientId/flow', authenticateToken, async (req, res) => {
    const { clientId } = req.params;
    const { content } = req.body;
    const userEmail = req.user.email;

    if (!content) {
        return res.status(400).json({ error: "Missing content" });
    }

    try {
        // Resolve authorId (TeamMember ID) from the logged-in user's email
        const teamMember = await prisma.teamMember.findFirst({
            where: { email: { equals: userEmail, mode: 'insensitive' } }
        });

        if (!teamMember) {
            return res.status(403).json({ error: "Authenticated user is not a registered TeamMember" });
        }

        const authorId = teamMember.id;

        log('API', `Creating flow message for client: ${clientId} by teamMember: ${authorId} (${userEmail})`);
        const message = await createFlowMessage({ clientId, content, authorId });

        // --- MENTIONS LOGIC FOR FLOW ---
        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const mentionedUserIds = new Set();

        while ((match = mentionRegex.exec(content)) !== null) {
            mentionedUserIds.add(match[2]);
        }

        for (const mentionedId of mentionedUserIds) {
            // Find the User associated with the mentioned TeamMember.
            const targetTeamMember = await prisma.teamMember.findUnique({ where: { id: mentionedId } });
            if (targetTeamMember && targetTeamMember.email) {
                const targetUser = await prisma.user.findUnique({
                    where: { email: targetTeamMember.email.trim().toLowerCase() }
                });

                if (targetUser) {
                     // Skip self-mention (compare User IDs)
                     if (targetUser.id === req.user.userId) continue;

                     // Fetch client name to avoid showing UUID in notification
                     const client = await prisma.client.findUnique({ where: { id: clientId } });
                     const clientDisplay = client ? client.name : "un cliente";

                     await createNotification({
                        userId: targetUser.id,
                        message: `${req.user.name} te mencionó en el chat de ${clientDisplay}`,
                        type: 'CAMPFIRE_MENTION', // Maintain type for compatibility or rename to FLOW_MENTION
                        relatedId: clientId // Store clientId for easier navigation in frontend
                    });
                }
            }
        }

        return res.json(message);
    } catch (error) {
        logError('API', "Failed to create flow message", error);
        return res.status(500).json({ error: "Failed to create message", details: error.message });
    }
});

// --- GENERAL CHAT ENDPOINTS ---

app.get('/api/general-chat', authenticateToken, async (req, res) => {
    try {
        log('API', "Fetching general chat messages");
        const messages = await getGeneralChatMessages();
        return res.json(messages);
    } catch (error) {
        logError('API', "Failed to fetch general chat messages", error);
        return res.status(500).json({ error: "Failed to fetch messages", details: error.message });
    }
});

app.post('/api/general-chat', authenticateToken, async (req, res) => {
    const { content } = req.body;
    const authorId = req.user.userId;

    if (!content) {
        return res.status(400).json({ error: "Missing content" });
    }

    try {
        log('API', `Creating general chat message by user: ${authorId}`);
        const message = await createGeneralChatMessage({ content, authorId });

        // --- MENTIONS LOGIC ---
        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        const mentionedUserIds = new Set();

        while ((match = mentionRegex.exec(content)) !== null) {
            mentionedUserIds.add(match[2]);
        }

        for (const mentionedId of mentionedUserIds) {
            // Mentions in the UI always use TeamMember IDs for consistency.
            // We must resolve each TeamMember ID to its corresponding User ID.
            const targetTeamMember = await prisma.teamMember.findUnique({ where: { id: mentionedId } });

            if (targetTeamMember && targetTeamMember.email) {
                const targetUser = await prisma.user.findUnique({
                    where: { email: targetTeamMember.email.trim().toLowerCase() }
                });

                if (targetUser) {
                    // Skip self-mention (compare User IDs)
                    if (targetUser.id === authorId) continue;

                    await createNotification({
                        userId: targetUser.id,
                        message: `${req.user.name} te mencionó en el chat general`,
                        type: 'GENERAL_CHAT_MENTION',
                        relatedId: message.id
                    });
                }
            }
        }

        return res.json(message);
    } catch (error) {
        logError('API', "Failed to create general chat message", error);
        return res.status(500).json({ error: "Failed to create message", details: error.message });
    }
});

// --- NOTIFICATIONS ENDPOINTS ---

app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        const notifications = await getNotifications(req.user.userId);
        return res.json(notifications);
    } catch (error) {
        return res.status(500).json({ error: "Failed to fetch notifications", details: error.message });
    }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        const count = await getUnreadNotificationCount(req.user.userId);
        return res.json({ count });
    } catch (error) {
        return res.status(500).json({ error: "Failed to fetch unread count", details: error.message });
    }
});

app.post('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const { userId, message, type, relatedId } = req.body;
        if (!userId || !message) return res.status(400).json({ error: "Missing fields" });

        const notification = await createNotification({ userId, message, type, relatedId });
        return res.json(notification);
    } catch (error) {
        return res.status(500).json({ error: "Failed to create notification", details: error.message });
    }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await markAsRead(req.params.id);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: "Failed to mark as read", details: error.message });
    }
});

app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await markAllNotificationsAsRead(req.user.userId);
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: "Failed to mark all as read", details: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages } = req.body;
        console.log(`[API] /api/chat received request with ${messages?.length || 0} messages.`);

        if (!credentials || !PROJECT_ID) {
            console.error("CRITICAL: Missing Google credentials or project ID for Vertex AI.");
            res.status(500);
            res.write("Error: Missing Google credentials or project ID for Vertex AI.");
            return res.end();
        }

        // Explicitly set headers at the start to prevent CORB blocking errors
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // We will enable chunked encoding implicitly by writing to the stream,
        // but setting it explicit helps some proxies.
        res.setHeader('Transfer-Encoding', 'chunked');

        if (!messages || !Array.isArray(messages)) {
            console.error("Invalid request body:", req.body);
            // Even validation errors should return text to be visible in browser
            res.status(400);
            res.write("Error: Invalid messages format");
            return res.end();
        }

        let generativeModel;
        try {
            generativeModel = vertexAI.getGenerativeModel({
                model: MODEL_NAME,
                systemInstruction: {
                    role: "system",
                    parts: [{ text: systemPrompt }]
                },
                tools: tools
            });
        } catch (initError) {
            console.error("CRITICAL: Failed to initialize Vertex AI Generative Model with Tools:", initError);
            throw initError; // Re-throw to be caught by the outer catch block
        }

        const history = messages
            .filter(msg => msg.role !== 'system')
            .slice(0, -1)
            .map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

        const lastMessageContent = messages[messages.length - 1]?.content;
        if (typeof lastMessageContent !== 'string' || !lastMessageContent.trim()) {
            console.error("Invalid last message content:", lastMessageContent);
            res.status(400);
            res.write("Error: Missing or invalid last message content.");
            return res.end();
        }

        // --- SKILLS ROUTING (Context Injection) ---
        let injectedSkillText = "";
        const lowerMessage = lastMessageContent.toLowerCase();

        // Check for Social Media Keywords
        if (/parrilla|redes sociales|post|carrusel|instagram|tiktok|reel/i.test(lowerMessage)) {
            try {
                // We combine our internal framework with Corey's social-content skill
                const socialSkillPath1 = path.join(__dirname, 'src', 'skills', 'Skill_Social_Copy.md');
                const socialSkillPath2 = path.join(__dirname, 'src', 'skills', 'Skill_Social_Content.md');

                let combinedSocialSkill = "";
                if (fs.existsSync(socialSkillPath1)) {
                    combinedSocialSkill += fs.readFileSync(socialSkillPath1, 'utf8') + "\n\n";
                }
                if (fs.existsSync(socialSkillPath2)) {
                    combinedSocialSkill += "--- NORMAS DE SOCIAL CONTENT (COREY HAINES) ---\n" + fs.readFileSync(socialSkillPath2, 'utf8');
                }

                if (combinedSocialSkill) {
                    injectedSkillText += "\n\n### HABILIDAD INYECTADA: SOCIAL MEDIA EXPERT ###\n" + combinedSocialSkill;
                    console.log("[Skills Router] Injected Social Media Skills");
                }
            } catch (err) {
                console.error("[Skills Router] Error reading Social Skills:", err);
            }
        }
        // Check for Web/CRO Keywords
        else if (/landing page|página web|página de precios|email sequence|página de ventas/i.test(lowerMessage)) {
             try {
                const croSkillPath = path.join(__dirname, 'src', 'skills', 'Skill_Web_CRO.md');
                if (fs.existsSync(croSkillPath)) {
                    injectedSkillText += "\n\n### HABILIDAD INYECTADA: WEB CRO COPYWRITING ###\n" + fs.readFileSync(croSkillPath, 'utf8');
                    console.log("[Skills Router] Injected Skill_Web_CRO.md");
                }
            } catch (err) {
                console.error("[Skills Router] Error reading CRO Skill:", err);
            }
        }
        // Check for Ad Creative Keywords
        else if (/anuncios|pauta|meta ads|facebook ads|campañas|copy para pauta/i.test(lowerMessage)) {
            try {
               const adSkillPath = path.join(__dirname, 'src', 'skills', 'Skill_Ad_Creative.md');
               if (fs.existsSync(adSkillPath)) {
                   injectedSkillText += "\n\n### HABILIDAD INYECTADA: AD CREATIVE EXPERT ###\n" + fs.readFileSync(adSkillPath, 'utf8');
                   console.log("[Skills Router] Injected Skill_Ad_Creative.md");
               }
           } catch (err) {
               console.error("[Skills Router] Error reading Ad Creative Skill:", err);
           }
        }

        // NON-EXCLUSIVE MODIFIER: Marketing Psychology
        if (/persuasivo|sesgos|psicología de ventas/i.test(lowerMessage)) {
            try {
                const psychSkillPath = path.join(__dirname, 'src', 'skills', 'Skill_Marketing_Psychology.md');
                if (fs.existsSync(psychSkillPath)) {
                    injectedSkillText += "\n\n### MODIFICADOR INYECTADO: MARKETING PSYCHOLOGY ###\n" + fs.readFileSync(psychSkillPath, 'utf8');
                    console.log("[Skills Router] Injected Skill_Marketing_Psychology.md");
                }
            } catch (err) {
                console.error("[Skills Router] Error reading Marketing Psychology Skill:", err);
            }
        }

        // We must re-instantiate the model to pass the dynamically extended system instruction
        const finalSystemPrompt = systemPrompt + injectedSkillText;

        let dynamicGenerativeModel;
        try {
            dynamicGenerativeModel = vertexAI.getGenerativeModel({
                model: MODEL_NAME,
                systemInstruction: {
                    role: "system",
                    parts: [{ text: finalSystemPrompt }]
                },
                tools: tools
            });
        } catch (initError) {
            console.error("CRITICAL: Failed to dynamically initialize Vertex AI Generative Model:", initError);
            throw initError;
        }

        const chat = dynamicGenerativeModel.startChat({
            history: history,
        });

        console.log(`[API] Sending message to Vertex AI model: ${MODEL_NAME}`);

        // --- DEBUG LOGS START ---
        console.log(`[DEBUG] Calling chat.sendMessageStream now...`);
        const streamResult = await sendMessageStreamWithRetry(chat, lastMessageContent);
        console.log(`[DEBUG] chat.sendMessageStream returned. Starting to iterate stream...`);

        let functionCallDetected = false;
        let wroteText = false;

        // Initialize thinking filter
        const processFilter = createThinkingFilter();

        // Consume the first stream
        for await (const chunk of streamResult.stream) {
            console.log(`[DEBUG] Received chunk from Vertex AI`);
            // Check for text content
            let text = '';
            if (typeof chunk?.text === 'function') {
                try {
                    text = chunk.text();
                } catch (e) {
                    // If it's a function call, text() might throw or return empty
                }
            }
            if (!text) {
                text = extractTextFromParts(getChunkParts(chunk));
            }

            if (text) {
                const safeText = processFilter(text);
                if (safeText) {
                    res.write(safeText);
                    wroteText = true;
                }
            }

            // Check if this chunk indicates a function call
            const parts = getChunkParts(chunk);
            if (parts?.some(part => part.functionCall)) {
                functionCallDetected = true;
            }
        }

        // Ensure we inspect the full response to detect function calls or missing text
        const fullResponse = await streamResult.response;
        const fullParts = fullResponse?.candidates?.[0]?.content?.parts || [];
        const functionCallPart = fullParts.find(part => part.functionCall);

        if (functionCallPart) {
            functionCallDetected = true;
        }

        if (!wroteText) {
            // We need to be careful here: if the filter absorbed everything (because it was all thinking),
            // then we technically "wrote" nothing visible, but the model did respond.
            // However, the fallbackText usually comes from fullParts.
            const fallbackText = extractTextFromParts(fullParts);
            // Apply filter to fallback text too, but beware of double processing if we already processed chunks.
            // Usually if we processed chunks, buffer is stateful.
            // If wroteText is false, it means we output nothing.
            // If fallbackText contains thinking, we should filter it.
            // But since we streamed, the filter state is advanced.
            // If the stream was fully consumed, the filter buffered potentially partial tags.
            // We can try to flush the filter buffer if we had a way, but createThinkingFilter closure variables are private.

            // Simpler approach: If we didn't write anything, maybe it was a pure function call?
            // Or maybe it was just thinking.

            // If function call detected, we don't worry about empty text yet.
        }

        // If a function call was detected during the stream, we execute it now
        if (functionCallDetected) {
            const call = functionCallPart?.functionCall;

            if (call) {
                let functionResponseParts = [];

                if (call.name === 'get_client_guidelines') {
                    const identifier = call.args?.identifier;
                    if (!identifier) {
                        console.error("[FunctionCall] Missing identifier argument in function call:", call);
                        res.write("Error: Missing identifier argument for get_client_guidelines.");
                        res.end();
                        return;
                    }
                    console.log(`[FunctionCall] Executing get_client_guidelines for: ${identifier}`);
                    const guidelinesText = await getClientGuidelines(identifier);

                    functionResponseParts = [{
                        functionResponse: {
                            name: 'get_client_guidelines',
                            response: { name: 'get_client_guidelines', content: guidelinesText }
                        }
                    }];
                } else if (call.name === 'search_cloud_storage') {
                    const query = call.args?.query;
                    if (!query) {
                        console.error("[FunctionCall] Missing query argument in function call:", call);
                        res.write("Error: Missing query argument for search_cloud_storage.");
                        res.end();
                        return;
                    }
                    console.log(`[FunctionCall] Executing search_cloud_storage with query: ${query}`);
                    const toolOutput = await searchCloudStorage(query);
                    const inlineDataParts = Array.isArray(toolOutput?.inlineDataParts)
                        ? toolOutput.inlineDataParts
                        : [];

                    functionResponseParts = [{
                        functionResponse: {
                            name: 'search_cloud_storage',
                            response: { name: 'search_cloud_storage', content: toolOutput.text }
                        }
                    }, ...inlineDataParts];

                } else if (call.name === 'analyze_website_dna') {
                    const url = call.args?.url;
                    if (!url) {
                        console.error("[FunctionCall] Missing url argument in function call:", call);
                        res.write("Error: Missing url argument for analyze_website_dna.");
                        res.end();
                        return;
                    }
                    console.log(`[FunctionCall] Executing analyze_website_dna for: ${url}`);
                    const auditJson = await analyzeWebsiteDna(url);

                    functionResponseParts = [{
                        functionResponse: {
                            name: 'analyze_website_dna',
                            response: { name: 'analyze_website_dna', content: auditJson }
                        }
                    }];
                } else if (call.name === 'fetch_agency_tasks') {
                    const responsibleName = call.args?.responsible_name || "Rodny";
                    console.log(`[FunctionCall] Executing fetch_agency_tasks for: ${responsibleName}`);
                    const tasksText = await fetchAgencyTasks(responsibleName);

                    functionResponseParts = [{
                        functionResponse: {
                            name: 'fetch_agency_tasks',
                            response: { name: 'fetch_agency_tasks', content: tasksText }
                        }
                    }];
                }

                // Start a new stream with the answer (if we have a response part)
                if (functionResponseParts.length === 0) {
                     console.error(`[FunctionCall] Unknown function called: ${call.name}`);
                     res.write(`Error: Unknown function ${call.name}`);
                     res.end();
                     return;
                }

                console.log(`[API] Sending function response back to model...`);
                let streamResult2;
                try {
                     streamResult2 = await sendMessageStreamWithRetry(chat, functionResponseParts);
                } catch (streamErr) {
                     console.error("[API] Error calling sendMessageStream with function response:", streamErr);
                     res.write("\n\n(Error interno al comunicar la respuesta de la herramienta al modelo).");
                     res.end();
                     return;
                }

                let wroteTextInSecondStream = false;
                // Reset filter or create new one?
                // Creating new one is safer for the new stream.
                const processFilter2 = createThinkingFilter();

                for await (const chunk of streamResult2.stream) {
                    console.log(`[DEBUG] Received chunk (post-function) from Vertex AI`);
                    let text = '';
                    if (typeof chunk?.text === 'function') {
                        try {
                            text = chunk.text();
                        } catch (e) {
                             console.warn("[DEBUG] Chunk (post-function) has no text:", e.message);
                        }
                    }
                    if (!text) {
                        text = extractTextFromParts(getChunkParts(chunk));
                    }

                    if (text) {
                        const safeText = processFilter2(text);
                        if (safeText) {
                            res.write(safeText);
                            wroteTextInSecondStream = true;
                        }
                    }
                }

                if (!wroteTextInSecondStream) {
                    console.warn("[API] Second stream finished but wrote no text. Sending fallback.");
                    res.write("\n\n(La búsqueda se completó, pero el modelo no generó una respuesta textual adicional).");
                }
            }
        }

        if (!wroteText && !functionCallDetected) {
            // Only error if we truly got nothing useful.
            // If we filtered out thinking, that's fine, but the user gets empty string?
            // Usually the model outputs thinking THEN the answer.
            // If it only outputs thinking, it's weird.
            console.error("[VertexAI] Empty response with no function call detected.", {
                model: MODEL_NAME,
                parts: fullParts
            });
            // Don't send error text if we just suppressed thinking.
        }

        console.log(`[DEBUG] Stream iteration finished. Ending response.`);
        res.end();

    } catch (error) {
        console.error("Error in /api/chat [CRITICAL]:", {
            message: error.message,
            stack: error.stack,
            code: error.code,
            details: error.details, // Vertex AI often provides details here
            response: error.response?.data,
            raw: JSON.stringify(error)
        });

        // Return error as text/plain so it's not blocked by CORB
        if (!res.headersSent) {
            const statusCode = isVertexRateLimitError(error) ? 429 : 500;
            res.status(statusCode);
            if (statusCode === 429) {
                res.write("Error: Vertex AI rate limit exceeded. Please try again shortly.");
            } else {
                res.write(`Error: ${error.message}`);
            }
            res.end();
        } else {
            res.end();
        }
    }
});

// --- GEMINI PROXY (Now mounted AFTER API routes) ---
const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

if (!geminiApiKey) {
    console.warn("[Gemini Proxy] WARNING: GEMINI_API_KEY is not defined.");
}

app.use(
  '/api/gemini',
  authenticateToken,
  createProxyMiddleware({
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    secure: true,
    pathRewrite: (path) => path.replace(/^\/api\/gemini/, ''),
    proxyTimeout: 300000,
    timeout: 300000,
    on: {
      proxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader('User-Agent', 'BrainStudioIntelligence/2.0');
        proxyReq.removeHeader('Authorization');

        if (geminiApiKey) {
          proxyReq.setHeader('x-goog-api-key', geminiApiKey);
        }

        // Restream the body if it was already parsed by express.json()
        if (req.body) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      proxyRes: (proxyRes, req, res) => {
        // Force CORS headers in every response, especially on errors (4xx, 5xx)
        const origin = req.headers.origin || "*";
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
        res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (proxyRes.statusCode >= 400) {
          console.error(`[Gemini Proxy] Error ${proxyRes.statusCode} on ${req.method} ${req.url}`);
        }
      },
      error: (err, req, res) => {
        console.error('[Gemini Proxy] Fatal Proxy Error:', err.message);

        if (!res.headersSent) {
          const origin = req.headers.origin || "*";
          res.header("Access-Control-Allow-Origin", origin);
          res.header("Access-Control-Allow-Credentials", "true");
          res.status(502).json({
            error: 'Proxy Error (Gemini)',
            details: err.message
          });
        }
      }
    }
  })
);

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  const isPrismaError = err.code && (err.code.startsWith('P') || err.message?.includes('Prisma'));

  console.error(`[Global Error] Unhandled error on ${req.method} ${req.originalUrl}:`, {
    message: err.message,
    code: err.code,
    meta: err.meta,
    isPrismaError,
    stack: process.env.NODE_ENV === 'production' ? 'REDACTED' : err.stack
  });

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

// --- API 404 GUARD ---
// If we reach here and it's an /api path, it means no route matched
app.use('/api', (req, res) => {
  console.warn(`[404] API endpoint not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "API endpoint not found",
    method: req.method,
    path: req.originalUrl
  });
});

// --- STATIC FILES & SPA ROUTING ---

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// Catch-all route to serve React app for any unknown path
app.get('*', (req, res) => {
    // Only if not starting with /api
    if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: "API endpoint not found" });
    }

    // Serve index.html for SPA routing
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }

    res.status(200).send("Brainstudio Intelligence Backend is running. (Frontend build not found)");
});

const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT} (Bound to 0.0.0.0)`);

    // Prisma Connection Diagnostic
    try {
      console.log("[Diagnostic] Testing Prisma database connection...");
      // Check if DATABASE_URL is set
      if (!process.env.DATABASE_URL) {
        console.error("[Diagnostic] ERROR: DATABASE_URL environment variable is MISSING!");
      } else {
        const urlParts = process.env.DATABASE_URL.split('@');
        const hostInfo = urlParts.length > 1 ? urlParts[1] : 'unknown host';
        console.log(`[Diagnostic] DATABASE_URL host info: ${hostInfo.split('/')[0]}`);
      }

      await prisma.$connect();
      console.log("[Diagnostic] Database connection successful.");

      const userCount = await prisma.user.count();
      console.log(`[Diagnostic] Database is accessible. Found ${userCount} users.`);
    } catch (dbError) {
      console.error("[Diagnostic] CRITICAL: Database connection failed!", {
        message: dbError.message,
        code: dbError.code,
        meta: dbError.meta,
        env_node_env: process.env.NODE_ENV
      });
    }
});

// Aumentar el timeout global del servidor a 5 minutos para procesar análisis largos de IA
server.timeout = 300000;
