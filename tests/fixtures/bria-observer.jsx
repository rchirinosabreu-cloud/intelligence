import React from 'react';
import { createRoot } from 'react-dom/client';
import BriaObserverInbox from '../../src/components/modules/BriaObserverInbox';
import '../../src/index.css';

createRoot(document.getElementById('root')).render(
  <main className="min-h-screen bg-zinc-50 p-3 text-zinc-900 sm:p-8 dark:bg-zinc-950 dark:text-zinc-100">
    <p className="mb-6 text-sm">Muestra local · datos ficticios · sin guardar cambios</p>
    <BriaObserverInbox />
  </main>
);
