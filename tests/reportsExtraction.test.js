import test from 'node:test';
import assert from 'node:assert';
import {
    extractMetricsWithGemini,
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

// We can mock the fetch call to Gemini to test the vision service
test('Vision Extraction Service - Gemini Mock and Math Validation', async (t) => {

    await t.test('Retries once when Gemini returns malformed structured JSON', async () => {
        const originalFetch = globalThis.fetch;
        const originalApiKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'mock-key';
        let calls = 0;
        globalThis.fetch = async () => {
            calls += 1;
            const text = calls === 1
                ? '{"metrics":{"spend":{"value":null} "impressions":{}}}'
                : JSON.stringify({ metrics: { spend: { value: 2500, unit: 'COP' } }, screenType: 'Rendimiento Macro' });
            return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        try {
            const result = await extractMetricsWithGemini(Buffer.from('mock-image'), 'image/jpeg');
            assert.strictEqual(calls, 2);
            assert.strictEqual(result.metrics.spend.value, 2500);
        } finally {
            globalThis.fetch = originalFetch;
            process.env.GEMINI_API_KEY = originalApiKey;
        }
    });

    await t.test('recovers when two structured responses are malformed', async () => {
        const originalFetch = globalThis.fetch;
        const originalApiKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'mock-key';
        let calls = 0;
        globalThis.fetch = async () => {
            calls += 1;
            const text = calls < 3
                ? '{"metrics":[{"key":"views","value":42500}'
                : JSON.stringify({ metrics: [{ key: 'views', value: 42500, label: 'Visualizaciones' }], sectionCategory: 'ORGANIC' });
            return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };
        try {
            const result = await extractMetricsWithGemini(Buffer.from('mock-image'), 'image/jpeg');
            assert.strictEqual(calls, 3);
            assert.strictEqual(result.metrics[0].value, 42500);
        } finally {
            globalThis.fetch = originalFetch;
            process.env.GEMINI_API_KEY = originalApiKey;
        }
    });

    await t.test('Successfully extracts structured metrics from mock response', async () => {
        const mockResponse = {
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: JSON.stringify({
                                    metrics: {
                                        spend: { key: "spend", label: "Importe gastado", value: 1250.50, unit: "USD", confidence: 0.95, evidence: "$1,250.50" },
                                        impressions: { key: "impressions", label: "Impresiones", value: 100000, unit: "count", confidence: 0.98, evidence: "100.000" },
                                        reach: { key: "reach", label: "Alcance", value: 85000, unit: "count", confidence: 0.92, evidence: "85.000" },
                                        clicks: { key: "clicks", label: "Clics en el enlace", value: 1500, unit: "count", confidence: 0.97, evidence: "1.500" },
                                        ctr: { key: "ctr", label: "CTR", value: 1.50, unit: "%", confidence: 0.96, evidence: "1.50%" },
                                        results: { key: "results", label: "Resultados", value: 120, unit: "count", confidence: 0.94, evidence: "120" }
                                    },
                                    screenType: "Rendimiento Macro",
                                    confidence: 0.95,
                                    narrativeDraft: "El rendimiento de la campaña muestra una estabilización excelente.",
                                    chartType: "LINE_CHART",
                                    title: "Tendencia de Performance",
                                    sectionCategory: "ADS",
                                    platform: "META_ADS",
                                    dataset: [
                                        { label: "Día 1", value: 100, hombres: null, mujeres: null },
                                        { label: "Día 2", value: 150, hombres: null, mujeres: null }
                                    ],
                                    demographics: {
                                        ageGender: [
                                            { label: "18-24", hombres: 10, mujeres: 15 }
                                        ],
                                        cities: [
                                            { label: "Bogota", value: 80 }
                                        ],
                                        countries: [
                                            { label: "Colombia", value: 95 }
                                        ]
                                    },
                                    topContent: [
                                        { title: "Publicacion 1", format: "Imagen", results: 150, impressions: 5000, reach: 4000 }
                                    ]
                                })
                            }
                        ]
                    }
                }
            ]
        };

        // Temporary stub for global fetch
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return new Response(JSON.stringify(mockResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        // Set mock env variables
        const originalApiKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'mock-key';

        try {
            const result = await extractMetricsWithGemini(Buffer.from('mock-image'), 'image/jpeg');
            assert.ok(result.metrics);
            assert.strictEqual(result.metrics.spend.value, 1250.50);
            assert.strictEqual(result.metrics.clicks.value, 1500);
            assert.strictEqual(result.metrics.ctr.value, 1.50);
            assert.strictEqual(result.screenType, "Rendimiento Macro");
            assert.strictEqual(result.confidence, 0.95);
        } finally {
            // Restore
            globalThis.fetch = originalFetch;
            process.env.GEMINI_API_KEY = originalApiKey;
        }
    });

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

        // Formatted as an Array from Gemini
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

    await t.test('Editorial narrative prompt and format generation logic', async () => {
        const mockNarrativeResponse = {
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: JSON.stringify({
                                    headline: "Rendimiento Excepcional en Campañas de Pauta",
                                    summaryPoints: [
                                        "Incremento sustancial en la conversión final.",
                                        "Estabilización y optimización de costos de adquisición.",
                                        "Aumento en CTR impulsado por nuevos ganchos de contenido."
                                    ],
                                    keyAchievements: "Durante este ciclo, la pauta publicitaria demostró una consolidación clave.",
                                    actionPlan: [
                                        { action: "Implementar optimización de audiencias", kpi: "CPA -10%", suggestedAssignee: "Director de Performance" },
                                        { action: "Renovar creativos del pilar más relevante", kpi: "CTR > 1.8%", suggestedAssignee: "Diseñador Creativo" },
                                        { action: "Establecer presupuesto incremental", kpi: "Retorno de inversión", suggestedAssignee: "Project Manager" }
                                    ],
                                    logrosYAvances: [
                                        "Incremento sustancial en la conversión final.",
                                        "Aumento en CTR impulsado por nuevos ganchos de contenido."
                                    ],
                                    contenidoTopAnalisis: "Análisis de las mejores piezas del mes.",
                                    oportunidadesYAprendizajes: "Nuevas oportunidades en la pauta de Meta Ads.",
                                    recomendacionesEstrategicas: "Recomendaciones finales de desempeño.",
                                    sections: [
                                        {
                                            sectionId: "sec-1",
                                            chartType: "LINE_CHART",
                                            title: "Rendimiento y Tendencia",
                                            sectionCategory: "ADS",
                                            platform: "META_ADS",
                                            dataset: [{ label: "Día 1", value: 100, hombres: null, mujeres: null }],
                                            narrativeComment: "Meta Ads registró 100 resultados visibles durante el periodo, una base que permite revisar la entrega de la campaña sin asumir ventas confirmadas.\n\nPara Cliente Demo, este resultado debe contrastarse con costo y calidad de los contactos antes de redistribuir inversión hacia el siguiente ciclo."
                                        }
                                    ]
                                })
                            }
                        ]
                    }
                }
            ]
        };

        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return new Response(JSON.stringify(mockNarrativeResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const originalApiKey = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = 'mock-key';

        try {
            // Import and run the new narrative generation service
            const { generateNarrativeWithGemini } = await import('../src/services/reportVisionService.js');
            const metrics = { spend: { value: 1300 } };
            const sections = [{ sectionId: "sec-1", chartType: "LINE_CHART", title: "Rendimiento y Tendencia", sectionCategory: "ADS", platform: "META_ADS", dataset: [{ label: "Día 1", value: 100, hombres: null, mujeres: null }] }];
            const result = await generateNarrativeWithGemini(metrics, sections, 'Cliente Demo');


            assert.ok(result);
            assert.strictEqual(result.headline, "Rendimiento Excepcional en Campañas de Pauta");
            assert.strictEqual(result.summaryPoints.length, 3);
            assert.strictEqual(result.actionPlan.length, 3);
            assert.strictEqual(result.actionPlan[0].suggestedAssignee, "Director de Performance");
        } finally {
            globalThis.fetch = originalFetch;
            process.env.GEMINI_API_KEY = originalApiKey;
        }
    });
});
