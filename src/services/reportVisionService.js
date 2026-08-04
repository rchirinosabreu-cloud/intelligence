import { parseJsonResponse } from './aiService.js';
import { GoogleGenAI } from '@google/genai';
import { adaptDatasetForChart } from '../lib/reportChartData.js';
import { filterTopContentRows } from '../lib/reportPresentation.js';

export { filterTopContentRows as filterExtractedTopContentRows };

/**
 * Sanitizes and cleans formatted text string values into valid floats or integers.
 */
export const cleanNumericValue = (rawVal) => {
    if (typeof rawVal === 'number') {
        return isFinite(rawVal) ? rawVal : null;
    }
    if (typeof rawVal !== 'string') {
        return null;
    }

    let clean = rawVal.trim();
    // Remove symbols, currency words, letters, spaces, percent signs
    clean = clean.replace(/[^\d.,+-]/g, '');

    if (!clean) return null;

    // Detect format of separator:
    const commaIndex = clean.lastIndexOf(',');
    const periodIndex = clean.lastIndexOf('.');

    if (commaIndex !== -1 && periodIndex !== -1) {
        if (commaIndex < periodIndex) {
            // US format "1,250.50"
            clean = clean.replace(/,/g, '');
        } else {
            // European format "1.250,50"
            clean = clean.replace(/\./g, '').replace(/,/g, '.');
        }
    } else if (commaIndex !== -1) {
        const parts = clean.split(',');
        if (parts[1] && parts[1].length === 3) {
            clean = clean.replace(/,/g, '');
        } else {
            clean = clean.replace(/,/g, '.');
        }
    } else if (periodIndex !== -1) {
        const parts = clean.split('.');
        if (parts[1] && parts[1].length === 3 && parts.length === 2) {
            clean = clean.replace(/\./g, '');
        } else if (parts.length > 2) {
            clean = clean.replace(/\./g, '');
        }
    }

    const num = parseFloat(clean);
    return isFinite(num) ? num : null;
};

export const visionExtractionSchema = {
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
        },
        ...Object.fromEntries([
          'views', 'viewers', 'interactions', 'linkClicks', 'profileVisits', 'follows', 'videoViews', 'reachOrganic', 'reachPaid'
        ].map((key) => [key, {
          type: "object",
          properties: {
            key: { type: "string" }, label: { type: "string" },
            value: { anyOf: [{ type: "number" }, { type: "null" }] },
            unit: { type: "string" }, changePct: { anyOf: [{ type: "number" }, { type: "null" }] },
            confidence: { type: "number" }, evidence: { type: "string" }
          },
          required: ["key", "label", "value", "unit", "changePct", "confidence", "evidence"],
          additionalProperties: false
        }]))
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
    entityLevel: { type: "string" },
    resultType: { type: "string" },
    period: {
      type: "object",
      properties: {
        start: { anyOf: [{ type: "string" }, { type: "null" }] },
        end: { anyOf: [{ type: "string" }, { type: "null" }] }
      },
      required: ["start", "end"],
      additionalProperties: false
    },
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

// Structured output stays intentionally compact: requiring a large object with every
// possible organic and paid key caused Gemini to repeat keys and truncate JSON.
visionExtractionSchema.properties.metrics = {
  type: "array",
  items: {
    type: "object",
    properties: {
      key: { type: "string" },
      label: { type: "string" },
      value: { anyOf: [{ type: "number" }, { type: "null" }] },
      unit: { type: "string" },
      scope: { type: "string" },
      changePct: { anyOf: [{ type: "number" }, { type: "null" }] },
      confidence: { type: "number" },
      evidence: { type: "string" }
    },
    required: ["key", "label", "value", "unit", "scope", "changePct", "confidence", "evidence"],
    additionalProperties: false
  }
};

const SYSTEM_PROMPT = `You are a professional Meta Ads and Organic Social Media data extraction expert using Google Generative AI (Gemini).
Analyze this screenshot as ONE independent source. Extract only metrics that are visibly present; do not emit null placeholder metrics. Paid screenshots may contain these canonical paid keys:
- spend: Inversión (e.g. amount spent in USD, COP, EUR, etc.)
- impressions: Impresiones
- reach: Alcance
- clicks: Clics (en el enlace o todos, prioritize Link Clicks if available)
- ctr: CTR (prioritize CTR (en el enlace) or CTR (todos))
- results: Resultados / conversiones (e.g., Purchases, Leads, etc.)

Organic screenshots may use: views, viewsOrganic, viewsPaid, viewers, interactions, linkClicks, profileVisits, follows, followersTotal, videoViews, reach, reachOrganic, and reachPaid. Never rename organic views as impressions or interactions as paid results merely to fill a canonical slot. Use follows only for followers gained during the period; use followersTotal for the audience total shown on demographic screens. Include visible changePct with its original sign.

For each metric, extract the following:
- key: use the paid canonical keys or organic semantic keys listed above; never substitute one concept for another. Return metrics as an array containing visible metrics only.
- label: the label as seen in the screenshot or translation (e.g., "Importe gastado", "Impresiones", "Alcance", "Clics en el enlace", "CTR (porcentaje de clics en el enlace)", "Resultados")
- value: the numeric value extracted from the image. It must be a raw float/integer number. Remove currency symbols, commas, percent signs, and dots used as thousands separator. Keep decimals (e.g. if CTR is "1.52%", value is 1.52. If spend is "$1,250.50", value is 1250.50). If the metric is completely missing or not visible in the screenshot, return null.
- unit: the unit of measurement (e.g. "USD", "COP", "count", "%", etc.). If not applicable, return a blank string or "count".
- scope: return "ORGANIC", "PAID", or "MIXED" according to what that exact value represents. A total that combines organic and ads is MIXED and must not be used as an organic result.
- confidence: Your confidence score for this extraction between 0.0 (unreadable) and 1.0 (perfectly clear).
- evidence: Quote the exact text and location/context where the metric was found on the screen.

Also identify each screenshot independently. Never merge it with another source:
- screenType: classify strictly as "CONTENT_SUMMARY", "METRIC_TRENDS", "AUDIENCE_DEMOGRAPHICS", "CONTENT_FORMATS", "AD_SET_SUMMARY", "AD_TABLE", or "UNKNOWN".
- entityLevel: for paid tables return "CAMPAIGN", "AD_SET", "AD", or "UNKNOWN". For organic screens return "ORGANIC".
- resultType: preserve the exact semantic result, e.g. "CONVERSATIONS", "LEADS", "PURCHASES", "INTERACTIONS", or "UNKNOWN". A conversation is not a sale or final conversion.
- period: extract the visible start/end dates as ISO YYYY-MM-DD when legible; otherwise use null. This is the screenshot period, not an inferred report month.
- confidence: Overall confidence score for the whole screenshot extraction (0.0 to 1.0).
- narrativeDraft: exactly two complete Spanish paragraphs separated by \n\n. Paragraph one reports the most relevant visible figures honestly; paragraph two explains business meaning and one concrete next decision. Be constructive but never disguise a decline or claim sales, profitability, causation, or final conversions without evidence.

Also extract graphic points and visual data as a structured section:
- chartType: Detect or choose the most appropriate chart type to display this visual: "LINE_CHART" (for trend curves or daily data), "BAR_CHART" (for age/gender bar breakdowns), "DONUT_CHART" (for platform split or percentage distribution), or "RANKING_TABLE" (for listing contents, ads, or posts).
- title: A descriptive and clear Spanish title for this chart/visualization block.
- sectionCategory: Categorize this screenshot section strictly as "ORGANIC" (for organic reels, posts, feed reach, likes, story views, organic Facebook/Instagram profile stats) or "ADS" (for campaigns, ad manager charts, spend/inversión, campaign results, paid conversions).
- platform: return "FACEBOOK" or "INSTAGRAM" for organic screenshots, using explicit text and header icons together; return "CROSS_PLATFORM" only when the screen itself is truly combined; return "META_ADS" for Ads Manager; return "UNKNOWN" when signals conflict. Do not collapse Facebook and Instagram into ORGANIC_RRSS.
- dataset: An array of data points following this strict schema based on chartType:
  - For BAR_CHART and LINE_CHART: return array of { "label": string, "value": number }.
  - For DEMOGRAPHICS_CHART: return array of { "label": string, "hombres": number, "mujeres": number }.
  If not visible or quantifiable in the image, return an empty array []. Do NOT generate simulated, fake, placeholder, or mock data (such as "Simulado 1"). All values must be valid numbers (not strings, and not null/undefined inside the properties if quantifiable).
- title: A descriptive and clear Spanish title for this chart/visualization block, following strictly the Spanish Sentence Case rule (only capitalize the first letter of the first word, all other words in lowercase, except proper names).

For Demographics and Top Content (N:1 Exhaustive Processing):
- demographics: Extract Age & Gender percentage breakdowns (ranges 18-24 to 65+ mapping males to "hombres" and females to "mujeres"), Top Cities ("cities"), and Top Countries ("countries"). Perform exhaustive extraction of all demographic metrics from the screenshot. If not visible in the screenshot, return empty arrays []. NEVER use mock or placeholder data (such as "Simulado X").
- topContent: Extract list of top performing posts, video/Reels formats, and ad creatives. Each must specify "title" (name of publication or ad creative), "format" (Imagen, Reel, or Carrusel), "results" (interactions or conversions), "impressions", and "reach". Perform exhaustive extraction of video, Reels, and ad performance metrics from the screenshot. If not visible, return an empty array []. NEVER use mock or placeholder data.

RIGOROUS META ADS TABLE PARSING RULES:
1. Row titles (the "title" field in topContent) MUST correspond strictly to the actual names of ads or Reels (e.g. "REEL - ELEGIR COLEGIO", "POST - ADVENTURE").
2. It is STRICTLY PROHIBITED to use metric names (like "Importe gastado", "Impresiones", "Alcance", "Resultados") as row titles.
3. Each column MUST map its actual numeric value from the screenshot: results (real conversions), impressions (actual impressions), and reach (actual accounts reached).
4. It is STRICTLY PROHIBITED to copy or repeat the investment/spend value in all columns or cells of a row. Keep the metric columns completely distinct and separate.
5. Aggregate format labels such as "Reels", "Enlaces", "Historias", "Foto", "Varias fotos" or "Otros" are distribution categories, not publications or ads. NEVER include them in topContent unless the row is an actual named creative with its own impressions or reach.
`;

const hasUsableExtractionSignal = (extracted) => {
    if (!extracted || typeof extracted !== 'object') return false;
    const metricItems = Array.isArray(extracted.metrics)
        ? extracted.metrics
        : Object.values(extracted.metrics || {});
    if (metricItems.some(item => cleanNumericValue(item?.value) !== null)) return true;
    if (adaptDatasetForChart(extracted.dataset || []).length > 0) return true;
    const demographics = extracted.demographics || {};
    if (['ageGender', 'cities', 'countries'].some(key => Array.isArray(demographics[key]) && demographics[key].length > 0)) return true;
    if (filterTopContentRows(extracted.topContent || []).length > 0) return true;
    return typeof extracted.narrativeDraft === 'string' && extracted.narrativeDraft.trim().length > 10;
};

/**
 * Analyzes a screenshot of Meta Ads using Gemini Vision with Structured Outputs.
 * @param {Buffer} imageBuffer - The binary image data.
 * @param {string} mimeType - The mime type of the image (image/png, image/jpeg).
 * @returns {Promise<Object>} The parsed canonical metrics extraction response.
 */
export const extractMetricsWithGemini = async (imageBuffer, mimeType = 'image/jpeg') => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY in server configuration");
    }

    const genAI = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    console.log(`[Vision Service] Sending image to Gemini using model ${model}...`);

    const base64Image = imageBuffer.toString('base64');

    let lastParseError;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await genAI.models.generateContent({
            model: model,
            contents: [{
                role: 'user',
                parts: [
                    { text: SYSTEM_PROMPT },
                    { text: attempt === 1
                        ? "Extract key metrics from this Meta Ads/organic screenshot."
                        : "Retry the extraction. Return one complete, strictly valid JSON object with every comma and closing delimiter. Do not repeat keys." },
                    { inlineData: { data: base64Image, mimeType } }
                ]
            }],
            config: {
                responseMimeType: "application/json",
                responseSchema: visionExtractionSchema,
                maxOutputTokens: 16384,
                temperature: 0
            }
        });

        const content = result.text;
        if (!content) {
            lastParseError = new Error("Gemini Vision response content is empty");
        } else {
            try {
                return parseJsonResponse(content);
            } catch (parseError) {
                lastParseError = parseError;
                console.error(`[Vision Service] Invalid JSON on attempt ${attempt}/${maxAttempts}:`, parseError.message, "Raw snippet:", content.slice(0, 500));
            }
        }
        if (attempt < maxAttempts) console.warn(`[Vision Service] Retrying malformed Gemini structured output (${attempt}/${maxAttempts - 1}).`);
    }
    throw lastParseError;
};

/**
 * Paso 2: Desacoplamiento de Validación por Fuente
 * Evaluates the parsed payload of a single screenshot and cleans it, returning if it is usable.
 */
export const validateAndCleanSourceExtraction = (extracted) => {
    if (!extracted) {
        return { usable: false, warnings: ["Extracción vacía"] };
    }

    let metrics = extracted.metrics || {};
    // ADAPTER: If metrics is formatted as an Array from Gemini, convert it to a Dictionary indexable by key!
    if (Array.isArray(metrics)) {
        const dict = {};
        metrics.forEach(item => {
            if (item && item.key) {
                dict[item.key] = item;
            }
        });
        metrics = dict;
    }

    const dataset = adaptDatasetForChart(extracted.dataset || []);
    const demographics = extracted.demographics || {};
    const topContent = filterTopContentRows(extracted.topContent || []);
    const narrativeDraft = extracted.narrativeDraft || "";

    const allowedKeys = [
        'spend', 'impressions', 'reach', 'clicks', 'ctr', 'results',
        'views', 'viewers', 'interactions', 'linkClicks', 'profileVisits', 'follows',
        'followersTotal', 'videoViews', 'viewsOrganic', 'viewsPaid', 'reachOrganic', 'reachPaid'
    ];
    const cleanMetrics = {};
    let hasValidCanonicalMetric = false;

    for (const key of allowedKeys) {
        const item = metrics[key] || {};
        const val = cleanNumericValue(item.value);

        cleanMetrics[key] = {
            key: key,
            label: typeof item.label === 'string' ? item.label : String(item.key || key),
            value: val,
            unit: key === 'spend' ? 'COP' : (typeof item.unit === 'string' && item.unit !== 'count' ? item.unit : 'count'),
            confidence: typeof item.confidence === 'number' ? item.confidence : 1.0,
            evidence: typeof item.evidence === 'string' ? item.evidence : '',
            scope: typeof item.scope === 'string' ? item.scope.toUpperCase() : (extracted.sectionCategory === 'ADS' ? 'PAID' : 'ORGANIC'),
            changePct: typeof item.changePct === 'number' ? item.changePct : null
        };

        if (cleanMetrics[key].value !== null) {
            hasValidCanonicalMetric = true;
        }
    }

    const hasValidDataset = Array.isArray(dataset) && dataset.length > 0;
    const hasValidDemographics = demographics && (
        (Array.isArray(demographics.ageGender) && demographics.ageGender.length > 0) ||
        (Array.isArray(demographics.cities) && demographics.cities.length > 0) ||
        (Array.isArray(demographics.countries) && demographics.countries.length > 0)
    );
    const hasValidTopContent = Array.isArray(topContent) && topContent.length > 0;
    const hasExplicitNarrative = typeof narrativeDraft === 'string' && narrativeDraft.trim().length > 10;

    const usable = hasValidCanonicalMetric || hasValidDataset || hasValidDemographics || hasValidTopContent || hasExplicitNarrative;

    const warnings = [];
    const missingMetrics = [];
    const invalidMetrics = [];

    for (const key of allowedKeys) {
        if (cleanMetrics[key].value === null) {
            missingMetrics.push(key);
        }
    }

    // Math check for CTR discrepancy
    const clicksVal = cleanMetrics.clicks.value;
    const impressionsVal = cleanMetrics.impressions.value;
    const ctrVal = cleanMetrics.ctr.value;

    if (typeof clicksVal === 'number' && typeof impressionsVal === 'number' && impressionsVal > 0) {
        const theoreticalCtr = (clicksVal / impressionsVal) * 100;
        if (typeof ctrVal === 'number') {
            const diff = Math.abs(ctrVal - theoreticalCtr);
            if (diff > 0.01) {
                warnings.push(`Advertencia matemática: El CTR extraído (${ctrVal}%) difiere del cálculo teórico basado en clics e impresiones (${theoreticalCtr.toFixed(4)}%).`);
            }
        }
    }

    return {
        usable,
        metrics: cleanMetrics,
        dataset,
        demographics: hasValidDemographics ? demographics : null,
        topContent,
        missingMetrics,
        invalidMetrics,
        warnings,
        chartType: extracted.chartType || 'LINE_CHART',
        title: extracted.title || 'Sección',
        narrativeDraft,
        screenType: extracted.screenType || 'Desconocido',
        sectionCategory: extracted.sectionCategory || 'ADS',
        platform: extracted.platform || 'META_ADS',
        entityLevel: extracted.entityLevel || (extracted.sectionCategory === 'ORGANIC' ? 'ORGANIC' : 'UNKNOWN'),
        resultType: extracted.resultType || 'UNKNOWN',
        period: extracted.period || { start: null, end: null }
    };
};

/**
 * Paso 3: Consolidación Semántica Acumulativa
 * Merges a single cleaned screenshot extraction into the master accumulator.
 */
export const mergeSourceMetricsIntoAccumulator = (accumulator, incomingExtraction) => {
    if (!accumulator) {
        accumulator = {
            spend: { sum: 0, count: 0, label: 'Inversión Total', unit: 'COP' },
            impressions: { sum: 0, count: 0, label: 'Impresiones Totales', unit: 'count' },
            reach: { values: [], label: 'Alcance Total', unit: 'count' },
            clicks: { sum: 0, count: 0, label: 'Clics Totales', unit: 'count' },
            results: { sum: 0, count: 0, label: 'Resultados Totales', unit: 'count' },
            ctr: { label: 'CTR Promedio', unit: '%' },
            demographics: { ageGender: [], cities: [], countries: [] },
            topContent: [],
            observedTotals: new Set()
        };
    }

    let { metrics, demographics, topContent } = incomingExtraction;

    // ADAPTER: If metrics is formatted as an Array from Gemini, convert it to a Dictionary indexable by key!
    if (Array.isArray(metrics)) {
        const dict = {};
        metrics.forEach(item => {
            if (item && item.key) {
                dict[item.key] = item;
            }
        });
        metrics = dict;
    }

    const totalSignature = ['spend', 'impressions', 'clicks', 'results']
        .map(key => `${key}:${metrics[key]?.value ?? ''}`).join('|');
    const isRepeatedTotal = accumulator.observedTotals.has(totalSignature);
    if (!isRepeatedTotal) accumulator.observedTotals.add(totalSignature);

    // Regla de Ausencia: Si la métrica entrante es null o undefined, preservar el acumulado anterior
    const cleanSpend = metrics.spend ? cleanNumericValue(metrics.spend.value) : null;
    if (cleanSpend !== null && !isRepeatedTotal) {
        accumulator.spend.sum += cleanSpend;
        accumulator.spend.count++;
        if (metrics.spend.unit) accumulator.spend.unit = metrics.spend.unit;
    }

    const cleanImpressions = metrics.impressions ? cleanNumericValue(metrics.impressions.value) : null;
    if (cleanImpressions !== null && !isRepeatedTotal) {
        accumulator.impressions.sum += cleanImpressions;
        accumulator.impressions.count++;
    }

    const cleanClicks = metrics.clicks ? cleanNumericValue(metrics.clicks.value) : null;
    if (cleanClicks !== null && !isRepeatedTotal) {
        accumulator.clicks.sum += cleanClicks;
        accumulator.clicks.count++;
    }

    const cleanResults = metrics.results ? cleanNumericValue(metrics.results.value) : null;
    if (cleanResults !== null && !isRepeatedTotal) {
        accumulator.results.sum += cleanResults;
        accumulator.results.count++;
    }

    // Regla de Alcance (reach): Tratar el alcance como métrica no aditiva si proviene de capturas del mismo periodo
    const cleanReach = metrics.reach ? cleanNumericValue(metrics.reach.value) : null;
    if (cleanReach !== null) {
        accumulator.reach.values.push(cleanReach);
    }

    // Accumulate demographics safely
    if (demographics) {
        if (Array.isArray(demographics.ageGender) && demographics.ageGender.length > 0) {
            accumulator.demographics.ageGender = demographics.ageGender;
        }
        if (Array.isArray(demographics.cities) && demographics.cities.length > 0) {
            accumulator.demographics.cities = demographics.cities;
        }
        if (Array.isArray(demographics.countries) && demographics.countries.length > 0) {
            accumulator.demographics.countries = demographics.countries;
        }
    }

    // Accumulate top content safely
    if (Array.isArray(topContent) && topContent.length > 0) {
        accumulator.topContent = [...accumulator.topContent, ...topContent];
    }

    return accumulator;
};

/**
 * Paso 3: Consolidación Semántica Acumulativa - Finalización
 * Formatea el acumulador en la estructura normalizedMetrics requerida por el backend.
 */
export const finalizeNormalizedMetrics = (accumulator) => {
    if (!accumulator) return null;

    // Regla de CTR: Recalcular el CTR global derivado mediante la fórmula teórica clicks / impressions * 100
    let overallClicks = accumulator.clicks.count > 0 ? accumulator.clicks.sum : null;
    let overallImpressions = accumulator.impressions.count > 0 ? accumulator.impressions.sum : null;
    let overallCtr = null;

    if (overallClicks !== null && overallImpressions !== null && overallImpressions > 0) {
        overallCtr = parseFloat(((overallClicks / overallImpressions) * 100).toFixed(4));
    }

    // Consolidate non-additive reach: take maximum observed value to prevent users counts duplication
    let overallReach = null;
    if (accumulator.reach.values.length > 0) {
        overallReach = Math.max(...accumulator.reach.values);
    }

    // Formulate final normalizedMetrics payload conforming strictly to Schema
    const finalMetrics = {
        spend: {
            key: 'spend',
            label: 'Inversión Total',
            value: accumulator.spend.count > 0 ? accumulator.spend.sum : null,
            unit: accumulator.spend.unit,
            confidence: 1.0,
            evidence: 'Consolidación de fuentes'
        },
        impressions: {
            key: 'impressions',
            label: 'Impresiones Totales',
            value: overallImpressions,
            unit: 'count',
            confidence: 1.0,
            evidence: 'Consolidación de fuentes'
        },
        reach: {
            key: 'reach',
            label: 'Alcance Total',
            value: overallReach,
            unit: 'count',
            confidence: 1.0,
            evidence: 'Consolidación de fuentes (máximo observado)'
        },
        clicks: {
            key: 'clicks',
            label: 'Clics Totales',
            value: overallClicks,
            unit: 'count',
            confidence: 1.0,
            evidence: 'Consolidación de fuentes'
        },
        ctr: {
            key: 'ctr',
            label: 'CTR Promedio',
            value: overallCtr,
            unit: '%',
            confidence: 1.0,
            evidence: 'Cálculo derivado de clics e impresiones'
        },
        results: {
            key: 'results',
            label: 'Resultados Totales',
            value: accumulator.results.count > 0 ? accumulator.results.sum : null,
            unit: 'count',
            confidence: 1.0,
            evidence: 'Consolidación de fuentes'
        },
        demographics: accumulator.demographics,
        topContent: accumulator.topContent
    };

    return finalMetrics;
};

export const preserveApprovedReportData = (existingMetrics = {}, approvedMetrics = {}) => {
    const result = { ...existingMetrics };
    for (const key of ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'results']) {
        result[key] = { ...(existingMetrics[key] || {}), ...(approvedMetrics[key] || {}) };
    }
    return result;
};

export const reconcileNarrativeSections = (storedSections = [], narrativeSections = []) => {
    const comments = new Map(narrativeSections.map(section => [section.sectionId, section.narrativeComment]));
    return storedSections.map(section => ({
        ...section,
        narrativeComment: typeof comments.get(section.sectionId) === 'string'
            ? comments.get(section.sectionId)
            : (section.narrativeComment || '')
    }));
};

/**
 * Generates an editorial narrative and strategic action plan from normalized metrics and sections using Gemini.
 * @param {Object} normalizedMetrics - The validated metrics object.
 * @param {Array} sections - The structured sections array.
 * @returns {Promise<Object>} The parsed narrative structure.
 */
export const generateNarrativeWithGemini = async (normalizedMetrics, sections = [], clientName = 'el cliente') => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY in server configuration");
    }

    const genAI = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const prompt = `Analiza las siguientes métricas cuantitativas ya validadas y la colección de secciones visuales, y genera una narración editorial estructurada en Español.

MÉTRICAS DEL PERIODO:
${JSON.stringify(normalizedMetrics, null, 2)}

SECCIONES VISUALES REGISTRADAS:
${JSON.stringify(sections, null, 2)}

CLIENTE DEL INFORME:
${clientName}

REGLAS DE REDACCIÓN DE LA NARRATIVA:
1. TONO: Consultivo, positivo, profesional, motivador y orientado a metas comerciales de alto nivel.
2. REGLA ESTRICTA DE INTEGRIDAD DE DATOS (PROHIBIDO HALLUCINAR): Queda terminantemente prohibido que menciones o inventes valores numéricos, métricas, cantidades o porcentajes que no existan de forma explícita en el objeto de métricas o secciones provisto arriba. No asumas divisas ni cifras que no estén allí.
2.1. ORDEN EDITORIAL: Si existen fuentes orgánicas, headline, summaryPoints, keyAchievements y logrosYAvances deben abrir exclusivamente con desempeño orgánico. La inversión, CTR, resultados y recomendaciones de pauta se reservan para la sección ADS posterior. Nunca abras un informe combinado hablando de inversión publicitaria.
2.2. ESPECIFICIDAD: Cada gráfica debe tener una lectura distinta según su screenType, plataforma, categorías y valores. Prohibido repetir un mismo segundo párrafo entre secciones. CONTENT_SUMMARY interpreta el embudo; METRIC_TRENDS analiza distribución temporal sin inventar causas; AUDIENCE_DEMOGRAPHICS interpreta composición sin llamarla rentable; CONTENT_FORMATS compara uso y rendimiento; AD_TABLE diferencia volumen y eficiencia.
2.3. PERSONALIZACIÓN: En el segundo párrafo escribe siempre "Para ${clientName}," y conecta los datos con una decisión concreta para ese cliente. Está prohibida la frase "Para el negocio" y cualquier sustituto impersonal equivalente.
3. PROFUNDIDAD NARRATIVA EDITORIAL (REGLA DE DOS PÁRRAFOS POR GRÁFICO): Cada comentario explicativo o interpretativo en el campo 'narrativeComment' de 'sections' y 'consultativeComment' de 'granularNarratives' debe constar estrictamente de al menos DOS PÁRRAFOS completos, separados por un salto de línea (\\n\\n):
   - Primer Párrafo (Análisis de Datos y Audiencia): Traducción directa de las cifras a un lenguaje claro y accesible, citando estrictamente los nombres de las categorías líderes y sus números exactos de la gráfica o tabla (por ejemplo: "En Instagram, las Historias alcanzaron un 22% de interacción superando a las Publicaciones tradicionales con un 13%..."). Queda prohibido usar textos genéricos sin mencionar datos numéricos reales de la gráfica.
   - Segundo Párrafo (Proyección Estratégica y Motivación): Enfoque consultivo y entusiasta de cierre que celebre el progreso del periodo, conecte el logro con los objetivos de negocio del cliente y lo motive hacia los siguientes pasos.
   Asegura que cada string comience desde el inicio de la oración y no sufra ningún recorte, truncamiento o abreviación.
4. ESTRUCTURA REQUERIDA (JSON):
   - headline: Un titular de impacto, corto y motivador, capitalizado strictly en Sentence Case (solo la primera letra en mayúscula).
   - summaryPoints: Un arreglo de exactamente 3 puntos clave resumidos, cada uno capitalizado strictly en Sentence Case.
   - keyAchievements: Un texto profundo de exactamente 3 a 4 oraciones completas que explique los logros más importantes y las variaciones relevantes, destacando la evolución de manera optimista, capitalizado strictly en Sentence Case.
   - actionPlan: Un plan de acción con exactamente 3 compromisos recomendados. Cada compromiso debe ser un objeto con 'action' (Acción, capitalizado strictly en Sentence Case), 'kpi' (KPI de éxito, capitalizado strictly en Sentence Case) y 'suggestedAssignee' (Responsable sugerido).
   - logrosYAvances: Un arreglo de exactamente 4 a 5 strings (viñetas analíticas con encabezado en negrita y explicación de valor, por ejemplo: "*Alcance orgánico sólido:* Se alcanzaron..."), capitalizado strictly en Sentence Case.
   - contenidoTopAnalisis: Texto explicativo de las piezas creativas de mayor rendimiento con ranking detallado (Top 1 - Imagen, Top 2 - Reel, etc.), capitalizado strictly en Sentence Case.
   - oportunidadesYAprendizajes: Arreglo de 3 a 4 objetos separados con 'title', 'evidence', 'learning' y 'application'. Cada evidencia debe citar datos provistos y cada aplicación debe ser concreta.
   - recomendacionesEstrategicas: Arreglo de 3 a 4 objetos separados con 'priority' ('ALTA' o 'MEDIA'), 'action', 'rationale' y 'kpi'. No recomiendes pauta cuando solo existan fuentes orgánicas.
   - sections: Un arreglo que contenga exactamente los mismos objetos que se te pasaron en SECCIONES VISUALES REGISTRADAS, pero agregando en cada uno un campo 'narrativeComment' con una explicación consultiva profunda, positiva y estructurada estrictamente en al menos DOS PÁRRAFOS completos separados por un salto de línea (\\n\\n) según la regla de DOS PÁRRAFOS descrita arriba, capitalizado con Sentence Case.
   - granularNarratives: Un arreglo que contenga exactamente dos objetos con 'sectionKey' ('macro_performance' y 'demographics' respectivamente), 'title' ('Rendimiento y Tendencia' y 'Distribución Demográfica' respectivamente), y 'consultativeComment' (explicación consultiva profunda, positiva y estructurada estrictamente en al menos DOS PÁRRAFOS completos separados por un salto de línea (\\n\\n) según la regla de DOS PÁRRAFOS descrita arriba, capitalizado con Sentence Case).
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
        oportunidadesYAprendizajes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" }, evidence: { type: "string" },
              learning: { type: "string" }, application: { type: "string" }
            },
            required: ["title", "evidence", "learning", "application"],
            additionalProperties: false
          }
        },
        recomendacionesEstrategicas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              priority: { type: "string" }, action: { type: "string" },
              rationale: { type: "string" }, kpi: { type: "string" }
            },
            required: ["priority", "action", "rationale", "kpi"],
            additionalProperties: false
          }
        },
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
        },
        granularNarratives: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sectionKey: { type: "string" },
              title: { type: "string" },
              consultativeComment: { type: "string" }
            },
            required: ["sectionKey", "title", "consultativeComment"],
            additionalProperties: false
          }
        }
      },
      required: ["headline", "summaryPoints", "keyAchievements", "actionPlan", "logrosYAvances", "contenidoTopAnalisis", "oportunidadesYAprendizajes", "recomendacionesEstrategicas", "sections", "granularNarratives"],
      additionalProperties: false
    };

    const response = await genAI.models.generateContent({
        model: model,
        contents: [
            {
                role: 'user',
                parts: [
                    { text: prompt }
                ]
            }
        ],
        config: {
            systemInstruction: "Eres un Director Editorial de Estrategia Digital en Brainstudio, experto en redactar análisis consultivos y planes de acción accionables basados en datos reales.",
            responseMimeType: "application/json",
            responseSchema: narrativeSchema,
            maxOutputTokens: 8192,
            temperature: 0.1
        }
    });

    const content = response.text;
    if (!content) {
        throw new Error("Gemini Narrative response content is empty");
    }

    try {
        const parsed = parseJsonResponse(content);
        const comments = (parsed.sections || []).map((section) => String(section.narrativeComment || '').trim());
        const normalizedComments = comments.map((comment) => comment.toLocaleLowerCase('es'));
        const strategicParagraphs = normalizedComments.map((comment) => comment.split(/\n\s*\n/).filter(Boolean)[1] || '');
        const clientReference = `para ${clientName}`.toLocaleLowerCase('es');
        const invalidEditorialOutput = comments.length !== sections.length
            || comments.some((comment) => comment.split(/\n\s*\n/).filter(Boolean).length < 2)
            || normalizedComments.some((comment) => comment.includes('para el negocio') || comment.includes('este dato permite identificar') || !comment.includes(clientReference))
            || new Set(strategicParagraphs).size !== strategicParagraphs.length;
        if (invalidEditorialOutput) {
            throw new Error('Narrative did not satisfy client-specific, two-paragraph, non-repetition rules');
        }
        return parsed;
    } catch (parseError) {
        console.error("[Vision Service] Error parsing narrative JSON schema:", parseError, "Raw content:", content);
        throw parseError;
    }
};

const formatMetricValue = (key, metric) => {
    if (!metric || metric.value === null || metric.value === undefined) return 'N/D';
    const val = metric.value;
    if (key === 'spend') {
        return `${Number(val).toLocaleString('es-CO')} ${metric.unit || 'COP'}`;
    }
    if (key === 'ctr') {
        return `${val}%`;
    }
    return Number(val).toLocaleString('es-ES');
};

const findMaxDataPoint = (dataset) => {
    if (!Array.isArray(dataset) || dataset.length === 0) return null;
    let maxItem = null;
    let maxVal = -1;
    dataset.forEach(item => {
        const val = Number(item.value !== undefined && item.value !== null ? item.value : 0);
        const h = Number(item.hombres !== undefined && item.hombres !== null ? item.hombres : 0);
        const m = Number(item.mujeres !== undefined && item.mujeres !== null ? item.mujeres : 0);
        const total = val + h + m;
        if (total > maxVal) {
            maxVal = total;
            maxItem = item;
        }
    });
    return maxItem ? { label: maxItem.label || 'Principal', value: maxVal } : null;
};

const findTopDemographic = (list) => {
    if (!Array.isArray(list) || list.length === 0) return null;
    let maxItem = null;
    let maxVal = -1;
    list.forEach(item => {
        const val = Number(item.value !== undefined && item.value !== null ? item.value : 0);
        const h = Number(item.hombres !== undefined && item.hombres !== null ? item.hombres : 0);
        const m = Number(item.mujeres !== undefined && item.mujeres !== null ? item.mujeres : 0);
        const total = val + h + m;
        if (total > maxVal) {
            maxVal = total;
            maxItem = item;
        }
    });
    return maxItem ? { label: maxItem.label || 'Principal', value: maxVal } : null;
};

export const generateFallbackNarrative = (normalizedMetrics, sections = [], clientName = 'el cliente') => {
    const organicSummary = normalizedMetrics.organicSummary || {};
    const hasOrganic = Object.keys(organicSummary).length > 0 || sections.some(section => section.sectionCategory === 'ORGANIC');
    const fallbackOrganicMetrics = hasOrganic && Object.keys(organicSummary).length === 0
        ? Object.fromEntries(['reach', 'impressions', 'clicks', 'results'].filter(key => normalizedMetrics[key]?.value).map(key => [key, normalizedMetrics[key]]))
        : organicSummary;
    const spendStr = formatMetricValue('spend', normalizedMetrics.spend);
    const reachStr = formatMetricValue('reach', normalizedMetrics.reach);
    const impressionsStr = formatMetricValue('impressions', normalizedMetrics.impressions);
    const clicksStr = formatMetricValue('clicks', normalizedMetrics.clicks);
    const resultsStr = formatMetricValue('results', normalizedMetrics.results);

    const organicMetricLabels = {
        viewsOrganic: 'visualizaciones orgánicas', views: 'visualizaciones', videoViews: 'reproducciones de video',
        viewers: 'espectadores', reach: 'cuentas alcanzadas', reachOrganic: 'alcance orgánico',
        interactions: 'interacciones', linkClicks: 'clics en el enlace', profileVisits: 'visitas al perfil', follows: 'nuevos seguidores',
        impressions: 'impresiones', clicks: 'clics', results: 'acciones registradas'
    };
    const organicHighlights = Object.entries(fallbackOrganicMetrics)
        .filter(([, metric]) => Number(metric?.value) > 0)
        .slice(0, 3)
        .map(([key, metric]) => `${Number(metric.value).toLocaleString('es-ES')} ${organicMetricLabels[key] || metric.label || key}`);

    const headline = hasOrganic
        ? "Lectura del desempeño orgánico del periodo"
        : "Resultados de la pauta digital del periodo";
    const summaryPoints = hasOrganic
        ? [
            organicHighlights[0] ? `La presencia orgánica registró ${organicHighlights[0]} durante el periodo.` : "La actividad orgánica del periodo quedó disponible para revisión por fuente.",
            organicHighlights[1] ? `La respuesta de la comunidad también alcanzó ${organicHighlights[1]}.` : "Las métricas deben interpretarse por plataforma y tipo de captura.",
            organicHighlights[2] ? `Como señal adicional se obtuvieron ${organicHighlights[2]}.` : "El siguiente paso es relacionar visibilidad, interés y acciones de la audiencia."
        ]
        : [
            `La pauta registró una inversión de ${spendStr} durante el periodo.`,
            `Las campañas alcanzaron ${reachStr} cuentas y ${impressionsStr} impresiones.`,
            `Meta reportó ${resultsStr} resultados con ${clicksStr} clics registrados.`
        ];

    const keyAchievements = hasOrganic
        ? `El periodo debe leerse primero desde el comportamiento orgánico: las cifras muestran cómo circuló el contenido y qué acciones realizó la comunidad sin confundirlas con inversión publicitaria. ${organicHighlights.length ? `Entre los datos disponibles se destacan ${organicHighlights.join(', ')}.` : 'Las fuentes orgánicas fueron conservadas por separado para revisión.'} Esta lectura permite distinguir exposición, interés y respuesta antes de evaluar cualquier apoyo de pauta. Las variaciones y los picos deben contrastarse con las publicaciones del periodo para convertirlos en decisiones de contenido.`
        : `La pauta registró ${impressionsStr} impresiones, ${reachStr} cuentas alcanzadas y ${resultsStr} resultados con una inversión de ${spendStr}. Estas cifras describen la entrega publicitaria, pero no demuestran por sí solas ventas o rentabilidad. El costo y la calidad de cada resultado deben contrastarse con el seguimiento comercial. Esta revisión permitirá decidir qué anuncios sostener, ajustar o escalar.`;

    const actionPlan = [
        {
            action: hasOrganic ? "Identificar los contenidos asociados a los picos orgánicos" : "Revisar presupuesto y resultados por anuncio",
            kpi: hasOrganic ? "Alcance e interacciones por publicación" : "Costo por resultado y calidad del contacto",
            suggestedAssignee: hasOrganic ? "Content Specialist" : "Director de Performance Ads"
        },
        {
            action: "Fortalecer los formatos que generaron respuesta verificable",
            kpi: "Variación mensual de visitas, clics e interacciones",
            suggestedAssignee: "Content Specialist"
        },
        {
            action: "Conectar las acciones digitales con el seguimiento comercial",
            kpi: "Tasa de avance desde interés hasta conversión confirmada",
            suggestedAssignee: "Project Manager"
        }
    ];

    const logrosYAvances = hasOrganic
        ? organicHighlights.map((highlight, index) => `*Indicador orgánico ${index + 1}:* El periodo registró ${highlight}, una señal que debe compararse con su variación y fuente específica.`)
        : [
            `*Entrega publicitaria:* Se registraron ${impressionsStr} impresiones y ${reachStr} cuentas alcanzadas.`,
            `*Inversión del periodo:* El importe consolidado fue de ${spendStr}.`,
            `*Respuesta registrada:* Meta atribuyó ${resultsStr} resultados durante el periodo.`
        ];

    const contenidoTopAnalisis = `El contenido destacado debe evaluarse comparando volumen y eficiencia, no únicamente el valor más alto. Los nombres, formatos y resultados visibles permiten formular hipótesis, pero es necesario revisar cada pieza antes de atribuirle una causa. Se recomienda conservar los patrones verificables y probar variaciones controladas durante el siguiente periodo.`;

    const oportunidadesYAprendizajes = [
        { title: "Concentración de la respuesta", evidence: `La fuente registra ${resultsStr} resultados y ${clicksStr} clics.`, learning: "La exposición debe contrastarse con acciones de interés para identificar qué parte de la audiencia avanza en el embudo.", application: "Revisar las piezas y fechas asociadas a los picos antes de replicar el enfoque." },
        { title: "Lectura separada por canal", evidence: `El alcance observado fue de ${reachStr} y las impresiones de ${impressionsStr}.`, learning: "Alcance e impresiones cumplen funciones distintas y no deben presentarse como personas únicas equivalentes.", application: "Mantener el desglose por plataforma y comparar cada canal contra su propio periodo anterior." },
        { title: "Trazabilidad comercial", evidence: "Las capturas muestran actividad digital, pero no incluyen ventas ni ingresos confirmados.", learning: "Un resultado de plataforma representa una señal de interés, no necesariamente una conversión final.", application: "Cruzar clics, conversaciones o visitas con los registros comerciales del cliente." }
    ];

    const recomendacionesEstrategicas = [
        { priority: "ALTA", action: "Conectar las métricas digitales con el resultado comercial", rationale: "La plataforma demuestra exposición e interés, pero no confirma por sí sola ventas, reservas o matrículas.", kpi: "Tasa de avance desde contacto digital hasta conversión confirmada" },
        { priority: "ALTA", action: "Revisar los contenidos asociados a los picos del periodo", rationale: "La comparación por fecha permite identificar patrones sin atribuir causalidad antes de revisar la pieza publicada.", kpi: "Interacciones, visitas o resultados por pieza evaluada" },
        { priority: "MEDIA", action: "Mantener comparaciones separadas por plataforma", rationale: "Facebook e Instagram tienen comunidades y dinámicas distintas; combinarlas ocultaría el aporte real de cada canal.", kpi: "Variación mensual por plataforma y tipo de métrica" }
    ];

    const updatedSections = (Array.isArray(sections) ? sections : []).map(section => {
        const maxPoint = findMaxDataPoint(section.dataset);
        const rankedPoints = (Array.isArray(section.dataset) ? section.dataset : [])
            .map((point) => ({
                label: point.label || 'Sin etiqueta',
                value: Number(point.value ?? 0) + Number(point.hombres ?? 0) + Number(point.mujeres ?? 0)
            }))
            .filter((point) => Number.isFinite(point.value))
            .sort((a, b) => b.value - a.value);
        const leader = rankedPoints[0];
        const runnerUp = rankedPoints[1];
        const lowest = rankedPoints[rankedPoints.length - 1];
        const title = section.title || 'esta sección';
        const platformName = section.platform === 'FACEBOOK' ? 'Facebook' : section.platform === 'INSTAGRAM' ? 'Instagram' : section.platform === 'META_ADS' ? 'Meta Ads' : 'Redes sociales';
        const metricName = section.metricLabel || (section.sectionCategory === 'ADS' ? 'resultados' : 'registros');
        const visibleMetrics = Object.entries(section.metrics || {})
            .filter(([, metric]) => metric?.value !== null && metric?.value !== undefined && Number.isFinite(Number(metric.value)))
            .filter(([, metric]) => Number(metric.value) > 0)
            .slice(0, 4);
        const metricSentence = visibleMetrics.map(([key, metric]) => {
            const label = String(metric.label || organicMetricLabels[key] || key).toLocaleLowerCase('es');
            const variation = Number.isFinite(Number(metric.changePct))
                ? ` (${Number(metric.changePct) > 0 ? '+' : ''}${Number(metric.changePct).toLocaleString('es-ES')}%)`
                : '';
            return `${Number(metric.value).toLocaleString('es-ES')} ${label}${variation}`;
        }).join(', ');
        let detailText = `${platformName}: esta sección de ${title} no contiene suficientes valores cuantitativos legibles para establecer una comparación concluyente. Aun así, se conserva como evidencia del periodo para revisión editorial.`;
        if (metricSentence) {
            detailText = `${platformName}: durante el periodo, ${title.toLocaleLowerCase('es')} registró ${metricSentence}. Leídas en conjunto, estas cifras distinguen la visibilidad obtenida de las acciones que realmente realizó la audiencia, sin confundir desempeño orgánico con pauta.`;
        }
        if (maxPoint) {
            const comparisons = {
                CONTENT_FORMATS: runnerUp
                    ? `${platformName}: en ${title}, "${leader.label}" lideró con ${leader.value.toLocaleString('es-ES')} ${metricName}, frente a ${runnerUp.value.toLocaleString('es-ES')} de "${runnerUp.label}". La diferencia de ${(leader.value - runnerUp.value).toLocaleString('es-ES')} confirma qué formato concentró la mayor parte de la respuesta visible en esta captura.`
                    : `${platformName}: en ${title}, "${leader.label}" concentró ${leader.value.toLocaleString('es-ES')} ${metricName}; al no existir una segunda categoría legible, el resultado debe evaluarse contra la frecuencia de publicación del formato.`,
                METRIC_TRENDS: lowest && lowest.label !== leader.label
                    ? `${platformName}: la tendencia de ${title} alcanzó su punto más alto en "${leader.label}" con ${leader.value.toLocaleString('es-ES')} ${metricName}, mientras "${lowest.label}" marcó ${lowest.value.toLocaleString('es-ES')}. La amplitud de ${(leader.value - lowest.value).toLocaleString('es-ES')} muestra una actividad irregular que exige revisar qué se publicó en ambos momentos.`
                    : `${platformName}: la tendencia de ${title} registró ${leader.value.toLocaleString('es-ES')} ${metricName} en "${leader.label}"; la captura no ofrece suficientes puntos distintos para describir una evolución temporal completa.`,
                CONTENT_SUMMARY: runnerUp
                    ? `${platformName}: el resumen de ${title} estuvo encabezado por "${leader.label}" con ${leader.value.toLocaleString('es-ES')} ${metricName}, seguido de "${runnerUp.label}" con ${runnerUp.value.toLocaleString('es-ES')}. Esta relación permite leer cuánto de la visibilidad avanzó hacia una segunda señal de interés sin mezclar resultados de pauta.`
                    : `${platformName}: el resumen de ${title} registró ${leader.value.toLocaleString('es-ES')} ${metricName} en "${leader.label}". Es la principal cifra legible de la captura y debe complementarse con alcance, interacción o visitas antes de valorar la profundidad de la respuesta.`,
                AUDIENCE_DEMOGRAPHICS: runnerUp
                    ? `${platformName}: en ${title}, el segmento "${leader.label}" concentró ${leader.value.toLocaleString('es-ES')}%, seguido por "${runnerUp.label}" con ${runnerUp.value.toLocaleString('es-ES')}%. La diferencia de ${(leader.value - runnerUp.value).toLocaleString('es-ES')} puntos permite reconocer la composición dominante sin convertir presencia en intención de compra.`
                    : `${platformName}: en ${title}, el segmento "${leader.label}" concentró el mayor valor visible con ${leader.value.toLocaleString('es-ES')}%. La cifra describe composición de audiencia, no una conversión comercial.`,
                AD_TABLE: runnerUp
                    ? `${platformName}: en ${title}, "${leader.label}" obtuvo ${leader.value.toLocaleString('es-ES')} ${metricName}, por encima de los ${runnerUp.value.toLocaleString('es-ES')} de "${runnerUp.label}". El liderazgo por volumen debe contrastarse con gasto y costo por resultado antes de definir el anuncio ganador.`
                    : `${platformName}: en ${title}, "${leader.label}" registró ${leader.value.toLocaleString('es-ES')} ${metricName}. Sin una segunda pieza comparable, todavía no existe evidencia suficiente para redistribuir presupuesto.`
            };
            detailText = metricSentence && ['CONTENT_SUMMARY', 'METRIC_TRENDS'].includes(section.screenType)
                ? detailText
                : comparisons[section.screenType]
                || `${platformName}: en ${title}, "${maxPoint.label}" registró ${maxPoint.value.toLocaleString('es-ES')} ${metricName}. La cifra se conserva con su plataforma y captura de origen para compararla con los demás indicadores del mismo periodo.`;
        }
        const businessInterpretations = {
            CONTENT_SUMMARY: `Para ${clientName}, esta lectura permite distinguir si el contenido solo obtuvo exposición o también impulsó visitas, clics e interacciones. La decisión del próximo periodo es reforzar los llamados a la acción en la etapa con mayor pérdida de interés y medir si aumenta el avance hacia el perfil o el enlace.`,
            METRIC_TRENDS: `Para ${clientName}, la secuencia temporal sirve para localizar días de aceleración y caídas, sin atribuirlas automáticamente a una publicación. Conviene cruzar cada pico con el calendario, identificar el tema y formato activos y convertir ese hallazgo en una prueba editorial medible.`,
            AUDIENCE_DEMOGRAPHICS: `Para ${clientName}, la composición de la comunidad orienta el lenguaje, los beneficios y las referencias creativas que deberían priorizarse. El siguiente paso es preparar variaciones dirigidas a los rangos y ubicaciones dominantes y comparar cuál genera más visitas, clics o interacción.`,
            CONTENT_FORMATS: `Para ${clientName}, la diferencia entre formatos indica dónde se concentra la atención, pero debe contrastarse con la cantidad de piezas publicadas. La ruta práctica es sostener el formato líder, probar una variación del mensaje y evaluar rendimiento por pieza para decidir qué escalar.`,
            AD_SET_SUMMARY: `Para ${clientName}, estos resultados representan oportunidades atribuidas por Meta y no ventas confirmadas. La decisión correcta es cruzar costo por resultado con calidad del contacto y avance comercial antes de aumentar o reducir presupuesto.`,
            AD_TABLE: `Para ${clientName}, la comparación entre anuncios debe equilibrar volumen, gasto y costo por resultado. El siguiente ajuste es separar las piezas ganadoras por eficiencia de las que aún tienen poca muestra y redistribuir inversión solo después de validar la calidad de los contactos.`
        };
        const businessText = businessInterpretations[section.screenType]
            || (section.sectionCategory === 'ADS'
                ? businessInterpretations.AD_TABLE
                : `Para ${clientName}, esta cifra aporta una señal concreta del comportamiento orgánico. Debe contrastarse con las otras métricas de la captura y con el contenido publicado para definir qué mantener, ajustar o probar durante el siguiente periodo.`);
        return {
            ...section,
            narrativeComment: `${detailText}\n\n${businessText}`
        };
    });

    const ageGenderList = normalizedMetrics.demographics?.ageGender || [];
    const topAge = findTopDemographic(ageGenderList);
    let demographicsComment = `La distribución demográfica conserva los rangos de edad, género y ubicación visibles en las fuentes orgánicas, sin atribuirles rentabilidad o intención comercial no demostrada.\n\nEsta información permite adaptar ejemplos, beneficios y formatos a los segmentos con mayor presencia y comparar posteriormente cuál genera más interacción, visitas o clics.`;
    if (topAge) {
        demographicsComment = `La distribución demográfica muestra que el segmento "${topAge.label}" concentra el mayor valor visible dentro de los rangos reportados. Este dato describe presencia de audiencia, no rentabilidad ni conversión.\n\nLa marca puede utilizarlo para crear variaciones de mensajes dirigidas a ese grupo y evaluar su respuesta mediante interacciones, visitas o clics durante el siguiente periodo.`;
    }

    const granularNarratives = [
        {
            sectionKey: "macro_performance",
            title: "Rendimiento y Tendencia",
            consultativeComment: hasOrganic
                ? `La tendencia orgánica muestra cómo se distribuyeron las acciones de la audiencia durante el periodo, conservando los picos y descensos visibles sin atribuirles causas no comprobadas.\n\nPara convertir la curva en aprendizaje, se deben cruzar las fechas destacadas con el calendario de publicaciones y comparar formato, tema y llamado a la acción.`
                : `La tendencia de pauta muestra cómo se distribuyeron impresiones, alcance y resultados durante el periodo sin demostrar por sí sola causalidad o rentabilidad.\n\nConviene contrastar los picos con cambios de presupuesto, anuncios activos y calidad de los contactos antes de escalar la inversión.`
        },
        {
            sectionKey: "demographics",
            title: "Distribución Demográfica",
            consultativeComment: demographicsComment
        }
    ];

    return {
        headline,
        summaryPoints,
        keyAchievements,
        actionPlan,
        logrosYAvances,
        contenidoTopAnalisis,
        oportunidadesYAprendizajes,
        recomendacionesEstrategicas,
        sections: updatedSections,
        granularNarratives
    };
};
