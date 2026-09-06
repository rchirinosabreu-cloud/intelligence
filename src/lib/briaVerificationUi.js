export const getFindingVerificationUi = (finding, meta = {}, now = Date.now()) => {
  if (finding.status === 'VERIFYING') {
    const startedAt = Date.parse(meta.startedAt);
    const expired = meta.state === 'RUNNING' && Number.isFinite(startedAt) && now - startedAt > 5 * 60000;
    const busy = ['PENDING', 'RUNNING'].includes(meta.state) && !expired;
    return {
      label: busy ? (meta.state === 'RUNNING' ? 'Verificando' : 'En espera') : 'No se pudo verificar',
      busy, canRetry: !busy, canUndo: true, isError: !busy,
      description: !busy ? 'La corrección no se confirmó. Puedes reintentar o deshacer.' : meta.state === 'RUNNING'
        ? 'Bria está comprobando este hallazgo contra la parrilla actual.'
        : meta.error ? 'Hubo un problema temporal. Bria reintentará automáticamente.' : 'La verificación está en cola. El puntaje no cambia hasta completar la revisión.'
    };
  }
  const verification = finding.verification;
  return {
    label: verification?.outcome === 'INCONCLUSIVE' ? 'Sin confirmar' : verification?.outcome === 'STILL_PRESENT' ? 'Requiere ajuste' : '',
    description: verification?.outcome !== 'RESOLVED' ? verification?.reason || '' : '',
    busy: false, canRetry: verification?.outcome === 'INCONCLUSIVE', canUndo: false
  };
};
