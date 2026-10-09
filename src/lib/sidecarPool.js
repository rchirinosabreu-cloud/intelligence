// Una sola reserva de conexiones para la base lateral de Bria y la bóveda (9 de octubre de 2026). Antes cada
// servicio abría la suya (memoria de la agencia 2, conversaciones 3, aprendizajes 3, bóveda 2): diez
// conexiones que casi siempre estaban ociosas. Ahora comparten seis. La del archivo de Drive y correo sigue
// aparte a propósito, porque abre sus conexiones en modo de solo lectura.
//
// Una conexión ociosa que se cae emite «error» en la reserva; sin un manejador, Node tumbaría el proceso.

import pg from 'pg';

export const SIDECAR_POOL_MAX = 6;
let pool = null;

export const getSidecarPool = ({ env = process.env, logger = console } = {}) => {
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: Number(env.SIDECAR_POOL_MAX) > 0 ? Number(env.SIDECAR_POOL_MAX) : SIDECAR_POOL_MAX,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  });
  pool.on('error', (error) => logger.error('[SidecarPool] Una conexión ociosa falló:', error?.code || error?.message));
  return pool;
};
