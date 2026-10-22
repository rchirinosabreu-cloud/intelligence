// Avisar por WhatsApp desde cualquier rincón de la plataforma (22 de octubre de 2026) sin esperar a Meta ni romper
// nada: quien avisa ya dejó su aviso en la campana, y WhatsApp es una copia que puede no salir. El puente se carga
// al usarlo porque arrastra el motor de Bria; dentro de `node --test` o sin token no sale nada.
const QUIET_OUTCOMES = new Set(['sent', 'not-linked', 'off', 'duplicate', 'not-configured']);

export const alertByWhatsApp = (input, { env = process.env, logger = console } = {}) => {
  if (env.NODE_TEST_CONTEXT || !env.META_WHATSAPP_TOKEN) return Promise.resolve({ outcome: 'not-configured' });
  return import('./whatsappBridgeService.js')
    .then(({ getWhatsAppBridgeService }) => getWhatsAppBridgeService().deliverAlert(input))
    .then((result) => {
      if (result?.outcome && !QUIET_OUTCOMES.has(result.outcome)) logger.info?.(`[WhatsApp] Aviso ${input?.kind || ''} no enviado: ${result.outcome}.`);
      return result;
    })
    .catch((failure) => { logger.error('[WhatsApp] Un aviso no salió:', failure?.message || failure); return { outcome: 'failed' }; });
};
