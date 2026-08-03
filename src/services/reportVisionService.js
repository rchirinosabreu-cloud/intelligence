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

const SYSTEM_PROMPT = `You are a professional Meta Ads and Organic Social Media data extraction expert using Google Generative AI (Gemini).
Analyze the provided screenshot and extract the 6 key metrics strictly:
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
- narrativeDraft: A short narrative explanation of these metrics in Spanish (exactly 3 to 4 complete, well-structured sentences), highlighting the progress and using extremely positive, forward-looking terminology. Never use negative/alarmist words (e.g. instead of "bajo" or "caída", use "fase de consolidación" or "ventana de oportunidad"). Ensure it does not truncate or cut off. Ensure the general strategy maintains a balanced 50/50 overview between organic social media content and paid performance results.

Also extract graphic points and visual data as a structured section:
- chartType: Detect or choose the most appropriate chart type to display this visual: "LINE_CHART" (for trend curves or daily data), "BAR_CHART" (for age/gender bar breakdowns), "DONUT_CHART" (for platform split or percentage distribution), or "RANKING_TABLE" (for listing contents, ads, or posts).
- title: A descriptive and clear Spanish title for this chart/visualization block.
- sectionCategory: Categorize this screenshot section strictly as "ORGANIC" (for organic reels, posts, feed reach, likes, story views, organic Facebook/Instagram profile stats) or "ADS" (for campaigns, ad manager charts, spend/inversión, campaign results, paid conversions).
- platform: Identify the specific platform category strictly: return 'ORGANIC_RRSS' (for Instagram/Facebook organic posts, reach, stories, feed demographics) or 'PAID_ADS' (for Meta Ads Manager paid campaigns, ad sets, impressions, investment).
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
    for (let attempt = 1; attempt <= 2; attempt += 1) {
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
                responseSchema: schema,
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
                console.error(`[Vision Service] Invalid JSON on attempt ${attempt}/2:`, parseError.message, "Raw snippet:", content.slice(0, 500));
            }
        }
        if (attempt === 1) console.warn('[Vision Service] Retrying malformed Gemini structured output once.');
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

    const allowedKeys = ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'results'];
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
            evidence: typeof item.evidence === 'string' ? item.evidence : ''
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
        platform: extracted.platform || 'META_ADS'
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
export const generateNarrativeWithGemini = async (normalizedMetrics, sections = []) => {
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

REGLAS DE REDACCIÓN DE LA NARRATIVA:
1. TONO: Consultivo, positivo, profesional, motivador y orientado a metas comerciales de alto nivel.
2. REGLA ESTRICTA DE INTEGRIDAD DE DATOS (PROHIBIDO HALLUCINAR): Queda terminantemente prohibido que menciones o inventes valores numéricos, métricas, cantidades o porcentajes que no existan de forma explícita en el objeto de métricas o secciones provisto arriba. No asumas divisas ni cifras que no estén allí.
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
   - oportunidadesYAprendizajes: Lecciones clave extraídas de la pauta y el contenido orgánico, redactando exactamente entre 3 y 4 párrafos ricos en consultoría de marketing y aprendizaje de audiencias, capitalizado strictly en Sentence Case.
   - recomendacionesEstrategicas: Exactamente entre 3 y 4 párrafos de aconsejamiento consultivo, motivador y hoja de ruta táctica detallada para la marca, capitalizado strictly en Sentence Case.
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
        return parseJsonResponse(content);
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

export const generateFallbackNarrative = (normalizedMetrics, sections = []) => {
    const spendStr = formatMetricValue('spend', normalizedMetrics.spend);
    const reachStr = formatMetricValue('reach', normalizedMetrics.reach);
    const impressionsStr = formatMetricValue('impressions', normalizedMetrics.impressions);
    const clicksStr = formatMetricValue('clicks', normalizedMetrics.clicks);
    const ctrStr = formatMetricValue('ctr', normalizedMetrics.ctr);
    const resultsStr = formatMetricValue('results', normalizedMetrics.results);

    const headline = "Optimización estratégica y consolidación de impacto digital";
    const summaryPoints = [
        `Eficiencia en pauta con una inversión total de ${spendStr} consolidada durante el periodo.`,
        `Alcance de audiencias clave superando las ${reachStr} personas impactadas en plataformas Meta.`,
        `Generación activa de valor con un total de ${resultsStr} resultados clave validados.`
    ];

    const keyAchievements = `El análisis estratégico de este periodo demuestra una consolidación sólida del posicionamiento de la marca en ecosistemas digitales. Con un alcance acumulado de ${reachStr} usuarios únicos y un total de ${impressionsStr} impresiones, el rendimiento general refleja una distribución altamente optimizada. Adicionalmente, el registro de ${clicksStr} clics con un CTR promedio de ${ctrStr} indica un alto nivel de interés y relevancia del contenido para la audiencia objetivo. Estos resultados sientan bases fuertes para escalar las conversiones de manera eficiente en los próximos ciclos.`;

    const actionPlan = [
        {
            action: "Optimización continua de presupuestos hacia creativos ganadores",
            kpi: "Reducción de costo por resultado en un 10%",
            suggestedAssignee: "Director de Performance Ads"
        },
        {
            action: "Potenciación de formatos interactivos y video corto orgánico",
            kpi: "Incremento del engagement orgánico en un 15%",
            suggestedAssignee: "Content Specialist"
        },
        {
            action: "Refinamiento de segmentaciones de audiencias personalizadas",
            kpi: "Aumento de la tasa de conversión en un 5%",
            suggestedAssignee: "Media Buyer"
        }
    ];

    const logrosYAvances = [
        `*Alcance estratégico sólido:* Logramos impactar de manera óptima a un total de ${reachStr} usuarios con impresiones consolidadas.`,
        `*Eficiencia en la inversión:* La asignación presupuestaria de ${spendStr} se concentró en los pilares comunicacionales de mayor tracción.`,
        `*Interés de audiencias:* La captación de ${clicksStr} clics demuestra el valor y relevancia de la propuesta creativa.`,
        `*Efectividad y conversión:* La consecución de ${resultsStr} resultados clave valida el embudo táctico implementado.`,
        `*Estabilidad en CTR:* El porcentaje promedio de ${ctrStr} refleja un enganche positivo con las piezas visuales activas.`
    ];

    const contenidoTopAnalisis = `La revisión detallada de las publicaciones y creativos destacados confirma que los formatos dinámicos y de valor educativo lideran el rendimiento. Las piezas comunicacionales orientadas a resolver inquietudes de los usuarios generaron el mayor volumen de interacciones y conversiones del periodo. Se recomienda mantener una línea conceptual basada en testimonios y demostraciones prácticas para sostener el desempeño observado.`;

    const oportunidadesYAprendizajes = `Se identifica una clara ventana de oportunidad para expandir las audiencias activas de la marca mediante la creación de públicos similares y personalizados, basados en los usuarios que demostraron mayor volumen de interacción en pauta.\n\nAsimismo, diversificar de manera ágil las variaciones de textos explicativos y creativos visuales en las campañas activas será determinante para contrarrestar la fatiga creativa del público objetivo, garantizando la sostenibilidad de los resultados.\n\nFinalmente, capitalizar el aprendizaje del comportamiento de la audiencia del periodo actual nos permitirá anticipar tendencias de consumo de contenido en redes, optimizando la asignación de pauta para las próximas activaciones.`;

    const recomendacionesEstrategicas = `Para los próximos periodos de trabajo, se aconseja de forma muy especial enfocar los recursos y esfuerzos presupuestarios en la amplificación de las piezas de contenido que demuestren tracción orgánica inicial sobresaliente.\n\nIntegrar análisis multivariados de manera ágil y dinámica en cada campaña, junto con robustecer la retención en los primeros tres segundos de los videos cortos, serán factores altamente determinantes para potenciar la rentabilidad de la pauta.\n\nComo pilar de cierre, se sugiere establecer un esquema continuo de pruebas A/B de audiencias personalizadas, lo cual permitirá blindar el costo por resultado frente a la saturación comercial, guiando a la marca hacia una fase de escalabilidad eficiente y sostenible.`;

    const updatedSections = (Array.isArray(sections) ? sections : []).map(section => {
        const maxPoint = findMaxDataPoint(section.dataset);
        const title = section.title || 'esta sección';
        let detailText = `El análisis estratégico para ${title} muestra un comportamiento de audiencia estable, equilibrado y altamente positivo.`;
        if (maxPoint) {
            detailText = `El análisis estratégico para ${title} identifica un punto de desempeño líder en la categoría "${maxPoint.label}" con un total registrado de ${maxPoint.value.toLocaleString('es-ES')} interacciones directas. Esta cifra consolida el liderazgo y la tracción que posee este formato específico dentro de la combinación creativa del periodo.`;
        }
        return {
            ...section,
            narrativeComment: `${detailText}\n\nEste rendimiento valida de forma concluyente las hipótesis de segmentación y comunicación activa diseñadas para el cliente. Se recomienda priorizar la asignación presupuestaria hacia estas tendencias ganadoras en los ciclos venideros para potenciar de forma sostenida los resultados generales.`
        };
    });

    const ageGenderList = normalizedMetrics.demographics?.ageGender || [];
    const topAge = findTopDemographic(ageGenderList);
    let demographicsComment = `La distribución demográfica activa del periodo revela un núcleo de audiencia altamente concentrado en los segmentos etarios más rentables y participativos de la marca. Se evidencia un balance y equilibrio muy saludable de interacción entre géneros, lo cual amplía significativamente nuestro espectro de comunicación efectiva en redes sociales.\n\nEste comportamiento demográfico nos brinda una oportunidad excepcional para refinar y personalizar los mensajes tácticos de pauta. Se recomienda direccionar variaciones creativas específicas a cada grupo etario para consolidar y expandir nuestro posicionamiento actual en el mercado.`;
    if (topAge) {
        demographicsComment = `La distribución demográfica activa del periodo identifica una concentración de impacto sumamente relevante en el segmento de edad "${topAge.label}", el cual lidera la interacción general con un porcentaje de participación muy destacado. El equilibrio observado entre géneros en este segmento consolida la alta receptividad del mensaje.\n\nEste comportamiento característico de la audiencia nos brinda una oportunidad estratégica excepcional para personalizar y optimizar los mensajes visuales de campaña. Se aconseja direccionar variaciones creativas específicas adaptadas a este grupo líder para rentabilizar de forma óptima cada impacto en el ecosistema digital.`;
    }

    const granularNarratives = [
        {
            sectionKey: "macro_performance",
            title: "Rendimiento y Tendencia",
            consultativeComment: `El análisis de tendencias temporales del periodo muestra una evolución sumamente favorable en el desempeño de la pauta publicitaria. El comportamiento diario de clics, alcance e impresiones refleja picos de interacción altamente correlacionados con el lanzamiento de nuestras campañas de conversión principales.\n\nEste comportamiento ratifica que la receptividad de la audiencia se mantiene en un nivel óptimo de enganche estratégico. Se proyecta continuar con esta distribución presupuestaria para capitalizar los periodos de mayor actividad y maximizar la rentabilidad de cada impacto publicitario en los siguientes ciclos.`
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
