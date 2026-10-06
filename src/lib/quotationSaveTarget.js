// A dónde va el guardado de una cotización (Elisa, 6 de octubre de 2026: guardó un borrador,
// ajustó el precio, emitió y quedaron dos cotizaciones). La página «Nueva propuesta» decidía por
// la dirección, que no cambia al guardar; ahora decide por la cotización que ya existe: la de la
// dirección o, si no hay, la que este mismo formulario acaba de crear.
export const quotationSaveTarget = (routeId, savedId) => {
    const quotationId = routeId || savedId || null;
    return quotationId
        ? { method: 'PUT', path: `/api/quotations/${quotationId}` }
        : { method: 'POST', path: '/api/quotations' };
};
