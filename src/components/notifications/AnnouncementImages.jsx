import React, { lazy, Suspense, useState } from 'react';
import { ImageIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { announcementImageSrc } from '@/lib/announcementImages';

const ChatFilePreview = lazy(() => import('@/components/chat/ChatFilePreview'));

// Las imágenes de un anuncio: una sola va a lo ancho; varias, en cuadrícula. Se abren en el visor de siempre.
// En la tarjeta compacta del dashboard caben tres y la última dice cuántas más hay.
export default function AnnouncementImages({ images = [], compact = false, elevated = false, className }) {
  const [openIndex, setOpenIndex] = useState(null);
  const visible = images.filter(image => !image.removed && image.url);
  const removed = images.length - visible.length;
  if (!images.length) return null;

  const shown = compact ? visible.slice(0, 3) : visible;
  const hidden = visible.length - shown.length;
  const single = shown.length === 1;
  const current = openIndex === null ? null : visible[openIndex];

  const download = () => {
    if (!current) return;
    const link = document.createElement('a');
    link.href = `${announcementImageSrc(current.url)}&download=1`;
    link.download = current.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className={cn('mt-3', className)}>
      {shown.length > 0 && (
        <div className={cn('grid gap-2', single ? 'grid-cols-1' : shown.length === 2 || shown.length === 4 ? 'grid-cols-2' : 'grid-cols-3')}>
          {shown.map((image, index) => {
            const more = hidden > 0 && index === shown.length - 1;
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
                aria-label={more ? `Ver imágenes del anuncio (${visible.length})` : `Ver imagen ${index + 1} de ${visible.length}: ${image.name}`}
              >
                <img
                  src={announcementImageSrc(image.url)}
                  alt={image.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                />
                {more && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">+{hidden + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {removed > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          {removed === 1 ? 'Una imagen ya se borró' : `${removed} imágenes ya se borraron`}: se guardan 30 días.
        </p>
      )}
      {current && (
        <Suspense fallback={null}>
          <ChatFilePreview
            file={{ id: current.id, name: current.name, mimeType: current.mimeType, size: current.size }}
            url={announcementImageSrc(current.url)}
            onClose={() => setOpenIndex(null)}
            onDownload={download}
            onPrevious={openIndex > 0 ? () => setOpenIndex(openIndex - 1) : undefined}
            onNext={openIndex < visible.length - 1 ? () => setOpenIndex(openIndex + 1) : undefined}
            position={visible.length > 1 ? { index: openIndex, total: visible.length } : undefined}
            previousLabel="Imagen anterior"
            nextLabel="Imagen siguiente"
            elevated={elevated}
          />
        </Suspense>
      )}
    </div>
  );
}
