export const getFindingVerificationUi = (finding, meta = {}, now = Date.now()) => {
  if (finding.status === 'VERIFYING') {
    const startedAt = Date.parse(meta.startedAt);
    const expired = meta.state === 'RUNNING' && Number.isFinite(startedAt) && now - startedAt > 5 * 60000;
    const busy = meta.state === 'RUNNING' && !expired;
    const pending = meta.state === 'PENDING';
    return {
      label: busy ? 'Verificando' : pending ? 'Por verificar' : 'No se pudo verificar',
      busy, canRetry: !busy, canUndo: true, isError: !busy && !pending,
      description: busy ? 'Bria está comprobando este hallazgo contra la parrilla actual.'
        : pending ? 'Solicita una revisión para comprobar esta corrección.'
          : 'La corrección no se confirmó. Puedes reintentar o deshacer.'
    };
  }
  const verification = finding.verification;
  return {
    label: verification?.outcome === 'INCONCLUSIVE' ? 'Sin confirmar' : verification?.outcome === 'STILL_PRESENT' ? 'Requiere ajuste' : '',
    description: verification?.outcome !== 'RESOLVED' ? verification?.reason || '' : '',
    busy: false, canRetry: verification?.outcome === 'INCONCLUSIVE', canUndo: false
  };
};
