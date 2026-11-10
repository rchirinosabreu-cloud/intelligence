import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { driveAssetUrls, driveEmbedAspect } from '@/lib/finalAssetShape';
import { finalAssetOrderProblem, moveAssetId, moveAssetToIndex } from '@/lib/finalAssetOrder';
import { finalAssetDownloadName } from '@/lib/finalAssetDownloadName';
import { Download, Eye, ExternalLink, Trash2, Plus, Loader2, Image as ImageIcon, FileText } from '@/components/ui/icons';
import FinalMediaPreview from './FinalMediaPreview';

const FIELD_LABEL = 'flex h-5 items-center text-xs font-medium text-zinc-500 dark:text-zinc-400';

// Controles de medios compartidos por el editor y la lectura de una pieza.
// No importan la pantalla de Parrillas ni los paneles de Bria.

export const MultiLinkInput = ({ values = [], onChange, placeholder, isEditing }) => {
  const [links, setLinks] = useState(Array.isArray(values) ? values : (values ? [values] : []));

  useEffect(() => {
    setLinks(Array.isArray(values) ? values : (values ? [values] : []));
  }, [values]);

  const handleAddLink = () => {
    const newLinks = [...links, ''];
    setLinks(newLinks);
  };

  const handleUpdateLink = (index, value) => {
    const newLinks = [...links];
    newLinks[index] = value;
    setLinks(newLinks);
  };

  const handleBlur = () => {
    const filtered = links.filter(l => l.trim() !== '');
    onChange(filtered);
  };

  const handleRemoveLink = (index) => {
    const newLinks = links.filter((_, i) => i !== index);
    setLinks(newLinks);
    onChange(newLinks);
  };

  if (!isEditing) {
    if (links.length === 0) return <span className="text-[10px] text-zinc-400 italic">No asignado</span>;
    return (
      <div className="flex flex-wrap gap-2">
        {links.map((link, i) => (
          <a
            key={i}
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 bg-brand-cyan-soft dark:bg-brand-cyan/10 text-brand-cyan-deep dark:text-brand-cyan hover:text-brand-cyan-deep dark:hover:text-brand-cyan font-bold text-[10px] rounded-xl transition-colors max-w-full truncate"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            {links.length > 1 ? `Enlace ${i + 1}` : 'Ver enlace'}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {links.map((link, i) => (
        <div key={i} className="flex gap-2">
          <input
            type="text"
            value={link}
            onChange={(e) => handleUpdateLink(i, e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            className="flex-1 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-brand-cyan/20 outline-none transition-all"
          />
          <button
            onClick={() => handleRemoveLink(i)}
            className="brain-danger-button-icon p-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        onClick={handleAddLink}
        className="flex items-center gap-1 text-[10px] font-bold text-brand-cyan-deep dark:text-brand-cyan hover:text-brand-cyan-deep dark:hover:text-brand-cyan transition-colors px-1"
      >
        <Plus className="w-3 h-3" /> Añadir enlace
      </button>
    </div>
  );
};
/**
 * La portada de un reel (Rodny, 15 de octubre de 2026). Solo aparece donde Meta la admite —un reel—,
 * incluso antes de cargar el video, para poder preparar ambos archivos en cualquier orden.
 *
 * Lo que dice es lo que de verdad pasa al publicar: la imagen sale en la pestaña Reels, y como el reel
 * se comparte al feed, en la cuadrícula del perfil Meta recorta su cuadrado central.
 */
export const CoverField = ({ item, isEditing, onUpload, onRemove, isBusy }) => {
  const [previewUrl, setPreviewUrl] = useState(null);
  const cover = item.cover || null;

  useEffect(() => {
    if (!cover) { setPreviewUrl(null); return undefined; }
    let objectUrl;
    let cancelled = false;
    fetch(`${getApiBaseUrl()}/api/content/items/${item.id}/cover?v=${encodeURIComponent(cover.name || '')}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    })
      .then((response) => { if (!response.ok) throw new Error(`Cover request failed with status ${response.status}`); return response.blob(); })
      .then((blob) => { if (cancelled) return; objectUrl = URL.createObjectURL(blob); setPreviewUrl(objectUrl); })
      .catch((error) => console.error('Cover preview failed:', error));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.id, cover?.name, cover?.size]);

  return (
    <div className="flex min-w-0 flex-col gap-2" data-piece-cover>
      <span className={`${FIELD_LABEL} gap-2`}>Portada del reel <span className="text-[11px] font-normal">Opcional</span></span>
      <div className="flex min-h-[144px] items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-white p-4 dark:border-white/15 dark:bg-zinc-900">
        {cover ? (
          <div className="h-20 w-[45px] shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-zinc-950">
            {previewUrl
              ? <img src={previewUrl} alt={cover.name || 'Portada'} className="h-full w-full object-cover" />
              : <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" /></div>}
          </div>
        ) : (
          <div className="flex h-20 w-[45px] shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-white/15">
            <ImageIcon className="h-4 w-4 text-zinc-400" />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
            {cover
              ? 'Sale en la pestaña Reels. En la cuadrícula del perfil, Meta recorta su cuadrado central.'
              : 'Sin portada, Meta elige un fotograma del video. Vertical 9:16, JPG o PNG.'}
          </p>
          {isEditing && (
            <div className="flex items-center gap-2.5">
              <label className={`cursor-pointer text-[13px] font-bold text-brand-cyan-deep hover:underline dark:text-brand-cyan ${isBusy ? 'pointer-events-none opacity-50' : ''}`}>
                {isBusy ? 'Guardando…' : cover ? 'Cambiar' : 'Subir portada'}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  disabled={isBusy}
                  onChange={(event) => {
                    const [file] = Array.from(event.target.files || []);
                    if (file) onUpload(item.id, file);
                    event.target.value = '';
                  }}
                />
              </label>
              {cover && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-600">·</span>
                  <button type="button" onClick={() => onRemove(item.id)} disabled={isBusy} className="text-[13px] font-bold text-destructive hover:underline">
                    Quitar
                  </button>
                </>
              )}
            </div>
          )}
          {!isEditing && !cover && <span className="text-[12px] text-zinc-400">Sin portada.</span>}
        </div>
      </div>
    </div>
  );
};

const FinalAssetTile = ({
  item, asset, isEditing, onDelete, isDeleting, position = null, total = 1,
  canDrag = false, isDragged = false, isDragActive = false, isSaving = false,
  onDragStart, onDragOver, onDragEnd, onKeyMove, assetUrls, onOpenAsset
}) => {
  const [mediaOpen, setMediaOpen] = useState(false);
  const eyeRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  // Un enlace de Drive no tiene bytes nuestros: no se pide a la API, se muestra el reproductor de Google.
  const drive = driveAssetUrls(asset);
  const customUrls = assetUrls?.(asset);
  const sourceUrl = drive
    ? null
    : customUrls ? customUrls.previewUrl : `${getApiBaseUrl()}/api/content/items/${item.id}/final-assets/${asset.id}?v=${encodeURIComponent(asset.storageKey || '')}`;
  const downloadUrl = drive ? null : customUrls ? customUrls.downloadUrl : sourceUrl;
  const downloadName = finalAssetDownloadName(asset, item, total > 1 ? position : null);
  const isImage = !drive && (asset.mimeType || '').startsWith('image/');
  const isVideo = !drive && (asset.mimeType || '').startsWith('video/');

  const download = async () => {
    if (downloading || !downloadUrl) return;
    setDownloading(true); setDownloadError('');
    try {
      const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
      if (!response.ok) throw new Error('No pudimos descargar el archivo. Revisa tu acceso e intenta otra vez.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = downloadName;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { console.error('[Entregables] No se pudo descargar:', error.message); setDownloadError(error.message); }
    finally { setDownloading(false); }
  };

  return (
    <div
      data-final-asset-tile={asset.id}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      title={canDrag ? 'Arrastra para cambiar el orden' : undefined}
      className={`group/asset relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 transition-opacity dark:border-white/10 dark:bg-zinc-950 ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isDragged ? 'opacity-30' : isSaving ? 'opacity-60' : ''}`}
    >
      {/* Un reel es vertical: el marco de Drive toma la forma del formato de la pieza, no la de fábrica.
          Mientras se arrastra, el contenido no recibe el puntero: un marco de Drive o un video se
          tragarían el arrastre y no habría dónde soltar. */}
      <div
        className={`${drive ? '' : 'aspect-square'} ${isDragActive ? 'pointer-events-none' : ''}`}
        style={drive ? { aspectRatio: driveEmbedAspect(item.format) } : undefined}
      >
        {drive ? (
          <iframe
            src={drive.embedUrl}
            title={asset.name || 'Pieza final en Drive'}
            className="h-full w-full border-0 bg-black"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        ) : (isImage || isVideo) ? <FinalMediaPreview sourceUrl={sourceUrl} name={downloadName} isVideo={isVideo} open={mediaOpen} onOpenChange={setMediaOpen} triggerRef={eyeRef}
          onDownload={downloadUrl ? download : undefined} downloading={downloading} downloadError={downloadError} /> : onOpenAsset ? (
          <button type="button" onClick={() => onOpenAsset(asset)} aria-label={`Ver ${asset.name || 'archivo'}`} className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-sm text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-white/5">
            <FileText className="h-8 w-8" />{asset.mimeType === 'application/pdf' ? 'PDF' : 'Archivo'}
          </button>
        ) : <FileText className="m-auto h-8 w-8 text-zinc-300" />}
      </div>
      {/* Las acciones van sobre la miniatura, no en la línea del nombre: compitiendo por el ancho de
          una tarjeta pequeña, el nombre se recortaba hasta quedarse en una letra suelta
          (Rodny, 25 de septiembre de 2026). Así el nombre se queda con la línea entera. */}
      {/* El orden de los archivos es el orden del carrusel que sale en redes (Rodny, 1 de octubre de
          2026): el número dice en qué puesto va cada lámina y, al editar, la miniatura se arrastra a
          su sitio. Hubo dos botones por miniatura y Rodny los devolvió el mismo día («prefiero drag
          and drop»). El número queda como asidero del teclado: con las flechas se mueve un puesto.
          Mientras se arrastra, la miniatura atenuada es el hueco donde va a quedar. */}
      {total > 1 && position !== null && (
        canDrag ? (
          <button
            type="button"
            data-final-asset-position
            data-final-asset-grip={asset.id}
            onKeyDown={(event) => {
              const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0;
              if (!direction) return;
              event.preventDefault();
              onKeyMove?.(asset.id, direction);
            }}
            aria-label={`${asset.name || 'Archivo'}, puesto ${position + 1} de ${total}. Arrastra la miniatura o usa las flechas del teclado para cambiar el orden.`}
            className="absolute left-1.5 top-1.5 flex h-6 min-w-6 cursor-grab items-center justify-center rounded-lg bg-black/55 px-1.5 text-[11px] font-bold tabular-nums text-white outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-brand-cyan"
          >
            {position + 1}
          </button>
        ) : (
          <span data-final-asset-position className="absolute left-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-lg bg-black/55 px-1.5 text-[11px] font-bold tabular-nums text-white backdrop-blur-sm">
            {position + 1}
          </span>
        )
      )}

      <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
        {(isImage || isVideo) && <button ref={eyeRef} type="button" onClick={() => setMediaOpen(true)} aria-label={`Ver ${downloadName}`} title="Ver completo"
          className="grid h-11 w-11 place-items-center rounded-lg bg-zinc-800/80 text-white backdrop-blur-sm transition hover:bg-zinc-900 dark:bg-zinc-950/80 dark:hover:bg-zinc-900"><Eye className="h-4 w-4" /></button>}
        {/* La descarga nativa del blob usa su UUID. Este botón conserva el nombre subido. */}
        {downloadUrl && <button type="button" onClick={download} disabled={downloading} aria-label={`Descargar ${downloadName}`} title={`Descargar ${downloadName}`}
          className="grid h-11 w-11 place-items-center rounded-lg bg-zinc-800/80 text-white backdrop-blur-sm transition hover:bg-zinc-900 disabled:opacity-50 dark:bg-zinc-950/80 dark:hover:bg-zinc-900">
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>}
        {drive && (
          <a
            href={drive.openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-black/55 p-1.5 text-white backdrop-blur-sm transition hover:bg-black/75"
            aria-label={`Abrir ${asset.name || 'el archivo'} en Drive`}
            title="Abrir en Drive"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {isEditing && (
          <button
            type="button"
            onClick={() => onDelete(item.id, asset.id)}
            disabled={isDeleting}
            className="rounded-lg bg-black/55 p-1.5 text-white backdrop-blur-sm transition hover:bg-destructive"
            aria-label={`Eliminar ${asset.name || 'archivo final'}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <span title={downloadName} className="block truncate px-2.5 py-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
        {downloadName}
      </span>
      {downloadError && <p role="alert" className="px-2.5 pb-2 text-xs text-destructive">{downloadError}</p>}
    </div>
  );
};

/** Dónde está cada miniatura dentro de la rejilla. `offsetLeft`/`offsetTop` no ven ni el scroll ni un deslizamiento a medias. */
const measureTilePlaces = (grid) => {
  const places = new Map();
  grid?.querySelectorAll('[data-final-asset-tile]').forEach((node) => {
    places.set(node.dataset.finalAssetTile, { left: node.offsetLeft, top: node.offsetTop, node });
  });
  return places;
};

/**
 * Las miniaturas de la pieza final, que al editar se ordenan arrastrando (Rodny, 1 de octubre de 2026).
 *
 * Se comporta como las tarjetas del tablero de Gestión: mientras se arrastra, las demás se corren
 * para abrirle el hueco y lo que se ve es lo que queda al soltar. Hubo una línea cian que marcaba
 * dónde iba a caer y Rodny la devolvió el mismo día («no quiero que salga ese borde azul sino que
 * al hacer drag, se reorganice de una vez hasta que yo la suelte»): no reponerla.
 *
 * Es el arrastre del navegador y no `@hello-pangea/dnd`, que solo sabe de listas en una dirección:
 * esto es una rejilla que da la vuelta. Al soltar, la miniatura se queda en su sitio nuevo atenuada
 * mientras el servidor guarda; si el servidor dice que no, vuelve a donde estaba y sale el motivo.
 * Soltar fuera de la rejilla, o pulsar Escape, lo deja todo como estaba.
 * El archivo heredado de las columnas antiguas no tiene fila propia: va primero y no se mueve.
 */
export const FinalAssetGrid = ({ item, finalAssets, isEditing, reorderable = isEditing, onDelete, isDeleting, onReorder, assetUrls, onOpenAsset }) => {
  const gridRef = useRef(null);
  const dragIdRef = useRef(null);
  const previewRef = useRef(null);
  const placesRef = useRef(new Map());
  const slidesRef = useRef(new Map());
  const slideNextRef = useRef(false);
  const [dragId, setDragId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(null);

  const ids = finalAssets.map(asset => asset.id);
  const canReorder = reorderable && ids.length > 1 && typeof onReorder === 'function';
  // Si mientras se arrastraba o se guardaba alguien añadió o quitó un archivo, ese orden ya no vale.
  const pending = saving && !finalAssetOrderProblem(ids, saving.order) ? saving : null;
  const live = !pending && preview && !finalAssetOrderProblem(ids, preview) ? preview : null;
  const shownOrder = pending?.order || live;
  const shown = shownOrder
    ? shownOrder.map(id => finalAssets.find(asset => asset.id === id))
    : finalAssets;
  const orderKey = shown.map(asset => asset.id).join('|');

  // Las que hacen sitio se deslizan a su puesto nuevo en vez de saltar. La que se arrastra no: ya
  // está en su hueco. Solo se anima un cambio de orden que hizo la persona, nunca una recarga.
  useLayoutEffect(() => {
    const before = placesRef.current;
    const after = measureTilePlaces(gridRef.current);
    placesRef.current = after;
    const slide = slideNextRef.current;
    slideNextRef.current = false;
    if (!slide || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    after.forEach((place, id) => {
      const from = before.get(id);
      if (!from || id === dragIdRef.current || (from.left === place.left && from.top === place.top)) return;
      slidesRef.current.get(id)?.cancel();
      const motion = place.node.animate(
        [{ transform: `translate(${from.left - place.left}px, ${from.top - place.top}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      );
      slidesRef.current.set(id, motion);
      const settle = () => { if (slidesRef.current.get(id) === motion) slidesRef.current.delete(id); };
      motion.onfinish = settle;
      motion.oncancel = settle;
    });
  }, [orderKey]);

  const focusGrip = (id) => requestAnimationFrame(() => {
    gridRef.current?.querySelector(`[data-final-asset-grip="${id}"]`)?.focus();
  });

  const endDrag = () => {
    dragIdRef.current = null;
    previewRef.current = null;
    setDragId(null);
    setPreview(null);
  };

  const commit = async (order, movedId, { keepFocus = false } = {}) => {
    if (saving || order.join('|') === ids.join('|')) return;
    placesRef.current = measureTilePlaces(gridRef.current);
    slideNextRef.current = true;
    setSaving({ order, movedId });
    // React recoloca el nodo y el navegador le quita el foco: se le devuelve para seguir con las flechas.
    if (keepFocus) focusGrip(movedId);
    try {
      await onReorder(item.id, order);
    } catch {
      // El motivo lo dice quien guarda; aquí la miniatura solo vuelve a su sitio.
      slideNextRef.current = true;
    } finally {
      setSaving(null);
      if (keepFocus) focusGrip(movedId);
    }
  };

  // El navegador solo deja soltar donde el último `dragenter` o `dragover` dijo que sí, y un gesto
  // rápido suelta antes del primer `dragover`: por eso van los dos, en la miniatura y en la rejilla
  // (el hueco entre dos miniaturas también es un sitio válido para soltar).
  const allowDrop = (event) => {
    // Solo cuenta una miniatura de esta rejilla; un archivo traído del escritorio no es esto.
    if (!dragIdRef.current) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    return true;
  };

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
      onDragEnter={allowDrop}
      onDragOver={allowDrop}
      onDrop={(event) => {
        const movedId = dragIdRef.current;
        if (!movedId) return;
        event.preventDefault();
        const order = previewRef.current || ids;
        endDrag();
        commit(order, movedId);
      }}
    >
      {shown.map((asset, position) => {
        const canDrag = canReorder && !saving;
        return (
          <FinalAssetTile
            key={asset.id}
            item={item}
            asset={asset}
            assetUrls={assetUrls}
            onOpenAsset={onOpenAsset}
            isEditing={isEditing}
            onDelete={onDelete}
            isDeleting={isDeleting}
            position={position}
            total={shown.length}
            canDrag={canDrag}
            isDragged={dragId === asset.id}
            isDragActive={Boolean(dragId)}
            isSaving={pending?.movedId === asset.id}
            onDragStart={canDrag ? (event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', asset.name || 'Archivo');
              dragIdRef.current = asset.id;
              previewRef.current = ids;
              placesRef.current = measureTilePlaces(gridRef.current);
              // Fuera del evento: si la miniatura cambia de aspecto dentro de `dragstart`, Chrome
              // cancela el arrastre antes de empezar.
              setTimeout(() => { if (dragIdRef.current === asset.id) setDragId(asset.id); }, 0);
            } : undefined}
            onDragOver={canDrag ? (event) => {
              if (!allowDrop(event)) return;
              const movedId = dragIdRef.current;
              // Una miniatura que todavía se desliza pasa por debajo del puntero sin que la persona
              // la haya buscado: no cuenta hasta que llega a su sitio. Sin esto el orden baila.
              if (asset.id === movedId || slidesRef.current.has(asset.id)) return;
              const current = previewRef.current || ids;
              const next = moveAssetToIndex(current, movedId, current.indexOf(asset.id));
              if (next === current) return;
              previewRef.current = next;
              slideNextRef.current = true;
              setPreview(next);
            } : undefined}
            onDragEnd={canDrag ? () => {
              // Si llega con el arrastre todavía vivo es que no se soltó dentro de la rejilla.
              if (!dragIdRef.current) return;
              slideNextRef.current = true;
              endDrag();
            } : undefined}
            onKeyMove={(assetId, direction) => commit(moveAssetId(ids, assetId, direction), assetId, { keepFocus: true })}
          />
        );
      })}
    </div>
  );
};
