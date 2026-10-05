
// Centralized storage for AI prompts to ensure consistency and transparency

export const SUMMARY_PROMPT_TEMPLATE = `
Analiza el siguiente contenido integrado de múltiples fuentes y genera un resumen ejecutivo visualmente estructurado.

Responde estrictamente en formato JSON.

Estructura requerida:
{
  "meeting_title": "Título breve de la reunión o documento",
  "meeting_date": "Fecha relevante si se menciona",
  "meeting_duration": "Duración estimada o reportada",
  "participants": ["Nombre: Rol o área", "Nombre: Rol o área"],
  "meeting_topics": ["Tema tratado 1", "Tema tratado 2"],
  "discussion_details": ["Punto clave 1", "Punto clave 2"],
  "agreements": ["Acuerdo o compromiso 1", "Acuerdo o compromiso 2"],
  "action_items": [
    { "task": "Acción concreta", "priority": "Alta|Media|Baja", "owner": "Nombre o Por asignar", "due_date": "Fecha o Sin fecha" }
  ]
}

{{CONTENT}}
`;

export const ANALYSIS_PROMPT_TEMPLATE = `
Realiza un análisis consultivo profundo y estructurado basado en la información disponible.

Responde estrictamente en formato JSON.

Estructura requerida:
{
  "meeting_topics": ["Tema 1", "Tema 2"],
  "consulting_insights": ["Insight consultivo 1", "Insight consultivo 2"],
  "observations": ["Observación crítica 1", "Observación crítica 2"],
  "recommendations": [
    { "title": "Estrategia recomendada", "description": "Objetivo y pasos tácticos concretos", "priority": "Alta|Media|Baja" }
  ],
  "opportunities": [
    { "title": "Oportunidad detectada", "description": "Potencial e impacto esperado" }
  ]
}

INSTRUCCIONES DE GENERACIÓN:
1. Enfócate únicamente en la información contenida en el contenido provisto.
2. No inventes títulos o frases tomadas de ejemplos o referencias visuales anteriores.

{{CONTENT}}
`;
