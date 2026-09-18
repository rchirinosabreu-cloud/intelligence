// Geometría pura del encuadre de la foto de perfil: la imagen siempre cubre el visor circular,
// el zoom parte de ese ajuste y el desplazamiento nunca deja huecos. Sin DOM, para poder probarla.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const AVATAR_OUTPUT_SIZE = 512;

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

/** Escala mínima para que la imagen cubra por completo un visor cuadrado. */
export const coverScale = (natural, viewport) => {
  const width = finite(natural?.width);
  const height = finite(natural?.height);
  if (width <= 0 || height <= 0 || !(viewport > 0)) return 1;
  return Math.max(viewport / width, viewport / height);
};

export const clampZoom = (zoom) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, finite(zoom, MIN_ZOOM)));

/** Tamaño en pantalla de la imagen para un zoom dado. */
export const displayedSize = (natural, viewport, zoom) => {
  const scale = coverScale(natural, viewport) * clampZoom(zoom);
  return { width: finite(natural?.width) * scale, height: finite(natural?.height) * scale, scale };
};

/** Limita el desplazamiento (centro de la imagen respecto al centro del visor) para no descubrir bordes. */
export const clampOffset = ({ natural, viewport, zoom, offset }) => {
  const { width, height } = displayedSize(natural, viewport, zoom);
  const maxX = Math.max(0, (width - viewport) / 2);
  const maxY = Math.max(0, (height - viewport) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, finite(offset?.x))),
    y: Math.min(maxY, Math.max(-maxY, finite(offset?.y)))
  };
};

/** Rectángulo de la imagen original que queda dentro del visor, listo para `drawImage`. */
export const cropRect = ({ natural, viewport, zoom, offset }) => {
  const { width, height, scale } = displayedSize(natural, viewport, zoom);
  const safe = clampOffset({ natural, viewport, zoom, offset });
  const side = viewport / scale;
  return {
    sx: ((width - viewport) / 2 - safe.x) / scale,
    sy: ((height - viewport) / 2 - safe.y) / scale,
    sw: side,
    sh: side
  };
};
