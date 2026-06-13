import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_NAME = process.env.GEMINI_MODEL || process.env.VERTEX_MODEL || "gemini-3.5-flash";

let genAI;
try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        genAI = new GoogleGenAI({ apiKey });
        console.log("[GoogleGenAI] Client initialized successfully.");
    } else {
        console.warn("[GoogleGenAI] GEMINI_API_KEY is missing.");
    }
} catch (e) {
    console.error("[GoogleGenAI] Failed to initialize client:", e);
}

export const systemPrompt = `Eres Brain Core, la Copywriter Senior y Analista de Datos experta de Brainstudio (Brain OS).
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
- El "So What?": Nunca dar un dato sin explicar su impacto. (MAL: "El post tuvo más clics". BIEN: "El post con la palabra 'Travel-proof' aumentó el CTR un 40%; usaremos este ángulo de dolor en la nueva parrilla").
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
La UI de la plataforma mostrará estas sugerencias como botones interactivos.
Genera el texto en Español neutro.

Formato de Salida Obligatorio:
💡 **Sugerencias:**
* \`[🔍 Auditar sitio web de X]\`
* \`[✍️ Generar ideas para Reels de X]\`
* \`[📄 Analizar reporte de métricas de X]\``;

export const tools = [
    {
        functionDeclarations: [
            {
                name: "get_client_guidelines",
                description: "Obtiene las reglas de redacción (brand guidelines y ai_instructions) de un cliente específico directamente desde la base de datos. DEBE llamarse SIEMPRE antes de generar contenido para asegurar el tono de la marca.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        identifier: {
                            type: "STRING",
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
                    type: "OBJECT",
                    properties: {
                        query: {
                            type: "STRING",
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
                    type: "OBJECT",
                    properties: {
                        url: {
                            type: "STRING",
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
                    type: "OBJECT",
                    properties: {
                        responsible_name: {
                            type: "STRING",
                            description: "Name of the responsible person (default: Rodny)."
                        }
                    },
                    required: []
                }
            }
        ]
    }
];

export function extractTextFromParts(parts = []) {
    return parts
        .filter(part => typeof part.text === 'string')
        .map(part => part.text)
        .join('');
}

export function getChunkParts(chunk) {
    return chunk?.candidates?.[0]?.content?.parts || [];
}

export function isGenAIRateLimitError(error) {
    const code = error?.code || error?.status || error?.response?.status;
    if (code === 429) {
        return true;
    }
    const message = error?.message || '';
    return message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
}

export async function sendMessageStreamWithRetry(genAIInstance, payload, maxAttempts = 3) {
    let attempt = 0;
    let lastError;
    while (attempt < maxAttempts) {
        attempt += 1;
        try {
            return await genAIInstance.models.generateContentStream({
                model: payload.model,
                systemInstruction: payload.systemInstruction,
                contents: payload.contents,
                config: payload.config
            });
        } catch (error) {
            lastError = error;
            if (!isGenAIRateLimitError(error) || attempt >= maxAttempts) {
                throw error;
            }
            const delayMs = 500 * Math.pow(2, attempt - 1);
            console.warn(`[GoogleGenAI] Rate limited. Retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastError;
}

export function createThinkingFilter() {
    let buffer = "";
    let insideThinking = false;

    return (chunkText) => {
        if (!chunkText) return "";

        let output = "";
        let scanIndex = 0;

        const fullText = buffer + chunkText;
        buffer = "";

        const len = fullText.length;

        while (scanIndex < len) {
            if (insideThinking) {
                const closeTagIndex = fullText.indexOf("</thinking>", scanIndex);
                if (closeTagIndex !== -1) {
                    scanIndex = closeTagIndex + "</thinking>".length;
                    insideThinking = false;
                } else {
                    const tail = fullText.slice(scanIndex);
                    let match = false;
                    for (let i = 1; i < 11; i++) {
                         if ("</thinking>".startsWith(tail.slice(-i))) {
                             buffer = tail;
                             match = true;
                             break;
                         }
                    }
                    scanIndex = len;
                }
            } else {
                const openTagIndex = fullText.indexOf("<thinking>", scanIndex);

                if (openTagIndex !== -1) {
                    output += fullText.slice(scanIndex, openTagIndex);
                    insideThinking = true;
                    scanIndex = openTagIndex + "<thinking>".length;
                } else {
                    let partialFound = false;
                    const remaining = fullText.slice(scanIndex);

                    for (let i = 1; i < 10; i++) {
                        if (remaining.length >= i && "<thinking>".startsWith(remaining.slice(-i))) {
                             output += remaining.slice(0, remaining.length - i);
                             buffer = remaining.slice(-i);
                             partialFound = true;
                             break;
                        }
                    }

                    if (!partialFound) {
                        output += remaining;
                    }
                    scanIndex = len;
                }
            }
        }

        return output;
    };
}

export const getAIInstance = () => genAI;
export { MODEL_NAME };

/**
 * Extracts text from a model response object.
 */
export const extractModelText = (response) => {
    try {
        if (typeof response.text === 'function') return response.text();
        if (typeof response.text === 'string') return response.text;
        return response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (e) {
        return "";
    }
};

/**
 * Safely parses a JSON response from the AI.
 */
export const parseJsonResponse = (rawText) => {
    if (!rawText) return null;
    try {
        const cleaned = rawText.replace(/```json|```/gi, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        const startArr = cleaned.indexOf('[');
        const endArr = cleaned.lastIndexOf(']');

        let jsonStr = cleaned;
        if (start !== -1 && end !== -1 && (startArr === -1 || start < startArr)) {
            jsonStr = cleaned.substring(start, end + 1);
        } else if (startArr !== -1 && endArr !== -1) {
            jsonStr = cleaned.substring(startArr, endArr + 1);
        }

        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("[AI Service] JSON Parse Error:", e.message);
        throw e;
    }
};

const MASTER_CATEGORIES = [
    "Estratégico",
    "Creativo & Diseño",
    "Marketing & Social Media",
    "Producción Audiovisual",
    "Creación de Contenido",
    "Operaciones & Reuniones",
    "Administrativo & Finanzas",
    "Educación"
];

const CLASSIFICATION_PROMPT = `Actúa como un Director de Operaciones (COO) experto en agencias de marketing digital.
Tu tarea es clasificar tareas operativas en una de las 8 categorías maestras y asignar un nivel de complejidad.

CATEGORÍAS MAESTRAS:
1. Estratégico: Planeación de alto nivel, auditorías, proyecciones, research profundo.
2. Creativo & Diseño: Diseño gráfico, branding, artes para posts, retoque fotográfico, UI/UX.
3. Marketing & Social Media: Pauta digital, segmentación, configuración de campañas, community management, analítica.
4. Producción Audiovisual: ¡PRIORIDAD! Cualquier tarea que mencione "video", "Reel", "TikTok", "grabación", "edición", "corrección de video".
5. Creación de Contenido: Redacción de copys, captions, guiones (no de video), blogs, newsletters.
6. Operaciones & Reuniones: Reuniones internas, llamadas con clientes, gestión administrativa, asistencia, correcciones menores (no video).
7. Administrativo & Finanzas: Facturación, pagos, presupuestos, legal, reportes financieros.
8. Educación: Capacitación, formación interna, investigación de herramientas.

REGLAS CRÍTICAS:
- IGNORA el sector del cliente. Clasifica por la NATURALEZA de la acción.
- Si dice "video" o "Reel" -> SIEMPRE 'Producción Audiovisual'.
- Si dice "reunión", "llamada" o "corrección" -> 'Operaciones & Reuniones'.
- Responde ESTRICTAMENTE en formato JSON.`;

/**
 * Classifies a single task using AI.
 */
export const classifyTaskWithAI = async (title, comments = "") => {
    if (!genAI) return null;

    try {
        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: CLASSIFICATION_PROMPT
        });

        const prompt = `Clasifica esta tarea:
        Título: ${title}
        Comentarios: ${comments}`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const response = await result.response;
        const data = parseJsonResponse(extractModelText(response));

        return {
            category: data.categoria,
            complexity: data.complejidad
        };
    } catch (error) {
        console.error("[AI Service] Single classification error:", error.message);
        return null;
    }
};

/**
 * Classifies a batch of tasks using AI.
 */
export const classifyTasksBatch = async (tasks) => {
    if (!genAI || !tasks || tasks.length === 0) return [];

    try {
        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: CLASSIFICATION_PROMPT
        });

        const tasksData = tasks.map(t => ({ id: t.id, title: t.title, comments: t.comments || "" }));
        const prompt = `Clasifica el siguiente arreglo de tareas en formato JSON: ${JSON.stringify(tasksData)}`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const response = await result.response;
        return parseJsonResponse(extractModelText(response));
    } catch (error) {
        console.error("[AI Service] Batch classification error:", error.message);
        return [];
    }
};
