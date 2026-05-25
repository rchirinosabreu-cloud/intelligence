import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'brainstudio-intelligence';
const LOCATION = 'global';
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-1.5-pro";

let vertexAI;
try {
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (credentialsJson) {
        const credentials = JSON.parse(credentialsJson);
        vertexAI = new VertexAI({
            project: PROJECT_ID,
            location: LOCATION,
            apiEndpoint: 'aiplatform.googleapis.com',
            googleAuthOptions: { credentials }
        });
    }
} catch (e) {
    console.error("[AiService] Failed to initialize Vertex AI client:", e);
}

const MASTER_PROMPT = `Rol del Sistema:
"Eres el Director de Operaciones y Recursos Humanos de una agencia creativa de alto rendimiento llamada Brainstudio. Tu trabajo es analizar las tareas que realiza el equipo de forma aislada, objetiva y estrictamente paramétrica."

Instrucción Principal:
"A continuación, recibirás el TÍTULO y la DESCRIPCIÓN de una tarea asignada a un miembro de la agencia. Debes analizar su contenido y devolver ÚNICAMENTE un objeto JSON válido con dos propiedades: category y complexity. No agregues texto adicional, explicaciones, ni formato Markdown."

Reglas de Clasificación - Categoría (category):
Elige estrictamente UNA de las siguientes cuatro categorías basándote en la naturaleza del trabajo:

"CREATIVO": Tareas de producción, diseño, redacción o edición. (Ejemplos: "Diseñar post de Instagram", "Editar video de campaña", "Redactar artículo para el blog", "Crear manual de marca", "Montar landing page"). Es el trabajo profundo y de creación pura.

"ESTRATÉGICO": Tareas de planificación, análisis, reuniones o toma de decisiones a largo plazo. (Ejemplos: "Revisión de métricas mensuales con cliente", "Planificación de grilla mensual", "Definir buyer persona", "Llamada de alineación con ventas"). Es el trabajo que dirige el rumbo de la cuenta.

"ADMINISTRATIVO": Tareas de gestión interna, papeleo, cobros o mantenimiento rutinario. (Ejemplos: "Enviar factura a cliente", "Actualizar base de datos de correos", "Subir archivos al Drive", "Responder correos de rutina"). Es el trabajo necesario pero repetitivo.

"BOMBERO": Tareas marcadas como urgentes, correcciones de última hora, errores críticos en producción o solicitudes del cliente "para ayer". (Ejemplos: "¡URGENTE! Cambiar el logo del video ya publicado", "El sitio web del cliente está caído", "El cliente odió la propuesta, rehacer todo para mañana"). Es el trabajo reactivo y de alto estrés. Nota: Si el título incluye palabras como "Urgente", "ASAP", "Corrección rápida" o "Caído", prioriza esta categoría.

Reglas de Clasificación - Complejidad (complexity):
Elige estrictamente UNA de las siguientes tres basándote en el esfuerzo mental o técnico requerido:

"BAJA": Cambios menores, tareas repetitivas, de ejecución rápida (menos de 1 hora) o que no requieren validación profunda. (Ejemplos: "Cambiar color de un botón", "Subir un post programado", "Enviar un email de seguimiento").

"MEDIA": Trabajo creativo estándar, diseño de piezas nuevas con lineamientos claros, o redacción de contenido regular. Requiere enfoque pero es el "pan de cada día" de la agencia. (Ejemplos: "Diseñar carrusel de 5 slides", "Redactar guion de reel", "Armar reporte mensual").

"ALTA": Tareas que requieren investigación profunda, conceptualización desde cero, resolución de problemas técnicos complejos o alto impacto en el negocio. (Ejemplos: "Crear identidad visual completa", "Desarrollar sitio web e-commerce", "Estrategia de pauta anual", "Resolver caída de servidor de producción").

Ejemplo de Entrada (Lo que enviará el servidor):
Título: [URGENTE] Cambiar la tipografía de todos los banners de la campaña de Salsipuedes. Descripción: El cliente acaba de llamar, dice que la font no es la correcta. Necesitan esto corregido y subido a la pauta en 2 horas máximo.

Ejemplo de Salida Esperada (Lo que debe responder Gemini):
{"category": "BOMBERO", "complexity": "MEDIA"}`;

/**
 * Classifies a task using Gemini AI.
 * @param {string} title - Task title
 * @param {string} comments - Task description/comments
 * @returns {Promise<Object>} - { category, complexity }
 */
export const classifyTaskWithAI = async (title, comments = "") => {
    if (!vertexAI) {
        console.warn("[AiService] Vertex AI client not initialized. Skipping classification.");
        return { category: null, complexity: null };
    }

    try {
        const model = vertexAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: {
                role: "system",
                parts: [{ text: MASTER_PROMPT }]
            },
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const prompt = `Tarea a clasificar:\n\nTítulo: ${title}\nDescripción: ${comments}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.candidates[0].content.parts[0].text;

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
