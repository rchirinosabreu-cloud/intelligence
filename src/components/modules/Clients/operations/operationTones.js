// Colores de «Operación de clientes» (borrador del 2 de octubre de 2026). Solo tokens de marca y
// semánticos: el rojo es siempre `destructive`; amarillo y verde, los tonos de estado.

export const LEVEL_META = {
  red: { label: 'En riesgo', dot: 'bg-destructive', text: 'text-destructive', soft: 'bg-destructive/10 border-destructive/20' },
  yellow: { label: 'Atención', dot: 'bg-status-attention', text: 'text-status-attention-fg', soft: 'bg-status-attention/15 border-status-attention/30' },
  green: { label: 'Al día', dot: 'bg-status-positive', text: 'text-status-positive-fg', soft: 'bg-status-positive/10 border-status-positive/25' },
  gray: { label: 'Sin medir', dot: 'bg-zinc-300 dark:bg-zinc-600', text: 'text-zinc-500 dark:text-zinc-400', soft: 'bg-zinc-100 border-zinc-200 dark:bg-white/5 dark:border-white/10' },
};

// Una etapa, un color. El orden de la barra va de lo más avanzado (publicada) a lo que falta.
export const STAGE_TONE = {
  publicada: 'bg-brand-green',
  programada: 'bg-brand-magenta',
  aprobada: 'bg-brand-cyan',
  disenada: 'bg-brand-coral',
  redactada: 'bg-brand-yellow',
  creada: 'bg-zinc-300 dark:bg-zinc-600',
  faltante: 'bg-zinc-100 dark:bg-white/5',
};

export const STAGE_LABEL = {
  publicada: 'Publicada',
  programada: 'Programada',
  aprobada: 'Aprobada',
  disenada: 'Diseñada',
  redactada: 'Redactada',
  creada: 'Creada, sin redactar',
  faltante: 'Falta crearla',
};

// El código de colores de la minuta: cada estado de pieza con el color de su etapa, el devuelto en rojo.
export const PIECE_STATUS = {
  BORRADOR: { label: 'Borrador', chip: 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300' },
  EN_REVISION: { label: 'En revisión', chip: 'bg-brand-yellow-soft text-brand-yellow-deep dark:bg-brand-yellow/15 dark:text-brand-yellow' },
  EN_PRODUCCION: { label: 'En producción', chip: 'bg-brand-coral-soft text-brand-coral-deep dark:bg-brand-coral/15 dark:text-brand-coral' },
  REALIZADO: { label: 'Diseñada', chip: 'bg-brand-coral-soft text-brand-coral-deep dark:bg-brand-coral/15 dark:text-brand-coral' },
  APROBADO: { label: 'Aprobada', chip: 'bg-brand-cyan-soft text-brand-cyan-deep dark:bg-brand-cyan/15 dark:text-brand-cyan' },
  PROGRAMADO: { label: 'Programada', chip: 'bg-brand-magenta-soft text-brand-magenta-deep dark:bg-brand-magenta/25 dark:text-zinc-100' },
  PUBLICADO: { label: 'Publicada', chip: 'bg-brand-green-soft text-brand-green-deep dark:bg-brand-green/15 dark:text-brand-green' },
  DEVUELTO: { label: 'Devuelta', chip: 'bg-destructive/10 text-destructive' },
};
