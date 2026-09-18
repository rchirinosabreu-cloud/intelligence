import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, Check, Loader2, Upload, X } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { cn } from '@/lib/utils';
import { AVATAR_OUTPUT_SIZE, MAX_ZOOM, MIN_ZOOM, clampOffset, clampZoom, cropRect, displayedSize } from '@/lib/avatarCrop';

const VIEWPORT = 256;
const MAX_BYTES = 5 * 1024 * 1024;

const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  image.src = url;
});

/** Recorta la zona visible del visor a un cuadrado y la devuelve como archivo JPEG. */
export const exportFramedAvatar = async ({ imageUrl, natural, zoom, offset }) => {
  const image = await loadImage(imageUrl);
  const rect = cropRect({ natural, viewport: VIEWPORT, zoom, offset });
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('No se pudo preparar la foto.');
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
};

/**
 * Cada persona sube y encuadra su propia foto: elige el archivo, la arrastra para centrarla,
 * le hace zoom y guarda. El servidor recibe la imagen ya recortada en cuadrado.
 */
const AvatarEditor = ({ user, onSaved, onCancel }) => {
  const queryClient = useQueryClient();
  const [imageUrl, setImageUrl] = useState(null);
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const dragRef = useRef(null);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const onDrop = useCallback(async (acceptedFiles, rejectedFiles) => {
    setError(null);
    if (rejectedFiles?.length) {
      setError('Usa una imagen JPG, PNG o WEBP de máximo 5 MB.');
      return;
    }
    const file = acceptedFiles[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
      setImageUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return url; });
      setZoom(MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
    } catch (loadError) {
      URL.revokeObjectURL(url);
      setError(loadError.message);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] },
    maxFiles: 1,
    maxSize: MAX_BYTES,
    multiple: false,
    noClick: Boolean(imageUrl),
    disabled: isSaving
  });

  const applyZoom = (nextZoom) => {
    const safeZoom = clampZoom(nextZoom);
    setZoom(safeZoom);
    setOffset((current) => clampOffset({ natural, viewport: VIEWPORT, zoom: safeZoom, offset: current }));
  };

  const onPointerDown = (event) => {
    if (!imageUrl) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offset };
  };
  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    const next = { x: dragRef.current.offset.x + (event.clientX - dragRef.current.x), y: dragRef.current.offset.y + (event.clientY - dragRef.current.y) };
    setOffset(clampOffset({ natural, viewport: VIEWPORT, zoom, offset: next }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onKeyDown = (event) => {
    const step = 12;
    const moves = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setOffset((current) => clampOffset({ natural, viewport: VIEWPORT, zoom, offset: { x: current.x + move.x, y: current.y + move.y } }));
  };

  const save = async () => {
    if (!imageUrl || !natural || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const framed = await exportFramedAvatar({ imageUrl, natural, zoom, offset });
      const formData = new FormData();
      formData.append('avatar', framed);
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/user/avatar`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error('[AvatarEditor] Upload failed:', data);
        throw new Error(data.error || 'No se pudo guardar la foto.');
      }
      await Promise.all([
        ['user-data'], ['user-profile'], ['talent-radar-summary'], ['member-radar-detail'], ['team-members'], ['dashboard-team-members'], ['user']
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success('Foto de perfil actualizada');
      onSaved?.(data.avatarUrl);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const size = natural ? displayedSize(natural, VIEWPORT, zoom) : null;

  return (
    <div className="space-y-5">
      {!imageUrl ? (
        <>
          <div className="flex flex-col items-center gap-3 py-2">
            <TeamAvatar member={user} size={96} ring showTitle={false} className="h-24 w-24 border-0 [&>span]:text-3xl" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Tu foto actual</p>
          </div>
          <div
            {...getRootProps()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
              isDragActive ? 'border-brand-cyan bg-brand-cyan/10' : 'border-zinc-200 hover:border-brand-cyan/60 dark:border-white/10',
              isSaving && 'pointer-events-none opacity-50'
            )}
          >
            <input {...getInputProps()} aria-label="Seleccionar foto de perfil" />
            <span className="rounded-2xl bg-brand-cyan/10 p-4 text-brand-cyan-deep dark:text-brand-cyan">
              <Upload className="h-7 w-7" />
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">Arrastra o selecciona una foto</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">JPG, PNG o WEBP · máximo 5 MB · después podrás encuadrarla</p>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-4">
            <div
              role="img"
              aria-label="Encuadre de la foto: arrastra para mover, usa el zoom para acercar"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
              className={cn(
                'relative touch-none select-none overflow-hidden rounded-full bg-zinc-100 shadow-inner ring-4 ring-brand-cyan/30 focus:outline-none focus-visible:ring-brand-cyan dark:bg-zinc-800',
                dragRef.current ? 'cursor-grabbing' : 'cursor-grab'
              )}
              style={{ width: VIEWPORT, height: VIEWPORT }}
            >
              {size && (
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                  style={{
                    width: size.width,
                    height: size.height,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`
                  }}
                />
              )}
            </div>
            <label className="flex w-full max-w-xs items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="shrink-0 font-semibold">Zoom</span>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => applyZoom(Number(event.target.value))}
                aria-label="Zoom de la foto"
                className="w-full accent-brand-cyan"
              />
              <span className="w-10 shrink-0 text-right tabular-nums">{zoom.toFixed(1)}x</span>
            </label>
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Arrastra la foto para centrarla. Lo que queda dentro del círculo es lo que verá el equipo.</p>
          </div>
          {/* One line always: short labels, no wrapping. */}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" className="shrink-0 gap-1.5 whitespace-nowrap rounded-lg px-3" disabled={isSaving} onClick={open} title="Elegir otra foto">
              <Camera className="h-4 w-4" />
              Otra foto
            </Button>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" className="gap-1.5 whitespace-nowrap rounded-lg px-3" disabled={isSaving} onClick={() => onCancel?.()}>
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button type="button" className="gap-1.5 whitespace-nowrap rounded-lg px-3" disabled={isSaving} onClick={save}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Guardar foto
              </Button>
            </div>
          </div>
          <div {...getRootProps({ className: 'hidden' })}><input {...getInputProps()} /></div>
        </>
      )}
      {error && <p className="text-xs font-semibold text-destructive" role="alert">{error}</p>}
    </div>
  );
};

export default AvatarEditor;
