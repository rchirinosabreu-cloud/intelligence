// Solo para evaluaciones: reserva el peor caso antes de la red y recupera la
// diferencia únicamente con uso completo del proveedor. Un fallo queda reservado.
export const createSettledEvalFetch = ({ model, maxUsd, inputUsdPerMillion, outputUsdPerMillion, countInputTokens,
  cachedInputUsdPerMillion, cacheWriteUsdPerMillion, fetchImpl = globalThis.fetch }) => {
  if (!model || ![maxUsd, inputUsdPerMillion, outputUsdPerMillion].every(value => Number.isFinite(value) && value > 0)) throw new Error('Declara modelo, tarifas conservadoras y tope de evaluación.');
  let committed = 0;
  const cachePricing = cachedInputUsdPerMillion !== undefined || cacheWriteUsdPerMillion !== undefined;
  if (cachePricing && (![cachedInputUsdPerMillion, cacheWriteUsdPerMillion].every(value => Number.isFinite(value) && value >= 0)
    || cacheWriteUsdPerMillion < inputUsdPerMillion || cachedInputUsdPerMillion > inputUsdPerMillion)) throw new Error('Tarifas de caché inválidas.');
  const cost = (input, output) => (input * inputUsdPerMillion + output * outputUsdPerMillion) / 1e6;
  return {
    committedUsd: () => committed,
    async fetch(url, init) {
      const body = JSON.parse(init.body);
      if (body.model !== model || !Number.isSafeInteger(body.max_output_tokens) || body.max_output_tokens <= 0) throw new Error('Modelo o límite de salida inválido para esta evaluación.');
      if (cachePricing && body.prompt_cache_options?.ttl === '12h') throw new Error('Esta evaluación solo permite caché de 30 minutos.');
      const inputTokens = countInputTokens ? await countInputTokens(structuredClone(body), init) : Buffer.byteLength(init.body);
      if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) throw new Error('El conteo previo de tokens no es válido; no se envió la generación.');
      const reserved = (inputTokens * (cachePricing ? cacheWriteUsdPerMillion : inputUsdPerMillion) + body.max_output_tokens * outputUsdPerMillion) / 1e6;
      if (committed + reserved > maxUsd) throw new Error('Presupuesto de evaluación agotado; no se envió otra llamada.');
      committed += reserved;
      const response = await fetchImpl(url, init);
      if (response.ok) {
        try {
          const { usage } = await response.clone().json();
          if ([usage?.input_tokens, usage?.output_tokens].every(value => Number.isSafeInteger(value) && value >= 0)) {
            const details = usage.input_tokens_details, cached = details?.cached_tokens, written = details?.cache_write_tokens;
            const knownCache = cachePricing && [cached, written].every(value => Number.isSafeInteger(value) && value >= 0)
              && cached + written <= usage.input_tokens && !details?.cache_write_tokens_details?.ttl_12h_tokens;
            const actual = knownCache
              ? ((usage.input_tokens - cached - written) * inputUsdPerMillion + cached * cachedInputUsdPerMillion + written * cacheWriteUsdPerMillion + usage.output_tokens * outputUsdPerMillion) / 1e6
              : cachePricing ? (usage.input_tokens * cacheWriteUsdPerMillion + usage.output_tokens * outputUsdPerMillion) / 1e6 : cost(usage.input_tokens, usage.output_tokens);
            committed += actual - reserved;
          }
        } catch { /* Sin uso verificable, se conserva la reserva completa. */ }
      }
      return response;
    }
  };
};
