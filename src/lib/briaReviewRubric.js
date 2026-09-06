import { createHash } from 'node:crypto';

// Candidate only. Promotion needs team-adjudicated examples and comparison with v4.
export const BRIA_REVIEW_RUBRIC = {
  version: 'bria-editorial-v1', status: 'CANDIDATE',
  weights: { ESTRATEGIA: 30, MARCA: 25, GRAMATICA: 25, CONSISTENCIA: 20 },
  rules: [
    { key: 'GRAMMAR_AGREEMENT', category: 'GRAMATICA', criterion: 'Concordancia verificablemente incorrecta entre sujeto, verbo, género o número.' },
    { key: 'GRAMMAR_SPELLING', category: 'GRAMATICA', criterion: 'Error ortográfico o de acentuación inequívoco. No corregir nombres propios o usos regionales válidos.' },
    { key: 'GRAMMAR_CLARITY', category: 'GRAMATICA', criterion: 'Redacción incomprensible o ambigua que impide entender la propuesta. No simples preferencias estilísticas.' },
    { key: 'BRAND_NAME', category: 'MARCA', criterion: 'Nombre de marca contradice el nombre o denominaciones autorizadas del cliente actual.' },
    { key: 'BRAND_VOICE', category: 'MARCA', criterion: 'Tono contradice una instrucción explícita vigente del cliente.' },
    { key: 'BRAND_CONSTRAINT', category: 'MARCA', criterion: 'Promesa o término prohibido contradice una restricción explícita vigente del cliente.' },
    { key: 'STRATEGY_OBJECTIVE', category: 'ESTRATEGIA', criterion: 'Contenido contradice o no desarrolla el objetivo explícito de la pieza o parrilla.' },
    { key: 'STRATEGY_CTA', category: 'ESTRATEGIA', criterion: 'Falta el llamado a la acción o destino cuando el objetivo exige conversión; no exigir CTA comercial a cada pieza educativa.' },
    { key: 'CONSISTENCY_FACT', category: 'CONSISTENCIA', criterion: 'Datos incompatibles entre campos o piezas, como precios, nombres o condiciones. Citar ambos datos.' },
    { key: 'CONSISTENCY_DATE', category: 'CONSISTENCIA', criterion: 'Fecha de publicación incompatible con una fecha explícita de vigencia o convocatoria. Fechas históricas no son obligaciones actuales.' },
    { key: 'CONSISTENCY_DUPLICATE', category: 'CONSISTENCIA', criterion: 'Duplicación textual entre piezas con el mismo propósito sin razón editorial explícita; no inferirla de títulos de otros lotes.' }
  ],
  scoreAnchors: [
    { min: 90, max: 100, meaning: 'Sin defectos sustantivos demostrables; 100 si no se encuentra ningún defecto. Preferencias opcionales no descuentan.' },
    { min: 75, max: 89, meaning: 'Uno o pocos defectos localizados y verificables; el objetivo sigue siendo comprensible.' },
    { min: 50, max: 74, meaning: 'Defectos recurrentes o contradicción sustancial que requiere corrección antes de publicar.' },
    { min: 0, max: 49, meaning: 'Falla generalizada o contradicción crítica que invalida el objetivo o una restricción explícita.' }
  ],
  policies: [
    'Usa los ruleKey del catálogo cuando apliquen. Para una regla no cubierta usa OTHER_<CATEGORIA> y explica la evidencia; no fuerces la clasificación.',
    'No confundas ausencia de memoria con mala calidad. Marca MARCA no evaluable sin instrucciones aplicables; ESTRATEGIA puede evaluarse con un objetivo explícito. Texto y coherencia no necesitan memoria.',
    'Las instrucciones actuales prevalecen sobre acuerdos históricos. Un comentario antiguo no demuestra por sí solo que una pieza publicada siga pendiente de corrección.',
    'No inventes defectos visuales: solo dispones de textos y metadatos, no de imágenes. No conviertas preferencias estilísticas en errores.',
    'INFO es sugerencia opcional; WARNING es defecto concreto corregible; CRITICAL exige una contradicción sustancial demostrable, no mera información ausente.',
    'Cada descuento debe estar explicado en la nota de su dimensión y respaldado por un defecto concreto. No duplicar el mismo defecto para descontar en varias dimensiones.',
    'Puntúa dentro del intervalo correspondiente considerando proporción de piezas afectadas. No mezcles confianza con calidad ni recompenses hacer clic en Corregido.',
    'ALINEADA sin defectos obligatorios; REQUIERE_AJUSTES con defectos corregibles; RIESGO solo con al menos un defecto CRITICAL demostrado.',
    'No evalúes textos ausentes de otros lotes. Una pieza limpia no necesita hallazgos de relleno.'
  ]
};

export const rubricHash = (rubric = BRIA_REVIEW_RUBRIC) => createHash('sha256').update(JSON.stringify(rubric)).digest('hex');
export const rubricInstructions = () => `RÚBRICA CANDIDATA ${BRIA_REVIEW_RUBRIC.version} (${rubricHash()}):\n${JSON.stringify(BRIA_REVIEW_RUBRIC)}`;
