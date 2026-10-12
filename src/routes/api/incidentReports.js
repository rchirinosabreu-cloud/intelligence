import express from 'express';
import { getGovernanceService } from '../../services/aiGovernanceService.js';
import { notifyIncidentReportToAdmins } from '../../services/incidentReportNotifications.js';
import { createRateLimiter } from '../../config/security.js';

/**
 * Reportar un incidente de seguridad (12 de octubre de 2026). Abierto a todo el equipo activo —el servicio
 * lo comprueba—, solo escribe: no hay ninguna ruta de lectura aquí, así que reportar no da acceso al registro.
 * Con tope por persona para que un clic repetido o una pantalla en bucle no inunde a administración.
 */
export function createIncidentReportRouter({ service, notify = notifyIncidentReportToAdmins, limit = { windowMs: 60 * 60 * 1000, max: 5 } } = {}) {
  const router = express.Router();
  const limiter = createRateLimiter({
    ...limit,
    keyGenerator: (req) => `incident-report:${req.user?.userId}`,
    onLimit: (req, res) => res.status(429).json({ error: 'Ya enviaste varios reportes. Si es urgente, avisa directo a administración.', code: 'INCIDENT_REPORT_RATE_LIMITED' })
  });
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.userId) return res.status(401).json({ error: 'Inicia sesión.' });
    next();
  });
  router.post('/', limiter, async (req, res) => {
    let result;
    try {
      result = await (service || getGovernanceService()).report(req.user.userId, req.body);
    } catch (error) {
      console.error('[IncidentReport]', error.response?.data || error.message);
      const status = [400, 403].includes(error.status) ? error.status : 500;
      return res.status(status).json({ error: status === 500 ? 'No se pudo enviar el reporte. Intenta de nuevo.' : error.message, code: status === 500 ? 'INCIDENT_REPORT_UNAVAILABLE' : error.code });
    }
    // El reporte ya quedó guardado: un aviso que no sale no puede convertirlo en un error.
    try { await notify({ incidentId: result.id, reporterId: req.user.userId, reporterName: result.reporterName }); }
    catch (error) { console.error('[IncidentReport] Aviso a administración:', error?.message || error); }
    return res.status(201).json({ ok: true, reportedAt: result.reportedAt });
  });
  return router;
}
