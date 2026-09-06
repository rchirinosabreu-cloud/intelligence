export const reviewSnapshot = request => JSON.parse(request.prompt.split('PARRILLA ACTUAL:\n')[1].split('\n')[0]);
export const reviewPayload = (request, overrides = {}) => ({
  summary: 'Revisión de prueba.', verdict: 'ALINEADA', findings: [],
  reviewedItemIds: reviewSnapshot(request).items.map(item => item.id),
  dimensions: Object.fromEntries(['ESTRATEGIA', 'MARCA', 'GRAMATICA', 'CONSISTENCIA'].map(key => [key, {
    score: 80, confidence: 0.8, assessable: true, note: 'Verificado.'
  }])), ...overrides
});
