export const TASK_CATEGORIES = Object.freeze([
  'Estrat\u00e9gico',
  'Creativo & Dise\u00f1o',
  'Marketing & Social Media',
  'Producci\u00f3n Audiovisual',
  'Creaci\u00f3n de Contenido',
  'Operaciones & Reuniones',
  'Administrativo & Finanzas',
  'Educaci\u00f3n'
]);

const FALLBACK_CATEGORY = 'Operaciones & Reuniones';

const CATEGORY_RULES = [
  {
    category: 'Estrat\u00e9gico',
    terms: {
      'estrategia integral': 7,
      'plan estrategico': 6,
      'objetivos de marca': 5,
      'posicionamiento': 4,
      'estrategia': 4,
      'analisis de metricas': 4,
      'concepto de campana': 4,
      'roadmap': 4,
      'auditoria de marca': 4
    }
  },
  {
    category: 'Creativo & Dise\u00f1o',
    terms: {
      'identidad visual': 6,
      'direccion de arte': 6,
      'pieza grafica': 5,
      'diseno': 4,
      'carrusel': 4,
      'branding': 4,
      'banner': 3,
      'logo': 3,
      'mockup': 3,
      'story': 2,
      'stories': 2,
      'piezas': 2
    }
  },
  {
    category: 'Marketing & Social Media',
    terms: {
      'calendario de contenido': 6,
      'redes sociales': 5,
      'social media': 5,
      'meta ads': 5,
      'parrilla': 5,
      'community management': 5,
      'pauta': 4,
      'instagram': 3,
      'facebook': 3,
      'tiktok': 3,
      'publicacion': 2,
      'programacion de contenido': 4
    }
  },
  {
    category: 'Producci\u00f3n Audiovisual',
    terms: {
      'produccion audiovisual': 7,
      'motion graphics': 6,
      'postproduccion': 6,
      'editar video': 6,
      'edicion de video': 6,
      'guion tecnico': 5,
      'reel': 5,
      'video': 5,
      'grabacion': 4,
      'audiovisual': 4,
      'animacion': 4,
      'subtitulos': 3,
      'podcast': 3,
      'produccion': 2
    }
  },
  {
    category: 'Creaci\u00f3n de Contenido',
    terms: {
      'creacion de contenido': 6,
      'articulo de blog': 6,
      'copy': 5,
      'caption': 5,
      'redaccion': 5,
      'storytelling': 4,
      'articulo': 4,
      'guion': 3,
      'texto': 2
    }
  },
  {
    category: 'Operaciones & Reuniones',
    terms: {
      'gestion de proyecto': 6,
      'reunion': 5,
      'llamada': 4,
      'seguimiento': 4,
      'coordinar': 3,
      'correccion': 3,
      'logistica': 3,
      'ajuste': 2,
      'revision': 2,
      'entrega': 1
    }
  },
  {
    category: 'Administrativo & Finanzas',
    terms: {
      'recursos humanos': 6,
      'cuenta de cobro': 6,
      'factura': 5,
      'contrato': 5,
      'nomina': 5,
      'contabilidad': 5,
      'presupuesto': 4,
      'administrativo': 4,
      'finanzas': 4,
      'cobro': 3,
      'pago': 3
    }
  },
  {
    category: 'Educaci\u00f3n',
    terms: {
      'investigacion de mercado': 7,
      'capacitacion': 6,
      'formacion': 5,
      'investigacion': 4,
      'benchmark': 4,
      'curso': 4,
      'tutorial': 3,
      'aprender': 3,
      'mercado': 2
    }
  }
];

const HIGH_COMPLEXITY_TERMS = new Map([
  ['desde cero', 4],
  ['estrategia integral', 4],
  ['campana integral', 4],
  ['investigacion profunda', 4],
  ['conceptualizacion', 3],
  ['concepto creativo', 3],
  ['auditoria completa', 3],
  ['branding completo', 3],
  ['identidad de marca', 3],
  ['motion graphics', 3],
  ['animacion 3d', 4],
  ['resolver problema tecnico', 3],
  ['arquitectura', 3]
]);

const LOW_COMPLEXITY_TERMS = [
  'cambiar',
  'corregir',
  'ajustar',
  'adaptar',
  'redimensionar',
  'reemplazar',
  'exportar',
  'subir',
  'cargar',
  'programar',
  'publicar',
  'agregar',
  'quitar',
  'actualizar'
];

const BROAD_SCOPE_TERMS = [
  'todos',
  'todas',
  'multiples',
  'varios',
  'completo',
  'completa',
  'integral',
  'campana',
  'lanzamiento'
];

const stripHtml = (value = '') => String(value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, ' & ');

const normalizeText = (value = '') => stripHtml(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9&]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const includesTerm = (text, term) => (` ${text} `).includes(` ${term} `);

const classifyCategory = (text) => {
  const scoredCategories = CATEGORY_RULES.map(({ category, terms }) => {
    const matches = Object.entries(terms).filter(([term]) => includesTerm(text, term));
    return {
      category,
      score: matches.reduce((total, [, weight]) => total + weight, 0),
      matches: matches.map(([term]) => term)
    };
  }).sort((left, right) => right.score - left.score);

  const winner = scoredCategories[0];
  if (!winner || winner.score === 0) {
    return { category: FALLBACK_CATEGORY, confidence: 0, reasons: ['sin coincidencias; regla de respaldo'] };
  }

  const runnerUpScore = scoredCategories[1]?.score || 0;
  const margin = winner.score - runnerUpScore;
  const confidence = Math.min(0.99, 0.48 + (winner.score * 0.04) + (margin * 0.03));

  return {
    category: winner.category,
    confidence: Number(confidence.toFixed(2)),
    reasons: winner.matches
  };
};

const classifyComplexity = (text, attachmentCount, category) => {
  const highScore = [...HIGH_COMPLEXITY_TERMS.entries()]
    .filter(([term]) => includesTerm(text, term))
    .reduce((total, [, weight]) => total + weight, 0);

  if (highScore >= 3) return 'ALTA';

  const hasLowSignal = LOW_COMPLEXITY_TERMS.some((term) => includesTerm(text, term));
  const hasBroadScope = BROAD_SCOPE_TERMS.some((term) => includesTerm(text, term));
  const isStandardAudiovisualWork = category === 'Producci\u00f3n Audiovisual'
    && ['video', 'reel', 'motion graphics', 'grabacion'].some((term) => includesTerm(text, term));
  const wordCount = text ? text.split(' ').length : 0;
  if (hasLowSignal && !hasBroadScope && !isStandardAudiovisualWork && attachmentCount < 3 && wordCount <= 18) return 'BAJA';

  return 'MEDIA';
};

export const classifyTaskDeterministically = ({
  title = '',
  description = '',
  attachmentCount = 0
} = {}) => {
  const text = normalizeText(`${title} ${description}`);
  const categoryResult = classifyCategory(text);

  return {
    ...categoryResult,
    complexity: classifyComplexity(text, Number(attachmentCount) || 0, categoryResult.category),
    method: 'RULES_V1'
  };
};
