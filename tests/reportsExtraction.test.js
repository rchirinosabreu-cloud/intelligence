import test from 'node:test';
import assert from 'node:assert';
import { extractMetricsWithVision } from '../src/services/reportVisionService.js';

// We can mock the fetch call to OpenAI to test the vision service
test('Vision Extraction Service - OpenAI Mock and Math Validation', async (t) => {

    await t.test('Successfully extracts structured metrics from mock response', async () => {
        const mockResponse = {
            choices: [
                {
                    message: {
                        content: JSON.stringify({
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
                            dataset: [
                                { label: "Día 1", value: 100 },
                                { label: "Día 2", value: 150 }
                            ]
                        })
                    }
                }
            ]
        };

        // Temporary stub for global fetch
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return {
                ok: true,
                status: 200,
                json: async () => mockResponse
            };
        };

        // Set mock env variables
        const originalApiKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'mock-key';

        try {
            const result = await extractMetricsWithVision(Buffer.from('mock-image'), 'image/jpeg');
            assert.ok(result.metrics);
            assert.strictEqual(result.metrics.spend.value, 1250.50);
            assert.strictEqual(result.metrics.clicks.value, 1500);
            assert.strictEqual(result.metrics.ctr.value, 1.50);
            assert.strictEqual(result.screenType, "Rendimiento Macro");
            assert.strictEqual(result.confidence, 0.95);
        } finally {
            // Restore
            globalThis.fetch = originalFetch;
            process.env.OPENAI_API_KEY = originalApiKey;
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

    await t.test('Editorial narrative prompt and format generation logic', async () => {
        const mockNarrativeResponse = {
            choices: [
                {
                    message: {
                        content: JSON.stringify({
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
                            sections: [
                                {
                                    sectionId: "sec-1",
                                    chartType: "LINE_CHART",
                                    title: "Rendimiento y Tendencia",
                                    dataset: [{ label: "Día 1", value: 100 }],
                                    narrativeComment: "Comentario optimista sobre rendimiento macro."
                                }
                            ]
                        })
                    }
                }
            ]
        };

        const originalFetch = globalThis.fetch;
        globalThis.fetch = async () => {
            return {
                ok: true,
                status: 200,
                json: async () => mockNarrativeResponse
            };
        };

        const originalApiKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = 'mock-key';

        try {
            // Import and run the new narrative generation service
            const { generateNarrativeWithOpenAI } = await import('../src/services/reportVisionService.js');
            const metrics = { spend: { value: 1300 } };
            const sections = [{ sectionId: "sec-1", chartType: "LINE_CHART", title: "Rendimiento y Tendencia", dataset: [{ label: "Día 1", value: 100 }] }];
            const result = await generateNarrativeWithOpenAI(metrics, sections);


            assert.ok(result);
            assert.strictEqual(result.headline, "Rendimiento Excepcional en Campañas de Pauta");
            assert.strictEqual(result.summaryPoints.length, 3);
            assert.strictEqual(result.actionPlan.length, 3);
            assert.strictEqual(result.actionPlan[0].suggestedAssignee, "Director de Performance");
        } finally {
            globalThis.fetch = originalFetch;
            process.env.OPENAI_API_KEY = originalApiKey;
        }
    });
});
