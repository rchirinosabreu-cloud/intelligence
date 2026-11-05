// Ficha, avisos y suspensión deben mirar el mismo contrato para un día de Bogotá.
export const CONTRACT_ORDER = [{ startDate: 'desc' }, { createdAt: 'desc' }];

export const orderedContracts = (contracts = []) => [...contracts].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))
  || (new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));

export const contractAt = (contracts, day) => contracts.find((row) => row.startDate <= day) || null;

// Un contrato vencido sigue siendo el último alcance registrado; una renovación futura no lo sustituye antes de empezar.
// Si solo hay contratos futuros, la ficha sigue disponible. Medir sus ciclos corresponde al servicio consumidor.
export function selectedContract(contracts, today) {
  const ordered = orderedContracts(contracts);
  return contractAt(ordered, today) || ordered[0] || null;
}
