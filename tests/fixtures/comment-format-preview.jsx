import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { Paperclip, Send } from '@/components/ui/icons';
import '@/index.css';

function Preview() {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('<p>Hola, equipo. Estas son las observaciones para la siguiente entrega.</p>');
  const [notice, setNotice] = useState('');
  const scrollRef = useRef(null);
  const editorRef = useRef(null);
  const simulateSend = () => setNotice('Muestra local: no se ha enviado ni guardado ningún comentario.');
  return <>
    <main className="min-h-screen bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <button className="rounded-lg bg-primary px-4 py-2 text-white" onClick={() => setOpen(true)}>Abrir muestra de Formato</button>
    </main>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent style={{ height: '85vh' }} className="flex max-w-6xl flex-col overflow-clip rounded-2xl border-zinc-200 bg-zinc-50 p-0 dark:border-zinc-800 dark:bg-zinc-950" onOpenAutoFocus={event => {
        event.preventDefault();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }));
      }}>
        <header className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4 pr-12 dark:border-zinc-800 dark:bg-zinc-900">
          <DialogTitle>Formato del comentario</DialogTitle>
          <DialogDescription className="mt-2">Muestra local · prueba el botón A para abrir y cerrar Formato.</DialogDescription>
          <button className="mt-2 text-sm text-primary" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
        </header>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="flex flex-col gap-6 pb-6">
            {Array.from({ length: 8 }, (_, index) => ['Comparto las observaciones de la pieza para revisar el texto.', 'La propuesta conserva las referencias que acordamos con el cliente.', 'Podemos ajustar los títulos y resaltar las ideas principales en el próximo comentario.', 'Prueba abrir Formato, escribir y volver a cerrarlo. El borde inferior debe mantenerse estable.'][index % 4]).map((message, index) => (
              <div key={index} className="max-w-3xl">
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">Equipo · comentario de muestra {index + 1}</p>
                <div className="rounded-2xl rounded-tl-none border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">{message}</div>
              </div>
            ))}
          </div>
          <RichTextEditor ref={editorRef} value={text} onChange={setText} onSend={simulateSend}
            attachmentAction={<span title="Adjuntos no habilitados en esta muestra" className="flex h-9 w-9 items-center justify-center text-zinc-400"><Paperclip size={16} /></span>}
            emojiAction={<button title="Insertar emoji de prueba" onClick={() => editorRef.current?.insertEmoji('🙂')} className="flex h-9 w-9 items-center justify-center text-zinc-400">🙂</button>}
            sendAction={<button title="Simular envío local" onClick={simulateSend} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white"><Send size={16} /></button>}
          />
          {notice && <p role="status" className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{notice}</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

createRoot(document.getElementById('root')).render(<Preview />);
