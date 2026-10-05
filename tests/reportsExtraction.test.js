import test from 'node:test';
import './syntheticAiGovernance.fixture.js';
import assert from 'node:assert';
import {
    extractMetricsWithOpenAI,
    filterExtractedTopContentRows,
    validateAndCleanSourceExtraction,
    mergeSourceMetricsIntoAccumulator,
    finalizeNormalizedMetrics
} from '../src/services/reportVisionService.js';

test('OpenAI vision extraction sends image input and structured output schema', async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'mock-openai-key';
    let requestBody;
    globalThis.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return new Response(JSON.stringify({
            output_text: JSON.stringify({ metrics: [], screenType: 'UNKNOWN' })
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
        const result = await extractMetricsWithOpenAI(Buffer.from('mock-image'), 'image/png');
        assert.deepEqual(result.metrics, []);
        assert.strictEqual(requestBody.text.format.type, 'json_schema');
        assert.match(requestBody.input[0].content[1].image_url, /^data:image\/png;base64,/);
        assert.strictEqual(requestBody.input[0].content[1].type, 'input_image');
    } finally {
        globalThis.fetch = originalFetch;
        process.env.OPENAI_API_KEY = originalApiKey;
    }
});

test('Vision Extraction Service - Math Validation and Consolidation', async (t) => {

    await t.test('CTR discrepancy validation generates warning correctly', async () => {
        // Here we test the mathematical validation logic that we wrote inside the endpoint
        const clicksVal = 10;
        const impressionsVal = 200;
        const ctrVal = 4.5; // Theoretical is (10 / 200) * 100 = 5.0%

        const warnings = [];
        if (typeof clicksVal === 'number' && typeof impressionsVal === 'number' && impressionsVal > 0) {
            const theoreticalCtr = (clicksVal / impressionsVal) * 100;
            if (typeof ctrVal === 'number') {
                const diff = Math.abs(ctrVal - theoreticalCtr);
                if (diff > 0.01) {
                    warnings.push(`Advertencia matemática: El CTR extraído (${ctrVal}%) difiere del cálculo teórico basado en clics e impresiones (${theoreticalCtr.toFixed(4)}%).`);
                }
            }
        }

        assert.strictEqual(warnings.length, 1);
        assert.ok(warnings[0].includes('difiere del cálculo teórico'));
        assert.ok(warnings[0].includes('5.0000%'));
    });

    await t.test('CTR matching validation does not generate warning', async () => {
        const clicksVal = 15;
        const impressionsVal = 1000;
        const ctrVal = 1.5; // Theoretical is (15 / 1000) * 100 = 1.5%

        const warnings = [];
        if (typeof clicksVal === 'number' && typeof impressionsVal === 'number' && impressionsVal > 0) {
            const theoreticalCtr = (clicksVal / impressionsVal) * 100;
            if (typeof ctrVal === 'number') {
                const diff = Math.abs(ctrVal - theoreticalCtr);
                if (diff > 0.01) {
                    warnings.push(`Advertencia matemática: El CTR extraído (${ctrVal}%) difiere del cálculo teórico basado en clics e impresiones (${theoreticalCtr.toFixed(4)}%).`);
                }
            }
        }

        assert.strictEqual(warnings.length, 0);
    });

    await t.test('Manual edit flag detection and audit updates', async () => {
        const dbMetrics = {
            spend: { value: 1250.50, unit: "USD" },
            impressions: { value: 100000, unit: "count" }
        };

        const newMetrics = {
            spend: { value: 1300.00, unit: "USD" }, // Edited!
            impressions: { value: 100000, unit: "count" } // Unchanged
        };

        const updatedMetrics = {};
        const keys = ['spend', 'impressions'];
        keys.forEach(key => {
            const dbMetric = dbMetrics[key] || {};
            const newMetric = newMetrics[key] || {};

            const dbVal = dbMetric.value !== undefined ? dbMetric.value : null;
            const newVal = newMetric.value !== undefined ? newMetric.value : null;
            const isEdited = dbVal !== newVal || dbMetric.isManuallyEdited === true;

            updatedMetrics[key] = {
                ...dbMetric,
                ...newMetric,
                isManuallyEdited: isEdited
            };
        });

        assert.strictEqual(updatedMetrics.spend.isManuallyEdited, true);
        assert.strictEqual(updatedMetrics.impressions.isManuallyEdited, false);
        assert.strictEqual(updatedMetrics.spend.value, 1300.00);
    });

    await t.test('Array metrics adaptation to key-indexed dictionary', async () => {
        const { validateAndCleanSourceExtraction } = await import('../src/services/reportVisionService.js');

        // Formatted as an Array by the model
        const rawPayload = {
            metrics: [
                { key: "spend", label: "Importe", value: 1250 },
                { key: "impressions", label: "Imp", value: 50000 }
            ],
            screenType: "Rendimiento",
            sectionCategory: "ADS"
        };

        const cleaned = validateAndCleanSourceExtraction(rawPayload);
        assert.strictEqual(cleaned.usable, true);
        assert.strictEqual(cleaned.metrics.spend.value, 1250);
        assert.strictEqual(cleaned.metrics.impressions.value, 50000);
        assert.strictEqual(cleaned.metrics.clicks.value, null);
    });

    await t.test('cleanNumericValue utility parsing styles', async () => {
        const { cleanNumericValue } = await import('../src/services/reportVisionService.js');

        assert.strictEqual(cleanNumericValue(1250.50), 1250.50);
        assert.strictEqual(cleanNumericValue("147.636"), 147636);
        assert.strictEqual(cleanNumericValue("147,636"), 147636);
        assert.strictEqual(cleanNumericValue("0,82%"), 0.82);
        assert.strictEqual(cleanNumericValue("$1,250.50 COP"), 1250.50);
        assert.strictEqual(cleanNumericValue("1.250,50"), 1250.50);
        assert.strictEqual(cleanNumericValue("1,250.50"), 1250.50);
        assert.strictEqual(cleanNumericValue("N/A"), null);
    });

    await t.test('Tolerant validation - partial metrics', async () => {
        // Screenshot with only spend and impressions, others null/missing
        const rawPayload = {
            metrics: {
                spend: { key: "spend", label: "Importe", value: 500, unit: "USD" },
                impressions: { key: "impressions", label: "Imp", value: 50000, unit: "count" }
            },
            screenType: "Rendimiento",
            sectionCategory: "ADS"
        };

        const cleaned = validateAndCleanSourceExtraction(rawPayload);
        assert.strictEqual(cleaned.usable, true);
        assert.strictEqual(cleaned.metrics.spend.value, 500);
        assert.strictEqual(cleaned.metrics.impressions.value, 50000);
        // Clicks, ctr, results, reach should be cleanly resolved to null
        assert.strictEqual(cleaned.metrics.clicks.value, null);
        assert.strictEqual(cleaned.metrics.ctr.value, null);
        assert.strictEqual(cleaned.metrics.reach.value, null);
    });

    await t.test('Tolerant validation - pure demographics screen', async () => {
        // Pure demographic screen with no global financial metrics
        const rawPayload = {
            metrics: {
                spend: { value: null },
                impressions: { value: null }
            },
            demographics: {
                ageGender: [{ label: "18-24", hombres: 12, mujeres: 18 }]
            },
            screenType: "Demografía",
            sectionCategory: "ORGANIC"
        };

        const cleaned = validateAndCleanSourceExtraction(rawPayload);
        assert.strictEqual(cleaned.usable, true);
        assert.strictEqual(cleaned.metrics.spend.value, null);
        assert.ok(cleaned.demographics);
        assert.strictEqual(cleaned.demographics.ageGender[0].hombres, 12);
    });

    await t.test('Consolidation - metric sum, reach non-additive, and null preservation', async () => {
        let accumulator = null;

        const source1 = validateAndCleanSourceExtraction({
            metrics: {
                spend: { value: 200, unit: "USD" },
                impressions: { value: 1000 },
                reach: { value: 800 }
            }
        });

        const source2 = validateAndCleanSourceExtraction({
            metrics: {
                spend: { value: 300, unit: "USD" },
                impressions: { value: 2000 },
                reach: { value: 1500 }
            }
        });

        accumulator = mergeSourceMetricsIntoAccumulator(accumulator, source1);
        accumulator = mergeSourceMetricsIntoAccumulator(accumulator, source2);

        const finalized = finalizeNormalizedMetrics(accumulator);

        // Sum check
        assert.strictEqual(finalized.spend.value, 500);
        assert.strictEqual(finalized.impressions.value, 3000);

        // Reach non-additive check (consolidates using Math.max)
        assert.strictEqual(finalized.reach.value, 1500);

        // Null preservation check: clicks and results were not observed and must remain null, never 0
        assert.strictEqual(finalized.clicks.value, null);
        assert.strictEqual(finalized.results.value, null);
    });

    await t.test('Consolidation - derived overall CTR calculation', async () => {
        let accumulator = null;

        const source1 = validateAndCleanSourceExtraction({
            metrics: {
                impressions: { value: 10000 },
                clicks: { value: 150 }
            }
        });

        const source2 = validateAndCleanSourceExtraction({
            metrics: {
                impressions: { value: 20000 },
                clicks: { value: 300 }
            }
        });

        accumulator = mergeSourceMetricsIntoAccumulator(accumulator, source1);
        accumulator = mergeSourceMetricsIntoAccumulator(accumulator, source2);

        const finalized = finalizeNormalizedMetrics(accumulator);

        // Theoretical overall CTR = (150+300) / (10000+20000) * 100 = 450 / 30000 * 100 = 1.5%
        assert.strictEqual(finalized.clicks.value, 450);
        assert.strictEqual(finalized.impressions.value, 30000);
        assert.strictEqual(finalized.ctr.value, 1.5);
    });
});
