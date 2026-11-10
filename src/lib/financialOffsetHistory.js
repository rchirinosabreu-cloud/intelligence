const titles = {
  SETTLEMENT: 'Compensación registrada en Cartera',
  OFFSET: 'Registro del cruce',
  LEGACY_OFFSET_LINKED: 'Contrapartida vinculada en Por pagar',
  OFFSET_REVERSE: 'Reversión del cruce',
};
const amount = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

/** Read old, one-sided settlements and linked offsets without rewriting their audit evidence. */
export function offsetHistoryEntry(event) {
  const before = event?.before || {}, after = event?.after || {};
  const balances = after.operation === 'SETTLEMENT'
    ? [{ label: 'Nos deben', before: amount(before.outstanding), after: amount(after.outstanding) }]
    : [['receivable', 'Nos deben'], ['payable', 'Debemos']].map(([key, label]) => ({ label, before: amount(before[key]?.outstanding), after: amount(after[key]?.outstanding) }));
  return {
    title: titles[after.operation] || 'Actualización del cruce',
    actor: after.actorName || event?.actorName || null,
    reason: after.reason || null,
    balances: balances.filter(row => row.before !== null || row.after !== null),
  };
}
