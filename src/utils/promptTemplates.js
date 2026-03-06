
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
    {"task": "Acción inmediata requerida", "priority": "Alta", "owner": "Nombre", "due_date": "Fecha si aplica"},
    {"task": "Seguimiento posterior", "priority": "Media", "owner": "Nombre", "due_date": "Fecha si aplica"}
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
     {"title": "Estrategia Recomendada", "description": "Pasos tácticos.", "priority": "Alta"},
     {"title": "Estrategia Recomendada", "description": "Pasos tácticos.", "priority": "Media"}
  ],
  "opportunities": [
     {"title": "Oportunidad Detectada", "description": "Descripción del potencial."}
  ]
}

INSTRUCCIONES DE GENERACIÓN:
1. Enfócate únicamente en la información contenida en el contenido provisto.
2. No inventes títulos o frases tomadas de ejemplos o referencias visuales anteriores.

{{CONTENT}}
`;

export const GEMINI_BENTO_PROMPT_TEMPLATE = `
Eres un Desarrollador Senior de Frontend y Diseñador UI/UX. Cuando recibes análisis y resúmenes generados por OpenAI, debes transformarlos en un documento HTML profesional para reportes estratégicos corporativos de alta gama.

FUENTES DE ESTILO VISUAL (REFERENCIAS OBLIGATORIAS):
Debes analizar y replicar visualmente (espaciados, sombras, radios de borde, jerarquía) los siguientes archivos:
- Diseño de Métricas: https://raw.githubusercontent.com/rchirinosabreu-cloud/minutes/main/assets/diseno/01.png
- Grilla de Hallazgos: https://raw.githubusercontent.com/rchirinosabreu-cloud/minutes/main/assets/diseno/02.png
- Cronograma y Planes: https://raw.githubusercontent.com/rchirinosabreu-cloud/minutes/main/assets/diseno/03.png
- Líneas de Tiempo: https://raw.githubusercontent.com/rchirinosabreu-cloud/minutes/main/assets/diseno/04.png
- Horizontes Estratégicos: https://raw.githubusercontent.com/rchirinosabreu-cloud/minutes/main/assets/diseno/05.png
- Resultados y ROI: https://raw.githubusercontent.com/rchirinosabreu-cloud/minutes/main/assets/diseno/06.png
- Fases de Acción: https://raw.githubusercontent.com/rchirinosabreu-cloud/minutes/main/assets/diseno/07.png
- Secciones de Texto Crítico: https://raw.githubusercontent.com/rchirinosabreu-cloud/minutes/main/assets/diseno/08.png

REGLAS CRÍTICAS DE PROCESAMIENTO:
1. INTEGRIDAD TOTAL: Prohibido resumir. No recortes, no omitas y no modifiques absolutamente ningún texto, título o viñeta del contenido proporcionado. Tu trabajo es DIAGRAMAR, no editar.
2. SISTEMA VISUAL: Usa exclusivamente el estilo Bento Grid con tarjetas (.card) y clases de expansión (.span-2, .span-4).
3. PALETA DE COLORES:
   - Fondo general: #F5F6FA
   - Púrpura estratégico: #635bff (texto blanco, usar en Estrategia y Acción)
   - Aqua Neón: #66FFED (texto oscuro, usar en Contexto y Temas)
   - Texto oscuro: #0C111C
4. TIPOGRAFÍA: Usa 'Plus Jakarta Sans' vía Google Fonts.
5. ICONOGRAFÍA: Utiliza SVGs simples de trazo fino para los iconos superiores de las tarjetas, basándote en los ejemplos de las referencias.

PENSAMIENTO (THINKING):
Antes de generar el código, decide qué tarjetas deben ser .span-4 basándote en la densidad del texto para evitar que el contenido se vea amontonado.

ESTRUCTURA HTML REQUERIDA:
- Contenedor: clase .bento-grid con display: grid, 4 columnas de igual ancho y gap: 24px.
- Tarjetas (.card): fondo blanco, border-radius: 32px, padding: 40px y box-shadow suave.
- Clases de diagramación:
  - .span-4: secciones principales, roadmaps o tablas de acción.
  - .span-2: insights de longitud media u observaciones.
  - .card (simple): métricas cortas y porcentajes.
- Incluye el CSS embebido en la etiqueta <style>.

DIAGRAMA EL SIGUIENTE CONTENIDO EN FORMATO BENTO GRID HTML, SIN ENVOLVER EN BLOQUES DE CÓDIGO:

{{CONTENT}}

INSTRUCCIONES ADICIONALES:
- PORTADA OBLIGATORIA: Antes de la grilla, crea una portada con el logo de BrainStudio, un texto pequeño que diga el valor de TIPO_REPORTE (ej. "Resumen general" o "Análisis estratégico"), el TITULO_DOCUMENTO y el SUBTITULO_PROYECTO como únicos títulos visibles en la portada.
- METADATOS DE PORTADA: En la portada muestra FECHA_GENERACION y DURACION_REUNION. Si DURACION_REUNION está vacío, no muestres texto de reemplazo ni "No especificada".
- LOGO: Usa el SVG de BrainStudio proporcionado en la URL https://brainstudioagencia.com/wp-content/uploads/2026/01/Recurso-1.svg. Si no carga, usa un placeholder neutro sin inventar logos.
- NO INVENTAR: No agregues otros títulos o subtítulos en la portada. No muestres los labels TITULO_DOCUMENTO/SUBTITULO_PROYECTO/TIPO_REPORTE/FECHA_GENERACION/DURACION_REUNION como texto literal.
- PIE DE PÁGINA: Incluye un pie de página fijo con "Brainstudio Intelligence" alineado a la izquierda y "Confidencial" alineado a la derecha.
- Devuelve únicamente el código HTML completo y funcional.
- Asegúrate de que las secciones más largas usen la clase .span-4 para que ocupen todo el ancho y no se amontone el texto.
- Respeta cada viñeta y sub-punto del análisis tal cual.
`;
