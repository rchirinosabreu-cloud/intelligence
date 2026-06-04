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
"A continuación, recibirás el TÍTULO y la DESCRIPCIÓN de una tarea asignada a un miembro de la agencia. Debes analizar su contenido y devolver ÚNICAMENTE un objeto JSON válido con dos propiedades: category y complexity. No agregues texto adicional, explicaciones, ni formato Markdown."

Reglas de Clasificación - Categoría (category):
Elige estrictamente UNA de las siguientes 12 categorías basándote en la naturaleza del trabajo:

"Marketing": Tareas de pauta ADS, SEO, SEM, estrategias de captación o análisis de embudos de venta.
"Estratégico": Planificación de alto nivel, auditorías, roadmaps, definición de KPIs o consultoría.
"Gestión de Oficina": Tareas operativas de la agencia, mantenimiento de herramientas o procesos internos.
"Video Production": Edición de video, post-producción, motion graphics o guionismo audiovisual.
"Creativo": Diseño gráfico, branding, identidad visual, ilustración o conceptualización.
"Educación": Formación interna, investigación de tendencias, cursos o workshops.
"Administrativo/Operacional": Facturación, gestión de archivos, carga de datos o trámites.
"Reuniones": Llamadas con clientes, juntas internas, dailies o presentaciones.
"Creación de Contenido": Redacción de copies, captions, artículos de blog o guiones.
"Corrección": Ajustes, cambios solicitados por el cliente u optimizaciones post-entrega.
"Finanzas": Presupuestos, cotizaciones, control de gastos o proyecciones.
"Social Media": Programación de posts, community management o gestión de perfiles.

Reglas de Clasificación - Complejidad (complexity):
Elige estrictamente UNA de las siguientes tres basándote en el esfuerzo mental o técnico requerido:

"BAJA": Cambios menores, tareas repetitivas, de ejecución rápida (menos de 1 hora) o que no requieren validación profunda. (Ejemplos: "Cambiar color de un botón", "Subir un post programado", "Enviar un email de seguimiento").

"MEDIA": Trabajo creativo estándar, diseño de piezas nuevas con lineamientos claros, o redacción de contenido regular. Requiere enfoque pero es el "pan de cada día" de la agencia. (Ejemplos: "Diseñar carrusel de 5 slides", "Redactar guion de reel", "Armar reporte mensual").

"ALTA": Tareas que requieren investigación profunda, conceptualización desde cero, resolución de problemas técnicos complejos o alto impacto en el negocio. (Ejemplos: "Crear identidad visual completa", "Desarrollar sitio web e-commerce", "Estrategia de pauta anual", "Resolver caída de servidor de producción").

Ejemplo de Entrada (Lo que enviará el servidor):
Título: [URGENTE] Cambiar la tipografía de todos los banners de la campaña de Salsipuedes. Descripción: El cliente acaba de llamar, dice que la font no es la correcta. Necesitan esto corregido y subido a la pauta en 2 horas máximo.

Ejemplo de Salida Esperada (Lo que debe responder Gemini):
{"category": "Corrección", "complexity": "MEDIA"}`;

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
                    responseMimeType: "application/json"
                }
            }
        });
        console.log("================ DEPURACIÓN IA RAW (Task Classification) ================", JSON.stringify(result, null, 2));
        const text = extractModelText(result);

        const classification = JSON.parse(text);
        return {
            category: classification.category,
            complexity: classification.complexity
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
