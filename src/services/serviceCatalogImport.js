export const CATALOG_MARGIN = 0.4;

const CATEGORY_MAP = Object.freeze({
  Branding: 'BRANDING',
  Diseño: 'DISENO',
  'Comunicación corporativa': 'COMUNICACION_CORPORATIVA',
  'Producción audiovisual': 'PRODUCCION_AUDIOVISUAL',
  Marketing: 'MARKETING',
  'Marketing / IA': 'MARKETING',
  Ads: 'ADS',
  Editorial: 'EDITORIAL',
  Web: 'WEB',
  'Desarrollo web y tecnología': 'DESARROLLO',
  'Merchandising / Impresión': 'MERCHANDISING_IMPRESION'
});

const LEGACY_NAMES_BY_CURRENT_NAME = Object.freeze({
  'Carrusel de hasta 10 slides': 'Carrusel de hasta 5 slides',
  'Administración Meta Ads + Google Ads': 'Meta + Google Ads',
  'Integración con servicios externos': 'Integración con herramientas externas',
  'Spot publicitario': 'Spot publicitario/produccion',
  'Tienda virtual - E commerce': 'Tienda virtual',
  'Marketing Básico – 8 contenidos': 'RRSS Básico',
  'Marketing Estándar – 12 contenidos': 'RRSS Estándar',
  'Marketing Pro – 20 contenidos': 'RRSS Pro'
});

export const mapCatalogCategory = (category) => {
  const mapped = CATEGORY_MAP[String(category || '').trim()];
  if (!mapped) throw new Error(`Categoría de tarifario no soportada: ${category}`);
  return mapped;
};

export const calculateCatalogFinalPrice = (cost, { variablePrice = false } = {}) => {
  if (variablePrice) return 0;
  const numericCost = Number(cost);
  if (!Number.isFinite(numericCost) || numericCost < 0) {
    throw new Error(`Costo inválido para calcular precio final: ${cost}`);
  }
  return Math.round(numericCost * (1 + CATALOG_MARGIN));
};

export const resolveCatalogIdentity = (currentName) => (
  LEGACY_NAMES_BY_CURRENT_NAME[currentName] || currentName
);

export const isVariablePriceService = (name) => (
  name === 'Inversión publicitaria Meta Ads' || name === 'Inversión publicitaria Google Ads'
);
