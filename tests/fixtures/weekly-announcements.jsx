import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DashboardAnnouncements from '@/components/modules/DashboardAnnouncements';
import { Button } from '@/components/ui/button';
import '@/index.css';

if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');
const initial = [
  { id: 'old-personal', scope: 'MEMBER', content: '<p>Recordatorio personal de la semana anterior.</p>', createdAt: '2026-09-14T04:30:00Z', author: { name: 'Helen Hernández' } },
  { id: 'old-global', scope: 'GLOBAL', content: '<p>Reunión general de la semana anterior.</p>', createdAt: '2026-09-11T15:00:00Z' },
];
function Preview() {
  const [announcements, setAnnouncements] = useState(initial);
  return <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
    <p className="mb-4 text-sm text-muted-foreground">Muestra local · Sin conexión a producción.</p>
    <div className="max-w-2xl" data-announcements-preview>
      <DashboardAnnouncements announcements={announcements} className="h-[470px] max-h-[470px]" />
    </div>
    <Button className="mt-4" onClick={() => setAnnouncements(rows => [
      { id: 'new-global', scope: 'GLOBAL', content: '<p>Prioridades de la nueva semana.</p>', createdAt: new Date().toISOString() }, ...rows,
    ])}>Añadir anuncio simulado</Button>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
