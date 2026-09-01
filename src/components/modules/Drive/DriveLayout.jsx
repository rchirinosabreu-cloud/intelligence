import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ChevronRight, Download, Edit, Eye, File, FileText, Folder, FolderOpen,
  Loader2, Plus, RefreshCcw, RotateCcw, Search, Trash2, Upload, X
} from '@/components/ui/icons';
import frontendApiService from '../../../services/frontendApiService';
import { toast } from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const formatDate = value => value
  ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Sin fecha';

const formatSize = (bytes, mimeType) => {
  if (!Number.isFinite(Number(bytes))) return mimeType === 'application/pdf' ? 'PDF' : 'JSON';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const triggerDownload = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const BRIA_ARTIFACT_KINDS = new Set(['MINUTE', 'TRANSCRIPT', 'SUMMARY_PDF', 'ANALYSIS_PDF']);
const BRIA_PDF_KINDS = new Set(['SUMMARY_PDF', 'ANALYSIS_PDF']);

const JsonList = ({ title, items, renderItem = item => String(item) }) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <section className="mt-6">
      <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{title}</h4>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="rounded-xl bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200">
            {renderItem(item)}
          </li>
        ))}
      </ul>
    </section>
  );
};

const MinuteDocument = ({ content }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-300">Resumen ejecutivo</p>
    <h3 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">{content.summaryTitle || 'Resumen de la reunión'}</h3>
    {content.summarySubtitle && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{content.summarySubtitle}</p>}
    <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-zinc-700 dark:text-zinc-200">{content.executiveSummary || 'Sin resumen disponible.'}</p>
    <div className="my-7 h-px bg-zinc-200 dark:bg-zinc-800" />
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Análisis de Bria</p>
    <h3 className="mt-2 text-xl font-semibold text-zinc-950 dark:text-white">{content.analysisTitle || 'Lectura operativa'}</h3>
    {content.analysisSubtitle && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{content.analysisSubtitle}</p>}
    <JsonList title="Temas" items={content.topics} />
    <JsonList title="Decisiones" items={content.decisions} />
    <JsonList title="Acciones propuestas" items={content.actionItems} renderItem={item => `${item.task || ''}${item.owner ? ` · ${item.owner}` : ''}${item.dueDate ? ` · ${item.dueDate}` : ''}`} />
    <JsonList title="Riesgos" items={content.risks} />
    <JsonList title="Oportunidades" items={content.opportunities} />
  </div>
);

const TranscriptDocument = ({ content }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Transcripción de Fireflies</p>
    <h3 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-white">{content.title || 'Reunión'}</h3>
    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatDate(content.date)}</p>
    <div className="mt-6 space-y-3">
      {(content.sentences || []).map((sentence, index) => (
        <div key={`sentence-${index}`} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">{sentence.speaker_name || 'Participante'}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-200">{sentence.text || sentence.raw_text || ''}</p>
        </div>
      ))}
    </div>
  </div>
);

const PreviewDialog = ({ file, preview, loading, onClose, onDownload }) => {
  return (
    <Dialog open={!!file} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[80] bg-zinc-950/55"
        className="z-[81] flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 sm:h-[92dvh] sm:w-[calc(100vw-3rem)]"
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <DialogTitle className="truncate font-semibold text-zinc-950 dark:text-white">{file?.name}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{file?.kind === 'TRANSCRIPT' ? 'Transcripción' : file?.kind === 'MINUTE' ? 'Datos estructurados de Bria' : file?.kind === 'SUMMARY_PDF' ? 'Resumen ejecutivo en PDF' : file?.kind === 'ANALYSIS_PDF' ? 'Análisis operativo en PDF' : file?.mimeType}</DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onDownload} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900">
              <Download className="h-4 w-4" /> Descargar
            </button>
            <button type="button" onClick={onClose} aria-label="Cerrar visor" className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"><X className="h-5 w-5" /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-zinc-50 p-4 dark:bg-zinc-900/50 sm:min-h-[24rem] sm:p-8">
          {loading && <div className="flex h-72 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /> Abriendo archivo...</div>}
          {!loading && preview?.type === 'minute' && <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-950 sm:p-9"><MinuteDocument content={preview.content} /></div>}
          {!loading && preview?.type === 'transcript' && <div className="mx-auto max-w-3xl"><TranscriptDocument content={preview.content} /></div>}
          {!loading && preview?.type === 'image' && <img src={preview.url} alt={file.name} className="mx-auto max-h-[68vh] rounded-xl object-contain" />}
          {!loading && preview?.type === 'pdf' && <iframe title={file.name} src={preview.url} className="h-[68vh] w-full rounded-xl bg-white" />}
          {!loading && preview?.type === 'text' && <pre className="mx-auto max-w-4xl whitespace-pre-wrap rounded-2xl bg-white p-6 text-sm leading-6 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200">{preview.text}</pre>}
          {!loading && preview?.type === 'unsupported' && <div className="flex h-72 flex-col items-center justify-center text-center"><File className="h-10 w-10 text-zinc-400" /><p className="mt-3 font-medium text-zinc-800 dark:text-zinc-100">Vista previa no disponible</p><p className="mt-1 text-sm text-zinc-500">Puedes descargar el archivo para abrirlo en tu dispositivo.</p></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DriveLayout = () => {
  const confirm = useConfirmDialog();
  const [contents, setContents] = useState({ folders: [], files: [] });
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [trash, setTrash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);

  const activeFolder = history.at(-1) || null;
  const activeFolderId = activeFolder?.id || null;
  const isBriaFolder = activeFolderId === 'bria-minutes';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await frontendApiService.getDriveContents({ folderId: trash ? null : activeFolderId, query, trash });
      setContents(result);
    } catch (requestError) {
      console.error('[Drive] Error cargando contenido:', requestError);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [activeFolderId, query, trash]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const visibleFiles = useMemo(() => contents.files.filter(file => filter === 'ALL' || file.kind === filter), [contents.files, filter]);

  const openFolder = folder => {
    setTrash(false);
    setFilter('ALL');
    setHistory(previous => [...previous, folder]);
  };

  const openPreview = async file => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewFile(file);
    setPreview(null);
    setPreviewLoading(true);
    try {
      if (BRIA_PDF_KINDS.has(file.kind)) {
        const blob = await frontendApiService.getDriveArtifactBlob(file.meetingId, file.kind);
        const url = URL.createObjectURL(blob); previewUrlRef.current = url; setPreview({ type: 'pdf', url });
      } else if (file.kind === 'MINUTE' || file.kind === 'TRANSCRIPT') {
        const result = await frontendApiService.getDriveFile(file.meetingId, file.kind);
        setPreview({ type: file.kind === 'MINUTE' ? 'minute' : 'transcript', content: result.file.content });
      } else {
        const blob = await frontendApiService.getManagedDriveFile(file.id);
        if (file.mimeType?.startsWith('image/')) {
          const url = URL.createObjectURL(blob); previewUrlRef.current = url; setPreview({ type: 'image', url });
        } else if (file.mimeType === 'application/pdf') {
          const url = URL.createObjectURL(blob); previewUrlRef.current = url; setPreview({ type: 'pdf', url });
        } else if (file.mimeType?.startsWith('text/') || file.mimeType?.includes('json')) {
          setPreview({ type: 'text', text: await blob.text() });
        } else {
          setPreview({ type: 'unsupported' });
        }
      }
    } catch (requestError) {
      console.error('[Drive] Error abriendo archivo:', requestError);
      toast.error(requestError.message || 'No fue posible abrir el archivo.');
      setPreviewFile(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const downloadFile = async file => {
    try {
      let blob;
      if (BRIA_PDF_KINDS.has(file.kind)) {
        blob = await frontendApiService.getDriveArtifactBlob(file.meetingId, file.kind, { download: true });
      } else if (file.kind === 'MINUTE' || file.kind === 'TRANSCRIPT') {
        const result = await frontendApiService.getDriveFile(file.meetingId, file.kind);
        blob = new Blob([JSON.stringify(result.file.content, null, 2)], { type: 'application/json' });
      } else {
        blob = await frontendApiService.getManagedDriveFile(file.id, { download: true });
      }
      triggerDownload(blob, file.name);
    } catch (requestError) {
      console.error('[Drive] Error descargando archivo:', requestError);
      toast.error(requestError.message || 'No fue posible descargar el archivo.');
    }
  };

  const createFolder = async event => {
    event.preventDefault();
    try {
      await frontendApiService.createDriveFolder({ name: folderName, parentId: activeFolderId });
      setFolderName(''); setNewFolderOpen(false); await load();
      toast.success('Carpeta creada.');
    } catch (requestError) {
      console.error('[Drive] Error creando carpeta:', requestError);
      toast.error(requestError.message);
    }
  };

  const uploadFiles = async event => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) await frontendApiService.uploadDriveFile({ file, folderId: activeFolderId });
      await load();
      toast.success(`${files.length} archivo(s) guardado(s).`);
    } catch (requestError) {
      console.error('[Drive] Error subiendo archivos:', requestError);
      toast.error(requestError.message);
    } finally {
      setUploading(false);
    }
  };

  const beginEdit = (target, type) => {
    setEditTarget({ ...target, type });
    setEditName(target.name);
  };

  const saveEdit = async event => {
    event.preventDefault();
    try {
      if (editTarget.type === 'folder') await frontendApiService.updateDriveFolder(editTarget.id, { name: editName });
      else await frontendApiService.updateDriveFile(editTarget.id, { name: editName });
      setEditTarget(null); await load(); toast.success('Nombre actualizado.');
    } catch (requestError) {
      console.error('[Drive] Error renombrando:', requestError);
      toast.error(requestError.message);
    }
  };

  const moveToRoot = async file => {
    try {
      await frontendApiService.updateDriveFile(file.id, { folderId: null });
      await load(); toast.success('Archivo movido a Mi unidad.');
    } catch (requestError) {
      console.error('[Drive] Error moviendo archivo:', requestError);
      toast.error(requestError.message);
    }
  };

  const sendToTrash = async (item, type) => {
    const isBriaArtifact = type === 'file' && BRIA_ARTIFACT_KINDS.has(item.kind);
    if (isBriaArtifact) {
      const accepted = await confirm({
        title: `Enviar reunión “${item.title}” a papelera`,
        description: 'El resumen, el análisis, la minuta y su transcripción dejarán de formar parte del contexto de Bria. Podrás restaurarlos después.',
        confirmLabel: 'Enviar a Papelera'
      });
      if (!accepted) return;
    }
    setBusyId(item.id);
    try {
      if (type === 'folder') await frontendApiService.trashDriveFolder(item.id);
      else if (isBriaArtifact) await frontendApiService.trashAutomatedMinute(item.meetingId);
      else await frontendApiService.trashDriveFile(item.id);
      await load();
      toast.success(isBriaArtifact ? 'Reunión enviada a la Papelera y excluida de Bria.' : 'Elemento enviado a la Papelera.');
    } catch (requestError) {
      console.error('[Drive] Error enviando a papelera:', requestError);
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  const restoreItem = async (item, type) => {
    const isBriaArtifact = type === 'file' && BRIA_ARTIFACT_KINDS.has(item.kind);
    setBusyId(item.id);
    try {
      if (type === 'folder') await frontendApiService.restoreDriveFolder(item.id);
      else if (isBriaArtifact) await frontendApiService.restoreAutomatedMinute(item.meetingId);
      else await frontendApiService.restoreDriveFile(item.id);
      await load();
      toast.success(isBriaArtifact ? 'Reunión restaurada y disponible para Bria.' : 'Elemento restaurado en Drive.');
    } catch (requestError) {
      console.error('[Drive] Error restaurando elemento:', requestError);
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  const deletePermanently = async (item) => {
    const accepted = await confirm({
      title: `Eliminar reunión “${item.title}” permanentemente`,
      description: 'Se borrarán del bucket el resumen PDF, el análisis PDF, la minuta y la transcripción. Fireflies no volverá a importarlos y esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar permanentemente'
    });
    if (!accepted) return;
    setBusyId(item.id);
    try {
      await frontendApiService.permanentlyDeleteAutomatedMinute(item.meetingId);
      await load();
      toast.success('Documentos de la reunión eliminados permanentemente.');
    } catch (requestError) {
      console.error('[Drive] Error eliminando reunión permanentemente:', requestError);
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10">
      <PageHeader
        title="Brainstudio Drive"
        subtitle="Organiza archivos de la agencia y consulta los documentos que Bria genera automáticamente."
      >
        {!trash && !isBriaFolder && (
          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={uploadFiles} />
            <button type="button" onClick={() => setNewFolderOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"><Plus className="h-4 w-4" /> Nueva carpeta</button>
            <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"><Upload className="h-4 w-4" /> {uploading ? 'Subiendo...' : 'Subir archivos'}</button>
          </div>
        )}
      </PageHeader>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
            <button type="button" onClick={() => { setHistory([]); setTrash(false); }} className="shrink-0 rounded-lg px-2 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">Mi unidad</button>
            {history.map((folder, index) => <React.Fragment key={folder.id}><ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" /><button type="button" onClick={() => setHistory(previous => previous.slice(0, index + 1))} className="max-w-48 truncate rounded-lg px-2 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">{folder.name}</button></React.Fragment>)}
            {trash && <><ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" /><span className="font-medium text-zinc-700 dark:text-zinc-200">Papelera</span></>}
          </div>
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1 md:w-72">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar archivos" className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm text-zinc-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white" />
            </label>
            <button type="button" onClick={() => { setHistory([]); setTrash(value => !value); }} aria-label="Papelera" className={`flex h-10 w-10 items-center justify-center rounded-xl border ${trash ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}><Trash2 className="h-4 w-4" /></button>
            <button type="button" onClick={load} aria-label="Actualizar Drive" className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"><RefreshCcw className="h-4 w-4" /></button>
          </div>
        </div>

        {isBriaFolder && <div className="flex flex-wrap gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">{[['ALL', 'Todos'], ['SUMMARY_PDF', 'Resúmenes PDF'], ['ANALYSIS_PDF', 'Análisis PDF'], ['MINUTE', 'Datos JSON'], ['TRANSCRIPT', 'Transcripciones']].map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${filter === value ? 'bg-violet-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`}>{label}</button>)}</div>}

        <div className="min-h-[28rem] p-4 sm:p-5">
          {error && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="h-4 w-4" /> {error}</div>}
          {loading && <div className="flex h-72 items-center justify-center gap-2 text-sm text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /> Cargando Drive...</div>}
          {!loading && !error && contents.folders.length === 0 && visibleFiles.length === 0 && <div className="flex h-72 flex-col items-center justify-center text-center"><FolderOpen className="h-11 w-11 text-zinc-300 dark:text-zinc-700" /><p className="mt-3 font-medium text-zinc-800 dark:text-zinc-100">Esta ubicación está vacía</p><p className="mt-1 text-sm text-zinc-500">{trash ? 'La Papelera no tiene elementos.' : 'Crea una carpeta o sube el primer archivo.'}</p></div>}
          {!loading && !error && (contents.folders.length > 0 || visibleFiles.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {contents.folders.map(folder => (
                <article key={folder.id} className="group rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 transition hover:border-violet-300 hover:bg-violet-50/40 dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-violet-800 dark:hover:bg-violet-950/20">
                  <button type="button" onClick={() => openFolder(folder)} className="flex w-full items-start gap-3 text-left">
                    <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"><Folder className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-zinc-900 dark:text-white">{folder.name}</span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{folder.subtitle || (folder.system ? 'Carpeta automática del sistema' : 'Carpeta de Drive')}</span></span>
                  </button>
                  {!folder.system && !trash && <div className="mt-3 flex justify-end gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800"><button type="button" onClick={() => beginEdit(folder, 'folder')} className="rounded-lg p-2 text-zinc-400 hover:bg-white hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={`Renombrar ${folder.name}`}><Edit className="h-4 w-4" /></button><button type="button" onClick={() => sendToTrash(folder, 'folder')} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-300" aria-label={`Enviar ${folder.name} a papelera`}><Trash2 className="h-4 w-4" /></button></div>}
                  {!folder.system && trash && <div className="mt-3 flex justify-end border-t border-zinc-200 pt-2 dark:border-zinc-800"><button type="button" onClick={() => restoreItem(folder, 'folder')} className="rounded-lg px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/30">Restaurar</button></div>}
                </article>
              ))}
              {visibleFiles.map(file => (
                <article key={file.id} className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 transition hover:border-cyan-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-cyan-800">
                  <button type="button" onClick={() => openPreview(file)} className="flex flex-1 items-start gap-3 text-left">
                    <span className={`rounded-xl p-2.5 ${BRIA_PDF_KINDS.has(file.kind) ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' : file.kind === 'TRANSCRIPT' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}><FileText className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block line-clamp-2 text-sm font-semibold leading-5 text-zinc-900 dark:text-white">{file.name}</span><span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{formatDate(file.meetingAt || file.updatedAt || file.createdAt)} · {formatSize(file.sizeBytes, file.mimeType)}</span></span>
                  </button>
                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    {!trash && <><button type="button" onClick={() => openPreview(file)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={`Ver ${file.name}`}><Eye className="h-4 w-4" /></button><button type="button" onClick={() => downloadFile(file)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={`Descargar ${file.name}`}><Download className="h-4 w-4" /></button></>}
                    {BRIA_ARTIFACT_KINDS.has(file.kind) && !trash && <button type="button" disabled={busyId === file.id} onClick={() => sendToTrash(file, 'file')} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30 dark:hover:text-red-300" aria-label={`Enviar ${file.name} a papelera`}><Trash2 className="h-4 w-4" /></button>}
                    {file.kind === 'UPLOAD' && !trash && <><button type="button" onClick={() => beginEdit(file, 'file')} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" aria-label={`Renombrar ${file.name}`}><Edit className="h-4 w-4" /></button>{activeFolderId && <button type="button" onClick={() => moveToRoot(file)} className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Mover a raíz</button>}<button type="button" onClick={() => sendToTrash(file, 'file')} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-300" aria-label={`Enviar ${file.name} a papelera`}><Trash2 className="h-4 w-4" /></button></>}
                    {file.kind === 'UPLOAD' && trash && <button type="button" disabled={busyId === file.id} onClick={() => restoreItem(file, 'file')} className="rounded-lg px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-950/30">Restaurar</button>}
                    {BRIA_ARTIFACT_KINDS.has(file.kind) && trash && <><button type="button" disabled={busyId === file.id} onClick={() => restoreItem(file, 'file')} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:text-violet-300 dark:hover:bg-violet-950/30"><RotateCcw className="h-3.5 w-3.5" /> Restaurar</button><button type="button" disabled={busyId === file.id} onClick={() => deletePermanently(file)} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30 dark:hover:text-red-300" aria-label={`Eliminar ${file.name} permanentemente`}><Trash2 className="h-4 w-4" /></button></>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent overlayClassName="z-[80]" className="z-[81] max-w-md rounded-2xl border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
          <form onSubmit={createFolder}>
            <DialogTitle className="font-semibold text-zinc-950 dark:text-white">Nueva carpeta</DialogTitle>
            <DialogDescription className="sr-only">Crea una carpeta nueva en la ubicación actual.</DialogDescription>
            <label className="mt-5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Nombre<input autoFocus value={folderName} onChange={event => setFolderName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-zinc-900 outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white" /></label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setNewFolderOpen(false)} className="min-h-11 rounded-xl px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900">Cancelar</button><button type="submit" className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">Crear carpeta</button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) setEditTarget(null); }}>
        <DialogContent overlayClassName="z-[80]" className="z-[81] max-w-md rounded-2xl border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
          <form onSubmit={saveEdit}>
            <DialogTitle className="font-semibold text-zinc-950 dark:text-white">Renombrar</DialogTitle>
            <DialogDescription className="sr-only">Cambia el nombre del archivo o carpeta seleccionado.</DialogDescription>
            <label className="mt-5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Nombre<input autoFocus value={editName} onChange={event => setEditName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-zinc-900 outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white" /></label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditTarget(null)} className="min-h-11 rounded-xl px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900">Cancelar</button><button type="submit" className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">Guardar</button></div>
          </form>
        </DialogContent>
      </Dialog>
      <PreviewDialog file={previewFile} preview={preview} loading={previewLoading} onClose={() => setPreviewFile(null)} onDownload={() => downloadFile(previewFile)} />
    </div>
  );
};

export default DriveLayout;
