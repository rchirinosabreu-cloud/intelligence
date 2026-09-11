import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import '@/index.css';

const members = [{ id: 'sample-sara', name: 'Sara Herrera' }, { id: 'sample-samuel', name: 'Samuel · ejemplo' }, { id: 'sample-melissa', name: 'Melissa Castaño' }];
function Composer() {
  const [value, setValue] = useState(''), [sent, setSent] = useState('');
  return <>
    <RichTextEditor value={value} onChange={setValue} onSend={() => setSent(value)} teamMembers={members} placeholder="Escribe @sar para mencionar a Sara…"
      sendAction={<button type="button" onClick={() => setSent(value)} className="min-h-11 rounded-lg bg-primary px-3 text-sm text-white">Simular envío</button>} />
    <output data-saved-comment className="block mt-4 break-words text-xs text-zinc-500 dark:text-zinc-400">{sent}</output>
  </>;
}
function Preview() {
  const [open, setOpen] = useState(false);
  return <main className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:p-12">
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-xl font-semibold">Menciones en comentarios</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Muestra local · no se envían comentarios ni notificaciones reales.</p>
      {!open && <Composer />}
      <button type="button" className="min-h-11 rounded-lg border border-zinc-200 px-4 dark:border-zinc-700" onClick={() => setOpen(true)}>Probar dentro de una tarea</button>
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl overflow-visible"><DialogTitle>Comentario de una tarea</DialogTitle><DialogDescription>Editor real con miembros de muestra.</DialogDescription><Composer /></DialogContent></Dialog>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
