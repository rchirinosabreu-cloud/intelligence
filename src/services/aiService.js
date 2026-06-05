import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.5-flash";

let genAI;
try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        genAI = new GoogleGenAI({ apiKey });
        console.log("[AiService] Google Generative AI initialized.");
    } else {
        console.warn("[AiService] GEMINI_API_KEY is missing.");
    }
} catch (e) {
    console.error("[AiService] Failed to initialize AI client:", e);
}

const MASTER_PROMPT = `Rol del Sistema:
"Eres el Director de Operaciones y Recursos Humanos de una agencia creativa de alto rendimiento llamada Brainstudio. Tu trabajo es analizar las tareas que realiza el equipo de forma aislada, objetiva y estrictamente paramétrica."

Instrucción Principal:
"A continuación, recibirás el TÍTULO y la DESCRIPCIÓN de una tarea asignada a un miembro de la agencia. Debes analizar su contenido y devolver ÚNICAMENTE un objeto JSON válido con dos propiedades: categoria y complejidad. No agregues texto adicional, explicaciones, ni formato Markdown."

Regla de Oro (Aislamiento de Contexto):
"Clasifica la naturaleza OPERATIVA de la acción realizada por el miembro del equipo de la agencia de marketing. Ignora por completo el sector comercial o industria del cliente para el que se hace la tarea. Ejemplo: Diseñar un post para una mueblería es 'Creativo & Diseño', NO 'Hogar y Decoración'."

Reglas de Clasificación - Categoría (categoria):
Elige estrictamente UNA de las siguientes 8 categorías basándote en la naturaleza del trabajo:

- "Estratégico": Planificación de alto nivel, auditorías, roadmaps, definición de KPIs o consultoría estratégica.
- "Creativo & Diseño": Diseño gráfico, branding, identidad visual, ilustración, conceptualización y tareas de producción visual.
- "Marketing & Social Media": Pauta ADS (Meta, Google), SEO, SEM, estrategias de captación, community management y gestión de redes sociales.
- "Producción Audiovisual": Edición de video, post-producción, motion graphics, guionismo audiovisual y producción de reels/videos.
- "Creación de Contenido": Redacción de copies, captions, artículos de blog, guiones y cualquier formato de contenido escrito.
- "Operaciones & Reuniones": Gestión de oficina, procesos internos, correcciones, ajustes, llamadas con clientes y juntas internas.
- "Administrativo & Finanzas": Facturación, gestión de archivos, carga de datos, presupuestos, cotizaciones, legal y control de gastos.
- "Educación": Formación interna, investigación de tendencias, cursos, workshops y desarrollo de nuevas habilidades.

Reglas de Clasificación - Complejidad (complexity):
Elige estrictamente UNA de las siguientes tres basándote en el esfuerzo mental o técnico requerido:

"BAJA": Cambios menores, tareas repetitivas, de ejecución rápida (menos de 1 hora) o que no requieren validación profunda. (Ejemplos: "Cambiar color de un botón", "Subir un post programado", "Enviar un email de seguimiento").

"MEDIA": Trabajo creativo estándar, diseño de piezas nuevas con lineamientos claros, o redacción de contenido regular. Requiere enfoque pero es el "pan de cada día" de la agencia. (Ejemplos: "Diseñar carrusel de 5 slides", "Redactar guion de reel", "Armar reporte mensual").

"ALTA": Tareas que requieren investigación profunda, conceptualización desde cero, resolución de problemas técnicos complejos o alto impacto en el negocio. (Ejemplos: "Crear identidad visual completa", "Desarrollar sitio web e-commerce", "Estrategia de pauta anual", "Resolver caída de servidor de producción").

Ejemplo de Entrada (Lo que enviará el servidor):
Título: [URGENTE] Cambiar la tipografía de todos los banners de la campaña de Salsipuedes. Descripción: El cliente acaba de llamar, dice que la font no es la correcta. Necesitan esto corregido y subido a la pauta en 2 horas máximo.

Ejemplo de Salida Esperada (Lo que debe responder Gemini):
{"categoria": "Operaciones & Reuniones", "complejidad": "MEDIA"}`;

/**
 * Classifies a task using Gemini AI.
 * @param {string} title - Task title
 * @param {string} comments - Task description/comments
 * @returns {Promise<Object>} - { category, complexity }
 */
export const classifyTaskWithAI = async (title, comments = "") => {
    if (!genAI) {
        console.warn("[AiService] AI client not initialized. Skipping classification.");
        return { category: null, complexity: null };
    }

    try {
        const prompt = `Tarea a clasificar:\n\nTítulo: ${title}\nDescripción: ${comments}`;
        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
            systemInstruction: MASTER_PROMPT,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "object",
                        properties: {
                            categoria: {
                                type: "string",
                                enum: [
                                    "Estratégico",
                                    "Creativo & Diseño",
                                    "Marketing & Social Media",
                                    "Producción Audiovisual",
                                    "Creación de Contenido",
                                    "Operaciones & Reuniones",
                                    "Administrativo & Finanzas",
                                    "Educación"
                                ]
                            },
                            complejidad: {
                                type: "string",
                                enum: ["BAJA", "MEDIA", "ALTA"]
                            }
                        },
                        required: ["categoria", "complejidad"]
                    }
                }
            }
        });
        console.log("================ DEPURACIÓN IA RAW (Task Classification) ================", JSON.stringify(result, null, 2));
        const text = extractModelText(result);

        const classification = JSON.parse(text);
        return {
            category: classification.categoria,
            complexity: classification.complejidad
        };
    } catch (error) {
        console.error("[AiService] AI Classification failed:", error.message);
        return { category: null, complexity: null };
    }
};

export const extractModelText = (result) => {
    // Priority: property .text in @google/genai (v2.6.0)
    if (result.text && String(result.text).trim()) return result.text;

    // Fallback logic for safety across SDK versions
    const directText = typeof result?.response?.text === 'function'
        ? result.response.text()
        : result?.response?.text;

    if (directText && String(directText).trim()) return directText;

    const candidates = result?.response?.candidates || result?.candidates;
    const firstPart = candidates?.[0]?.content?.parts?.[0];

    if (firstPart?.text && String(firstPart.text).trim()) return firstPart.text;
    if (firstPart?.functionCall?.args) return JSON.stringify(firstPart.functionCall.args);

    throw new Error('Empty AI response');
};
