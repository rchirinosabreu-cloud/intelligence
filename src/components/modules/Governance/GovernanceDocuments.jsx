import React, { useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GOVERNANCE_DOCUMENTS } from '@/lib/aiGovernance';

const buttonStyle = 'min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const markdownComponents = {
  h1: ({ children }) => <h3 className="mb-4 text-xl font-semibold leading-snug">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-3 mt-8 text-lg font-semibold leading-snug">{children}</h4>,
  h3: ({ children }) => <h5 className="mb-2 mt-6 font-semibold">{children}</h5>,
  p: ({ children }) => <p className="my-3">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-4 rounded-lg border border-border bg-muted p-4">{children}</blockquote>,
  table: ({ children }) => <div className="my-5 max-w-full overflow-x-auto rounded-lg border border-border focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} role="region" aria-label="Tabla del documento; desplazamiento horizontal"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
  th: ({ children }) => <th className="min-w-40 border border-border bg-muted px-3 py-2 align-top font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-3 py-2 align-top">{children}</td>,
  pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-muted p-4">{children}</pre>,
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{children}</a>,
};

export default function GovernanceDocuments({ loadDocument, onDownload }) {
  const [selectedId, setSelectedId] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const trigger = useRef(null);
  const panelId = useId();
  const selected = GOVERNANCE_DOCUMENTS.find(doc => doc.id === selectedId);
  const query = useQuery({
    queryKey: ['governance', 'document', selectedId],
    queryFn: ({ signal }) => loadDocument(selectedId, signal),
    enabled: Boolean(selected), retry: false, staleTime: 0, gcTime: 0,
  });
  const close = () => { setSelectedId(null); trigger.current?.focus(); };
  async function download() {
    setDownloading(true);
    try { await onDownload(selected); }
    finally { setDownloading(false); }
  }
  return <div className="min-w-0">
    <h2 className="text-lg font-semibold">Documentación interna</h2>
    <p className="my-3 text-sm text-muted-foreground">Selecciona un documento para leerlo aquí o descargarlo en Markdown. Son borradores privados para revisión y aprobación, no declaraciones listas para firmar.</p>
    <div className="grid gap-3 sm:grid-cols-2">{GOVERNANCE_DOCUMENTS.map(doc => <button
      key={doc.id} type="button" aria-expanded={selectedId === doc.id} aria-controls={panelId}
      className={`${buttonStyle} text-left ${selectedId === doc.id ? 'bg-muted' : ''}`}
      onClick={event => { trigger.current = event.currentTarget; setSelectedId(id => id === doc.id ? null : doc.id); }}
    >{doc.title}<span aria-hidden="true" className="ml-2">{selectedId === doc.id ? '−' : '+'}</span></button>)}</div>
    <div id={panelId}>
      {selected && <div className="mt-6 min-w-0 border-t border-border pt-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Lectura privada · Borrador</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonStyle} onClick={download} disabled={downloading || query.isPending || Boolean(query.error)}>{downloading ? 'Descargando…' : 'Descargar Markdown'}</button>
            <button type="button" className={buttonStyle} onClick={close}>Cerrar lectura</button>
          </div>
        </div>
        {query.isPending ? <p role="status" className="text-sm">Cargando documento…</p>
          : query.error ? <div><p role="alert" className="mb-3 text-sm text-destructive">No se pudo abrir el documento: {query.error.message}</p><button type="button" className={buttonStyle} disabled={query.isFetching} onClick={() => query.refetch()}>Reintentar</button></div>
            : <article aria-label={selected.title} className="min-w-0 break-words text-sm leading-7 text-card-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']} components={markdownComponents}>{query.data}</ReactMarkdown>
            </article>}
      </div>}
    </div>
  </div>;
}
