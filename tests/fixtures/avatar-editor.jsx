import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import AvatarEditor from '@/components/profile/AvatarEditor';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { dashboardDemoUser } from './dashboardPreviewData';
import '@/index.css';

// Served only by scripts/preview-dashboard.js. The mock API rejects writes, so saving shows the error path.
if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const roster = ['Rodny Chirinos', 'Helen Hernández', 'Melissa Castaño', 'Franci Villa', 'Sara Herrera', 'Jesús Arnedo', 'Elisa Torres',
  'Juan Pérez', 'Camila Ruiz', 'Andrés Gómez', 'Laura Díaz', 'Mateo Silva', 'Valentina Ortiz', 'Daniel Rojas'];

function Preview() {
  const [saved, setSaved] = useState(null);
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <p className="mb-4 text-sm text-muted-foreground">Muestra local · API simulada de solo lectura · Sin conexión a producción.</p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section aria-label="Editor de foto" className="brain-glass p-6" data-avatar-editor>
          <h1 className="mb-4 text-lg font-semibold">Actualizar foto</h1>
          <AvatarEditor user={dashboardDemoUser} onSaved={setSaved} onCancel={() => setSaved('cancel')} />
          {saved && <p className="mt-3 text-xs text-zinc-500">Resultado: {String(saved)}</p>}
        </section>
        <section aria-label="Anillos del equipo" className="brain-glass p-6">
          <h2 className="mb-4 text-lg font-semibold">Anillo de color por persona (14)</h2>
          <div className="flex flex-wrap gap-5">
            {roster.map((name) => (
              <div key={name} className="flex w-24 flex-col items-center gap-2 text-center">
                <TeamAvatar member={{ name }} size={64} ring className="h-16 w-16 border-0 [&>span]:text-lg" />
                <span className="text-[11px] text-zinc-600 dark:text-zinc-300">{name}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}><Preview /><Toaster position="top-right" /></QueryClientProvider>
);
