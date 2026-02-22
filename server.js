import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { VertexAI, FunctionDeclarationSchemaType } from '@google-cloud/vertexai';
import { SearchServiceClient } from '@google-cloud/discoveryengine';
import { JWT } from 'google-auth-library';
import * as cheerio from 'cheerio';
import { GoogleSpreadsheet } from 'google-spreadsheet';

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

const app = express();

const allowedOrigins = [
  "https://intelligence.brainstudioagencia.com",
  "http://localhost:3000",
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",") : [])
];

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (como Postman o apps móviles)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: El origen ${origin} no está autorizado.`));
  },
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};

// CORS configuration (allow all by default; restrict via CORS_ORIGINS env)
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());

const PORT = process.env.PORT || 8080;

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

// --- AGENCY TASKS TOOL (Google Sheets) ---

// Helper: Find column index by keywords (case-insensitive)
function findColumnIndex(headers, keywords) {
    if (!headers || !Array.isArray(headers)) return -1;
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    return headers.findIndex(h => {
        const header = String(h || "").toLowerCase().trim();
        return lowerKeywords.includes(header);
    });
}

// Helper: Convert 0-based index to Excel column letter (0->A, 25->Z, 26->AA)
function columnIndexToLetter(index) {
    let temp, letter = '';
    let col = index;
    while (col >= 0) {
        temp = col % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        col = Math.floor(col / 26) - 1;
    }
    return letter;
}

function findTargetSheet(doc) {
    // Calculate dynamic sheet name based on current date (Spanish Month + Year)
    // e.g., "Febrero 2026"
    const now = new Date();
    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const currentMonthName = months[now.getMonth()];
    const currentYear = now.getFullYear();
    const targetTitle = `${currentMonthName} ${currentYear}`;

    console.log(`[AgencyTasks] Looking for target sheet: "${targetTitle}"`);

    for (const sheet of doc.sheetsByIndex) {
        if (sheet.title.trim() === targetTitle) {
             console.log(`[AgencyTasks] Found target sheet: ${sheet.title}`);
             return sheet;
        }
    }

    console.warn(`[AgencyTasks] Target sheet "${targetTitle}" not found. Falling back to first sheet (Index 0).`);
    return doc.sheetsByIndex[0];
}

// Helper: Parse dates (DD/MM/YYYY or YYYY-MM-DD)
function parseDate(dateStr) {
    if (!dateStr) return null;
    const d = String(dateStr).trim();
    if (!d) return null;

    // Handle "DD/MM/YYYY" or "DD/MM"
    const parts = d.split('/');
    if (parts.length >= 2) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
        if (!isNaN(day) && !isNaN(month)) {
            return new Date(year, month, day);
        }
    }

    // Handle "YYYY-MM-DD"
    const date = new Date(d);
    if (!isNaN(date.getTime())) return date;

    return null;
}

async function fetchAgencyTasks(responsibleName = "Rodny") {
    console.log(`[AgencyTasks] Fetching tasks for: ${responsibleName}`);
    try {
        const allTasks = await getAgencyTasksJSON();
        const targetResp = responsibleName.trim().toLowerCase();

        const pendingTasks = allTasks.filter(task => {
            const rName = (task.responsable_name || "").toLowerCase();
            const status = (task.estado || "").toLowerCase();
            // Filter logic: Match name and exclude "Realizado"
            return rName.includes(targetResp) && status !== 'realizado';
        });

        if (pendingTasks.length === 0) {
            return `No se encontraron tareas pendientes para "${responsibleName}".`;
        }

        const taskList = pendingTasks.map(t => {
            const urgency = t.es_prioritaria ? " [URGENTE]" : "";
            return `- [${t.fecha_entrega || "Sin fecha"}] ${t.pendiente} (Cliente: ${t.cliente}) [Estado: ${t.estado}]${urgency}`;
        }).join('\n');

        return `Tareas pendientes para ${responsibleName}:\n\n${taskList}`;

    } catch (error) {
        console.error("[AgencyTasks] Error:", error);
        return `Error al consultar la hoja de tareas: ${error.message}`;
    }
}

const normalizeTaskStatus = (rawStatus = "") => {
    const status = String(rawStatus || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, '').trim();

    if (!status) return 'Pendiente';

    if (['pendiente', 'por hacer', 'to do', 'todo'].includes(status)) return 'Pendiente';
    if (['en proceso', 'en curso', 'proceso', 'working', 'doing', 'in progress'].includes(status)) return 'En Proceso';
    if (['realizado', 'finalizado', 'hecho', 'done', 'completado', 'terminado'].includes(status)) return 'Realizado';

    // Fallback conservador: si no coincide exactamente con estados conocidos, mantener Pendiente.
    return 'Pendiente';
};

const isSummaryOrInvalidTaskTitle = (title = '') => {
    const normalized = String(title || '').trim().toLowerCase();
    if (!normalized) return true;

    // Filas típicas de resumen en Sheets: "607 PENDIENTES", "Total pendientes", etc.
    if (/^\d+\s*pendientes?$/.test(normalized)) return true;
    if (/^total\s*pendientes?$/.test(normalized)) return true;
    if (/^pendientes?$/.test(normalized)) return true;

    return false;
};

async function getAgencyTasksJSON() {
    console.log(`[AgencyTasksJSON] Fetching all tasks in JSON format.`);
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

        // DEBUG EXTREMO: Listar todas las hojas
        const availableSheets = doc.sheetsByIndex.map(s => s.title);
        console.log('[DEBUG EXTREMO] Hojas disponibles en el documento:', availableSheets);

        let sheet = findTargetSheet(doc);
        if (!sheet) {
             console.warn(`[AgencyTasksJSON] No sheet found matching current month. Fallback to index 0.`);
             sheet = doc.sheetsByIndex[0];
        }

        if (!sheet) throw new Error("No sheet found.");
        console.log(`[DEBUG EXTREMO] Intentando leer hoja: "${sheet.title}"`);

        await sheet.loadHeaderRow();
        const headers = sheet.headerValues;
        console.log('[DEBUG EXTREMO] Headers detectados:', headers);

        const colFechaAsignacion = findColumnIndex(headers, ['fecha asignacion', 'fecha_asignacion', 'asignacion', 'fecha de asignacion']);
        const colPendiente = findColumnIndex(headers, ['pendiente', 'tarea', 'actividad', 'task']);
        const colCliente = findColumnIndex(headers, ['cliente', 'marca', 'cuenta']);
        const colResponsable = findColumnIndex(headers, ['responsable', 'owner', 'asignado']);
        const colEstado = findColumnIndex(headers, ['estado', 'status', 'estatus']);
        const colFechaEntrega = findColumnIndex(headers, ['fecha entrega', 'fecha_entrega', 'entrega', 'due date', 'vencimiento']);
        const colComentarios = findColumnIndex(headers, ['comentarios', 'comentario', 'observaciones', 'notas']);
        const colCompletedAt = findColumnIndex(headers, ['completed_at', 'completado_el', 'fecha_fin', 'fecha completado', 'fecha_realizado']);

        console.log('[DEBUG EXTREMO] Índices detectados:', {
            colFechaAsignacion,
            colPendiente,
            colCliente,
            colResponsable,
            colEstado,
            colFechaEntrega,
            colComentarios,
            colCompletedAt
        });

        const rows = await sheet.getRows();
        console.log(`[DEBUG EXTREMO] Filas leídas: ${rows.length}`);

        if (rows.length > 0) {
            // Log raw data from internal property if available, or try to reconstruct
            try {
                 // _rawData is internal to google-spreadsheet but useful for debug
                 console.log('[DEBUG EXTREMO] Fila 0 Raw (_rawData):', rows[0]._rawData);
            } catch (e) {
                 console.log('[DEBUG EXTREMO] Fila 0 (toObject):', rows[0].toObject());
            }
        }

        const tasks = rows.map((row, index) => {
            // Use _rawData for direct array access as requested
            // row._rawData[0] = Col A, [1] = Col B, etc.
            const data = row._rawData || [];

            const getRaw = (idx, fallbackIdx) => {
                // If dynamic index found (>=0), use it. Else fallback to hardcoded.
                const targetIdx = (idx >= 0) ? idx : fallbackIdx;
                if (targetIdx < 0 || targetIdx >= data.length) return "";
                return String(data[targetIdx] || "").trim();
            };

            // Mapping with Dynamic Indices (Fallback to standard order A-G)
            // Col A (0): fecha_asignacion
            // Col B (1): pendiente
            // Col C (2): cliente
            // Col D (3): responsable
            // Col E (4): estado
            // Col F (5): fecha_entrega
            // Col G (6): comentarios

            const fecha_asignacion = getRaw(colFechaAsignacion, 0);
            const pendiente = getRaw(colPendiente, 1);

            // Filtrar filas vacías o filas-resumen de la hoja.
            if (isSummaryOrInvalidTaskTitle(pendiente)) return null;

            const cliente = getRaw(colCliente, 2);
            const respName = getRaw(colResponsable, 3);
            const rawStatus = getRaw(colEstado, 4);
            const fecha_entrega = getRaw(colFechaEntrega, 5);
            const comentarios = getRaw(colComentarios, 6);
            // Default to col 7 (H) if header not found
            const completed_at = getRaw(colCompletedAt, 7);

            // DEBUG: Log first few rows to debug status issues
            if (index < 3) {
                console.log(`[DEBUG Row ${index}] Status Raw: "${rawStatus}" (Col: ${colEstado >= 0 ? colEstado : 4}) -> Normalized: "${normalizeTaskStatus(rawStatus)}"`);
            }

            // Status Normalization (alineado con vocabulario de Google Sheet)
            const estado = normalizeTaskStatus(rawStatus);

            // Priority Calculation
            let es_prioritaria = false;

            // Priority Logic:
            // 1. Must be due today or overdue.
            // 2. Must NOT be completed ('Realizado').
            const deliveryDate = parseDate(fecha_entrega);
            if (deliveryDate) {
                 const now = new Date();
                 const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                 // Reset time to compare only dates
                 const deliveryDateOnly = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth(), deliveryDate.getDate());

                 if (deliveryDateOnly <= today) {
                     // Check if task is already completed to remove priority tag
                     if (estado !== 'Realizado') {
                         es_prioritaria = true;
                     }
                 }
            }

            // Avatar Logic
            const responsableUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(respName || "Sin Asignar")}&background=random&color=fff&size=128`;

            return {
                id: row.rowNumber || (index + 2),
                fecha_asignacion: fecha_asignacion,
                pendiente: pendiente,
                cliente: cliente,
                responsable: responsableUrl, // Frontend <img> src
                responsable_name: respName,  // Frontend text
                estado: estado,
                fecha_entrega: fecha_entrega,
                comentarios: comentarios,
                completed_at: completed_at,
                es_prioritaria: es_prioritaria,
                prioridad: es_prioritaria ? 'Alta' : 'Normal'
            };
        }).filter(t => t !== null);

        if (tasks.length > 0) {
            console.log('Datos procesados (Sample):', JSON.stringify(tasks[0], null, 2));
        }

        return tasks;

    } catch (error) {
        console.error("[AgencyTasksJSON] Error:", error);
        throw error;
    }
}

async function updateTaskStatus(id, newStatus) {
    console.log(`[UpdateTask] Updating task ID ${id} to status: ${newStatus}`);
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

        let sheet = findTargetSheet(doc);
        if (!sheet) throw new Error("Target sheet not found.");

        // El ID recibido desde frontend es el número de fila real en Google Sheet.
        // Esto evita desalineaciones cuando existen filas-resumen o filtros visuales.

        await sheet.loadHeaderRow();
        const headers = sheet.headerValues;

        // 1. Update Status
        const statusColIndex = findColumnIndex(headers, ['estado', 'status', 'estatus']);
        if (statusColIndex < 0) {
            throw new Error('No se encontró la columna de estado en la hoja.');
        }

        const rowNumber = parseInt(id, 10);
        if (isNaN(rowNumber) || rowNumber < 2) {
            throw new Error(`Invalid ID: ${id}`);
        }

        const statusColumnLetter = columnIndexToLetter(statusColIndex);
        const rangeStatus = `${statusColumnLetter}${rowNumber}`;

        // 2. Update Completed At (if transitioning to 'Realizado')
        let rangeCompletedAt = null;
        const isCompleted = normalizeTaskStatus(newStatus) === 'Realizado';

        if (isCompleted) {
             let completedAtColIndex = findColumnIndex(headers, ['completed_at', 'completado_el', 'fecha_fin', 'fecha completado']);
             // Fallback to column H (index 7) if header not found
             if (completedAtColIndex < 0) completedAtColIndex = 7;

             const completedAtColumnLetter = columnIndexToLetter(completedAtColIndex);
             rangeCompletedAt = `${completedAtColumnLetter}${rowNumber}`;
        }

        // Load necessary cells
        const rangesToLoad = [rangeStatus];
        if (rangeCompletedAt) rangesToLoad.push(rangeCompletedAt);

        console.log(`[UpdateTask] Loading cells ${rangesToLoad.join(', ')} in sheet ${sheet.title}`);
        await sheet.loadCells(rangesToLoad);

        // Set Status
        const cellStatus = sheet.getCellByA1(rangeStatus);
        cellStatus.value = newStatus;

        // Set Completed At (if applicable)
        if (rangeCompletedAt && isCompleted) {
             const cellCompletedAt = sheet.getCellByA1(rangeCompletedAt);
             // Write ISO string for sorting, or localized date?
             // ISO string is safer for sorting: 2023-10-27T10:00:00.000Z
             // Or simple date: new Date().toISOString()
             cellCompletedAt.value = new Date().toISOString();
        }

        await sheet.saveUpdatedCells();

        console.log(`[UpdateTask] Success.`);
        return { success: true };

    } catch (error) {
        console.error("[UpdateTask] Error:", error);
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

const systemPrompt = `### PROTOCOLO DE USO DE HERRAMIENTAS Y CORRECCIÓN DE ENTIDADES:
Tu objetivo es garantizar búsquedas exitosas incluso si el usuario comete errores.

1. ANÁLISIS PREVIO: Antes de llamar a la función \`search_cloud_storage\`, analiza los nombres propios en la consulta.
2. CORRECCIÓN FONÉTICA: Si detectas un nombre que suena similar a uno de nuestros clientes conocidos, corrígelo mentalmente.
   - Ejemplo: Si el usuario escribe "trupik", "trupick" o "truepeak" -> TU QUERY DEBE SER "TruPeak".
   - Ejemplo: Si el usuario escribe "artiza" -> TU QUERY DEBE SER "Artyzza".
   - Ejemplo: Si el usuario escribe "nuba" -> TU QUERY DEBE SER "Muebles Nuva".
3. EJECUCIÓN: Llama a la herramienta de búsqueda usando ÚNICAMENTE el nombre corregido. Nunca busques el término mal escrito.

### PROTOCOLO DE AUDITORÍA WEB Y ANÁLISIS DE MARCA:
Cuentas con una herramienta especializada llamada "analyze_website_dna". Úsala siempre que el usuario pida analizar, auditar o revisar un sitio web.

1.  **Cuándo usarla:**
    -   "Analiza la web de Artyzza"
    -   "¿Qué colores usa TruPeak?"
    -   "Revisa el SEO técnico de brainstudio.com"
2.  **Cómo procesar la respuesta:**
    -   La herramienta te devolverá un JSON con "title", "meta_description", "h1_tags" y "top_colors_detected".
    -   **NO muestres el JSON crudo.**
    -   Redacta un informe profesional:
        -   **Salud Técnica:** Evalúa si el título y la descripción son efectivos para SEO. Revisa si hay múltiples H1 (error común) o si faltan.
        -   **ADN de Marca:** Describe la paleta de colores detectada y sugiere qué emociones transmiten.

### ROL: DIRECTOR DE ESTRATEGIA (BRAIN STUDIO)
No eres un simple asistente que lista datos. Eres un Consultor Senior de Negocios.

CUANDO ENTREGUES UN ANÁLISIS (AUDITORÍA O LECTURA):
1. **El "So What?":** Nunca des un dato sin explicar su impacto en dinero o marca.
   - MAL: "El H1 es 'Home'".
   - BIEN: "El H1 'Home' es un desperdicio de espacio publicitario. Estás invisible para quien busca 'Luxury Resort'. Cambialo para capturar ese tráfico."

2. **Crítica Constructiva:** No tengas miedo de señalar errores. Si la web se ve "barata" o "inconsistente", dilo con respeto profesional. Tu valor está en la verdad, no en la complacencia.

3. **Conexión de Puntos:** Siempre intenta cruzar lo que ves en la web (colores, textos) con lo que sabes de los documentos internos (PDFs). Busca incoherencias.

TU OBJETIVO: Dar insights accionables que mejoren el ROI y la identidad de marca del cliente.

Eres Bria, el núcleo de inteligencia y razonamiento de "Brainstudio Intelligence" (Brain OS). Tu misión es actuar como una Consultora Estratégica con Omnisciencia Operativa: no solo encuentras información, la analizas, conectas y transformas en insights accionables.

### PROTOCOLO DE FUENTES DE INFORMACIÓN:
1. **TU PRIMERA OPCIÓN ES SIEMPRE EL STORAGE:**
   - Si te preguntan por un cliente (ej: "Wine and Wonder"), **PRIMERO** busca en \`search_cloud_storage\`.
   - Analiza profundamente esos documentos internos. Ese es tu mayor valor.
2. **NO pidas la URL web como prerrequisito:**
   - Si encuentras documentos internos suficientes para responder (estrategia, brief, identidad), haz el análisis basado en eso.
   - Solo sugiere auditar la web como un "paso extra opcional" al final, o pregunta: "¿Tienen sitio web para auditarlo también?".
   - Nunca detengas tu análisis esperando una URL si ya tienes archivos.
3. **Manejo de "Cliente Sin Web":**
   - Asume que es posible que el cliente no tenga web. Tu consultoría basada en documentos debe ser completa y autónoma.

TU PROCESO DE PENSAMIENTO (Chain of Thought):
Antes de responder, realiza un análisis interno profundo (oculto en <thinking>).
NO narres lo que vas a hacer ("Voy a decirle al usuario..."). HAZLO: Analiza los datos, cruza información y detecta patrones.
1.  **Análisis de Intención:** ¿Qué necesita realmente el usuario?
2.  **Examen de Evidencia:** Si buscaste archivos, lee el contenido extraído. ¿Qué dicen los datos? ¿Hay contradicciones?
3.  **Síntesis:** Construye la respuesta final basada en estos hallazgos.

ESTRUCTURA DE RESPUESTA OBLIGATORIA:
<thinking>
[Espacio para análisis técnico y razonamiento puro. No hables con el usuario aquí, habla contigo misma sobre los datos.]
- Archivos analizados: [Lista]
- Hallazgos clave: [Datos específicos encontrados en el contenido]
- Estrategia: [Cómo estructurarás la respuesta]
</thinking>

[Aquí comienza tu respuesta final al usuario]

DIRECTRICES DE FORMATO VISUAL:
1.  **Prohibido usar backticks (\`) para resaltar texto normal.**
    -   MAL: Analizando \`Villa Montaña\`.
    -   BIEN: Analizando **Villa Montaña**.
2.  **Uso de Código:**
    -   Usa bloques de código (\`\`\`) ÚNICAMENTE cuando escribas código de programación real (Python, HTML, JSON).
3.  **Jerarquía y Énfasis:**
    -   Usa **Negritas** para resaltar entidades, nombres de marcas o conceptos clave.
    -   Usa Listas y Títulos (###) para estructurar respuestas largas.

REGLAS DE ESTILO Y FORMATO (ESTRICTAS):
1.  **CERO COMILLAS RARAS EN NOMBRES DE ARCHIVO:**
    -   ESTÁ PROHIBIDO usar backticks (\`) para nombres de archivos (ej: \`archivo.pdf\`). ¡Se ve horrible!
    -   ESTÁ PROHIBIDO usar negritas con backticks (ej: **\`archivo.pdf\`**).
    -   CORRECTO: Usa negrita simple para destacar el nombre (ej: **archivo.pdf**) o simplemente menciónalo naturalmente.
2.  **Professional Markdown:**
    -   Usa títulos H1, H2, H3 (Markdown #, ##, ###) para estructurar.
    -   Usa listas y tablas para datos densos.
3.  **Tono:** Profesional, directo, estratégico, empático pero eficiente. Eres Bria.

PRINCIPIOS DE ANÁLISIS PROFUNDO:
-   Si encuentras un documento, ANALÍZALO. No digas "encontré este documento". Di "Analizando el documento X, observo que la estrategia de Q3 se centra en..."
-   Cruza información: "El Excel de ventas contradice lo que dice el Brief en PDF..." -> Eso es valor.
-   Si es una imagen, descríbela y úsala en tu análisis.

Eres la socia intelectual de Brainstudio. Piensa, luego responde.

### PROTOCOLO DE SUGERENCIAS (SKILLS):
Al finalizar CADA respuesta, debes actuar como un facilitador proactivo.
Analiza el contexto de la conversación y genera 3 sugerencias de acciones cortas que el usuario podría querer ejecutar a continuación.

**Reglas de Generación:**
1. Las sugerencias deben ser acciones concretas que tú puedes realizar (Buscar, Auditar, Redactar, Resumir).
2. Usa un formato visual distintivo al final del mensaje.
3. Sé específico con el contexto actual (no digas "Auditar web", di "Auditar web de [Cliente Actual]").
4. IDIOMA Y CODIFICACIÓN: Genera el texto SIEMPRE en Español neutro y asegúrate de no usar caracteres rotos o mal codificados.

**Formato de Salida Obligatorio (Markdown):**
---
💡 **Sugerencias:**
*   \`[🔍 Auditar sitio web de X]\`
*   \`[📄 Buscar contratos de X]\`
*   \`[✍️ Redactar idea de contenido]\`

(Usa el formato de \`código inline\` para que visualmente parezcan botones).
Lógica de Negocio (Ejemplos):

Si hablas de una marca -> Sugiere: Auditar Web, Buscar Brand Book, Ver Competencia.

Si hablas de un documento -> Sugiere: Resumir puntos clave, Extraer citas, Enviar por email.

Si el usuario saluda -> Sugiere: Listar clientes activos, Ver novedades en Storage.`;

const tools = [
    {
        functionDeclarations: [
            {
                name: "search_cloud_storage",
                description: "Busca en el 'cerebro' de Brainstudio (Google Cloud Storage) documentos no estructurados (PDFs, guías, reportes) de clientes como Sunpartners, TruPeak, etc. Usa esto para consultas sobre información interna o conocimiento de proyectos.",
                parameters: {
                    type: FunctionDeclarationSchemaType.OBJECT,
                    properties: {
                        query: {
                            type: FunctionDeclarationSchemaType.STRING,
                            description: "Término de búsqueda (ej. 'Estrategia Sunpartners', 'Reporte TruPeak', 'Guía de Estilo')."
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


app.get('/', (req, res) => {
    res.status(200).send('Brainstudio Intelligence API is running (v6-stable-deploy).');
});

app.get('/api/pendientes', async (req, res) => {
    try {
        const tasks = await getAgencyTasksJSON();
        res.json(tasks);
    } catch (error) {
        console.error("[API] /api/pendientes error:", error);
        res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
    }
});

app.patch('/api/pendientes/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: "Missing status in body" });
        }

        console.log(`[API] Updating task ${id} to ${status}`);
        await updateTaskStatus(id, status);
        res.json({ success: true, message: "Status updated" });
    } catch (error) {
        console.error("[API] /api/pendientes/:id/status error:", error);
        res.status(500).json({ error: "Failed to update status", details: error.message });
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
        const origin = req.headers.origin;
        if (allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
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

        const chat = generativeModel.startChat({
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

                if (call.name === 'search_cloud_storage') {
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (Bound to 0.0.0.0)`);
});
