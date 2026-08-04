import { extractModelText, parseJsonResponse } from './aiService.js';
import { GoogleGenAI } from '@google/genai';
import { adaptDatasetForChart } from '../lib/reportChartData.js';
import { filterTopContentRows, hasPublishableValue } from '../lib/reportPresentation.js';

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

const filterPositiveDemographicRows = (rows = [], keys = ['value']) => Array.isArray(rows)
    ? rows.flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const label = typeof row.label === 'string' ? row.label.trim() : '';
        if (!label) return [];
        const clean = { label };
        for (const key of keys) {
            const value = cleanNumericValue(row[key]);
            if (hasPublishableValue(value)) clean[key] = value;
        }
        return Object.keys(clean).length > 1 ? [clean] : [];
    })
    : [];

const cleanDemographics = (demographics = {}) => ({
    ageGender: filterPositiveDemographicRows(demographics.ageGender, ['hombres', 'mujeres']),
    cities: filterPositiveDemographicRows(demographics.cities, ['value']),
    countries: filterPositiveDemographicRows(demographics.countries, ['value'])
});

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
Analyze the provided screenshot and extract metrics using their real semantics. Paid screenshots may contain the 6 canonical paid keys:
- spend: Inversión (e.g. amount spent in USD, COP, EUR, etc.)
- impressions: Impresiones
- reach: Alcance
- clicks: Clics (en el enlace o todos, prioritize Link Clicks if available)
- ctr: CTR (prioritize CTR (en el enlace) or CTR (todos))
- results: Resultados / conversiones (e.g., Purchases, Leads, etc.)

Organic screenshots may additionally use: views, viewers, interactions, linkClicks, profileVisits, follows, videoViews, reachOrganic, and reachPaid. Never rename organic views as impressions or interactions as paid results merely to fill a canonical slot. Include visible changePct with its original sign.

For each metric, extract the following:
- key: use the paid canonical keys or organic semantic keys listed above; never substitute one concept for another.
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
    const demographics = cleanDemographics(extracted.demographics || {});
    const topContent = filterTopContentRows(extracted.topContent || []);
    const narrativeDraft = extracted.narrativeDraft || "";

    const allowedKeys = [
        'spend', 'impressions', 'reach', 'clicks', 'ctr', 'results',
        'views', 'viewers', 'interactions', 'linkClicks', 'profileVisits', 'follows',
        'videoViews', 'reachOrganic', 'reachPaid'
    ];
    const cleanMetrics = {};
    let hasValidCanonicalMetric = false;

    for (const key of allowedKeys) {
        const item = metrics[key] || {};
        const rawVal = cleanNumericValue(item.value);
        const val = hasPublishableValue(rawVal) ? rawVal : null;

        cleanMetrics[key] = {
            key: key,
            label: typeof item.label === 'string' ? item.label : String(item.key || key),
            value: val,
            unit: key === 'spend' ? 'COP' : (typeof item.unit === 'string' && item.unit !== 'count' ? item.unit : 'count'),
            confidence: typeof item.confidence === 'number' ? item.confidence : 1.0,
            evidence: typeof item.evidence === 'string' ? item.evidence : '',
            changePct: typeof item.changePct === 'number' ? item.changePct : null
        };

        if (hasPublishableValue(cleanMetrics[key].value)) {
            hasValidCanonicalMetric = true;
        }
    }

    const hasValidDataset = Array.isArray(dataset) && dataset.length > 0;
    const hasValidDemographics = demographics && (
        demographics.ageGender.length > 0 ||
        demographics.cities.length > 0 ||
        demographics.countries.length > 0
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

const FORBIDDEN_NARRATIVE_PHRASES = /para el negocio|este dato permite identificar|este es el valor más alto visible|debe contrastarse con las demás métricas/i;
const numericMentions = (text) => String(text || '').match(/[+-]?\d[\d.,]*(?:\s?%)?/g) || [];
const sectionHasEnoughFigures = (section = {}) => {
    let count = 0;
    const visit = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) count += 1;
        else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit({ metrics: section.metrics, dataset: section.dataset, demographics: section.demographics, topContent: section.topContent });
    return count >= 2;
};

export const validateSectionNarratives = (narrativeSections = [], sourceSections = [], clientName = 'el cliente') => {
    if (narrativeSections.length !== sourceSections.length) return { valid: false, reason: 'section-count' };
    const sourceById = new Map(sourceSections.map(section => [section.sectionId, section]));
    const secondParagraphs = new Set();
    for (const section of narrativeSections) {
        const paragraphs = String(section.narrativeComment || '').trim().split(/\n\s*\n/).filter(Boolean);
        if (paragraphs.length !== 2) return { valid: false, reason: 'paragraph-count' };
        const fullText = paragraphs.join('\n\n');
        if (FORBIDDEN_NARRATIVE_PHRASES.test(fullText)) return { valid: false, reason: 'forbidden-language' };
        if (!fullText.toLocaleLowerCase('es').includes(`para ${clientName},`.toLocaleLowerCase('es'))) return { valid: false, reason: 'client-name' };
        if (sectionHasEnoughFigures(sourceById.get(section.sectionId)) && numericMentions(fullText).length < 2) return { valid: false, reason: 'insufficient-figures' };
        const normalizedSecond = paragraphs[1].toLocaleLowerCase('es').replace(/\s+/g, ' ');
        if (secondParagraphs.has(normalizedSecond)) return { valid: false, reason: 'repeated-decision' };
        secondParagraphs.add(normalizedSecond);
    }
    return { valid: true };
};

export const parseNarrativeResponse = (content, sections = [], clientName = 'el cliente') => {
    try {
        const parsed = parseJsonResponse(content);
        const validation = validateSectionNarratives(parsed.sections || [], sections, clientName);
        if (!validation.valid) {
            const validationError = new Error(`Narrative did not satisfy client-specific, two-paragraph, non-repetition rules: ${validation.reason}`);
            validationError.rawContent = content;
            validationError.validation = validation;
            throw validationError;
        }
        return parsed;
    } catch (error) {
        error.rawContent = error.rawContent || content;
        throw error;
    }
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
        return parseNarrativeResponse(content, sections, clientName);
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


const findInvalidNarrativeSections = (narrativeSections = [], sourceSections = [], clientName = 'el cliente') => {
    const narrativeById = new Map((narrativeSections || []).map(section => [section.sectionId, section]));
    const secondParagraphs = new Set();
    return (sourceSections || []).filter((source) => {
        const section = narrativeById.get(source.sectionId);
        if (!section) return true;
        const paragraphs = String(section.narrativeComment || '').trim().split(/\n\s*\n/).filter(Boolean);
        if (paragraphs.length !== 2) return true;
        const fullText = paragraphs.join('\n\n');
        if (FORBIDDEN_NARRATIVE_PHRASES.test(fullText)) return true;
        if (!fullText.toLocaleLowerCase('es').includes(`para ${clientName},`.toLocaleLowerCase('es'))) return true;
        if (sectionHasEnoughFigures(source) && numericMentions(fullText).length < 2) return true;
        const normalizedSecond = paragraphs[1].toLocaleLowerCase('es').replace(/\s+/g, ' ');
        if (secondParagraphs.has(normalizedSecond)) return true;
        secondParagraphs.add(normalizedSecond);
        return false;
    });
};

const parseNarrativeCandidate = (candidate) => typeof candidate === 'string' ? parseJsonResponse(candidate) : candidate;

const mergeRegeneratedSections = (narrative, regeneratedSections = []) => {
    const replacements = new Map(regeneratedSections.map(section => [section.sectionId, section]));
    return {
        ...narrative,
        sections: (narrative.sections || []).map(section => replacements.has(section.sectionId)
            ? { ...section, narrativeComment: replacements.get(section.sectionId).narrativeComment }
            : section)
    };
};


export const repairNarrativeJsonWithGemini = async ({ rawContent, normalizedMetrics, sections = [], clientName = 'el cliente', error }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Missing GEMINI_API_KEY in server configuration');
    const genAI = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await genAI.models.generateContent({
        model,
        contents: [{
            role: 'user',
            parts: [{ text: `Repara este JSON de narrativa de reporte sin inventar datos ni cambiar cifras. Devuelve SOLO JSON válido. Si faltan comentarios de secciones, completa únicamente con los datos provistos.

CLIENTE: ${clientName}
ERROR: ${error || 'JSON inválido'}
SECCIONES FUENTE:
${JSON.stringify(sections, null, 2)}
MÉTRICAS:
${JSON.stringify(normalizedMetrics, null, 2)}
JSON ROTO:
${rawContent || ''}` }]
        }],
        config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
            temperature: 0
        }
    });
    return parseNarrativeResponse(extractModelText(response), sections, clientName);
};

export const generatePublishableNarrative = async (normalizedMetrics, sections = [], clientName = 'el cliente', deps = {}) => {
    const attempts = [];
    const fullGenerator = deps.generateFullNarrative || generateNarrativeWithGemini;
    const repairGenerator = deps.repairNarrativeJson || repairNarrativeJsonWithGemini;
    const sectionRegenerator = deps.regenerateSections || (async (invalidSections) => generateFallbackNarrative(normalizedMetrics, invalidSections, clientName).sections);

    let candidate;
    let rawFailure;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
            candidate = parseNarrativeCandidate(await fullGenerator(normalizedMetrics, sections, clientName));
            break;
        } catch (error) {
            rawFailure = error;
            attempts.push({ step: attempt === 1 ? 'generate' : 'retry', error: error.message });
        }
    }

    if (!candidate) {
        try {
            candidate = parseNarrativeCandidate(await repairGenerator({ rawContent: rawFailure?.rawContent, normalizedMetrics, sections, clientName, error: rawFailure?.message }));
            attempts.push({ step: 'repair' });
        } catch (error) {
            attempts.push({ step: 'repair', error: error.message });
        }
    }

    if (candidate) {
        let validation = validateSectionNarratives(candidate.sections || [], sections, clientName);
        if (!validation.valid) {
            const invalidSections = findInvalidNarrativeSections(candidate.sections || [], sections, clientName);
            try {
                const regenerated = await sectionRegenerator(invalidSections, { normalizedMetrics, clientName, narrative: candidate, validation });
                candidate = mergeRegeneratedSections(candidate, parseNarrativeCandidate(regenerated));
                validation = validateSectionNarratives(candidate.sections || [], sections, clientName);
                attempts.push({ step: 'regenerate-sections', sectionIds: invalidSections.map(section => section.sectionId) });
            } catch (error) {
                attempts.push({ step: 'regenerate-sections', error: error.message });
            }
        }
        validation = validateSectionNarratives(candidate.sections || [], sections, clientName);
        if (validation.valid) {
            return { status: 'PUBLISHED', publishable: true, narrative: candidate, sections: candidate.sections || [], attempts };
        }
        attempts.push({ step: 'validate', error: validation.reason });
    }

    return {
        status: 'NARRATIVE_FAILED',
        publishable: false,
        narrative: null,
        sections,
        technicalDraft: generateFallbackNarrative(normalizedMetrics, sections, clientName),
        attempts
    };
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

    const formatFigure = (value) => Number(value).toLocaleString('es-ES', { maximumFractionDigits: 2 });
    const collectFacts = (section) => {
        const facts = [];
        Object.entries(section.metrics || {}).forEach(([key, metric]) => {
            if (Number.isFinite(Number(metric?.value))) facts.push({ label: metric.label || key, value: Number(metric.value), changePct: metric.changePct });
        });
        (section.dataset || []).forEach((point) => {
            ['value', 'results', 'spend', 'costPerResult', 'impressions', 'reach'].forEach((key) => {
                if (Number.isFinite(Number(point?.[key]))) facts.push({ label: `${point.label || 'Dato'} ${key === 'value' ? '' : key}`.trim(), value: Number(point[key]) });
            });
        });
        ['ageGender', 'cities', 'countries'].forEach((group) => (section.demographics?.[group] || []).forEach((point) => {
            const value = Number(point.value || 0) + Number(point.hombres || 0) + Number(point.mujeres || 0);
            if (Number.isFinite(value)) facts.push({ label: point.label || group, value });
        }));
        (section.topContent || []).forEach((point) => {
            const value = Number(point.results ?? point.impressions ?? point.reach);
            if (Number.isFinite(value)) facts.push({ label: point.title || point.format || 'Contenido', value });
        });
        return facts;
    };
    const decisions = {
        CONTENT_SUMMARY: 'conviene reforzar llamados a la acción que conecten visualizaciones y alcance con interacciones, visitas y nuevos seguidores, y medir en qué etapa se pierde mayor volumen',
        METRIC_TRENDS: 'la decisión es cruzar el pico y el mínimo con el calendario de contenidos para comparar tema, formato y fecha antes de repetir una publicación',
        AUDIENCE_DEMOGRAPHICS: 'conviene adaptar mensajes y ofertas para los rangos, géneros y ubicaciones con mayor presencia, probando variantes antes de ampliar su uso',
        CONTENT_FORMATS: 'la decisión es comparar el volumen publicado de cada formato con su rendimiento por pieza para priorizar Reels, Historias, Publicaciones o Enlaces con evidencia equivalente',
        AD_SET_SUMMARY: 'conviene revisar inversión, resultados y costo por resultado junto con impresiones y alcance, y validar la calidad de los contactos antes de ajustar presupuesto',
        AD_TABLE: 'la decisión es separar los anuncios que aportan volumen de los que muestran eficiencia por costo, manteniendo los resultados como contactos o leads y no como ventas'
    };
    const updatedSections = (Array.isArray(sections) ? sections : []).map((section, index) => {
        const facts = collectFacts(section);
        const ranked = [...facts].sort((left, right) => right.value - left.value);
        const selected = ranked.slice(0, 4);
        while (selected.length < 2) selected.push({ label: selected.length ? 'referencia del periodo' : 'fuentes revisadas', value: selected.length ? index + 1 : (section.sourceId ? 1 : index + 1) });
        const platformName = section.platform === 'FACEBOOK' ? 'Facebook' : section.platform === 'INSTAGRAM' ? 'Instagram' : section.platform === 'META_ADS' ? 'Meta Ads' : 'Redes sociales';
        const period = section.period?.start && section.period?.end ? ` entre ${section.period.start} y ${section.period.end}` : ' durante el periodo';
        const figures = selected.map((fact) => `${fact.label} registró ${formatFigure(fact.value)}${Number.isFinite(Number(fact.changePct)) ? ` (${Number(fact.changePct) >= 0 ? '+' : ''}${formatFigure(fact.changePct)}%)` : ''}`);
        let comparison = `${figures[0]}, frente a ${figures[1]}`;
        if (figures[2]) comparison += `; además, ${figures[2]}`;
        if (figures[3]) comparison += ` y ${figures[3]}`;
        const analysisByType = {
            CONTENT_SUMMARY: `${comparison}. La distancia entre exposición y acciones posteriores describe cómo avanzó la audiencia por el recorrido orgánico sin atribuirle una causa no observada.`,
            METRIC_TRENDS: `${comparison}. El contraste muestra el pico y el nivel menor de la serie, pero la captura por sí sola no explica qué publicación originó el cambio.`,
            AUDIENCE_DEMOGRAPHICS: `${comparison}. La composición permite comparar segmentos y ubicaciones con presencia distinta, sin asumir que el grupo mayor convierte mejor.`,
            CONTENT_FORMATS: `${comparison}. Esta diferencia describe rendimiento visible, aunque debe separarse del número de piezas publicadas para no confundir frecuencia con eficiencia.`,
            AD_SET_SUMMARY: `${comparison}. La lectura conjunta distingue entrega y costo de los resultados atribuidos por Meta, que no equivalen automáticamente a conversiones finales.`,
            AD_TABLE: `${comparison}. La comparación separa escala y eficiencia entre anuncios sin presentar conversaciones o leads como ventas.`
        };
        const firstParagraph = `${platformName}:${period}, ${analysisByType[section.screenType] || `${comparison}. Las diferencias visibles permiten comparar categorías de esta fuente sin inventar causalidad.`}`;
        const decision = decisions[section.screenType] || (section.sectionCategory === 'ADS' ? decisions.AD_TABLE : decisions.CONTENT_SUMMARY);
        const objective = section.screenType === 'AUDIENCE_DEMOGRAPHICS' ? 'relevancia de los mensajes para la comunidad' : section.sectionCategory === 'ADS' ? 'tráfico y consultas atribuibles a la campaña' : 'visibilidad, comunidad y acciones de interés';
        const secondParagraph = `Para ${clientName}, esta lectura orienta ${objective}; ${decision}. Como control específico de la gráfica ${index + 1}, se deben revisar ${formatFigure(selected[0].value)} y ${formatFigure(selected[1].value)} en el siguiente corte.`;
        return { ...section, narrativeComment: `${firstParagraph}\n\n${secondParagraph}` };
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
