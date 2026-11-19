// La ficha de marca como contexto de Bria (Rodny, 18 de noviembre de 2026, tras revisar Henry: «Henry lee las reglas de
// cada marca y por eso el caption sale en su voz»). Las fichas ya guardan voz, frase, notas de uso, colores y
// tipografías; aquí se vuelven un texto corto que Bria puede leer al revisar una parrilla o al escribir para el cliente.
// Es dato editorial, nunca una orden: el texto lo escribe el equipo (o sale del manual del cliente).

const clean = (value, max = 600) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const ROLE_LABEL = {
  PRINCIPAL: 'principal', SECUNDARIO: 'secundario', ACENTO: 'acento', NEUTRO: 'neutro', FONDO: 'fondo', TEXTO: 'texto'
};
const USE_LABEL = {
  LOGO: 'logo', TITULOS: 'títulos', TEXTOS: 'textos', COMPLEMENTARIA: 'complementaria'
};

const list = (value) => (Array.isArray(value) ? value : []);

export const brandSheetSummary = (brand) => {
  if (!brand) return null;
  const lines = [];
  const tagline = clean(brand.tagline, 200);
  const voice = clean(brand.voice);
  const notes = clean(brand.usageNotes, 900);
  if (tagline) lines.push(`Frase de marca: ${tagline}`);
  if (voice) lines.push(`Voz y tono: ${voice}`);
  if (notes) lines.push(`Reglas de uso: ${notes}`);
  const colors = list(brand.colors).filter((color) => color?.hex).slice(0, 16)
    .map((color) => [clean(color.name, 40), String(color.hex).toUpperCase(), ROLE_LABEL[color.role] || null].filter(Boolean).join(' '));
  if (colors.length) lines.push(`Colores: ${colors.join('; ')}`);
  const fonts = list(brand.fonts).filter((font) => font?.family).slice(0, 8)
    .map((font) => `${clean(font.family, 60)}${USE_LABEL[font.use] ? ` (${USE_LABEL[font.use]})` : ''}`);
  if (fonts.length) lines.push(`Tipografías: ${fonts.join(', ')}`);
  return lines.length ? lines.join('\n') : null;
};

// Evidencia para la revisión de parrillas: un solo documento, con id estable por revisión de la ficha para que el
// hash de análisis cambie cuando el equipo edita la marca y Bria vuelva a revisar contra la versión nueva.
export const brandSheetEvidence = (brand, { clientName = '' } = {}) => {
  const content = brandSheetSummary(brand);
  if (!content) return null;
  return {
    id: `brand:${brand.id}:r${brand.revision || 1}`,
    title: clientName ? `Ficha de marca · ${clientName}` : 'Ficha de marca',
    sourceKind: 'BRAND_SHEET',
    sourceUrl: brand.clientId ? `/cliente/${brand.clientId}?tab=marca` : null,
    content,
    score: 1
  };
};
