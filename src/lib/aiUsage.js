// One shape for what a model call cost, whatever the provider reports.
// Unknown usage stays `null`: an unmeasured call is never written down as free.
const number = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeAiUsage = raw => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const inputTokens = number(raw.inputTokens ?? raw.input_tokens ?? raw.prompt_tokens);
  const outputTokens = number(raw.outputTokens ?? raw.output_tokens ?? raw.completion_tokens);
  if (inputTokens === null && outputTokens === null) return null;
  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: number(raw.totalTokens ?? raw.total_tokens) ?? input + output,
    cachedTokens: number(raw.cachedTokens ?? raw.input_tokens_details?.cached_tokens) ?? 0,
    reasoningTokens: number(raw.reasoningTokens ?? raw.output_tokens_details?.reasoning_tokens) ?? 0
  };
};

const counters = ['inputTokens', 'outputTokens', 'totalTokens', 'cachedTokens', 'reasoningTokens'];

// Every entry is one model call: `{ model, latencyMs, usage }`. Latency is
// added for every call; tokens only for the calls whose usage is known.
export const summarizeAiCalls = (calls = []) => {
  const list = (Array.isArray(calls) ? calls : []).filter(call => call && typeof call === 'object');
  const known = list.filter(call => call.usage && typeof call.usage === 'object');
  const summary = { calls: list.length, callsWithUsage: known.length };
  for (const field of counters) summary[field] = known.reduce((sum, call) => sum + (number(call.usage[field]) ?? 0), 0);
  summary.latencyMs = list.reduce((sum, call) => sum + (number(call.latencyMs) ?? 0), 0);
  summary.models = [...new Set(list.map(call => call.model).filter(Boolean))].sort();
  return summary;
};
