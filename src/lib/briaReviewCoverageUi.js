const dimensionKeys = ['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'];

export const getBriaReviewCoverageUi = (review, meta = {}) => {
  const scope = review?.scope;
  const known = scope?.complete === true && Number.isInteger(scope.totalItems) && scope.totalItems >= 0
    && scope.reviewedItems === scope.totalItems;
  const dimensions = dimensionKeys.filter(key => review?.dimensions?.[key]?.assessable === true).length;
  const progress = meta.state !== 'CURRENT' ? meta.progress : null;
  return {
    pieces: known ? `${scope.reviewedItems}/${scope.totalItems} piezas revisadas` : 'Cobertura de piezas no registrada',
    dimensions: Object.keys(review?.dimensions || {}).length ? `${dimensions}/4 dimensiones evaluadas` : 'Dimensiones no registradas',
    limit: known && scope.crossBatchTextComparison === false
      ? 'Textos completos revisados por lotes; la comparación entre lotes usa objetivos y fechas, no todos los textos a la vez.' : null,
    progress: progress ? `Avance guardado: ${progress.reviewedItems}/${progress.totalItems} piezas · ${progress.completedBatches}/${progress.totalBatches} lotes.` : null,
    previousScore: Boolean(review && ['PENDING', 'RUNNING', 'FAILED'].includes(meta.state))
  };
};
