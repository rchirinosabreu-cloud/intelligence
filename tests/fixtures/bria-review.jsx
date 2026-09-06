import React from 'react';
import { createRoot } from 'react-dom/client';
import BriaContentPlanReview from '../../src/components/modules/ContentPlan/BriaContentPlanReview';
import '../../src/index.css';

createRoot(document.getElementById('root')).render(
  <main className="min-h-screen bg-zinc-50 p-3 text-zinc-900 sm:p-8 dark:bg-zinc-950 dark:text-zinc-100">
    <p className="mb-6 text-sm">Muestra local · datos ficticios · sin guardar cambios</p>
    <BriaContentPlanReview planId="verification-fixture" />
    <div id="item-piece" className="mt-12 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">Pieza de ejemplo</div>
  </main>
);
