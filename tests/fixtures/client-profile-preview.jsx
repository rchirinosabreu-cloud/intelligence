import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import EditClientDialog from '@/components/modules/Clients/EditClientDialog';
import '@/index.css';

// Muestra local de la ficha completa en Clientes (30 de septiembre de 2026): el diálogo de
// editar con un cliente de ejemplo y un servidor simulado en memoria.
const client = {
  id: 'demo-grit', name: 'Fundación Grit', slug: 'fundacion-grit',
  legalName: 'FUNDACIÓN GRIT COLOMBIA', documentType: 'NIT', documentNumber: '901234567',
  contactName: 'María Pérez', email: 'pagos@grit.org', phone: '+57 300 123 4567',
  address: 'Calle 64 # 17A-16', city: 'Cartagena', country: 'Colombia'
};
window.__requests = [];
window.fetch = async (url, options = {}) => {
  const body = JSON.parse(options.body || '{}');
  window.__requests.push(body);
  return new Response(JSON.stringify({ ...client, ...body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function Preview() {
  const [saved, setSaved] = useState(null);
  // El diálogo queda abierto para mirarlo; lo guardado se ve debajo.
  return <main className="min-h-screen bg-background p-6 text-foreground">
    <pre data-saved className="text-xs">{saved ? JSON.stringify(saved) : ''}</pre>
    <EditClientDialog client={client} onSaved={setSaved} onClose={() => {}} />
    <Toaster />
  </main>;
}

createRoot(document.getElementById('root')).render(<Preview />);
