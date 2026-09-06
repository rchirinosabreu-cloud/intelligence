import React from 'react';
import { createRoot } from 'react-dom/client';
import BriaScoreDetails from '../../src/components/modules/ContentPlan/BriaScoreDetails';
import '../../src/index.css';

export const demoScore = { score: 92, scoreTrace: { rubric: { version: 'bria-editorial-traceable-v1', status: 'CANDIDATE' }, totalChecks: 11, assessedChecks: 4, partial: true, unroundedScore: 92.4242424242,
  deductions: [{ ruleKey: 'GRAMMAR_AGREEMENT', itemId: 'piece', category: 'GRAMATICA', quote: 'Nuestros diseños comunica tu idea.', points: 7.5757575758, detail: 'El sujeto plural requiere «comunican».', recommendation: 'Cambiar «comunica» por «comunican».' }],
  exclusions: ['BRAND_VOICE', 'BRAND_NAME', 'BRAND_CONSTRAINT', 'STRATEGY_CTA', 'CONSISTENCY_FACT', 'CONSISTENCY_DATE', 'CONSISTENCY_DUPLICATE'].map(ruleKey => ({ ruleKey, itemId: 'piece', detail: 'No hay contexto aplicable a este criterio en la muestra.' }))
} };
createRoot(document.getElementById('root')).render(<main className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"><p className="mb-6">Muestra ficticia del desglose · no cambia puntajes publicados</p><BriaScoreDetails review={demoScore} /></main>);
