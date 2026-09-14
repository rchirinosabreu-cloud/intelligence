import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import KeyLinksWidget from '@/components/modules/KeyLinksWidget';
import { ConfirmDialogProvider } from '@/components/ui/ConfirmDialog';
import '@/index.css';

if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
createRoot(document.getElementById('root')).render(
  <ConfirmDialogProvider>
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-xl font-semibold">Espacio del cliente</h1>
        <p className="text-sm text-muted-foreground">Muestra local · Enlaces de ejemplo</p>
        <KeyLinksWidget clientId="client-links-preview" />
      </div>
    </main>
    <Toaster />
  </ConfirmDialogProvider>
);
