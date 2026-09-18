// Anillo de color por persona (decisión de Rodny, 18 de septiembre de 2026).
// Cada foto lleva un anillo de la paleta oficial; el color se deriva de la identidad de la persona,
// así es estable entre pantallas y sesiones sin guardar nada. Con nueve tonos y ~14 personas puede
// repetirse, pero poco. Las clases se escriben completas para que Tailwind las genere.
export const AVATAR_RING_CLASSES = Object.freeze([
  'ring-brand-cyan',
  'ring-brand-magenta',
  'ring-brand-green',
  'ring-brand-coral',
  'ring-brand-yellow',
  'ring-brand-cyan-deep',
  'ring-brand-magenta-deep',
  'ring-brand-green-deep',
  'ring-brand-coral-deep'
]);

// FNV-1a with a final multiplicative mix so short, similar keys spread evenly across the nine tones.
const hashKey = (value) => {
  const text = String(value || '').trim().toLowerCase();
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
};

export const avatarRingKey = (member) => {
  if (!member) return '';
  if (typeof member === 'string') return member;
  return member.userId || member.id || member.email || member.name || '';
};

export const avatarRingIndex = (member) => {
  const key = avatarRingKey(member);
  if (!key) return 0;
  return hashKey(key) % AVATAR_RING_CLASSES.length;
};

export const avatarRingClass = (member) => AVATAR_RING_CLASSES[avatarRingIndex(member)];
