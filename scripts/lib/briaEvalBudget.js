// Solo para evaluaciones: reserva el peor caso antes de la red y recupera la
// diferencia únicamente con uso completo del proveedor. Un fallo queda reservado.
export const createSettledEvalFetch = ({ model, maxUsd, inputUsdPerMillion, outputUsdPerMillion, fetchImpl = globalThis.fetch }) => {
  if (!model || ![maxUsd, inputUsdPerMillion, outputUsdPerMillion].every(value => Number.isFinite(value) && value > 0)) throw new Error('Declara modelo, tarifas conservadoras y tope de evaluación.');
  let committed = 0;
  const cost = (input, output) => (input * inputUsdPerMillion + output * outputUsdPerMillion) / 1e6;
  return {
    committedUsd: () => committed,
    async fetch(url, init) {
      const body = JSON.parse(init.body);
      if (body.model !== model || !Number.isSafeInteger(body.max_output_tokens) || body.max_output_tokens <= 0) throw new Error('Modelo o límite de salida inválido para esta evaluación.');
      const reserved = cost(Buffer.byteLength(init.body), body.max_output_tokens);
      if (committed + reserved > maxUsd) throw new Error('Presupuesto de evaluación agotado; no se envió otra llamada.');
      committed += reserved;
      const response = await fetchImpl(url, init);
      if (response.ok) {
        try {
          const { usage } = await response.clone().json();
          if ([usage?.input_tokens, usage?.output_tokens].every(value => Number.isSafeInteger(value) && value >= 0)) {
            committed += cost(usage.input_tokens, usage.output_tokens) - reserved;
          }
        } catch { /* Sin uso verificable, se conserva la reserva completa. */ }
      }
      return response;
    }
  };
};
