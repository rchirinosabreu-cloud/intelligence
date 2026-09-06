import React from 'react';
import { createRoot } from 'react-dom/client';
import BriaClientCriteria from '../../src/components/modules/ContentPlan/BriaClientCriteria';
import '../../src/index.css';

createRoot(document.getElementById('root')).render(
  <main className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <p className="mb-6">Prueba local · datos ficticios</p>
    <BriaClientCriteria planId="criteria-fixture" />
  </main>
);
