import React, { lazy, Suspense, useState } from 'react';
import { Download, File, FileArchive, FileSpreadsheet, FileText, FileVideo, Paperclip } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { announcementFileLabel, announcementFileSrc, isAnnouncementImage } from '@/lib/announcementFiles';

const ChatFilePreview = lazy(() => import('@/components/chat/ChatFilePreview'));

const iconFor = (file) => {
  const name = String(file.name || '').toLowerCase();
  if (file.mimeType === 'application/pdf' || /\.(docx?|txt|md|rtf|pptx?)$/.test(name)) return FileText;
  if (/\.(xlsx?|csv|tsv|numbers)$/.test(name)) return FileSpreadsheet;
  if (/\.(zip|rar|7z)$/.test(name)) return FileArchive;
  if (/^video\//.test(file.mimeType || '') || /\.(mp4|mov|webm)$/.test(name)) return FileVideo;
  return File;
};

// Los archivos de un anuncio. Las imágenes: una sola va a lo ancho; varias, en cuadrícula. Los demás (PDF, Word,
// Excel…) van como fichas debajo, con su icono, tipo y peso. Todo se abre en el visor de siempre y desde ahí se pasa
// al siguiente con las flechas. En la tarjeta compacta del dashboard caben tres imágenes y dos fichas.
export default function AnnouncementFiles({ files = [], compact = false, elevated = false, className }) {
  const [openIndex, setOpenIndex] = useState(null);
  if (!files.length) return null;
  const available = files.filter(file => !file.removed && file.url);
  const removed = files.length - available.length;
  const images = available.filter(isAnnouncementImage);
  const documents = available.filter(file => !isAnnouncementImage(file));
  // El visor recorre primero las imágenes y luego los documentos, en el orden en que se ven.
  const sequence = [...images, ...documents];

  const shownImages = compact ? images.slice(0, 3) : images;
  const hiddenImages = images.length - shownImages.length;
  const shownDocuments = compact ? documents.slice(0, 2) : documents;
  const hiddenDocuments = documents.length - shownDocuments.length;
  const single = shownImages.length === 1;
  const current = openIndex === null ? null : sequence[openIndex];

  const download = (file = current) => {
    if (!file) return;
    const link = document.createElement('a');
    link.href = `${announcementFileSrc(file.url)}&download=1`;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className={cn('mt-3 space-y-2', className)}>
      {shownImages.length > 0 && (
        <div className={cn('grid gap-2', single ? 'grid-cols-1' : shownImages.length === 2 || shownImages.length === 4 ? 'grid-cols-2' : 'grid-cols-3')}>
          {shownImages.map((image, index) => {
            const more = hiddenImages > 0 && index === shownImages.length - 1;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setOpenIndex(index)}
                className={cn(
                  'group relative block overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-100 dark:border-white/10 dark:bg-zinc-900',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                  single ? (compact ? 'h-40 sm:h-44' : 'h-52 sm:h-72') : 'aspect-[4/3]'
                )}
                aria-label={more ? `Ver las ${images.length} imágenes del anuncio` : `Ver imagen ${index + 1} de ${images.length}: ${image.name}`}
              >
                <img
                  src={announcementFileSrc(image.url)}
                  alt={image.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                {more && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">+{hiddenImages + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {shownDocuments.length > 0 && (
        <ul className={cn('grid gap-2', !compact && shownDocuments.length > 1 && 'sm:grid-cols-2')}>
          {shownDocuments.map((file, index) => {
            const Icon = iconFor(file);
            return (
              <li key={file.id} className="flex min-w-0 items-center gap-1 rounded-lg border border-zinc-200/80 bg-white/80 pr-1 dark:border-white/10 dark:bg-zinc-900/60">
                <button
                  type="button"
                  onClick={() => setOpenIndex(images.length + index)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:hover:bg-white/5"
                  aria-label={`Ver ${file.name}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-cyan/10 text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{file.name}</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">{announcementFileLabel(file)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => download(file)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-primary dark:hover:bg-white/5"
                  aria-label={`Descargar ${file.name}`}
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
                </button>
              </li>
            );
          })}
          {hiddenDocuments > 0 && (
            <li className="flex items-center gap-1.5 px-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <Paperclip className="h-3.5 w-3.5" />
              {hiddenDocuments === 1 ? '1 archivo más' : `${hiddenDocuments} archivos más`} en el historial
            </li>
          )}
        </ul>
      )}
      {removed > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          {removed === 1 ? 'Un archivo ya se borró' : `${removed} archivos ya se borraron`}: se guardan 30 días.
        </p>
      )}
      {current && (
        <Suspense fallback={null}>
          <ChatFilePreview
            file={{ id: current.id, name: current.name, mimeType: current.mimeType, size: current.size }}
            url={announcementFileSrc(current.url)}
            onClose={() => setOpenIndex(null)}
            onDownload={() => download()}
            onPrevious={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : undefined}
            onNext={openIndex < sequence.length - 1 ? () => setOpenIndex(openIndex + 1) : undefined}
            position={sequence.length > 1 ? { index: openIndex, total: sequence.length } : undefined}
            previousLabel="Archivo anterior"
            nextLabel="Archivo siguiente"
            elevated={elevated}
          />
        </Suspense>
      )}
    </div>
  );
}
