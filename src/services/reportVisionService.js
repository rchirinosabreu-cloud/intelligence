import { parseJsonResponse } from './aiService.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const schema = {
  type: "object",
  properties: {
    metrics: {
      type: "object",
      properties: {
        spend: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            value: { anyOf: [{ type: "number" }, { type: "null" }] },
            unit: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "string" }
          },
          required: ["key", "label", "value", "unit", "confidence", "evidence"],
          additionalProperties: false
        },
        impressions: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            value: { anyOf: [{ type: "number" }, { type: "null" }] },
            unit: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "string" }
          },
          required: ["key", "label", "value", "unit", "confidence", "evidence"],
          additionalProperties: false
        },
        reach: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            value: { anyOf: [{ type: "number" }, { type: "null" }] },
            unit: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "string" }
          },
          required: ["key", "label", "value", "unit", "confidence", "evidence"],
          additionalProperties: false
        },
        clicks: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            value: { anyOf: [{ type: "number" }, { type: "null" }] },
            unit: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "string" }
          },
          required: ["key", "label", "value", "unit", "confidence", "evidence"],
          additionalProperties: false
        },
        ctr: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            value: { anyOf: [{ type: "number" }, { type: "null" }] },
            unit: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "string" }
          },
          required: ["key", "label", "value", "unit", "confidence", "evidence"],
          additionalProperties: false
        },
        results: {
          type: "object",
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            value: { anyOf: [{ type: "number" }, { type: "null" }] },
            unit: { type: "string" },
            confidence: { type: "number" },
            evidence: { type: "string" }
          },
          required: ["key", "label", "value", "unit", "confidence", "evidence"],
          additionalProperties: false
        }
      },
      required: ["spend", "impressions", "reach", "clicks", "ctr", "results"],
      additionalProperties: false
    },
    screenType: { type: "string" },
    confidence: { type: "number" },
    narrativeDraft: { type: "string" },
    chartType: { type: "string" },
    title: { type: "string" },
    sectionCategory: { type: "string" },
    platform: { type: "string" },
    dataset: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          value: { anyOf: [{ type: "number" }, { type: "null" }] },
          hombres: { anyOf: [{ type: "number" }, { type: "null" }] },
          mujeres: { anyOf: [{ type: "number" }, { type: "null" }] }
        },
        required: ["label", "value", "hombres", "mujeres"],
        additionalProperties: false
      }
    },
    demographics: {
      type: "object",
      properties: {
        ageGender: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              hombres: { anyOf: [{ type: "number" }, { type: "null" }] },
              mujeres: { anyOf: [{ type: "number" }, { type: "null" }] }
            },
            required: ["label", "hombres", "mujeres"],
            additionalProperties: false
          }
        },
        cities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { anyOf: [{ type: "number" }, { type: "null" }] }
            },
            required: ["label", "value"],
            additionalProperties: false
          }
        },
        countries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { anyOf: [{ type: "number" }, { type: "null" }] }
            },
            required: ["label", "value"],
            additionalProperties: false
          }
        }
      },
      required: ["ageGender", "cities", "countries"],
      additionalProperties: false
    },
    topContent: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          format: { type: "string" },
          results: { anyOf: [{ type: "number" }, { type: "null" }] },
          impressions: { anyOf: [{ type: "number" }, { type: "null" }] },
          reach: { anyOf: [{ type: "number" }, { type: "null" }] }
        },
        required: ["title", "format", "results", "impressions", "reach"],
        additionalProperties: false
      }
    }
  },
  required: ["metrics", "screenType", "confidence", "narrativeDraft", "chartType", "title", "sectionCategory", "platform", "dataset", "demographics", "topContent"],
  additionalProperties: false
};

const SYSTEM_PROMPT = `You are a professional Meta Ads data extraction expert.
Analyze the provided screenshot of Meta Ads metrics and extract the 6 key metrics strictly:
- spend: Inversión (e.g. amount spent in USD, COP, EUR, etc.)
- impressions: Impresiones
- reach: Alcance
- clicks: Clics (en el enlace o todos, prioritize Link Clicks if available)
- ctr: CTR (prioritize CTR (en el enlace) or CTR (todos))
- results: Resultados / conversiones (e.g., Purchases, Leads, etc.)

For each metric, extract the following:
- key: the key name (strictly: "spend", "impressions", "reach", "clicks", "ctr", "results")
- label: the label as seen in the screenshot or translation (e.g., "Importe gastado", "Impresiones", "Alcance", "Clics en el enlace", "CTR (porcentaje de clics en el enlace)", "Resultados")
- value: the numeric value extracted from the image. It must be a raw float/integer number. Remove currency symbols, commas, percent signs, and dots used as thousands separator. Keep decimals (e.g. if CTR is "1.52%", value is 1.52. If spend is "$1,250.50", value is 1250.50). If the metric is completely missing or not visible in the screenshot, return null.
- unit: the unit of measurement (e.g. "USD", "COP", "count", "%", etc.). If not applicable, return a blank string or "count".
- confidence: Your confidence score for this extraction between 0.0 (unreadable) and 1.0 (perfectly clear).
- evidence: Quote the exact text and location/context where the metric was found on the screen.

Also identify:
- screenType: The type of screen (e.g., "Rendimiento Macro" or "Desglose Micro" or "Tabla General").
- confidence: Overall confidence score for the whole screenshot extraction (0.0 to 1.0).
- narrativeDraft: A short narrative explanation of these metrics in Spanish (exactly 3 to 4 complete, well-structured sentences), highlighting the progress and using extremely positive, forward-looking terminology. Never use negative/alarmist words (e.g. instead of "bajo" or "caída", use "fase de consolidación" or "ventana de oportunidad"). Ensure it does not truncate or cut off.

Also extract graphic points and visual data as a structured section:
- chartType: Detect or choose the most appropriate chart type to display this visual: "LINE_CHART" (for trend curves or daily data), "BAR_CHART" (for age/gender bar breakdowns), "DONUT_CHART" (for platform split or percentage distribution), or "RANKING_TABLE" (for listing contents, ads, or posts).
- title: A descriptive and clear Spanish title for this chart/visualization block.
- sectionCategory: Categorize this screenshot section strictly as "ORGANIC" (for organic reels, posts, feed reach, likes, story views, organic Facebook/Instagram profile stats) or "ADS" (for campaigns, ad manager charts, spend/inversión, campaign results, paid conversions).
- platform: Identify the specific platform: "FACEBOOK" (for Facebook specific stats), "INSTAGRAM" (for Instagram specific business profile/feed stats), or "META_ADS" (for paid ads/manager).
- dataset: An array of data points following this strict schema based on chartType:
  - For BAR_CHART and LINE_CHART: return array of { "label": string, "value": number }.
  - For DEMOGRAPHICS_CHART: return array of { "label": string, "hombres": number, "mujeres": number }.
  If not visible or quantifiable in the image, return an empty array []. Do NOT generate simulated, fake, placeholder, or mock data (such as "Simulado 1"). All values must be valid numbers (not strings, and not null/undefined inside the properties if quantifiable).
- title: A descriptive and clear Spanish title for this chart/visualization block, following strictly the Spanish Sentence Case rule (only capitalize the first letter of the first word, all other words in lowercase, except proper names).

For Demographics and Top Content (N:1 Exhaustive Processing):
- demographics: Extract Age & Gender percentage breakdowns (ranges 18-24 to 65+ mapping males to "hombres" and females to "mujeres"), Top Cities ("cities"), and Top Countries ("countries"). Perform exhaustive extraction of all demographic metrics from the screenshot. If not visible in the screenshot, return empty arrays []. NEVER use mock or placeholder data (such as "Simulado X").
- topContent: Extract list of top performing posts, video/Reels formats, and ad creatives. Each must specify "title" (name of publication or ad creative), "format" (Imagen, Reel, or Carrusel), "results" (interactions or conversions), "impressions", and "reach". Perform exhaustive extraction of video, Reels, and ad performance metrics from the screenshot. If not visible, return an empty array []. NEVER use mock or placeholder data.
`;

/**
 * Analyzes a screenshot of Meta Ads using OpenAI Vision with Structured Outputs.
 * @param {Buffer} imageBuffer - The binary image data.
 * @param {string} mimeType - The mime type of the image (image/png, image/jpeg).
 * @returns {Promise<Object>} The parsed canonical metrics extraction response.
 */
export const extractMetricsWithVision = async (imageBuffer, mimeType = 'image/jpeg') => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("Missing OpenAI API Key in server configuration");
    }

    const base64Image = imageBuffer.toString('base64');
    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";

    console.log(`[Vision Service] Sending image to OpenAI using model ${model}...`);

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'BrainStudioIntelligence/2.0'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: "Extract key metrics from this Meta Ads screenshot."
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "metrics_extraction",
                    strict: true,
                    schema: schema
                }
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Vision Service] OpenAI API error: ${response.status}`, errorText);
        throw new Error(`OpenAI Vision API failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("OpenAI Vision response content is empty");
    }

    try {
        return parseJsonResponse(content);
    } catch (parseError) {
        console.error("[Vision Service] Error parsing extracted JSON schema:", parseError, "Raw content:", content);
        throw parseError;
    }
};

/**
 * Generates an editorial narrative and strategic action plan from normalized metrics and sections.
 * @param {Object} normalizedMetrics - The validated metrics object.
 * @param {Array} sections - The structured sections array.
 * @returns {Promise<Object>} The parsed narrative structure.
 */
export const generateNarrativeWithOpenAI = async (normalizedMetrics, sections = []) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("Missing OpenAI API Key in server configuration");
    }

    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";

    const prompt = `Analiza las siguientes métricas cuantitativas ya validadas y la colección de secciones visuales, y genera una narración editorial estructurada en Español.

MÉTRICAS DEL PERIODO:
${JSON.stringify(normalizedMetrics, null, 2)}

SECCIONES VISUALES REGISTRADAS:
${JSON.stringify(sections, null, 2)}

REGLAS DE REDACCIÓN DE LA NARRATIVA:
1. TONO: Consultivo, positivo, profesional, motivador y orientado a metas comerciales de alto nivel.
2. REGLA ESTRICTA DE INTEGRIDAD DE DATOS (PROHIBIDO HALLUCINAR): Queda terminantemente prohibido que menciones o inventes valores numéricos, métricas, cantidades o porcentajes que no existan de forma explícita en el objeto de métricas o secciones provisto arriba. No asumas divisas ni cifras que no estén allí.
3. PROFUNDIDAD NARRATIVA EDITORIAL: Cada comentario explicativo o interpretativo debe constar de explicaciones consultivas profundas de exactamente 3 a 4 oraciones completas y bien estructuradas. Asegura que el string comience desde el inicio de la oración y no sufra ningún recorte, truncamiento o abreviación.
4. ESTRUCTURA REQUERIDA (JSON):
   - headline: Un titular de impacto, corto y motivador, capitalizado strictly en Sentence Case (solo la primera letra en mayúscula).
   - summaryPoints: Un arreglo de exactamente 3 puntos clave resumidos, cada uno capitalizado strictly en Sentence Case.
   - keyAchievements: Un texto profundo de exactamente 3 a 4 oraciones completas que explique los logros más importantes y las variaciones relevantes, destacando la evolución de manera optimista, capitalizado strictly en Sentence Case.
   - actionPlan: Un plan de acción con exactamente 3 compromisos recomendados. Cada compromiso debe ser un objeto con 'action' (Acción, capitalizado strictly en Sentence Case), 'kpi' (KPI de éxito, capitalizado strictly en Sentence Case) y 'suggestedAssignee' (Responsable sugerido).
   - logrosYAvances: Un arreglo de exactamente 4 a 5 strings (viñetas analíticas con el impacto alcanzado), capitalizado strictly en Sentence Case.
   - contenidoTopAnalisis: Texto explicativo de las piezas creativas de mayor rendimiento con ranking detallado (Top 1 - Imagen, Top 2 - Reel, etc.), capitalizado strictly en Sentence Case.
   - oportunidadesYAprendizajes: Lecciones clave extraídas de la pauta y el contenido orgánico, capitalizado strictly en Sentence Case.
   - recomendacionesEstrategicas: 2 a 3 párrafos de aconsejamiento consultivo y motivador de cierre, capitalizado strictly en Sentence Case.
   - sections: Un arreglo que contenga exactamente los mismos objetos que se te pasaron en SECCIONES VISUALES REGISTRADAS, pero agregando en cada uno un campo 'narrativeComment' con una explicación consultiva profunda, positiva y de exactamente 3 a 4 oraciones completas explicando dicho gráfico o tabla, capitalizado strictly en Sentence Case.
`;

    const narrativeSchema = {
      type: "object",
      properties: {
        headline: { type: "string" },
        summaryPoints: {
          type: "array",
          items: { type: "string" }
        },
        keyAchievements: { type: "string" },
        actionPlan: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string" },
              kpi: { type: "string" },
              suggestedAssignee: { type: "string" }
            },
            required: ["action", "kpi", "suggestedAssignee"],
            additionalProperties: false
          }
        },
        logrosYAvances: {
          type: "array",
          items: { type: "string" }
        },
        contenidoTopAnalisis: { type: "string" },
        oportunidadesYAprendizajes: { type: "string" },
        recomendacionesEstrategicas: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sectionId: { type: "string" },
              chartType: { type: "string" },
              title: { type: "string" },
              sectionCategory: { type: "string" },
              platform: { type: "string" },
              dataset: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { anyOf: [{ type: "number" }, { type: "null" }] },
                    hombres: { anyOf: [{ type: "number" }, { type: "null" }] },
                    mujeres: { anyOf: [{ type: "number" }, { type: "null" }] }
                  },
                  required: ["label", "value", "hombres", "mujeres"],
                  additionalProperties: false
                }
              },
              narrativeComment: { type: "string" }
            },
            required: ["sectionId", "chartType", "title", "sectionCategory", "platform", "dataset", "narrativeComment"],
            additionalProperties: false
          }
        }
      },
      required: ["headline", "summaryPoints", "keyAchievements", "actionPlan", "logrosYAvances", "contenidoTopAnalisis", "oportunidadesYAprendizajes", "recomendacionesEstrategicas", "sections"],
      additionalProperties: false
    };

    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'BrainStudioIntelligence/2.0'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                {
                    role: 'system',
                    content: "Eres un Director Editorial de Estrategia Digital en Brainstudio, experto en redactar análisis consultivos y planes de acción accionables basados en datos reales."
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "editorial_narrative",
                    strict: true,
                    schema: narrativeSchema
                }
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Vision Service] OpenAI Narrative API error: ${response.status}`, errorText);
        throw new Error(`OpenAI Narrative API failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("OpenAI Narrative response content is empty");
    }

    try {
        return parseJsonResponse(content);
    } catch (parseError) {
        console.error("[Vision Service] Error parsing narrative JSON schema:", parseError, "Raw content:", content);
        throw parseError;
    }
};
