import { Bria3D, BriaIsotipo } from '@/components/bria/BriaBrand';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, Edit, ExpandView as Maximize2, CollapseView as Minimize2, X, Copy, History, Brain, Trash2, MessageSquare, ThumbsUp, ThumbsDown, ArrowUpRight } from '@/components/ui/icons';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { requestBriaChat, streamBriaChat, downloadBriaAttachment } from '@/lib/briaChatRequest';
import { requestKnowledge } from '@/lib/briaKnowledgeRequest';
import BriaComposer from './BriaComposer';
import BriaWaiting from './BriaWaiting';
import BriaVoiceMode from './BriaVoiceMode';
import { requestVoiceStatus } from '@/lib/briaVoiceRequest';
import BriaAccessCards from './BriaAccessCards';
import BriaAccessCapture from './BriaAccessCapture';
import { cn } from '@/lib/utils';
import { validateAttachmentSelection } from '@/lib/briaAttachments';
import { onBriaAsk, onBriaOpen, onBriaQuickAsk } from '@/lib/briaAsk';
import { normalizeQuickReplies } from '@/lib/briaQuickReplies';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { completedBriaReplyId } from '@/lib/briaMascotActivity';
import { canRateTurn, ratingNoteOpenFor } from '@/lib/briaRating';

const safeSource = url => {
  if (typeof url !== 'string') return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try { const value = new URL(url); return value.protocol === 'https:' && ['drive.google.com','docs.google.com','mail.google.com'].includes(value.hostname) ? value.href : null; } catch { return null; }
};
// El chat con la marca de Bria (Rodny, 18 de noviembre de 2026: «una recreación completamente nueva, pero usando los
// mismos iconos, viendo las mismas funciones»): fondo blanco con un resplandor suave de menta y cian arriba —azul noche en
// oscuro—, cabecera sin franja con el isotipo y el título del chat, Bria sin burbuja y quien escribe en menta clara.
const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors hover:bg-bria-night/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan dark:hover:bg-white/10';
const suggestions = ['Ayúdame a revisar una parrilla', '¿Qué tengo pendiente hoy?', 'Revisemos la producción de esta semana', 'Crear un pendiente'];

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
  return <div className="p-5"><button type="button" className="min-h-11 text-sm text-bria-cyan-deep dark:text-bria-mint" onClick={onBack}>Volver a la conversación</button><h2 className="mt-3 text-lg font-semibold">Registro</h2><p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">Decisiones y correcciones que el equipo compartió conversando. Puedes pedirle cualquier ajuste en el chat.</p>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<ul className="mt-5 space-y-5">{rows.map(row => <li key={row.id} className="border-b border-zinc-200 pb-4 dark:border-white/10"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{row.entity} · {row.topic}</p>{row.status === 'ACTIVE' && <button type="button" aria-label={`Olvidar: ${row.topic}`} title="Olvidar este recuerdo" disabled={!!busy} onClick={() => forget(row)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>}</div><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{row.text}</p><p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{row.author} · {row.validFrom} · {row.status === 'REVOKED' ? 'Retirado' : row.kind === 'PROPOSAL' ? 'Propuesta' : 'Confirmado'} · versión {row.revision}</p></li>)}</ul>{!rows.length && <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">Los recuerdos aparecerán aquí cuando compartas una decisión o corrección.</p>}</div>;
}

export default function BriaConversation({ userId = 'local-research-owner', userName = 'Rodny', userRole = 'VIEWER', fullScreen = false, visible = true, onFullScreen, onClose, onOpenSource, onActivityChange, request = requestBriaChat, voiceStatus = request === requestBriaChat ? requestVoiceStatus : null, stream, downloadBriaAttachment: downloadAttachment = downloadBriaAttachment }) {
  // «Esperando por ti» (20 de noviembre de 2026): con algo pendiente, el inicio se compacta para que la lista quepa a la vista.
  const [waiting, setWaiting] = useState(0);
  // La voz de Bria (20 de noviembre de 2026): solo aparece si el servidor dice que hay voz para esta persona. El
  // elemento de audio se crea y se estrena dentro del toque que abre la voz, porque el iPhone solo deja sonar lo que
  // nació de un gesto.
  const [voiceReady, setVoiceReady] = useState(false), [voiceOpen, setVoiceOpen] = useState(false), voiceAudio = useRef(null);
  useEffect(() => { if (!visible || !voiceStatus) return undefined; let live = true; voiceStatus().then(status => { if (live) setVoiceReady(Boolean(status?.enabled)); }).catch(() => {}); return () => { live = false; }; }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const openVoice = () => { const element = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='); element.play().catch(() => {}); voiceAudio.current = element; setError(''); setVoiceOpen(true); };
  useEffect(() => { if (!visible) setVoiceOpen(false); }, [visible]);
  // Respuesta en vivo (9 de octubre de 2026). Con el `request` de siempre se usa el flujo; una muestra que inyecta
  // su propio `request` sigue con la respuesta completa, salvo que inyecte también `stream`.
  const streamer = stream ?? (request === requestBriaChat ? streamBriaChat : null);
  const [live, setLive] = useState({ text: '', status: '' });
  const liveText = useRef(''), liveFrame = useRef(0);
  const showLive = patch => {
    if ('text' in patch) liveText.current = patch.text;
    clearTimeout(liveFrame.current);
    // Muchos trozos seguidos se pintan juntos. Un temporizador y no requestAnimationFrame: este se detiene en una
    // pestaña de fondo y el texto no avanzaría hasta volver a ella.
    liveFrame.current = setTimeout(() => setLive(current => ({ ...current, ...patch, text: liveText.current })), 40);
  };
  const onStreamEvent = event => {
    if (event.type === 'status') showLive({ status: event.label || '' });
    else if (event.type === 'delta') showLive({ text: liveText.current + (event.text || '') });
    else if (event.type === 'reset') showLive({ text: '' });
  };
  const confirm = useConfirmDialog();
  const isAdmin = userRole === 'ADMIN', allowAttachments = ['ADMIN', 'PROJECT_MANAGER'].includes(userRole);
  const [files, setFiles] = useState([]), [voiceBusy, setVoiceBusy] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false), dragDepth = useRef(0);
  const key = `bria:conversation:${userId}`;
  const [chat, setChat] = useState(null), [history, setHistory] = useState([]), [view, setView] = useState('chat');
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  // La respuesta que acaba de llegar en esta sesión: solo esa muestra sola un acceso de la bóveda.
  const [freshTurnId, setFreshTurnId] = useState(null);
  const completedTurnId = freshTurnId && completedBriaReplyId(chat) === freshTurnId ? freshTurnId : null;
  useEffect(() => { onActivityChange?.({ working: busy || voiceBusy, completionId: completedTurnId }); }, [busy, voiceBusy, completedTurnId, onActivityChange]);
  const end = useRef(null), scrollBox = useRef(null), input = useRef(null), lock = useRef(false), liveChat = useRef(null), mounted = useRef(true);
  const rememberChat = row => { liveChat.current = row; setChat(row); sessionStorage.setItem(key, row.id); };
  const loadHistory = async () => { const rows = await request(); if (mounted.current) setHistory(rows); return rows; };
  useEffect(() => {
    mounted.current = true;
    (async () => { try { const rows = await loadHistory(), active = sessionStorage.getItem(key); if (active && rows.some(row => row.id === active)) rememberChat(await request(`/${active}`)); else if (rows.length) rememberChat(await request(`/${rows[0].id}`)); } catch (failure) { if (mounted.current) setError(failure.message); } finally { if (mounted.current) setLoading(false); } })();
    return () => { mounted.current = false; };
  }, [userId]);
  // Abrir o volver a un chat lo deja en lo último conversado (Rodny, 23 de octubre de 2026: «no me abre donde iba …
  // debe quedar donde lo dejé»). El chat se carga con el panel cerrado, cuando todavía no tiene alto: por eso se mide
  // al hacerse visible, y otra vez en el siguiente cuadro, cuando ya se pintaron las tablas y las listas. Solo una
  // respuesta que acaba de llegar en este mismo chat se muestra desde su comienzo, para leerla de arriba abajo.
  const shownTurns = useRef({ id: null, length: 0 });
  useLayoutEffect(() => {
    const box = scrollBox.current;
    if (!box || !visible || view !== 'chat' || !chat) return undefined;
    const previous = shownTurns.current, length = chat.turns.length;
    shownTurns.current = { id: chat.id, length };
    const arrived = previous.id === chat.id && length > previous.length && chat.turns.at(-1)?.role === 'assistant';
    if (arrived) {
      const answers = box.querySelectorAll('[data-conversation-turn="assistant"]'), last = answers[answers.length - 1];
      if (last) box.scrollTop = box.scrollTop + last.getBoundingClientRect().top - box.getBoundingClientRect().top - 12;
      return undefined;
    }
    // El inicio (chat vacío) se lee desde arriba: si no cabe entero, lo que queda abajo son las sugerencias, nunca Bria.
    if (!length) { box.scrollTop = 0; return undefined; }
    box.scrollTop = box.scrollHeight;
    const frame = requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
    return () => cancelAnimationFrame(frame);
    // Sin `chat` entero: valorar una respuesta o cualquier otro cambio del mismo chat no puede mover la vista.
  }, [chat?.id, chat?.turns.length, view, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mientras Bria escribe, la vista la sigue, salvo que la persona haya subido a leer algo anterior.
  useLayoutEffect(() => {
    const box = scrollBox.current;
    if (!box || !live.text) return;
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
  }, [live.text]);
  // Cuando Bria se pone a trabajar aparece de cuerpo entero bajo el último mensaje: la vista baja para que se vea
  // completa y no cortada por el cuadro de escribir.
  useLayoutEffect(() => {
    const box = scrollBox.current;
    if (!box || !busy) return;
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 240) box.scrollTop = box.scrollHeight;
  }, [busy]);
  useEffect(() => () => clearTimeout(liveFrame.current), []);
  useEffect(() => { if (!isAdmin && view === 'memory') setView('chat'); }, [isAdmin, view]);
  useEffect(() => { if (visible && view === 'chat') input.current?.focus({ preventScroll: true }); }, [visible, view, loading]);
  // Un mensaje que llega de otra pantalla queda escrito, no enviado: la persona lo lee y decide.
  useEffect(() => onBriaAsk(message => { setQuestion(message); setView('chat'); setTimeout(() => input.current?.focus({ preventScroll: true }), 0); }), []);
  // Otra pantalla pide abrir una conversación concreta (el foco de la semana, 10 de octubre de 2026): se carga y se
  // refresca la lista, porque la dejó Bria sola y todavía no estaba en el historial.
  const openChatRef = useRef(null);
  useEffect(() => onBriaOpen(async id => { await openChatRef.current?.(id); loadHistory().catch(failure => console.error('[BriaConversation]', failure.message)); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // La consulta rápida (10 de octubre de 2026) la escribió la persona con sus manos: se envía al chat abierto (o a
  // uno nuevo si no hay ninguno), sin obligarla a «iniciar un nuevo chat».
  const sendRef = useRef(null);
  useEffect(() => onBriaQuickAsk(text => { setView('chat'); sendRef.current?.(text); }), []);
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
  openChatRef.current = openChat;
  useEffect(() => { sendRef.current = send; });
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
      const body = files.length ? new FormData() : { question: value, expectedRevision: current.revision };
      if (files.length) { body.append('question', value); body.append('expectedRevision', String(current.revision)); files.forEach(file => body.append('files', file, file.name)); }
      liveText.current = ''; setLive({ text: '', status: '' });
      const saved = streamer
        ? await streamer(`/${current.id}/messages`, { body, onEvent: onStreamEvent })
        : await request(`/${current.id}/messages`, { method: 'POST', body });
      rememberChat(saved); setFreshTurnId(saved.turns?.at(-1)?.id || null); setFiles([]); await loadHistory();
    } catch (failure) {
      console.error('[BriaConversation]', failure.message); setError(failure.message); setQuestion(value); setChat(liveChat.current);
      // A different tab or WhatsApp may have changed the proposal. Show that response without replaying consent.
      if (failure.code === 'BRIA_CONVERSATION_STALE' && liveChat.current) {
        try { rememberChat(await request(`/${liveChat.current.id}`)); setFreshTurnId(null); }
        catch (refreshFailure) { console.error('[BriaConversation]', refreshFailure.message); setError('La conversación cambió y no pude actualizarla. Vuelve a abrirla antes de confirmar. Tu mensaje y archivos siguen aquí.'); }
      }
    }
    finally { clearTimeout(liveFrame.current); liveText.current = ''; setLive({ text: '', status: '' }); setBusy(false); lock.current = false; input.current?.focus({ preventScroll: true }); }
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
  // Que Bria se mida (14 de octubre de 2026): pulgar arriba o abajo en cada respuesta. El pulgar abajo se registra al
  // instante y después pregunta qué falló; la nota es opcional y se manda aparte, para no perder el pulgar si la
  // persona no escribe nada. El estado que se pinta es el que devolvió el servidor, nunca el del clic.
  const [ratingNote, setRatingNote] = useState(null);
  const rate = async (turn, value, note = null) => {
    if (busy || loading || !chat?.id) return;
    setError('');
    try {
      const result = await request(`/${chat.id}/rating`, { method: 'POST', body: { turnId: turn.id, rating: value, ...(note ? { note } : {}) } });
      rememberChat(result);
      if (value === 'DOWN' && !note) setRatingNote({ turnId: turn.id, text: '' });
      else setRatingNote(null);
    } catch (failure) { console.error('[BriaRating]', failure.message); setError(failure.message); }
  };
  const ratingButton = 'flex h-9 w-9 items-center justify-center rounded-lg hover:bg-bria-night/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan dark:hover:bg-white/10';
  const sourceClick = (event, source) => {
    const url = safeSource(source.url);
    if (source.kind === 'aprendizaje') { event.preventDefault(); if (isAdmin) setView('memory'); }
    else if (url?.startsWith('/') && onOpenSource) { event.preventDefault(); onOpenSource(source); }
  };
  const conversationList = <div className="flex min-h-0 flex-1 flex-col p-3"><button type="button" onClick={newChat} disabled={busy || loading || voiceBusy} className="flex min-h-11 items-center gap-2 rounded-2xl bg-bria-mist px-3 text-left text-sm font-medium text-bria-teal dark:bg-bria-turquoise/20 dark:text-bria-mint"><Edit className="h-4 w-4" />Nueva conversación</button><h2 className="mt-6 px-3 text-xs font-medium text-bria-muted dark:text-zinc-400">Conversaciones</h2><ul className="mt-2 min-h-0 flex-1 overflow-y-auto">{history.map(row => <li key={row.id} className="flex items-center gap-1"><button type="button" disabled={busy || loading || voiceBusy} onClick={() => openChat(row.id)} aria-current={chat?.id === row.id ? 'true' : undefined} className={cn('min-h-11 min-w-0 flex-1 truncate rounded-xl px-3 text-left text-sm hover:bg-bria-night/5 dark:hover:bg-white/10', chat?.id === row.id && 'bg-bria-mist/70 text-bria-night dark:bg-white/10 dark:text-white')}>{row.title}</button><button type="button" aria-label={`Borrar conversación: ${row.title}`} title="Borrar conversación" disabled={busy || loading || voiceBusy} onClick={() => removeChat(row)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-40 dark:text-zinc-400 dark:hover:text-destructive"><Trash2 className="h-4 w-4" /></button></li>)}</ul>{isAdmin && <button type="button" onClick={() => setView('memory')} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm hover:bg-bria-night/5 dark:hover:bg-white/10"><Brain className="h-4 w-4" />Registro</button>}</div>;
  return <section aria-label="Conversación con Bria" onDragEnter={dragEnter} onDragLeave={dragLeave} onDragOver={dragOver} onDrop={dropFiles} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white text-bria-night dark:bg-bria-night dark:text-white">
    {voiceOpen && <BriaVoiceMode chat={chat} busy={busy} request={request} send={send} audio={voiceAudio.current} onClose={() => { setVoiceOpen(false); requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); }} />}
    <div aria-hidden="true" data-bria-aura className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(120%_100%_at_30%_0%,rgba(114,221,155,0.26)_0%,rgba(20,174,188,0.10)_45%,transparent_75%)] dark:bg-[radial-gradient(120%_100%_at_30%_0%,rgba(43,193,175,0.24)_0%,rgba(20,174,188,0.08)_45%,transparent_75%)]" />
    {draggingFiles && <div role="status" className="pointer-events-none absolute inset-x-3 bottom-3 top-20 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-bria-turquoise bg-white/95 p-6 text-center text-sm font-medium text-bria-cyan-deep dark:bg-bria-night/95 dark:text-bria-mint">Suelta los archivos para adjuntarlos</div>}
    <header className="relative flex h-[68px] shrink-0 items-center gap-1 px-2 text-bria-ink dark:text-zinc-300">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Menú de Bria" className={iconButton}><Menu className="h-4 w-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setView('chat')}><MessageSquare className="mr-2 h-4 w-4" />Chat</DropdownMenuItem>
          <DropdownMenuItem disabled={voiceBusy} onSelect={() => setView('history')}><History className="mr-2 h-4 w-4" />Historial</DropdownMenuItem>
          {isAdmin && <DropdownMenuItem disabled={voiceBusy} onSelect={() => setView('memory')}><Brain className="mr-2 h-4 w-4" />Registro</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex min-w-0 flex-1 items-center gap-2.5" data-bria-chat-title>{chat?.turns?.length > 0 && <><BriaIsotipo className="h-7 shrink-0" /><span className="flex min-w-0 flex-col"><span className="font-bria text-base font-bold leading-5 text-bria-night dark:text-white">Bria</span>{chat.title && <span className="truncate text-sm leading-5 text-bria-muted dark:text-zinc-400">{chat.title}</span>}</span></>}</div>
      <button type="button" title="Nueva conversación" aria-label="Nueva conversación" className={iconButton} onClick={newChat} disabled={busy || loading || voiceBusy}><Edit className="h-4 w-4" /></button>
      {onFullScreen && <button type="button" title={fullScreen ? 'Volver al panel lateral' : 'Pantalla completa'} aria-label={fullScreen ? 'Volver al panel lateral' : 'Pantalla completa'} className={iconButton} onClick={onFullScreen}>{fullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>}
      {onClose && <button type="button" title="Cerrar Bria" aria-label="Cerrar Bria" className={iconButton} onClick={onClose}><X className="h-4 w-4" /></button>}
    </header>
    <div className="flex min-h-0 flex-1">{fullScreen && <aside aria-label="Historial de conversaciones" className="relative hidden w-64 shrink-0 flex-col border-r border-bria-line bg-bria-mist/30 dark:border-white/10 dark:bg-bria-night-deep md:flex">{conversationList}</aside>}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {view === 'memory' && isAdmin ? <div className="min-h-0 flex-1 overflow-y-auto"><Remembered onBack={() => setView('chat')} /></div> : view === 'history' ? <div className="flex min-h-0 flex-1 flex-col"><button type="button" onClick={() => setView('chat')} className="min-h-11 px-5 pt-3 text-left text-sm text-bria-cyan-deep dark:text-bria-mint">Volver al chat</button>{conversationList}</div> : <>
          <div ref={scrollBox} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 sm:px-6">
            {loading && <p role="status" className="text-sm text-bria-muted dark:text-zinc-400">Abriendo conversación…</p>}
            {!loading && !chat?.turns.length && <div data-bria-home className="mx-auto flex min-h-full max-w-2xl flex-col"><div data-bria-home-hero className={cn('flex flex-1 items-center justify-center', waiting ? 'flex-row gap-3 pb-2 pt-1 text-left' : `flex-col gap-2 pb-[clamp(0.75rem,3vh,2.5rem)] text-center [@media(max-height:760px)]:flex-row [@media(max-height:760px)]:gap-3 [@media(max-height:760px)]:pb-1 [@media(max-height:760px)]:text-left`)}><Bria3D mood="reposo" className={cn('shrink-0', waiting ? 'w-[clamp(3.5rem,calc(22vh_-_5rem),4.5rem)]' : 'w-[clamp(4.5rem,15vh,8rem)] [@media(max-height:760px)]:w-[clamp(3.5rem,calc(22vh_-_5rem),5.5rem)]')} /><div className="min-w-0"><h2 className={cn('font-bria font-bold text-bria-night dark:text-white', waiting ? 'text-xl' : 'text-2xl [@media(max-height:760px)]:text-xl')}>Hola{userName ? `, ${userName.split(' ')[0]}` : ''}</h2><p className={cn('text-bria-muted dark:text-zinc-300', waiting ? 'mt-0.5 text-sm' : 'mt-1.5 text-base [@media(max-height:760px)]:mt-0.5 [@media(max-height:760px)]:text-sm')}>¿En qué trabajamos hoy?</p></div></div><BriaWaiting visible={visible} onCount={setWaiting} disabled={busy || loading || voiceBusy} onGo={url => onOpenSource?.({ url })} onAsk={send} onOpenChat={id => openChat(id)} /><ul data-bria-suggestions className={waiting ? 'grid grid-cols-2 gap-2' : 'space-y-2 [@media(max-height:760px)]:space-y-1.5'}>{suggestions.map(suggestion => <li key={suggestion} className={waiting ? 'flex' : undefined}><button type="button" onClick={() => send(suggestion)} disabled={busy || loading || voiceBusy} className={cn('flex items-center justify-between border border-bria-line bg-bria-mist/30 text-left text-bria-night transition-colors hover:border-bria-turquoise hover:bg-bria-mist/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10', waiting ? 'min-h-12 w-full gap-2 rounded-2xl px-3 py-1.5 text-sm leading-5' : 'min-h-12 w-full gap-3 rounded-2xl px-4 text-base [@media(max-height:800px)]:min-h-11 [@media(max-height:760px)]:text-sm')}>{suggestion}<ArrowUpRight className="h-4 w-4 shrink-0 text-bria-cyan-deep dark:text-bria-mint" /></button></li>)}</ul></div>}
            <ol aria-live="polite" className="mx-auto max-w-3xl space-y-7">{chat?.turns.map(turn => <li key={turn.id} className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}>{turn.role === 'user' ? <div data-conversation-turn="user" className="max-w-[85%] rounded-[20px] rounded-br-md bg-bria-mist px-4 py-3 text-base leading-6 text-bria-night dark:bg-bria-turquoise/20 dark:text-white"><p className="whitespace-pre-wrap">{turn.text}</p>{turn.attachments?.length > 0 && <ul className="mt-2 space-y-1">{turn.attachments.map(file => <li key={file.id}><button type="button" disabled={turn.id === 'pending'} aria-label={`Descargar ${file.name}`} onClick={() => downloadAttachment(chat.id, file).catch(failure => setError(failure.message))} className="min-h-9 max-w-full break-all text-left text-xs underline">{file.name}</button>{file.warning && <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">{file.warning}</p>}</li>)}</ul>}</div> : <div className="flex min-w-0 max-w-full gap-2.5"><BriaIsotipo className="mt-1 h-[22px] shrink-0" /><div data-conversation-turn="assistant" className="min-w-0 max-w-full flex-1"><div className="prose prose-sm max-w-none break-words text-base leading-7 text-bria-ink prose-a:font-semibold prose-a:text-bria-cyan-deep prose-strong:text-bria-night prose-li:marker:text-bria-turquoise sm:prose-base dark:prose-invert dark:text-zinc-100 dark:prose-a:text-bria-mint dark:prose-strong:text-white dark:prose-li:marker:text-bria-mint"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ code: ({ children, className }) => <code className={cn('before:content-none after:content-none', className)}>{children}</code>, table: ({ children }) => <div className="max-w-full overflow-x-auto"><table>{children}</table></div>, a: ({ href, children }) => safeSource(href) ? <a href={safeSource(href)} onClick={event => sourceClick(event, { url: href })} target={href.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">{children}</a> : <span>{children}</span> }}>{turn.text}</ReactMarkdown></div>{turn.accessCards?.length > 0 && <BriaAccessCards cards={turn.accessCards} fresh={turn.id === freshTurnId} />}{turn.accessCapture && <BriaAccessCapture capture={turn.accessCapture} active={turn.id === chat.turns.at(-1)?.id && !busy} onSaved={message => send(message)} />}<div className="mt-2 flex items-center gap-1"><button type="button" aria-label="Copiar respuesta" title="Copiar respuesta" onClick={() => navigator.clipboard.writeText(turn.text).catch(() => setError('No se pudo copiar la respuesta.'))} className="flex h-9 w-9 items-center justify-center rounded-lg text-bria-muted hover:bg-bria-night/5 dark:text-zinc-400 dark:hover:bg-white/10"><Copy className="h-3.5 w-3.5" /></button>{canRateTurn(turn) && <><button type="button" aria-label="Me sirvió" title="Me sirvió" aria-pressed={turn.rating?.value === 'UP'} disabled={busy || loading} onClick={() => rate(turn, 'UP')} className={cn(ratingButton, turn.rating?.value === 'UP' ? 'text-bria-cyan-deep dark:text-bria-mint' : 'text-bria-muted dark:text-zinc-400')}><ThumbsUp className="h-3.5 w-3.5" /></button><button type="button" aria-label="No me sirvió" title="No me sirvió" aria-pressed={turn.rating?.value === 'DOWN'} disabled={busy || loading} onClick={() => rate(turn, 'DOWN')} className={cn(ratingButton, turn.rating?.value === 'DOWN' ? 'text-bria-night dark:text-white' : 'text-bria-muted dark:text-zinc-400')}><ThumbsDown className="h-3.5 w-3.5" /></button></>}</div>{ratingNoteOpenFor(ratingNote, turn) && <form data-bria-rating-note onSubmit={event => { event.preventDefault(); rate(turn, 'DOWN', ratingNote.text.trim() || null); }} className="mt-2 max-w-md rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-bria-night-raised"><label className="block text-sm font-medium" htmlFor={`rating-note-${turn.id}`}>¿Qué falló?</label><p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Opcional. Sirve para pulir a Bria; nadie evalúa a nadie con esto.</p><textarea id={`rating-note-${turn.id}`} value={ratingNote.text} maxLength={300} rows={2} autoFocus onChange={event => setRatingNote(current => ({ ...current, text: event.target.value }))} placeholder="Por ejemplo: se inventó la fecha, no entendió a qué cliente me refería…" className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none dark:border-white/10 dark:bg-bria-night dark:text-zinc-100" /><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setRatingNote(null)} className="min-h-9 rounded-lg px-3 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">Omitir</button><button type="submit" disabled={busy || loading || !ratingNote.text.trim()} className="min-h-9 rounded-lg bg-primary px-3 text-sm font-medium text-white disabled:opacity-40">Enviar</button></div></form>}{turn.failures?.length > 0 && <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Una parte de la consulta falló. La respuesta usa lo que sí pudo leerse.</p>}</div></div>}</li>)}{busy && live.text && <li aria-hidden="true" className="flex justify-start gap-2.5"><BriaIsotipo className="mt-1 h-[22px] shrink-0" /><div data-conversation-turn="streaming" className="min-w-0 max-w-full flex-1"><div className="prose prose-sm max-w-none break-words text-base leading-7 text-bria-ink prose-li:marker:text-bria-turquoise sm:prose-base dark:prose-invert dark:text-zinc-100"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children }) => <span>{children}</span> }}>{live.text}</ReactMarkdown></div></div></li>}{busy && !live.text && <li role="status" data-bria-working className="flex items-center gap-3 pb-4"><Bria3D mood="trabajando" className="h-24 w-24 shrink-0" /><span className="text-base font-semibold text-bria-night dark:text-white">{live.status || 'Bria está pensando…'}</span></li>}</ol>
            {chat?.turns.at(-1)?.role === 'assistant' && normalizeQuickReplies(chat.turns.at(-1).quickReplies).length > 0 && <div role="group" aria-label="Respuestas rápidas" className="mx-auto mt-5 flex max-w-3xl flex-wrap gap-2 pl-8">{normalizeQuickReplies(chat.turns.at(-1).quickReplies).map(reply => <button key={reply} type="button" disabled={busy || loading || voiceBusy} onClick={() => send(reply)} className="min-h-11 max-w-full rounded-full border border-bria-turquoise/40 bg-white px-4 py-2 text-left text-sm text-bria-teal transition-colors hover:border-bria-turquoise hover:bg-bria-mist/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bria-cyan disabled:opacity-40 dark:border-white/15 dark:bg-transparent dark:text-bria-mint dark:hover:bg-white/10">{reply}</button>)}</div>}
            <div ref={end} />
          </div>
          <div className="relative shrink-0 px-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-2">{error && <p role="alert" className="mx-auto mb-3 max-w-3xl text-sm leading-6 text-destructive">{error}</p>}<BriaComposer value={question} onChange={setQuestion} files={files} onFiles={setFiles} onAddFiles={addFiles} disabled={busy || loading} visible={visible} allowAttachments={allowAttachments} onSend={send} onError={setError} onVoiceBusy={setVoiceBusy} inputRef={input} request={request} onVoice={voiceReady && view === 'chat' ? openVoice : undefined} /></div>
        </>}
      </div>
    </div>
  </section>;
}
