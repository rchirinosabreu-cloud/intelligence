import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, Edit, ExpandView as Maximize2, CollapseView as Minimize2, X, Copy, History, Brain, Trash2, MessageSquare } from '@/components/ui/icons';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { requestBriaChat, downloadBriaAttachment } from '@/lib/briaChatRequest';
import { requestKnowledge } from '@/lib/briaKnowledgeRequest';
import BriaComposer from './BriaComposer';
import { cn } from '@/lib/utils';
import { validateAttachmentSelection } from '@/lib/briaAttachments';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

const safeSource = url => {
  if (typeof url !== 'string') return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try { const value = new URL(url); return value.protocol === 'https:' && ['drive.google.com','docs.google.com','mail.google.com'].includes(value.hostname) ? value.href : null; } catch { return null; }
};
const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
const suggestions = ['Ayúdame a revisar una parrilla', '¿Qué tengo pendiente hoy?', 'Revisemos la producción de esta semana'];

function Remembered({ onBack }) {
  const [rows, setRows] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(null);
  const load = () => requestKnowledge().then(setRows).catch(failure => setError(failure.message));
  useEffect(() => { load(); }, []);
  const forget = async row => {
    setBusy(row.id); setError('');
    try { await requestKnowledge(`/${row.id}/revoke`, { method: 'POST', body: { expectedRevision: row.revision } }); await load(); }
    catch (failure) { console.error('[BriaMemory]', failure.message); setError(failure.message); }
    finally { setBusy(null); }
  };
  return <div className="p-5"><button type="button" className="min-h-11 text-sm text-brand-cyan-deep dark:text-brand-cyan" onClick={onBack}>Volver a la conversación</button><h2 className="mt-3 text-lg font-semibold">Registro</h2><p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Decisiones y correcciones que el equipo compartió conversando. Puedes pedirle cualquier ajuste en el chat.</p>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<ul className="mt-5 space-y-5">{rows.map(row => <li key={row.id} className="border-b border-zinc-200 pb-4 dark:border-zinc-800"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{row.entity} · {row.topic}</p>{row.status === 'ACTIVE' && <button type="button" aria-label={`Olvidar: ${row.topic}`} title="Olvidar este recuerdo" disabled={!!busy} onClick={() => forget(row)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{row.text}</p><p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{row.author} · {row.validFrom} · {row.status === 'REVOKED' ? 'Retirado' : row.kind === 'PROPOSAL' ? 'Propuesta' : 'Confirmado'} · versión {row.revision}</p></li>)}</ul>{!rows.length && <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">Los recuerdos aparecerán aquí cuando compartas una decisión o corrección.</p>}</div>;
}

export default function BriaConversation({ userId = 'local-research-owner', userName = 'Rodny', userRole = 'VIEWER', fullScreen = false, visible = true, onFullScreen, onClose, onOpenSource, request = requestBriaChat, downloadBriaAttachment: downloadAttachment = downloadBriaAttachment }) {
  const confirm = useConfirmDialog();
  const isAdmin = userRole === 'ADMIN', allowAttachments = ['ADMIN', 'PROJECT_MANAGER'].includes(userRole);
  const [files, setFiles] = useState([]), [voiceBusy, setVoiceBusy] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false), dragDepth = useRef(0);
  const key = `bria:conversation:${userId}`;
  const [chat, setChat] = useState(null), [history, setHistory] = useState([]), [view, setView] = useState('chat');
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const end = useRef(null), scrollBox = useRef(null), input = useRef(null), lock = useRef(false), liveChat = useRef(null), mounted = useRef(true);
  const rememberChat = row => { liveChat.current = row; setChat(row); sessionStorage.setItem(key, row.id); };
  const loadHistory = async () => { const rows = await request(); if (mounted.current) setHistory(rows); return rows; };
  useEffect(() => {
    mounted.current = true;
    (async () => { try { const rows = await loadHistory(), active = sessionStorage.getItem(key); if (active && rows.some(row => row.id === active)) rememberChat(await request(`/${active}`)); else if (rows.length) rememberChat(await request(`/${rows[0].id}`)); } catch (failure) { if (mounted.current) setError(failure.message); } finally { if (mounted.current) setLoading(false); } })();
    return () => { mounted.current = false; };
  }, [userId]);
  useLayoutEffect(() => {
    const box = scrollBox.current;
    if (!box) return;
    const latest = chat?.turns.at(-1);
    if (latest?.role === 'assistant') {
      const answers = box.querySelectorAll('[data-conversation-turn="assistant"]'), last = answers[answers.length - 1];
      if (last) box.scrollTop = box.scrollTop + last.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
    } else box.scrollTop = box.scrollHeight;
  }, [chat?.id, chat?.turns.length, view]);
  useEffect(() => { if (!isAdmin && view === 'memory') setView('chat'); }, [isAdmin, view]);
  useEffect(() => { if (visible && view === 'chat') input.current?.focus({ preventScroll: true }); }, [visible, view, loading]);
  useEffect(() => { dragDepth.current = 0; setDraggingFiles(false); }, [visible, view, allowAttachments, busy, loading, voiceBusy]);
  const canAddFiles = visible && view === 'chat' && allowAttachments && !busy && !loading && !voiceBusy;
  const addFiles = additions => {
    if (!canAddFiles || !additions.length) return;
    try { const next = [...files, ...additions]; validateAttachmentSelection(next); setFiles(next); setError(''); }
    catch (failure) { setError(failure.message); }
  };
  const fileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  const dragEnter = event => { if (!fileDrag(event)) return; event.preventDefault(); dragDepth.current++; if (canAddFiles) setDraggingFiles(true); };
  const dragLeave = event => { if (!fileDrag(event)) return; event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDraggingFiles(false); };
  const dragOver = event => { if (!fileDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = canAddFiles ? 'copy' : 'none'; };
  const dropFiles = event => { if (!fileDrag(event)) return; event.preventDefault(); dragDepth.current = 0; setDraggingFiles(false); addFiles(Array.from(event.dataTransfer.files || [])); };
  const openChat = async id => {
    if (lock.current || voiceBusy) return;
    setLoading(true); setError('');
    try { rememberChat(await request(`/${id}`)); setView('chat'); setQuestion(''); setFiles([]); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  const newChat = async () => {
    if (lock.current || voiceBusy) return;
    setLoading(true); setError('');
    try { rememberChat(await request('', { method: 'POST' })); await loadHistory(); setView('chat'); setQuestion(''); setFiles([]); input.current?.focus({ preventScroll: true }); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  const send = async (message = question) => {
    const value = String(message).trim(); if ((!value && !files.length) || value.length > 12000 || lock.current || loading || voiceBusy) return;
    lock.current = true; setBusy(true); setError(''); setQuestion('');
    try {
      let current = liveChat.current;
      if (!current) { current = await request('', { method: 'POST' }); rememberChat(current); }
      setChat({ ...current, turns: [...current.turns, { id: 'pending', role: 'user', text: value || 'Analiza los archivos adjuntos.', attachments: files.map((file, index) => ({ id: `pending-${index}`, name: file.name })) }] });
      const body = files.length ? new FormData() : { question: value };
      if (files.length) { body.append('question', value); files.forEach(file => body.append('files', file, file.name)); }
      const saved = await request(`/${current.id}/messages`, { method: 'POST', body });
      rememberChat(saved); setFiles([]); await loadHistory();
    } catch (failure) { console.error('[BriaConversation]', failure.message); setError(failure.message); setQuestion(value); setChat(liveChat.current); }
    finally { setBusy(false); lock.current = false; input.current?.focus({ preventScroll: true }); }
  };
  const removeChat = async row => {
    if (lock.current || loading || voiceBusy) return;
    const accepted = await confirm({ title: 'Borrar conversación', description: 'Se borrarán definitivamente el chat y sus archivos.\nLo que Bria aprendió se conserva.', confirmLabel: 'Borrar definitivamente', showIcon: false, spreadActions: true, layer: 300 });
    if (!accepted || lock.current || loading || voiceBusy) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await request(`/${row.id}`, { method: 'DELETE', body: { expectedRevision: row.revision } });
      setHistory(current => current.filter(item => item.id !== row.id));
      if (liveChat.current?.id === row.id) { liveChat.current = null; setChat(null); sessionStorage.removeItem(key); setQuestion(''); setFiles([]); setView('chat'); }
      toast.success(result.filesPending ? 'Chat eliminado; sus archivos se están borrando.' : 'Conversación y archivos eliminados.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); lock.current = false; }
  };
  const sourceClick = (event, source) => {
    const url = safeSource(source.url);
    if (source.kind === 'aprendizaje') { event.preventDefault(); if (isAdmin) setView('memory'); }
    else if (url?.startsWith('/') && onOpenSource) { event.preventDefault(); onOpenSource(source); }
  };
  const conversationList = <div className="flex min-h-0 flex-1 flex-col p-3"><button type="button" onClick={newChat} disabled={busy || loading || voiceBusy} className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-cyan-soft px-3 text-left text-sm text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan"><Edit className="h-4 w-4" />Nueva conversación</button><h2 className="mt-6 px-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">Conversaciones</h2><ul className="mt-2 min-h-0 flex-1 overflow-y-auto">{history.map(row => <li key={row.id} className="flex items-center gap-1"><button type="button" disabled={busy || loading || voiceBusy} onClick={() => openChat(row.id)} aria-current={chat?.id === row.id ? 'true' : undefined} className={cn('min-h-11 min-w-0 flex-1 truncate rounded-xl px-3 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800', chat?.id === row.id && 'bg-zinc-100 dark:bg-zinc-800')}>{row.title}</button><button type="button" aria-label={`Borrar conversación: ${row.title}`} title="Borrar conversación" disabled={busy || loading || voiceBusy} onClick={() => removeChat(row)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-40 dark:text-zinc-400 dark:hover:text-destructive"><Trash2 className="h-4 w-4" /></button></li>)}</ul>{isAdmin && <button type="button" onClick={() => setView('memory')} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"><Brain className="h-4 w-4" />Registro</button>}</div>;
  return <section aria-label="Conversación con Bria" onDragEnter={dragEnter} onDragLeave={dragLeave} onDragOver={dragOver} onDrop={dropFiles} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    {draggingFiles && <div role="status" className="pointer-events-none absolute inset-x-3 bottom-3 top-20 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-cyan bg-white/95 p-6 text-center text-sm font-medium text-brand-cyan-deep dark:bg-zinc-950/95 dark:text-brand-cyan">Suelta los archivos para adjuntarlos</div>}
    <header className="brain-ai-header flex h-16 shrink-0 items-center gap-1 px-3 text-white">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Menú de Bria" className={iconButton}><Menu className="h-4 w-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setView('chat')}><MessageSquare className="mr-2 h-4 w-4" />Chat</DropdownMenuItem>
          <DropdownMenuItem disabled={voiceBusy} onSelect={() => setView('history')}><History className="mr-2 h-4 w-4" />Historial</DropdownMenuItem>
          {isAdmin && <DropdownMenuItem disabled={voiceBusy} onSelect={() => setView('memory')}><Brain className="mr-2 h-4 w-4" />Registro</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <img src="/brainstudio-mascot-tip.png" alt="" className="h-8 w-8 rounded-lg bg-white p-1 dark:bg-zinc-100" /><h1 className="ml-2 flex-1 text-sm font-semibold">Bria</h1>
      <button type="button" title="Nueva conversación" aria-label="Nueva conversación" className={iconButton} onClick={newChat} disabled={busy || loading || voiceBusy}><Edit className="h-4 w-4" /></button>
      {onFullScreen && <button type="button" title={fullScreen ? 'Volver al panel lateral' : 'Pantalla completa'} aria-label={fullScreen ? 'Volver al panel lateral' : 'Pantalla completa'} className={iconButton} onClick={onFullScreen}>{fullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>}
      {onClose && <button type="button" title="Cerrar Bria" aria-label="Cerrar Bria" className={iconButton} onClick={onClose}><X className="h-4 w-4" /></button>}
    </header>
    <div className="flex min-h-0 flex-1">{fullScreen && <aside aria-label="Historial de conversaciones" className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 md:flex">{conversationList}</aside>}
      <div className="flex min-w-0 flex-1 flex-col">
        {view === 'memory' && isAdmin ? <div className="min-h-0 flex-1 overflow-y-auto"><Remembered onBack={() => setView('chat')} /></div> : view === 'history' ? <div className="flex min-h-0 flex-1 flex-col"><button type="button" onClick={() => setView('chat')} className="min-h-11 px-5 pt-3 text-left text-sm text-brand-cyan-deep dark:text-brand-cyan">Volver al chat</button>{conversationList}</div> : <>
          <div ref={scrollBox} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            {loading && <p role="status" className="text-sm text-zinc-500 dark:text-zinc-400">Abriendo conversación…</p>}
            {!loading && !chat?.turns.length && <div className="mx-auto flex h-full max-w-2xl flex-col"><div className="flex flex-1 flex-col items-center justify-center pb-12 text-center"><img src="/brainstudio-mascot-tip.png" alt="" className="mb-4 h-16 w-16 object-contain" /><h2 className="text-xl font-semibold">Hola{userName ? `, ${userName.split(' ')[0]}` : ''}</h2><p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">¿En qué trabajamos hoy?</p></div><ul className="space-y-1">{suggestions.map(suggestion => <li key={suggestion}><button type="button" onClick={() => { setQuestion(suggestion); input.current?.focus({ preventScroll: true }); }} className="min-h-11 w-full border-b border-zinc-100 py-3 text-left text-sm text-zinc-700 hover:text-brand-cyan-deep dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-brand-cyan">{suggestion}</button></li>)}</ul></div>}
            <ol aria-live="polite" className="mx-auto max-w-3xl space-y-7">{chat?.turns.map(turn => <li key={turn.id} className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}>{turn.role === 'user' ? <div data-conversation-turn="user" className="max-w-[90%] rounded-2xl rounded-br-md bg-brand-cyan-soft px-4 py-3 text-sm leading-6 text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-zinc-100"><p className="whitespace-pre-wrap">{turn.text}</p>{turn.attachments?.length > 0 && <ul className="mt-2 space-y-1">{turn.attachments.map(file => <li key={file.id}><button type="button" disabled={turn.id === 'pending'} aria-label={`Descargar ${file.name}`} onClick={() => downloadAttachment(chat.id, file).catch(failure => setError(failure.message))} className="min-h-9 max-w-full break-all text-left text-xs underline">{file.name}</button>{file.warning && <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">{file.warning}</p>}</li>)}</ul>}</div> : <div data-conversation-turn="assistant" className="min-w-0 max-w-full"><div className="prose prose-sm max-w-none break-words leading-7 text-zinc-800 dark:prose-invert dark:text-zinc-100"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ code: ({ children, className }) => <code className={cn('before:content-none after:content-none', className)}>{children}</code>, table: ({ children }) => <div className="max-w-full overflow-x-auto"><table>{children}</table></div>, a: ({ href, children }) => safeSource(href) ? <a href={safeSource(href)} onClick={event => sourceClick(event, { url: href })} target={href.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a> : <span>{children}</span> }}>{turn.text}</ReactMarkdown></div><div className="mt-2 flex items-center gap-2"><button type="button" aria-label="Copiar respuesta" title="Copiar respuesta" onClick={() => navigator.clipboard.writeText(turn.text).catch(() => setError('No se pudo copiar la respuesta.'))} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-zinc-800"><Copy className="h-3.5 w-3.5" /></button></div>{turn.failures?.length > 0 && <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Una parte de la consulta falló. La respuesta usa lo que sí pudo leerse.</p>}</div>}</li>)}{busy && <li role="status" className="animate-pulse text-sm text-brand-cyan-deep dark:text-brand-cyan">Bria está revisando…</li>}</ol><div ref={end} />
          </div>
          <div className="shrink-0 px-4 pb-4 pt-2 sm:px-5">{error && <p role="alert" className="mx-auto mb-3 max-w-3xl text-sm leading-6 text-destructive">{error}</p>}<BriaComposer value={question} onChange={setQuestion} files={files} onFiles={setFiles} onAddFiles={addFiles} disabled={busy || loading} visible={visible} allowAttachments={allowAttachments} onSend={send} onError={setError} onVoiceBusy={setVoiceBusy} inputRef={input} request={request} /></div>
        </>}
      </div>
    </div>
  </section>;
}
