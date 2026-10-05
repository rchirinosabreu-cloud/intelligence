// La dirección que mira el vigilante externo (Rodny, 5 de octubre de 2026): `GET /api/health/ready`.
// `/api/health` responde «ok» con solo que el proceso esté vivo, aunque la base de datos esté caída;
// esta le hace una pregunta trivial a la base y contesta 200 o 503. Es pública a propósito —el
// vigilante no inicia sesión—, así que no dice nada interno: ni el error, ni versiones, ni modelos.

const DEFAULT_TIMEOUT_MS = 3000;

export const createReadinessHandler = ({ check, timeoutMs = DEFAULT_TIMEOUT_MS, logger = console }) => async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(check),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })
    ]);
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    logger.error('[Health] La base de datos no respondió a la comprobación externa:', error?.message || error);
    return res.status(503).json({ status: 'unavailable' });
  } finally {
    clearTimeout(timer);
  }
};
